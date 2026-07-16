import { publicDeviceJwkSchema, type DeviceProof } from '../../schemas/licensing-api';
import type { DeviceIdentity } from './types';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('设备签名载荷包含不支持的值。');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKeyJwk = publicDeviceJwkSchema.parse(await crypto.subtle.exportKey('jwk', pair.publicKey));
  if (pair.privateKey.extractable) throw new Error('设备私钥必须不可导出。');
  return { privateKey: pair.privateKey, publicKeyJwk };
}

export async function createDeviceProof(
  privateKey: CryptoKey,
  operation: 'activate' | 'refresh' | 'consume' | 'deactivate',
  payload: unknown,
): Promise<DeviceProof> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const payloadBytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', payloadBytes)));
  const message = new TextEncoder().encode(`bead-cloud:v1:${operation}\n${String(timestamp)}\n${nonce}\n${digest}`);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message));
  return { timestamp, nonce, signature: base64Url(signature) };
}
