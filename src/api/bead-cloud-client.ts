import type { z } from 'zod';
import {
  apiErrorResponseSchema,
  statusResponseSchema,
  tokenResponseSchema,
  usageConsumeResponseSchema,
  usageStatusResponseSchema,
  type DeviceProof,
  type PublicDeviceJwk,
} from '../schemas/licensing-api';

type FetchLike = typeof fetch;

const errorMessages: Readonly<Record<string, string>> = {
  ACTIVATION_REJECTED: '激活码无效、已过期或已停用。',
  DEVICE_LIMIT_REACHED: '该激活码的设备数量已达到上限。',
  DEVICE_REVOKED: '当前设备授权已撤销，请重新激活。',
  INVALID_DEVICE_PROOF: '设备凭据无效，请清除本地授权后重新激活。',
  INVALID_TOKEN: '授权已过期，请重新激活。',
  LICENSE_INACTIVE: '授权已过期或已停用。',
  TOKEN_REUSED: '刷新凭据已失效，请重新激活。',
  ENTITLEMENT_REQUIRED: '当前内测授权不包含该功能。',
  QUOTA_EXCEEDED: '当前内测额度不足。',
  IDEMPOTENCY_KEY_REUSED: '额度请求标识冲突，请重试。',
  RATE_LIMITED: '请求过于频繁，请稍后重试。',
  INVALID_REQUEST: '授权请求字段无效。',
};

export class BeadCloudClientError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
    readonly kind: 'configuration' | 'network' | 'protocol' | 'service',
    options?: ErrorOptions,
  ) {
    super(userMessage, options);
    this.name = 'BeadCloudClientError';
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BeadCloudClientError('INVALID_CONFIGURATION', '授权服务地址配置无效。', 'configuration', { cause: error });
  }
  const localHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new BeadCloudClientError('INSECURE_CONFIGURATION', '授权服务必须使用 HTTPS。', 'configuration');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new BeadCloudClientError('INVALID_CONFIGURATION', '授权服务地址必须是纯 origin，不能包含凭据、路径、查询或片段。', 'configuration');
  }
  return url.origin;
}

function serviceError(value: unknown, status: number): BeadCloudClientError {
  const parsed = apiErrorResponseSchema.safeParse(value);
  if (!parsed.success) {
    return new BeadCloudClientError('INVALID_RESPONSE', '授权服务返回了无法识别的错误。', 'protocol');
  }
  const code = parsed.data.error.code;
  return new BeadCloudClientError(
    code,
    errorMessages[code] ?? (status >= 500 ? '授权服务暂时不可用。' : parsed.data.error.message),
    'service',
  );
}

export class BeadCloudClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetcher: FetchLike = (input, init) => globalThis.fetch(input, init),
    private readonly timeoutMs = 8_000,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
      const value: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw serviceError(value, response.status);
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        throw new BeadCloudClientError('INVALID_RESPONSE', '授权服务响应格式无效。', 'protocol', { cause: parsed.error });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof BeadCloudClientError) throw error;
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      throw new BeadCloudClientError(
        aborted ? 'REQUEST_TIMEOUT' : 'SERVICE_UNAVAILABLE',
        aborted ? '授权服务响应超时，基础功能仍可继续使用。' : '无法连接授权服务，基础功能仍可继续使用。',
        'network',
        { cause: error },
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  activate(input: {
    readonly activationCode: string;
    readonly deviceName: string;
    readonly publicKeyJwk: PublicDeviceJwk;
    readonly proof: DeviceProof;
  }) {
    return this.request('/v1/licenses/activate', tokenResponseSchema, { method: 'POST', body: JSON.stringify(input) });
  }

  refresh(input: { readonly refreshToken: string; readonly proof: DeviceProof }) {
    return this.request('/v1/licenses/refresh', tokenResponseSchema, { method: 'POST', body: JSON.stringify(input) });
  }

  status(accessToken: string) {
    return this.request('/v1/licenses/status', statusResponseSchema, {
      method: 'GET', headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async deactivate(accessToken: string, proof: DeviceProof): Promise<void> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/licenses/deactivate-device`, {
        method: 'POST', body: JSON.stringify({ proof }), signal: controller.signal,
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 204) return;
      const value: unknown = await response.json().catch(() => undefined);
      throw serviceError(value, response.status);
    } catch (error) {
      if (error instanceof BeadCloudClientError) throw error;
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      throw new BeadCloudClientError(
        aborted ? 'REQUEST_TIMEOUT' : 'SERVICE_UNAVAILABLE',
        aborted ? '授权服务响应超时，基础功能仍可继续使用。' : '无法连接授权服务，基础功能仍可继续使用。',
        'network',
        { cause: error },
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  usageStatus(accessToken: string) {
    return this.request('/v1/usage/status', usageStatusResponseSchema, {
      method: 'GET', headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  consume(input: {
    readonly accessToken: string;
    readonly feature: string;
    readonly amount: number;
    readonly requestId: string;
    readonly proof: DeviceProof;
  }) {
    const { accessToken, ...body } = input;
    return this.request('/v1/usage/consume', usageConsumeResponseSchema, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body),
    });
  }
}
