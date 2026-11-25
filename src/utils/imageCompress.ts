export const MAX_RECEIPT_DIMENSION = 1080;
export const DEFAULT_RECEIPT_QUALITY = 0.72;
export const MAX_COMPRESSED_BYTES = 180 * 1024;
export const MAX_RAW_FALLBACK_BYTES = 350 * 1024;

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc dữ liệu ảnh biên lai.'));
      }
    };
    reader.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh biên lai.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh biên lai.'));
    img.src = objectUrl;
  });
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Không thể nén ảnh trên trình duyệt này.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Nén ảnh biên lai nhẹ (~70KB) trên máy người dùng trước khi tải lên Supabase Storage.
 */
export async function compressReceiptImage(
  file: File | Blob,
  options?: { maxDimension?: number; quality?: number }
): Promise<Blob> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP).');
  }

  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return file;
  }

  const maxDimension = options?.maxDimension ?? MAX_RECEIPT_DIMENSION;
  const quality = options?.quality ?? DEFAULT_RECEIPT_QUALITY;

  const objectUrl = URL.createObjectURL(file);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImageElement(objectUrl);
    } catch {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        img = await loadImageElement(dataUrl);
      } catch {
        if (file.size <= MAX_RAW_FALLBACK_BYTES) {
          return file;
        }
        throw new Error(
          'Trình duyệt không giải mã được định dạng ảnh này (thử chụp màn hình hoặc chọn ảnh JPG/PNG).'
        );
      }
    }
    const origWidth = img.naturalWidth || img.width || maxDimension;
    const origHeight = img.naturalHeight || img.height || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(origWidth, origHeight));

    const targetWidth = Math.max(1, Math.round(origWidth * scale));
    const targetHeight = Math.max(1, Math.round(origHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    // Nền trắng tránh PNG trong suốt bị nền đen khi chuyển JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let compressed = await canvasToJpegBlob(canvas, quality);
    if (compressed.size > MAX_COMPRESSED_BYTES) {
      compressed = await canvasToJpegBlob(canvas, 0.55);
    }

    return compressed;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
