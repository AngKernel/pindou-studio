import type { LicenseStatus, PublicDeviceJwk } from '../../schemas/licensing-api';

export const MONOCHROME_PDF_ENTITLEMENT = 'pdf.monochrome.experimental';

export interface DeviceIdentity {
  readonly privateKey: CryptoKey;
  readonly publicKeyJwk: PublicDeviceJwk;
}

export interface RefreshSession {
  readonly refreshToken: string;
  readonly refreshExpiresAt: string;
  readonly license: LicenseStatus;
}

export interface LicensingSnapshot {
  readonly mode: 'loading' | 'free' | 'active' | 'offline' | 'error';
  readonly license: LicenseStatus | null;
  readonly message: string;
}
