'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLicensing } from '../../features/licensing/LicensingProvider';

function modeLabel(mode: ReturnType<typeof useLicensing>['mode']): string {
  if (mode === 'active') return '已验证';
  if (mode === 'offline') return '服务离线';
  if (mode === 'loading') return '检查中';
  if (mode === 'error') return '需要处理';
  return '免费模式';
}

export default function ActivationPage() {
  const licensing = useLicensing();
  const [activationCode, setActivationCode] = useState('');
  const [deviceName, setDeviceName] = useState('当前浏览器');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await licensing.activate(activationCode, deviceName)) setActivationCode('');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-violet-600 dark:text-violet-300">免费邀请内测</p>
            <h1 className="mt-1 text-3xl font-bold">设备功能激活</h1>
          </div>
          <Link href="/" className="min-h-11 rounded-lg border px-4 py-2.5 text-sm">返回工作台</Link>
        </div>

        <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-900 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">当前状态</p>
              <p data-testid="licensing-mode" className="text-lg font-semibold">{modeLabel(licensing.mode)}</p>
            </div>
            {licensing.license && (
              <div className="text-right text-sm">
                <p>{licensing.license.plan} · {licensing.license.deviceName}</p>
                <p data-testid="licensing-quota" className="text-slate-500">额度 {licensing.license.quota.remaining}/{licensing.license.quota.total}</p>
              </div>
            )}
          </div>
          <p data-testid="licensing-message" role={licensing.mode === 'error' ? 'alert' : 'status'} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">{licensing.message}</p>
          {licensing.license?.expiresAt && <p className="mt-2 text-xs text-slate-500">有效期至 {new Date(licensing.license.expiresAt).toLocaleString('zh-CN')}</p>}
          {licensing.license && (
            <div className="mt-3 flex flex-wrap gap-2">
              {licensing.license.entitlements.map((entitlement) => <code key={entitlement} className="rounded bg-violet-50 px-2 py-1 text-xs dark:bg-violet-950">{entitlement}</code>)}
            </div>
          )}
        </section>

        {licensing.mode !== 'active' && (
          <form onSubmit={(event) => { void submit(event); }} className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <label className="block text-sm font-medium" htmlFor="activation-code">邀请激活码</label>
            <input
              id="activation-code" data-testid="activation-code" autoComplete="off" spellCheck={false}
              value={activationCode} onChange={(event) => setActivationCode(event.target.value)}
              placeholder="PD-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              className="mt-2 min-h-12 w-full rounded-lg border px-3 font-mono tracking-wide dark:bg-slate-950"
            />
            <label className="mt-4 block text-sm font-medium" htmlFor="device-name">设备名称（可选）</label>
            <input
              id="device-name" data-testid="device-name" maxLength={80} value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-lg border px-3 dark:bg-slate-950"
            />
            <button data-testid="activate-device" disabled={licensing.busy || !activationCode.trim()} className="mt-5 min-h-12 w-full rounded-lg bg-violet-600 px-4 font-semibold text-white disabled:opacity-50">
              {licensing.busy ? '正在验证…' : '激活当前设备'}
            </button>
          </form>
        )}

        {licensing.mode === 'active' && (
          <div className="flex flex-wrap gap-3">
            <button data-testid="refresh-license" disabled={licensing.busy} onClick={() => { void licensing.refresh(); }} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">刷新授权</button>
            <button data-testid="deactivate-device" disabled={licensing.busy} onClick={() => { void licensing.deactivate(); }} className="min-h-11 rounded-lg bg-red-600 px-4 text-white disabled:opacity-50">停用当前设备</button>
          </div>
        )}

        {(licensing.mode === 'offline' || licensing.mode === 'error') && (
          <button data-testid="clear-local-license" disabled={licensing.busy} onClick={() => { void licensing.clearLocal(); }} className="min-h-11 rounded-lg border border-amber-400 px-4 text-sm disabled:opacity-50">仅清除损坏的本地凭据</button>
        )}

        <section className="rounded-2xl bg-slate-100 p-5 text-sm leading-7 dark:bg-slate-800">
          <h2 className="font-semibold">这不是账号或付费会员</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>激活码只用于免费内测权限，不代表购买、订单或长期服务承诺。</li>
            <li>浏览器会生成不可导出的设备私钥；服务端只接收公钥，不使用 Canvas、字体、WebGL 或音频指纹。</li>
            <li>原始激活码只在首次激活时提交，不会保存在本地项目或授权凭据中。</li>
            <li>图片、图纸和项目不会发送到授权服务；服务离线时基础功能继续可用。</li>
            <li>清除浏览器数据会同时删除设备私钥，并可能被视为新设备。</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
