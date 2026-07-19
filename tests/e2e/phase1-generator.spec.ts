import { expect, test } from '@playwright/test';
import sharp from 'sharp';

async function fixture(
  format: 'jpeg' | 'png' | 'webp',
  width = 96,
  height = 96,
): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 24, g: 32, b: 128, alpha: 1 },
    },
  });
  return format === 'jpeg'
    ? image.jpeg().toBuffer()
    : format === 'webp'
      ? image.webp().toBuffer()
      : image.png().toBuffer();
}

test('rejects a renamed SVG with a stable Chinese error', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({
    name: 'renamed.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.locator('[role="alert"]').filter({ hasText: '无法识别图片内容' })).toContainText(
    '无法识别图片内容',
  );
  await expect(page.getByText('拼豆生成结果')).toHaveCount(0);
});

test('accepts a PNG through drag and drop', async ({ page }) => {
  await page.goto('/');
  const png = await fixture('png');
  await page.getByTestId('image-drop-zone').evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, png.toString('base64'));
  await page.getByTestId('crop-confirm').click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', { timeout: 20_000 });
});

test('exposes the upload area as a keyboard-focusable control', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('image-drop-zone')).toHaveAttribute('role', 'button');
  await expect(page.getByTestId('image-drop-zone')).toHaveAttribute('tabindex', '0');
});

for (const format of ['jpeg', 'png', 'webp'] as const) {
  test(`imports ${format} and generates a 100×100 pattern in a Worker`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('image-file-input').setInputFiles({
      name: `fixture.${format === 'jpeg' ? 'jpg' : format}`,
      mimeType: `image/${format}`,
      buffer: await fixture(format),
    });
    await page.getByTestId('crop-confirm').click();

    await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
      timeout: 45_000,
    });
    await expect(page.getByText('预处理原图')).toBeVisible();
    await expect(page.getByText('拼豆生成结果')).toBeVisible();
    await expect(page.getByText('Worker 耗时')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2);
  });
}

test('supports independent dimensions, four modes and latest-task wins', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('image-file-input').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: await fixture('png', 120, 80),
  });
  await page.getByTestId('crop-confirm').click();
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });

  await page.getByLabel('锁定处理区域宽高比').uncheck();
  await page.getByLabel('纵轴切割数量 (10-300):').fill('80');
  await page.getByRole('button', { name: '应用数字' }).click();
  const mode = page.getByLabel('处理模式:');
  await mode.selectOption('dither');
  await mode.selectOption('limited');
  await mode.selectOption('average');

  await expect(mode).toHaveValue('average');
  await expect(page.getByTestId('generation-status')).toContainText('生成完成', {
    timeout: 45_000,
  });
});
