import { BeadCloudClient, BeadCloudClientError } from '../../api/bead-cloud-client';
import type { TokenResponse } from '../../schemas/licensing-api';
import { createDeviceProof, generateDeviceIdentity } from './device-key';
import { LicensingCredentialStore, LicensingStorageError } from './credential-store';
import type { DeviceIdentity, LicensingSnapshot, RefreshSession } from './types';

const FREE: LicensingSnapshot = {
  mode: 'free', license: null, message: '未激活也可使用全部基础生成、编辑、本地保存和普通导出功能。',
};

function userMessage(error: unknown): string {
  if (error instanceof BeadCloudClientError || error instanceof LicensingStorageError) return error.message;
  return '设备授权发生错误，基础功能仍可继续使用。';
}

export class LicensingService {
  private accessToken: string | null = null;

  constructor(
    private readonly client: BeadCloudClient | null,
    private readonly store = new LicensingCredentialStore(),
  ) {}

  private async device(): Promise<DeviceIdentity> {
    try {
      const existing = await this.store.loadDevice();
      if (existing) return existing;
    } catch (error) {
      if (!(error instanceof LicensingStorageError) || error.code !== 'CORRUPT_CREDENTIALS') throw error;
      await this.store.clearAll();
    }
    const created = await generateDeviceIdentity();
    await this.store.saveDevice(created);
    return created;
  }

  private async accept(response: TokenResponse): Promise<LicensingSnapshot> {
    this.accessToken = response.accessToken;
    const session: RefreshSession = {
      refreshToken: response.refreshToken,
      refreshExpiresAt: response.refreshExpiresAt,
      license: response.license,
    };
    await this.store.saveSession(session);
    return { mode: 'active', license: response.license, message: '当前设备授权已验证。' };
  }

  private async refreshSession(session: RefreshSession): Promise<LicensingSnapshot> {
    if (!this.client) return { mode: 'offline', license: session.license, message: '授权服务未配置，已暂停内测功能；基础功能不受影响。' };
    const device = await this.device();
    const payload = { refreshToken: session.refreshToken };
    const proof = await createDeviceProof(device.privateKey, 'refresh', payload);
    return this.accept(await this.client.refresh({ ...payload, proof }));
  }

  async initialize(): Promise<LicensingSnapshot> {
    let session: RefreshSession | null;
    try {
      session = await this.store.loadSession();
    } catch (error) {
      await this.store.clearAll().catch(() => undefined);
      return { mode: 'error', license: null, message: userMessage(error) };
    }
    if (!session) return FREE;
    try {
      return await this.refreshSession(session);
    } catch (error) {
      this.accessToken = null;
      if (error instanceof BeadCloudClientError && (error.kind === 'network' || error.kind === 'configuration')) {
        return { mode: 'offline', license: session.license, message: `${error.userMessage} 内测功能已暂停。` };
      }
      await this.store.clearSession().catch(() => undefined);
      return { mode: 'error', license: null, message: userMessage(error) };
    }
  }

  async activate(activationCodeInput: string, deviceNameInput: string): Promise<LicensingSnapshot> {
    if (!this.client) throw new BeadCloudClientError('NOT_CONFIGURED', '当前站点未配置授权服务，基础功能仍可使用。', 'configuration');
    const activationCode = activationCodeInput.trim().toUpperCase();
    const deviceName = deviceNameInput.trim();
    if (!/^PD(?:-[0-9A-HJKMNP-TV-Z]{4}){8}$/.test(activationCode)) {
      throw new BeadCloudClientError('INVALID_ACTIVATION_CODE', '激活码格式无效。', 'protocol');
    }
    if (!deviceName || deviceName.length > 80) {
      throw new BeadCloudClientError('INVALID_DEVICE_NAME', '设备名称必须为 1 到 80 个字符。', 'protocol');
    }
    const device = await this.device();
    const payload = { activationCode, deviceName, publicKeyJwk: device.publicKeyJwk };
    const proof = await createDeviceProof(device.privateKey, 'activate', payload);
    return this.accept(await this.client.activate({ ...payload, proof }));
  }

  async refresh(): Promise<LicensingSnapshot> {
    const session = await this.store.loadSession();
    if (!session) return FREE;
    return this.refreshSession(session);
  }

  async deactivate(): Promise<LicensingSnapshot> {
    if (!this.client) throw new BeadCloudClientError('NOT_CONFIGURED', '当前站点未配置授权服务。', 'configuration');
    if (!this.accessToken) await this.refresh();
    const accessToken = this.accessToken;
    if (!accessToken) return FREE;
    const device = await this.device();
    const proof = await createDeviceProof(device.privateKey, 'deactivate', {});
    await this.client.deactivate(accessToken, proof);
    this.accessToken = null;
    await this.store.clearAll();
    return { ...FREE, message: '当前设备已停用，本地设备凭据已删除。' };
  }

  async clearLocal(): Promise<LicensingSnapshot> {
    this.accessToken = null;
    await this.store.clearAll();
    return { ...FREE, message: '本地授权凭据已清除；这不会重置服务端设备名额。' };
  }
}

export { FREE as FREE_LICENSING_SNAPSHOT };
