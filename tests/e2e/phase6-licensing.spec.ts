import { expect, test, type Page } from '@playwright/test';

const license = {
  licenseId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  deviceName: 'E2E 浏览器',
  plan: 'beta',
  status: 'active',
  expiresAt: '2030-01-01T00:00:00.000Z',
  entitlements: ['pdf.monochrome.experimental'],
  quota: { total: 5, used: 1, remaining: 4 },
} as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
};

function tokens(sequence: number) {
  return {
    protocolVersion: 1,
    accessToken: `access-${String(sequence)}`.padEnd(40, 'a'),
    accessExpiresAt: '2030-01-01T00:15:00.000Z',
    refreshToken: `refresh-${String(sequence)}`.padEnd(43, 'r'),
    refreshExpiresAt: '2030-02-01T00:00:00.000Z',
    license,
  };
}

async function installSuccessApi(page: Page, state: { offline: boolean; activations: number; refreshes: number }) {
  await page.route('**/v1/**', async (route) => {
    if (state.offline) {
      await route.abort('connectionfailed');
      return;
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/licenses/activate') {
      state.activations += 1;
      const body: unknown = route.request().postDataJSON();
      expect(body).toMatchObject({ deviceName: 'E2E 浏览器', publicKeyJwk: { kty: 'EC', crv: 'P-256' } });
      expect(JSON.stringify(body)).not.toContain('"d"');
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(tokens(1)) });
      return;
    }
    if (path === '/v1/licenses/refresh') {
      state.refreshes += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(tokens(state.refreshes + 1)) });
      return;
    }
    if (path === '/v1/licenses/deactivate-device') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found' } }) });
  });
}

async function activate(page: Page, state: { activations: number }): Promise<void> {
  const response = await page.goto('/activation');
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  await expect(page.getByTestId('licensing-mode')).toHaveText('免费模式');
  await page.getByTestId('device-name').fill('E2E 浏览器');
  await page.getByTestId('activation-code').fill('PD-0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ');
  await page.getByTestId('activate-device').click();
  await expect.poll(() => state.activations).toBe(1);
  await expect(page.getByTestId('licensing-mode')).toHaveText('已验证');
}

test('activates with a non-exportable device key, refreshes without the raw code, and deactivates', async ({ page }) => {
  const state = { offline: false, activations: 0, refreshes: 0 };
  await installSuccessApi(page, state);
  await activate(page, state);
  expect(state.activations).toBe(1);
  await expect(page.getByTestId('licensing-quota')).toContainText('4/5');

  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pindou-studio-licensing', 1);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('credentials').objectStore('credentials').getAll();
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const device = values.find((value) => Boolean(value && typeof value === 'object' && 'key' in value && value.key === 'device')) as { privateKey: CryptoKey };
    const serialized = JSON.stringify(values);
    return {
      count: values.length,
      privateKeyExtractable: device.privateKey.extractable,
      hasActivationCode: serialized.includes('activationCode') || serialized.includes('PD-0123'),
      hasAccessToken: serialized.includes('accessToken') || serialized.includes('access-1'),
    };
  });
  expect(stored).toEqual({ count: 2, privateKeyExtractable: false, hasActivationCode: false, hasAccessToken: false });

  await page.reload();
  await expect(page.getByTestId('licensing-mode')).toHaveText('已验证');
  expect(state.activations).toBe(1);
  expect(state.refreshes).toBe(1);
  await page.getByTestId('deactivate-device').click();
  await expect(page.getByTestId('licensing-mode')).toHaveText('免费模式');
});

test('shows stable device-limit errors without turning activation into an account flow', async ({ page }) => {
  await page.route('**/v1/**', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    : route.fulfill({
      status: 409,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'DEVICE_LIMIT_REACHED', message: 'internal wording' } }),
    }));
  await page.goto('/activation');
  await page.getByTestId('activation-code').fill('PD-0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ');
  await page.getByTestId('activate-device').click();
  await expect(page.getByTestId('licensing-message')).toContainText('设备数量已达到上限');
  await expect(page.getByText('这不是账号或付费会员')).toBeVisible();
});

test('disables the experimental entitlement offline while generation and ordinary exports remain usable', async ({ page }) => {
  const state = { offline: false, activations: 0, refreshes: 0 };
  await installSuccessApi(page, state);
  await activate(page, state);
  state.offline = true;
  await page.reload();
  await expect(page.getByTestId('licensing-mode')).toHaveText('服务离线');
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles('tests/fixtures/phase1/transparent-1.png');
  await page.getByTestId('crop-confirm').click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await expect(page.getByTestId('export-panel')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('export-png')).toBeEnabled();
  await expect(page.getByTestId('export-csv')).toBeEnabled();
  await expect(page.getByTestId('export-pdf')).toBeEnabled();
  await expect(page.getByTestId('pdf-mode').locator('option[value="monochrome"]')).toBeDisabled();
  await expect(page.getByTestId('pdf-mode')).toHaveValue('color');
});
