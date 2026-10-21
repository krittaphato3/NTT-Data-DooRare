/** Shrinks a photo to a JPEG <= `maxBytes` (spec UI-14: compressed to <= 1.5 MB) and returns it as base64 (no data: prefix). */
export async function compressImageToBase64(file: File, maxBytes = 1.5 * 1024 * 1024, maxSide = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปได้');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4, 0.3]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) return blobToBase64(blob);
    }
    throw new Error('รูปใหญ่เกินไป กรุณาถ่ายใหม่ด้วยความละเอียดต่ำลง');
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}
