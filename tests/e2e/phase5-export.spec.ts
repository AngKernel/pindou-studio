import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';

async function createProject(page: Page, options: { width?: number; height?: number; transparent?: boolean } = {}): Promise<void> {
  const source = options.transparent
    ? await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 20, height: 40, channels: 4, background: { r: 230, g: 50, b: 60, alpha: 1 } } }, left: 0, top: 0 }])
      .png().toBuffer()
    : await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 230, g: 50, b: 60, alpha: 1 } } }).png().toBuffer();
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({ name: 'export.png', mimeType: 'image/png', buffer: source });
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  if (options.width || options.height) {
    await page.getByLabel('锁定处理区域宽高比').uncheck();
    await page.getByLabel('横轴切割数量 (10-300):').fill(String(options.width ?? 100));
    await page.getByLabel('纵轴切割数量 (10-300):').fill(String(options.height ?? 100));
    await page.getByRole('button', { name: '应用数字' }).click();
    await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  }
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });
  await expect(page.getByTestId('export-panel')).toBeVisible();
}

async function downloadFrom(page: Page, testId: string): Promise<Download> {
  const pending = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  return pending;
}

test('calculates live project/board statistics and exports Excel-compatible inventory CSV', async ({ page }) => {
  test.slow();
  await createProject(page);
  await expect(page.getByTestId('stats-summary')).toHaveText('10000 颗 · 1 色');
  await page.getByTestId('stats-board').click();
  await expect(page.getByTestId('stats-summary')).toHaveText('841 颗 · 1 色');
  await page.getByTestId('stats-sort').selectOption('count');
  await page.getByTestId('stats-project').click();

  const download = await downloadFrom(page, 'export-csv');
  expect(download.suggestedFilename()).toMatch(/-inventory\.csv$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.toString('utf8');
  expect(csv).toContain('品牌,色号,颜色名称,RGB,数量,占比\r\n');
  expect(csv).toContain(',10000,100.00%\r\n');
  expect(csv).toMatch(/\r\nMARD,[^#]/);
  expect(csv).toContain('未提供（色号');

  await page.getByTestId('enter-maker').click();
  await expect(page.getByTestId('maker-canvas')).toBeVisible();
  await page.getByTestId('next-board').click();
  await page.getByTestId('next-board').click();
  await page.getByTestId('next-board').click();
  await expect(page.getByTestId('maker-board-label')).toHaveText('豆板 4/16');
  await page.getByTestId('maker-canvas').click({ position: { x: 12, y: 12 } });
  await expect(page.getByTestId('maker-save-state')).toContainText('进度已保存', { timeout: 15_000 });
  await page.getByRole('button', { name: '退出制作' }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-open').click();
  await expect(page.getByTestId('export-panel')).toBeVisible();
  await page.getByTestId('stats-board').click();
  await expect(page.getByTestId('stats-summary')).toHaveText('377 颗 · 1 色');
});

test('exports pattern, grid and code PNG variants with scale and background choices', async ({ page }) => {
  test.slow();
  await createProject(page, { width: 10, height: 10, transparent: true });
  await page.getByTestId('png-scale').fill('1');
  const pattern = await downloadFrom(page, 'export-png');
  const patternPath = await pattern.path();
  expect(await sharp(patternPath!).metadata()).toMatchObject({ format: 'png', width: 80, height: 80 });

  await page.getByTestId('png-style').selectOption('grid');
  await page.getByTestId('png-scale').fill('2');
  await page.getByTestId('png-background').selectOption('transparent');
  const grid = await downloadFrom(page, 'export-png');
  const gridPath = await grid.path();
  expect(await sharp(gridPath!).metadata()).toMatchObject({ format: 'png', width: 160, height: 160, hasAlpha: true });
  const raw = await sharp(gridPath!).ensureAlpha().raw().toBuffer();
  expect(raw[(88 * 160 + 152) * 4 + 3]).toBe(0);

  await page.getByTestId('png-style').selectOption('codes');
  await page.getByTestId('png-background').selectOption('white');
  const codes = await downloadFrom(page, 'export-png');
  expect(await sharp((await codes.path())!).metadata()).toMatchObject({ format: 'png', width: 160, height: 160 });
});

test('exports one A4 PDF page per board and exposes cancellation on mobile', async ({ page }) => {
  test.slow();
  await createProject(page);
  await page.getByTestId('board-width').fill('50');
  await page.getByTestId('board-height').fill('50');
  await expect(page.getByTestId('board-count')).toContainText('2×2，共 4 块');
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });

  const pdf = await downloadFrom(page, 'export-pdf');
  if (process.env.PINDOU_PDF_SAMPLE_PATH) await pdf.saveAs(process.env.PINDOU_PDF_SAMPLE_PATH);
  const pdfPath = await pdf.path();
  const text = (await readFile(pdfPath!)).toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/Type /Pages /Count 4');
  expect(text).toContain('(Pindou Studio - Board 4 / 4)');
  expect(text).toContain('(Rows 51-100 | Columns 51-100 | TOP ^)');

  await page.getByLabel('锁定处理区域宽高比').uncheck();
  await page.getByLabel('横轴切割数量 (10-300):').fill('300');
  await page.getByLabel('纵轴切割数量 (10-300):').fill('300');
  await page.getByRole('button', { name: '应用数字' }).click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 45_000 });
  await page.getByTestId('board-width').fill('300');
  await page.getByTestId('board-height').fill('300');
  await expect(page.getByTestId('active-project-name')).toContainText('已保存到此浏览器', { timeout: 15_000 });
  await page.getByTestId('export-pdf').click();
  await page.getByTestId('export-cancel').evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId('export-status')).toContainText('导出任务已取消');
  await page.getByTestId('png-scale').fill('8');
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('export-panel').getByRole('alert')).toContainText(
    'PNG 像素尺寸过大',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('export-panel')).toBeVisible();
  await expect(page.getByTestId('export-png')).toHaveCSS('min-height', '44px');
});
