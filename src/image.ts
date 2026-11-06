// Foto's inlezen, (zo nodig) omzetten en verkleinen voordat ze geüpload worden.

export class PhotoError extends Error {}

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

type Drawable = { width: number; height: number; source: CanvasImageSource };

/** Probeer een foto te tekenen: eerst snel (createImageBitmap), dan via <img>. */
async function tryDecode(blob: Blob): Promise<Drawable | null> {
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (bmp) return { width: bmp.width, height: bmp.height, source: bmp };
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null); // geen Event doorgeven, gewoon "niet gelukt"
      i.src = url;
    });
    return img && img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight, source: img } : null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Foto inlezen; iPhone-foto's (HEIC) worden zo nodig eerst naar JPEG omgezet. */
async function decode(file: File): Promise<Drawable> {
  const direct = await tryDecode(file);
  if (direct) return direct;
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import('heic2any');
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const jpg = Array.isArray(out) ? out[0] : out;
      const d = await tryDecode(jpg);
      if (d) return d;
    } catch { /* hieronder een duidelijke melding */ }
  }
  throw new PhotoError(
    'Deze foto kan niet gelezen worden. Kies een andere foto, of maak een screenshot van de foto en voeg die toe.',
  );
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new PhotoError('Foto verwerken lukte niet.'))), 'image/jpeg', quality));
}

/** Verkleint een foto tot max 1600px en maakt er een JPEG van (scheelt opslag en data). */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const img = await decode(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Foto verwerken lukte niet.');
  ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas, quality);
}

/** Vierkant bijsnijden (midden) en verkleinen, voor profielfoto's. */
export async function squareImage(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const img = await decode(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new PhotoError('Foto verwerken lukte niet.');
  ctx.drawImage(img.source, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return toJpeg(c, quality);
}
