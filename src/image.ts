/** Verkleint een foto tot max 1600px en maakt er een JPEG van (scheelt opslag en data). */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  if (bitmap) {
    w = bitmap.width; h = bitmap.height;
    draw = (ctx, cw, ch) => ctx.drawImage(bitmap, 0, 0, cw, ch);
  } else {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth; h = img.naturalHeight;
    draw = (ctx, cw, ch) => ctx.drawImage(img, 0, 0, cw, ch);
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  draw(ctx, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
}

/** Vierkant bijsnijden (midden) en verkleinen, voor profielfoto's. */
export async function squareImage(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
}
