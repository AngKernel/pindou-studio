import { z } from 'zod';

export const publicDeviceJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  y: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string()).optional(),
}).strict();

export const deviceProofSchema = z.object({
  timestamp: z.number().int().positive(),
  nonce: z.uuid(),
  signature: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
}).strict();

export const quotaSchema = z.object({
  total: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
}).strict().refine((quota) => quota.used + quota.remaining === quota.total, '额度字段不一致。');

export const licenseStatusSchema = z.object({
  licenseId: z.uuid(),
  deviceId: z.uuid(),
  deviceName: z.string().min(1).max(80),
  plan: z.string().min(1).max(32),
  status: z.literal('active'),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  entitlements: z.array(z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/)).max(32),
  quota: quotaSchema,
}).strict();

export const tokenResponseSchema = z.object({
  protocolVersion: z.literal(1),
  accessToken: z.string().min(32).max(4096),
  accessExpiresAt: z.iso.datetime({ offset: true }),
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  refreshExpiresAt: z.iso.datetime({ offset: true }),
  license: licenseStatusSchema,
}).strict();

export const statusResponseSchema = z.object({
  protocolVersion: z.literal(1),
  license: licenseStatusSchema,
}).strict();

export const usageStatusResponseSchema = z.object({
  protocolVersion: z.literal(1),
  quota: quotaSchema,
}).strict();

export const usageConsumeResponseSchema = z.object({
  protocolVersion: z.literal(1),
  remaining: z.number().int().nonnegative(),
  replayed: z.boolean(),
}).strict();

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(300),
  }).strict(),
}).strict();

export type PublicDeviceJwk = z.infer<typeof publicDeviceJwkSchema>;
export type DeviceProof = z.infer<typeof deviceProofSchema>;
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
