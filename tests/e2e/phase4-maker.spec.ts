import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function createProject(page: Page): Promise<void> {
  const buffer = await sharp({
    create: { width: 48, height: 48, channels: 4, background: { r: 220, g: 80, b: 90, alpha: 1 } },
  }).png().toBuffer();
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({ name: 'maker.png', mimeType: 'image/png', buffer });
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });
}

async function enterMaker(page: Page): Promise<void> {
  await expect(page.getByTestId('enter-maker')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('enter-maker').click();
  await expect(page.getByTestId('maker-canvas')).toBeVisible({ timeout: 15_000 });
}

test('configures boards and persists maker progress, board and lock semantics', async ({ page }) => {
  await createProject(page);
  await expect(page.getByTestId('board-count')).toContainText('4×4，共 16 块');
  await page.getByLabel('豆子直径').fill('2.6');
  await expect(page.getByTestId('finished-size')).toContainText('26×26 cm');
  await page.getByTestId('board-width').fill('50');
  await page.getByTestId('board-height').fill('50');
  await expect(page.getByTestId('board-count')).toContainText('2×2，共 4 块');
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });

  await enterMaker(page);
  const canvas = page.getByTestId('maker-canvas');
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(page.getByTestId('overall-progress')).toContainText('1/10000');
  await expect(page.getByTestId('maker-position')).toContainText('第 1 行，第 1 列');

  await canvas.dispatchEvent('pointerdown', { pointerId: 77, pointerType: 'touch', clientX: 20, clientY: 20, bubbles: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 77, pointerType: 'touch', clientX: 50, clientY: 20, bubbles: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 77, pointerType: 'touch', clientX: 50, clientY: 20, bubbles: true });
  await expect(page.getByTestId('overall-progress')).toContainText('1/10000');

  await page.getByTestId('maker-lock').click();
  await canvas.click({ position: { x: 36, y: 12 } });
  await expect(page.getByTestId('overall-progress')).toContainText('1/10000');
  await page.getByTestId('maker-lock').click();

  await page.getByTestId('next-board').click();
  await expect(page.getByTestId('maker-board-label')).toHaveText('豆板 2/4');
  await page.getByTestId('maker-canvas').click({ position: { x: 12, y: 12 } });
  await expect(page.getByTestId('overall-progress')).toContainText('2/10000');
  await page.getByTestId('hide-completed').check();
  await expect(page.getByTestId('maker-save-state')).toContainText('进度已保存', { timeout: 15_000 });

  await page.reload();
  await expect(page.getByTestId('maker-board-label')).toHaveText('豆板 2/4');
  await expect(page.getByTestId('overall-progress')).toContainText('2/10000');
  await expect(page.getByTestId('maker-position')).toContainText('第 1 行，第 51 列');
  await page.getByTestId('wake-lock').click();
  await expect(page.getByTestId('wake-status')).toHaveText(/已启用|不支持|无法启用/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('maker-canvas')).toBeVisible();
  await expect(page.getByTestId('maker-lock')).toHaveCSS('min-height', '44px');
});

test('preserves completion data through project export and fresh-context import', async ({ page, browser }) => {
  await createProject(page);
  await enterMaker(page);
  await page.getByTestId('maker-canvas').click({ position: { x: 12, y: 12 } });
  await expect(page.getByTestId('maker-save-state')).toContainText('进度已保存', { timeout: 15_000 });

  await page.goto('/');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('project-export').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const context = await browser.newContext();
  const importedPage = await context.newPage();
  await importedPage.goto('/');
  await importedPage.getByTestId('project-import-input').setInputFiles(path!);
  await expect(importedPage.getByTestId('enter-maker')).toBeEnabled({ timeout: 15_000 });
  await importedPage.getByTestId('enter-maker').click();
  await expect(importedPage.getByTestId('overall-progress')).toContainText('1/10000');
  await context.close();
});
