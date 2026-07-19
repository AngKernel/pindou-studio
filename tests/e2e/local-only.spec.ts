import { expect, test } from '@playwright/test';

test('runs the public build without licensing UI, credentials, or cloud requests', async ({ page }) => {
  let cloudRequests = 0;
  await page.route('**/v1/**', async (route) => {
    cloudRequests += 1;
    await route.abort('blockedbyclient');
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'");
  expect(response?.headers()['content-security-policy']).not.toContain('127.0.0.1:8787');
  await expect(page.getByTestId('activation-link')).toHaveCount(0);

  await page.getByTestId('image-file-input').setInputFiles('tests/fixtures/phase1/transparent-1.png');
  await page.getByTestId('crop-confirm').click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await expect(page.getByTestId('export-panel')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('export-png')).toBeEnabled();
  await expect(page.getByTestId('export-csv')).toBeEnabled();
  await expect(page.getByTestId('export-pdf')).toBeEnabled();
  await expect(page.getByTestId('pdf-mode').locator('option[value="monochrome"]')).toHaveCount(0);
  await expect(page.getByTestId('pdf-entitlement')).toContainText('纯前端稳定版');

  await page.goto('/activation');
  await expect(page.getByRole('heading', { name: '纯前端本地模式' })).toBeVisible();
  await expect(page.getByTestId('local-only-notice')).toContainText('当前站点不连接授权服务');
  await expect(page.getByTestId('activation-code')).toHaveCount(0);
  await expect(page.getByTestId('activate-device')).toHaveCount(0);
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name));
  expect(databases).not.toContain('pindou-studio-licensing');
  expect(cloudRequests).toBe(0);
});
