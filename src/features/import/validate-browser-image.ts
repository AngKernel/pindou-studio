import {
  ImageImportError,
  validateImageFileCandidate,
  type ImageImportLimits,
  type ValidatedImageFile,
} from '../../core/image/import-policy';

export async function validateBrowserImageFile(
  file: File,
  limits?: ImageImportLimits,
): Promise<ValidatedImageFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return validateImageFileCandidate(
    {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      bytes,
    },
    limits,
  );
}

export async function validateAndDecodeBrowserImageFile(
  file: File,
  limits?: ImageImportLimits,
): Promise<ValidatedImageFile> {
  const validated = await validateBrowserImageFile(file, limits);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageImportError('DECODE_FAILED', '图片无法解码，文件可能已损坏。');
  }

  const decodedWidth = bitmap.width;
  const decodedHeight = bitmap.height;
  try {
    const dimensionsMatch = decodedWidth === validated.width && decodedHeight === validated.height;
    const dimensionsMatchAfterExifRotation = decodedWidth === validated.height && decodedHeight === validated.width;
    if (!dimensionsMatch && !dimensionsMatchAfterExifRotation) {
      throw new ImageImportError(
        'DECODE_FAILED',
        '图片文件头尺寸与实际解码尺寸不一致，已拒绝导入。',
      );
    }
  } finally {
    bitmap.close();
  }

  return {
    ...validated,
    width: decodedWidth,
    height: decodedHeight,
  };
}
