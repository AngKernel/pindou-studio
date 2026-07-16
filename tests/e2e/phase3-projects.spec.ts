import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function createSavedProject(page: Page): Promise<void> {
  const buffer = await sharp({
    create: { width: 36, height: 36, channels: 4, background: { r: 45, g: 60, b: 160, alpha: 1 } },
  }).png().toBuffer();
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({ name: 'local-project.png', mimeType: 'image/png', buffer });
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });
  await expect(page.getByTestId('project-card')).toHaveCount(1);
}

test('autosaves to IndexedDB and restores the exact project after refresh', async ({ page }) => {
  await createSavedProject(page);
  await page.reload();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-open').click();
  await expect(page.getByText('拼豆生成结果')).toBeVisible();
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器');
  await expect(page.getByText('100×100 · MARD')).toBeVisible();
});

test('renames, duplicates and deletes isolated project records', async ({ page }) => {
  await createSavedProject(page);
  page.once('dialog', (dialog) => dialog.accept('蓝色小图'));
  await page.getByTestId('project-rename').click();
  await expect(page.getByRole('heading', { name: '蓝色小图' })).toBeVisible();

  await page.getByTestId('project-duplicate').click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '蓝色小图 副本' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('project-delete').first().click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '蓝色小图' })).toBeVisible();
});

test('exports and imports a portable project in a fresh browser context', async ({ page, browser }) => {
  await createSavedProject(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('project-export').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto('/');
  await otherPage.getByTestId('project-import-input').setInputFiles(path!);
  await expect(otherPage.getByTestId('project-card')).toHaveCount(1);
  await expect(otherPage.getByText('拼豆生成结果')).toBeVisible();
  await expect(otherPage.getByText('100×100 · MARD')).toBeVisible();
  await otherContext.close();
});

test('rejects a future project before writing any record', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'future.bead.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ formatVersion: 999, payload: '<script>alert(1)</script>' })),
  });
  await expect(page.getByTestId('local-projects').getByRole('alert')).toContainText('不支持项目格式版本 999');
  await expect(page.getByTestId('project-card')).toHaveCount(0);
});

test('keeps image generation usable when IndexedDB is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
  const buffer = await sharp({
    create: { width: 32, height: 32, channels: 4, background: { r: 100, g: 40, b: 150, alpha: 1 } },
  }).png().toBuffer();
  await page.goto('/');
  await expect(page.getByTestId('local-projects').getByRole('alert')).toContainText('编辑功能仍可继续');
  await page.getByTestId('image-file-input').setInputFiles({ name: 'offline.png', mimeType: 'image/png', buffer });
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await expect(page.getByText('拼豆生成结果')).toBeVisible();
});
