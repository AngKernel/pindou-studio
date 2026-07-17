export type DeploymentMode = 'local-only' | 'cloud';

interface DeploymentEnvironment {
  readonly mode?: string;
  readonly beadCloudApiUrl?: string;
}

export interface DeploymentConfig {
  readonly mode: DeploymentMode;
  readonly beadCloudEnabled: boolean;
  readonly beadCloudApiUrl: string | null;
}

export class DeploymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentConfigurationError';
  }
}

function normalizeApiOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeploymentConfigurationError('NEXT_PUBLIC_BEAD_CLOUD_API_URL must be a valid URL origin.');
  }
  const localHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new DeploymentConfigurationError('NEXT_PUBLIC_BEAD_CLOUD_API_URL must use HTTPS outside loopback development.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new DeploymentConfigurationError('NEXT_PUBLIC_BEAD_CLOUD_API_URL must be a plain origin without credentials, path, query, or fragment.');
  }
  return url.origin;
}

export function resolveDeploymentConfig(environment: DeploymentEnvironment): DeploymentConfig {
  const configuredMode = environment.mode?.trim();
  const configuredApiUrl = environment.beadCloudApiUrl?.trim();
  if (configuredMode && configuredMode !== 'local-only' && configuredMode !== 'cloud') {
    throw new DeploymentConfigurationError('NEXT_PUBLIC_DEPLOYMENT_MODE must be either local-only or cloud.');
  }
  const mode: DeploymentMode = configuredMode === 'cloud'
    ? 'cloud'
    : configuredMode === 'local-only'
      ? 'local-only'
      : configuredApiUrl
        ? 'cloud'
        : 'local-only';
  if (mode === 'local-only') {
    if (configuredApiUrl) {
      throw new DeploymentConfigurationError('Local-only deployments must not configure NEXT_PUBLIC_BEAD_CLOUD_API_URL.');
    }
    return { mode, beadCloudEnabled: false, beadCloudApiUrl: null };
  }
  if (!configuredApiUrl) {
    throw new DeploymentConfigurationError('Cloud deployments require NEXT_PUBLIC_BEAD_CLOUD_API_URL.');
  }
  return {
    mode,
    beadCloudEnabled: true,
    beadCloudApiUrl: normalizeApiOrigin(configuredApiUrl),
  };
}

export const deploymentConfig = resolveDeploymentConfig({
  mode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
  beadCloudApiUrl: process.env.NEXT_PUBLIC_BEAD_CLOUD_API_URL,
});
