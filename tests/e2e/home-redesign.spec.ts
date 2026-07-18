import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixturePath = path.resolve('tests/fixtures/phase1/landscape-2.png');

async function uploadAndWaitForPattern(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles(fixturePath);
  await expect(page.getByTestId('visual-cropper')).toBeVisible();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });
}

test('completes the redesigned upload, visual crop, edit and export flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把喜欢的图片， 变成真正能拼的图纸。' })).toBeVisible();
  await expect(page.getByTestId('image-drop-zone')).toHaveAttribute('role', 'button');

  await page.getByTestId('image-file-input').setInputFiles(fixturePath);
  await expect(page.getByTestId('visual-cropper')).toBeVisible();
  await expect(page.getByTestId('workflow-stepper')).toBeVisible();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });

  const cropBox = page.getByTestId('crop-box');
  const beforeCrop = await cropBox.boundingBox();
  expect(beforeCrop).not.toBeNull();
  const southeastHandle = page.getByRole('button', { name: '调整右下角' });
  await southeastHandle.scrollIntoViewIfNeeded();
  const handleBox = await southeastHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x - 72, handleBox!.y - 42, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });
  const afterCrop = await cropBox.boundingBox();
  expect(afterCrop).not.toBeNull();
  expect(afterCrop!.width).toBeLessThan(beforeCrop!.width);
  expect(afterCrop!.height).toBeLessThan(beforeCrop!.height);

  await page.getByRole('button', { name: '1 : 1' }).click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });
  const squareCrop = await cropBox.boundingBox();
  expect(squareCrop).not.toBeNull();
  expect(Math.abs(squareCrop!.width - squareCrop!.height)).toBeLessThan(2);

  await page.getByRole('button', { name: '顺时针旋转至 90 度' }).click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });

  await expect(page.getByTestId('project-card')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '进入手动编辑模式' }).click();
  await expect(page.getByTestId('editor-workspace')).toBeVisible();
  await page.getByRole('button', { name: '完成编辑' }).click();
  await expect(page.getByTestId('export-panel')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-png').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await expect(page.getByTestId('export-status')).toContainText('导出完成', {
    timeout: 30_000,
  });
});

test('keeps the touch cropper usable on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadAndWaitForPattern(page);

  const cropBox = page.getByTestId('crop-box');
  const southeastHandle = page.getByRole('button', { name: '调整右下角' });
  await southeastHandle.scrollIntoViewIfNeeded();
  const beforeCrop = await cropBox.boundingBox();
  expect(beforeCrop).not.toBeNull();
  const handleBox = await southeastHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;

  await southeastHandle.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    clientX: startX,
    clientY: startY,
    bubbles: true,
  });
  await southeastHandle.dispatchEvent('pointermove', {
    pointerId: 41,
    pointerType: 'touch',
    clientX: startX - 45,
    clientY: startY - 28,
    bubbles: true,
  });
  await southeastHandle.dispatchEvent('pointerup', {
    pointerId: 41,
    pointerType: 'touch',
    clientX: startX - 45,
    clientY: startY - 28,
    bubbles: true,
  });

  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });
  const afterCrop = await cropBox.boundingBox();
  expect(afterCrop).not.toBeNull();
  expect(afterCrop!.width).toBeLessThan(beforeCrop!.width);
  expect(afterCrop!.height).toBeLessThan(beforeCrop!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
