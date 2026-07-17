'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BeadCloudClient } from '../../api/bead-cloud-client';
import { deploymentConfig } from '../../config/deployment';
import { LicensingCredentialStore } from './credential-store';
import { FREE_LICENSING_SNAPSHOT, LicensingService } from './licensing-service';
import type { LicensingSnapshot } from './types';

interface LicensingContextValue extends LicensingSnapshot {
  readonly busy: boolean;
  readonly hasEntitlement: (entitlement: string) => boolean;
  readonly activate: (activationCode: string, deviceName: string) => Promise<boolean>;
  readonly refresh: () => Promise<boolean>;
  readonly deactivate: () => Promise<boolean>;
  readonly clearLocal: () => Promise<void>;
}

const LicensingContext = createContext<LicensingContextValue | null>(null);

function createService(): LicensingService {
  return new LicensingService(
    new BeadCloudClient(deploymentConfig.beadCloudApiUrl!),
    new LicensingCredentialStore(),
  );
}

function failure(error: unknown): LicensingSnapshot {
  return {
    mode: 'error',
    license: null,
    message: error instanceof Error ? error.message : '授权操作失败，基础功能仍可继续使用。',
  };
}

const LOCAL_ONLY_VALUE: LicensingContextValue = {
  ...FREE_LICENSING_SNAPSHOT,
  message: '当前为纯前端稳定版：图片、项目和导出均在浏览器本地处理，不连接授权服务。',
  busy: false,
  hasEntitlement: () => false,
  activate: async () => false,
  refresh: async () => false,
  deactivate: async () => false,
  clearLocal: async () => undefined,
};

function CloudLicensingProvider({ children }: { readonly children: ReactNode }) {
  const serviceRef = useRef<LicensingService | null>(null);
  if (!serviceRef.current) serviceRef.current = createService();
  const [snapshot, setSnapshot] = useState<LicensingSnapshot>({ mode: 'loading', license: null, message: '正在检查本地设备授权…' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void serviceRef.current!.initialize().then((next) => { if (active) setSnapshot(next); });
    return () => { active = false; };
  }, []);

  const value = useMemo<LicensingContextValue>(() => {
    const run = async (operation: () => Promise<LicensingSnapshot>): Promise<boolean> => {
      setBusy(true);
      try {
        setSnapshot(await operation());
        return true;
      } catch (error) {
        setSnapshot(failure(error));
        return false;
      } finally {
        setBusy(false);
      }
    };
    return {
      ...snapshot,
      busy,
      hasEntitlement: (entitlement) => snapshot.mode === 'active' && Boolean(snapshot.license?.entitlements.includes(entitlement)),
      activate: (activationCode, deviceName) => run(() => serviceRef.current!.activate(activationCode, deviceName)),
      refresh: () => run(() => serviceRef.current!.refresh()),
      deactivate: () => run(() => serviceRef.current!.deactivate()),
      clearLocal: async () => {
        setBusy(true);
        try { setSnapshot(await serviceRef.current!.clearLocal()); }
        catch (error) { setSnapshot(failure(error)); }
        finally { setBusy(false); }
      },
    };
  }, [busy, snapshot]);

  return <LicensingContext.Provider value={value}>{children}</LicensingContext.Provider>;
}

export function LicensingProvider({ children }: { readonly children: ReactNode }) {
  if (!deploymentConfig.beadCloudEnabled) {
    return <LicensingContext.Provider value={LOCAL_ONLY_VALUE}>{children}</LicensingContext.Provider>;
  }
  return <CloudLicensingProvider>{children}</CloudLicensingProvider>;
}

export function useLicensing(): LicensingContextValue {
  const value = useContext(LicensingContext);
  if (!value) throw new Error('useLicensing must be used inside LicensingProvider.');
  return value;
}

export { FREE_LICENSING_SNAPSHOT };
