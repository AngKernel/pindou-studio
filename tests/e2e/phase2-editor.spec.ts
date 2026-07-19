import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function openEditor(page: Page): Promise<void> {
  const buffer = await sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 30, g: 40, b: 130, alpha: 1 } },
  }).png().toBuffer();
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({ name: 'editor.png', mimeType: 'image/png', buffer });
  await page.getByTestId('crop-confirm').click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await page.getByLabel('锁定处理区域宽高比').uncheck();
  await page.getByLabel('横轴切割数量 (10-300):').fill('10');
  await page.getByLabel('纵轴切割数量 (10-300):').fill('10');
  await page.getByRole('button', { name: '应用数字' }).click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await page.getByRole('button', { name: '进入手动编辑模式' }).click();
  await expect(page.getByTestId('editor-workspace')).toBeVisible();
}

test('edits with patch undo/redo and blocks changes while locked', async ({ page }) => {
  await openEditor(page);
  const color = page.getByTestId('editor-color');
  const alternateValue = await color.locator('option').nth(1).getAttribute('value');
  expect(alternateValue).not.toBeNull();
  await color.selectOption(alternateValue!);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.click({ position: { x: 52, y: 52 } });
  await expect(page.getByTestId('editor-history')).toHaveText('历史：1/0');
  await page.getByTestId('editor-undo').click();
  await expect(page.getByTestId('editor-history')).toHaveText('历史：0/1');
  await page.getByTestId('editor-redo').click();
  await expect(page.getByTestId('editor-history')).toHaveText('历史：1/0');
  await page.getByTestId('editor-lock').click();
  await canvas.click({ position: { x: 76, y: 52 } });
  await expect(page.getByTestId('editor-history')).toHaveText('历史：1/0');
});

test('selects, copies, pastes, moves and flips a region', async ({ page }) => {
  await openEditor(page);
  const canvas = page.getByTestId('editor-canvas');
  const color = page.getByTestId('editor-color');
  const alternateValue = await color.locator('option').nth(1).getAttribute('value');
  await color.selectOption(alternateValue!);
  await canvas.click({ position: { x: 28, y: 28 } });
  await page.getByTestId('tool-select').click();
  await canvas.hover({ position: { x: 28, y: 28 } });
  await page.mouse.down();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 52, box!.y + 52);
  await page.mouse.up();
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await canvas.hover({ position: { x: 100, y: 100 } });
  await page.getByRole('button', { name: '粘贴', exact: true }).click();
  await expect(page.getByTestId('editor-history')).toHaveText('历史：2/0');
  await page.getByTestId('tool-move').click();
  await canvas.click({ position: { x: 124, y: 124 } });
  await page.getByRole('button', { name: '水平翻转', exact: true }).click();
  await page.getByRole('button', { name: '垂直翻转', exact: true }).click();
  await expect(page.getByTestId('editor-history')).toHaveText('历史：5/0');
});

test('switches editor views and handles a two-pointer pinch on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.getByTestId('toggle-codes').check();
  await page.getByTestId('toggle-original').check();
  await expect(page.getByTestId('toggle-codes')).toBeChecked();
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveCSS('touch-action', 'none');
  const before = await page.getByTestId('editor-zoom').textContent();
  await canvas.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 100, clientY: 200, bubbles: true });
  await canvas.dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', clientX: 200, clientY: 200, bubbles: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 12, pointerType: 'touch', clientX: 260, clientY: 200, bubbles: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', clientX: 100, clientY: 200, bubbles: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch', clientX: 260, clientY: 200, bubbles: true });
  await expect(page.getByTestId('editor-zoom')).not.toHaveText(before ?? '');
  await expect(page.getByTestId('editor-history')).toHaveText('历史：0/0');
});
