export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Approximate size in bytes of the encoded image. */
  bytes: number;
}

/**
 * Firestore documents are capped at 1 MiB, and a data URL is base64 (~4/3 of the raw
 * size), so keep encoded images comfortably under that.
 */
export const MAX_INLINE_IMAGE_BYTES = 700 * 1024;

/**
 * Resizes an image in the browser and re-encodes it as JPEG, stepping quality and size
 * down until it fits `maxBytes`. Used to store photos inline in Firestore (no Storage).
 */
export async function compressImage(
  file: File,
  maxDim: number,
  maxBytes = MAX_INLINE_IMAGE_BYTES
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw Object.assign(new Error('Not an image'), { code: 'image/not-an-image' });
  }

  const bitmap = await loadBitmap(file);
  try {
    let dim = maxDim;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not supported');
      // JPEG has no transparency: paint white behind PNGs with alpha.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.7, 0.58]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        if (bytes <= maxBytes) return { dataUrl, width, height, bytes };
      }
      dim = Math.round(dim * 0.75);
    }
  } finally {
    if ('close' in bitmap) bitmap.close();
  }
  throw Object.assign(new Error('Image too large'), { code: 'image/too-large' });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Respect EXIF orientation so phone photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> (e.g. formats createImageBitmap can't decode) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw Object.assign(new Error('Unsupported image'), { code: 'image/unsupported' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
