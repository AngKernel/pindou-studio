import { describe, expect, it } from 'vitest';
import { DeploymentConfigurationError, resolveDeploymentConfig } from './deployment';

describe('deployment configuration', () => {
  it('defaults to the local-only public build when no cloud endpoint is configured', () => {
    expect(resolveDeploymentConfig({})).toEqual({
      mode: 'local-only',
      beadCloudEnabled: false,
      beadCloudApiUrl: null,
    });
  });

  it('keeps existing cloud builds compatible when an API origin is supplied', () => {
    expect(resolveDeploymentConfig({ beadCloudApiUrl: 'https://license.example/' })).toEqual({
      mode: 'cloud',
      beadCloudEnabled: true,
      beadCloudApiUrl: 'https://license.example',
    });
  });

  it('requires cloud mode and its API origin to agree', () => {
    expect(() => resolveDeploymentConfig({
      mode: 'local-only',
      beadCloudApiUrl: 'https://license.example',
    })).toThrowError(DeploymentConfigurationError);
    expect(() => resolveDeploymentConfig({ mode: 'cloud' })).toThrowError(DeploymentConfigurationError);
  });

  it('rejects invalid modes, paths, credentials, and insecure remote origins', () => {
    for (const input of [
      { mode: 'other' },
      { mode: 'cloud', beadCloudApiUrl: 'https://license.example/v1' },
      { mode: 'cloud', beadCloudApiUrl: 'https://user:secret@license.example' },
      { mode: 'cloud', beadCloudApiUrl: 'http://license.example' },
    ]) {
      expect(() => resolveDeploymentConfig(input)).toThrowError(DeploymentConfigurationError);
    }
  });

  it('allows loopback HTTP only for local cloud integration tests', () => {
    expect(resolveDeploymentConfig({
      mode: 'cloud',
      beadCloudApiUrl: 'http://127.0.0.1:8787',
    }).beadCloudApiUrl).toBe('http://127.0.0.1:8787');
  });
});
