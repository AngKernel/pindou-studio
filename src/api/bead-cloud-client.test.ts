import { describe, expect, it } from 'vitest';
import { BeadCloudClient, BeadCloudClientError } from './bead-cloud-client';

const license = {
  licenseId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  deviceName: '测试浏览器',
  plan: 'beta',
  status: 'active',
  expiresAt: null,
  entitlements: ['pdf.monochrome.experimental'],
  quota: { total: 5, used: 1, remaining: 4 },
} as const;

const tokenResponse = {
  protocolVersion: 1,
  accessToken: 'a'.repeat(32),
  accessExpiresAt: '2030-01-01T00:15:00.000Z',
  refreshToken: 'r'.repeat(43),
  refreshExpiresAt: '2030-02-01T00:00:00.000Z',
  license,
} as const;

const activation = {
  activationCode: 'PD-0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ',
  deviceName: '测试浏览器',
  publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'x'.repeat(43), y: 'y'.repeat(43) } as const,
  proof: { timestamp: 1_900_000_000, nonce: '33333333-3333-4333-8333-333333333333', signature: 's'.repeat(86) },
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('BeadCloudClient', () => {
  it('uses only the versioned HTTPS JSON contract and strictly parses token responses', async () => {
    let requestedUrl = '';
    let requestedBody = '';
    const fetcher: typeof fetch = (input, init) => {
      requestedUrl = String(input);
      requestedBody = String(init?.body);
      return Promise.resolve(jsonResponse(tokenResponse));
    };
    const client = new BeadCloudClient('https://license.example/', fetcher);
    const result = await client.activate(activation);
    expect(result.license.entitlements).toEqual(['pdf.monochrome.experimental']);
    expect(requestedUrl).toBe('https://license.example/v1/licenses/activate');
    expect(JSON.parse(requestedBody)).toEqual(activation);

    const invalidClient = new BeadCloudClient('https://license.example', () => Promise.resolve(jsonResponse({ ...tokenResponse, internal: true })));
    await expect(invalidClient.activate(activation)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE', kind: 'protocol',
    } satisfies Partial<BeadCloudClientError>);
  });

  it('maps stable service errors without exposing arbitrary server details', async () => {
    const client = new BeadCloudClient('http://127.0.0.1:8787', () => Promise.resolve(jsonResponse({
      error: { code: 'DEVICE_LIMIT_REACHED', message: 'server-internal-wording' },
    }, 409)));
    await expect(client.activate(activation)).rejects.toMatchObject({
      code: 'DEVICE_LIMIT_REACHED', userMessage: '该激活码的设备数量已达到上限。', kind: 'service',
    } satisfies Partial<BeadCloudClientError>);
  });

  it('rejects insecure remote endpoints and URLs containing non-origin data', () => {
    expect(() => new BeadCloudClient('http://license.example')).toThrow('HTTPS');
    expect(() => new BeadCloudClient('https://user:secret@license.example')).toThrow('纯 origin');
    expect(() => new BeadCloudClient('https://license.example/licensing')).toThrow('纯 origin');
  });
});
