import { MEASURE_FIELDS, POSES, photoOf, type MeasureKey, type Measurement } from './types';
import { signedUrls } from './progress';
import { fromISO, today } from './dates';

// Standaard-PDF-lettertypes kennen geen emoji of het wiskundige minteken: alleen gewone tekens hier.
// Verhoudingen (zonder eenheid) met 2 decimalen, maten met 1
const nl = (n: number | null, unit: string) =>
  n == null ? '-' : `${n.toLocaleString('nl-NL', unit ? { maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`.trim();
const dd = (a: number | null, b: number | null, unit: string) => {
  if (a == null || b == null) return '-';
  const f = unit ? 10 : 100;
  const d = Math.round((b - a) * f) / f;
  return `${d > 0 ? '+' : d < 0 ? '-' : ''}${Math.abs(d).toLocaleString('nl-NL', unit ? { maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`.trim();
};
const longDate = (s: string) =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(fromISO(s));
const shortDate = (s: string) =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(fromISO(s));

/** Foto ophalen en bijsnijden tot 3:4 staand, als JPEG-dataURL. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const W = 600, H = 800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const scale = Math.max(W / bmp.width, H / bmp.height);
    const w = bmp.width * scale, h = bmp.height * scale;
    ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

export interface PdfOptions { a: Measurement; b: Measurement | null; fields: MeasureKey[]; height: number | null }

export async function makeProgressPdf(ms: Measurement[], name: string, opt: PdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 14, PW = 210, CW = PW - 2 * M;
  const accent: [number, number, number] = [112, 61, 87]; // mauve shadow
  const grey: [number, number, number] = [122, 100, 104];
  const ink: [number, number, number] = [36, 23, 21];
  const { a: A, b: B } = opt;

  const footer = () => {
    doc.setFontSize(8); doc.setTextColor(...grey);
    doc.text('Prive document - alleen voor jou. LockedIn.', M, 290);
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber}`, PW - M, 290, { align: 'right' });
  };

  // ---- Kop ----
  doc.setFillColor(...accent); doc.rect(0, 0, PW, 4, 'F');
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('Mijn voortgang', M, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...grey);
  doc.text(`${name}  -  ${B ? `${shortDate(A.measured_on)} tot ${shortDate(B.measured_on)}` : shortDate(A.measured_on)}  -  gemaakt op ${longDate(today())}`, M, 27);
  doc.setFillColor(246, 238, 241); doc.setDrawColor(217, 184, 196);
  doc.roundedRect(M, 31, CW, 9, 2, 2, 'FD');
  doc.setFontSize(9.5); doc.setTextColor(64, 42, 44);
  doc.text('Prive: dit overzicht is voor jou. Niemand in de groep kan deze gegevens zien.', M + 3, 36.8);

  // ---- Matentabel: moment A vs B ----
  let y = 50;
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Maten', M, y);
  y += 4;
  const cols = [M, M + 50, M + 94, M + 138];
  doc.setFillColor(246, 238, 241); doc.rect(M, y, CW, 8, 'F');
  doc.setFontSize(9.5); doc.setTextColor(...grey);
  ['', shortDate(A.measured_on), B ? shortDate(B.measured_on) : '-', 'Verschil'].forEach((h, i) => doc.text(h, cols[i] + 2, y + 5.4));
  y += 8;
  const ratio = (x?: number | null, z?: number | null) => (x != null && z != null && z > 0 ? Math.round((x / z) * 100) / 100 : null);
  const rows: { label: string; a: number | null; b: number | null; unit: string }[] = [
    ...MEASURE_FIELDS.filter((f) => opt.fields.includes(f.key) || A[f.key] != null || B?.[f.key] != null)
      .map((f) => ({ label: f.label, a: A[f.key] ?? null, b: B?.[f.key] ?? null, unit: f.unit })),
    { label: 'Taille / heupen', a: ratio(A.waist_cm, A.hips_cm), b: ratio(B?.waist_cm, B?.hips_cm), unit: '' },
    { label: 'Taille / lengte', a: ratio(A.waist_cm, opt.height), b: ratio(B?.waist_cm, opt.height), unit: '' },
  ].filter((r, i, all) => i < all.length - 2 || r.a != null || r.b != null);
  doc.setFontSize(10.5);
  for (const r of rows) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink);
    doc.text(r.label, cols[0] + 2, y + 5.6);
    doc.setFont('helvetica', 'normal');
    doc.text(nl(r.a, r.unit), cols[1] + 2, y + 5.6);
    doc.text(B ? nl(r.b, r.unit) : '-', cols[2] + 2, y + 5.6);
    doc.setFont('helvetica', 'bold');
    if (r.a != null && r.b != null && r.b !== r.a) doc.setTextColor(...(r.b < r.a ? accent : [161, 98, 7] as [number, number, number]));
    doc.text(dd(r.a, r.b, r.unit), cols[3] + 2, y + 5.6);
    doc.setDrawColor(238, 226, 230); doc.line(M, y + 8, M + CW, y + 8);
    y += 8;
  }

  // ---- Foto's: moment A (boven) en B (onder) ----
  const moments = (B ? [A, B] : [A]).filter(Boolean) as Measurement[];
  const paths = moments.flatMap((m) => POSES.map((p) => photoOf(m, p.id))).filter((x): x is string => Boolean(x));
  if (paths.length) {
    const urls = await signedUrls(paths);
    const data: Record<string, string | null> = {};
    await Promise.all(paths.map(async (p) => { data[p] = urls[p] ? await toDataUrl(urls[p]) : null; }));

    y += 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ink);
    doc.text("Foto's", M, y);
    y += 3;
    const gap = 3, labelW = 18;
    const avail = 282 - y - 6 - moments.length * 8;
    const ph = Math.min(((CW - labelW - gap * 3) / 4) * (4 / 3), avail / moments.length);
    const pw = ph * 0.75;
    const x0 = M + labelW + (CW - labelW - (pw * 4 + gap * 3)) / 2;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
    POSES.forEach((p, i) => doc.text(p.label, x0 + i * (pw + gap) + pw / 2, y + 4, { align: 'center' }));
    y += 6;
    for (const m of moments) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
      doc.text(shortDate(m.measured_on), M + labelW - 2, y + ph / 2, { align: 'right' });
      POSES.forEach((p, i) => {
        const x = x0 + i * (pw + gap);
        const path = photoOf(m, p.id);
        const img = path ? data[path] : null;
        if (img) doc.addImage(img, 'JPEG', x, y, pw, ph);
        else {
          doc.setFillColor(246, 238, 241); doc.rect(x, y, pw, ph, 'F');
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
          doc.text('geen foto', x + pw / 2, y + ph / 2, { align: 'center' });
        }
      });
      y += ph + 8;
    }
  }
  footer();

  // ---- Pagina 2: alle metingen ----
  doc.addPage();
  y = 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...ink);
  doc.text('Alle metingen', M, y);
  y += 6;
  const used = MEASURE_FIELDS.filter((f) => opt.fields.includes(f.key) || ms.some((m) => m[f.key] != null));
  const dateW = 30, colW = (CW - dateW) / Math.max(used.length, 1);
  const head = () => {
    doc.setFillColor(246, 238, 241); doc.rect(M, y, CW, 8, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
    doc.text('Datum', M + 2, y + 5.4);
    used.forEach((f, i) => doc.text(`${f.label} (${f.unit})`, M + dateW + i * colW + 1, y + 5.4, { maxWidth: colW - 2 }));
    y += 8;
  };
  head();
  for (const m of [...ms].reverse()) {
    const note = m.note ? (doc.splitTextToSize(m.note, CW - 4) as string[]) : [];
    const h = 8 + note.length * 4;
    if (y + h > 280) { footer(); doc.addPage(); y = 20; head(); }
    doc.setFontSize(9.5); doc.setTextColor(...ink); doc.setFont('helvetica', 'normal');
    doc.text(shortDate(m.measured_on), M + 2, y + 5.5);
    used.forEach((f, i) => doc.text(m[f.key] != null ? (m[f.key] as number).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '-', M + dateW + i * colW + 1, y + 5.5));
    if (note.length) { doc.setFontSize(8.5); doc.setTextColor(...grey); doc.text(note, M + 2, y + 10); }
    doc.setDrawColor(238, 226, 230); doc.line(M, y + h, M + CW, y + h);
    y += h;
  }
  footer();
  return doc.output('blob');
}

/** Delen (telefoon) of downloaden (computer). */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch { /* geannuleerd */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
