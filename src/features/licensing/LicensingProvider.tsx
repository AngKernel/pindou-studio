'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BeadCloudClient } from '../../api/bead-cloud-client';
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
  const configuredUrl = process.env.NEXT_PUBLIC_BEAD_CLOUD_API_URL?.trim();
  const baseUrl = configuredUrl || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8787' : undefined);
  if (!baseUrl) return new LicensingService(null, new LicensingCredentialStore());
  try {
    return new LicensingService(new BeadCloudClient(baseUrl), new LicensingCredentialStore());
  } catch {
    return new LicensingService(null, new LicensingCredentialStore());
  }
}

function failure(error: unknown): LicensingSnapshot {
  return {
    mode: 'error',
    license: null,
    message: error instanceof Error ? error.message : '授权操作失败，基础功能仍可继续使用。',
  };
}

export function LicensingProvider({ children }: { readonly children: ReactNode }) {
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

export function useLicensing(): LicensingContextValue {
  const value = useContext(LicensingContext);
  if (!value) throw new Error('useLicensing must be used inside LicensingProvider.');
  return value;
}

export { FREE_LICENSING_SNAPSHOT };
