import { POSES, photoOf, type Measurement, type Pose } from './types';
import { firstLast, signedUrls } from './progress';
import { fromISO, today } from './dates';

// Standaard-PDF-lettertypes kennen geen emoji of het wiskundige minteken: alleen gewone tekens hier.
const nl = (n: number | null, unit: string) =>
  n == null ? '-' : `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
const dd = (a: number | null, b: number | null, unit: string) => {
  if (a == null || b == null) return '-';
  const d = Math.round((b - a) * 10) / 10;
  return `${d > 0 ? '+' : d < 0 ? '-' : ''}${Math.abs(d).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
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

/** Per kant: de eerste en de nieuwste foto (als die verschillen). */
function photoPairs(ms: Measurement[]) {
  return POSES.map((p) => {
    const withPhoto = ms.filter((m) => photoOf(m, p.id));
    const first = withPhoto[0] ?? null;
    const last = withPhoto.length > 1 ? withPhoto[withPhoto.length - 1] : null;
    return { pose: p.id as Pose, label: p.label, first, last };
  });
}

export async function makeProgressPdf(ms: Measurement[], name: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 14, PW = 210, CW = PW - 2 * M;
  const green: [number, number, number] = [112, 61, 87]; // mauve shadow
  const grey: [number, number, number] = [122, 100, 104];

  const footer = () => {
    doc.setFontSize(8); doc.setTextColor(...grey);
    doc.text('Prive document - alleen voor jou. LockedIn.', M, 290);
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber}`, PW - M, 290, { align: 'right' });
  };

  // ---- Kop ----
  doc.setFillColor(...green); doc.rect(0, 0, PW, 4, 'F');
  doc.setTextColor(36, 23, 21); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('Mijn voortgang', M, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...grey);
  doc.text(`${name}  -  gemaakt op ${longDate(today())}`, M, 27);
  doc.setFillColor(246, 238, 241); doc.setDrawColor(217, 184, 196);
  doc.roundedRect(M, 31, CW, 9, 2, 2, 'FD');
  doc.setFontSize(9.5); doc.setTextColor(64, 42, 44);
  doc.text('Prive: dit overzicht is voor jou. Niemand in de groep kan deze gegevens zien.', M + 3, 36.8);

  // ---- Matentabel ----
  let y = 50;
  doc.setTextColor(36, 23, 21); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Maten', M, y);
  y += 4;
  const cols = [M, M + 46, M + 92, M + 138];
  const rows: { label: string; key: 'weight_kg' | 'waist_cm' | 'belly_cm'; unit: string }[] = [
    { label: 'Gewicht', key: 'weight_kg', unit: 'kg' },
    { label: 'Taille', key: 'waist_cm', unit: 'cm' },
    { label: 'Buikomtrek', key: 'belly_cm', unit: 'cm' },
  ];
  doc.setFillColor(246, 238, 241); doc.rect(M, y, CW, 8, 'F');
  doc.setFontSize(9.5); doc.setTextColor(...grey);
  ['', 'Begin', 'Nu', 'Verschil'].forEach((h, i) => doc.text(h, cols[i] + 2, y + 5.4));
  y += 8;
  doc.setFontSize(11);
  for (const r of rows) {
    const { first, last } = firstLast(ms, r.key);
    const a = first?.[r.key] ?? null, b = last?.[r.key] ?? null;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(36, 23, 21);
    doc.text(r.label, cols[0] + 2, y + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(nl(a, r.unit), cols[1] + 2, y + 6.5);
    doc.text(nl(b, r.unit), cols[2] + 2, y + 6.5);
    doc.setFont('helvetica', 'bold');
    if (a != null && b != null && b !== a) doc.setTextColor(...(b < a ? green : [161, 98, 7] as [number, number, number]));
    doc.text(dd(a, b, r.unit), cols[3] + 2, y + 6.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
    if (first) doc.text(shortDate(first.measured_on), cols[1] + 2, y + 10.5);
    if (last) doc.text(shortDate(last.measured_on), cols[2] + 2, y + 10.5);
    doc.setFontSize(11);
    doc.setDrawColor(238, 226, 230); doc.line(M, y + 13, M + CW, y + 13);
    y += 13;
  }

  // ---- Foto's: begin (boven) en nu (onder) ----
  const pairs = photoPairs(ms);
  const paths = pairs.flatMap((p) => [p.first && photoOf(p.first, p.pose), p.last && photoOf(p.last, p.pose)])
    .filter((x): x is string => Boolean(x));
  const urls = await signedUrls(paths);
  const data: Record<string, string | null> = {};
  await Promise.all(paths.map(async (p) => { data[p] = urls[p] ? await toDataUrl(urls[p]) : null; }));

  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(36, 23, 21);
  doc.text("Foto's", M, y);
  y += 3;
  const gap = 3, labelW = 12;
  const pw = (CW - labelW - gap * 3) / 4, ph = pw * (4 / 3);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
  pairs.forEach((p, i) => doc.text(p.label, M + labelW + i * (pw + gap) + pw / 2, y + 4, { align: 'center' }));
  y += 6;
  const hasLast = pairs.some((p) => p.last);
  for (const row of hasLast ? (['first', 'last'] as const) : (['first'] as const)) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(36, 23, 21);
    doc.text(row === 'first' ? 'Begin' : 'Nu', M + labelW - 2, y + ph / 2, { align: 'right', angle: 0 });
    pairs.forEach((p, i) => {
      const x = M + labelW + i * (pw + gap);
      const m = p[row];
      const path = m && photoOf(m, p.pose);
      const img = path ? data[path] : null;
      if (img) {
        doc.addImage(img, 'JPEG', x, y, pw, ph);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
        doc.text(shortDate(m!.measured_on), x + pw / 2, y + ph + 3.5, { align: 'center' });
      } else {
        doc.setFillColor(246, 238, 241); doc.rect(x, y, pw, ph, 'F');
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
        doc.text('geen foto', x + pw / 2, y + ph / 2, { align: 'center' });
      }
    });
    y += ph + 7;
  }
  footer();

  // ---- Pagina 2: alle metingen ----
  doc.addPage();
  y = 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(36, 23, 21);
  doc.text('Alle metingen', M, y);
  y += 6;
  const c2 = [M, M + 38, M + 66, M + 92, M + 118];
  const head = () => {
    doc.setFillColor(246, 238, 241); doc.rect(M, y, CW, 8, 'F');
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grey);
    ['Datum', 'Gewicht', 'Taille', 'Buik', 'Notitie'].forEach((h, i) => doc.text(h, c2[i] + 2, y + 5.4));
    y += 8;
  };
  head();
  doc.setFontSize(10);
  for (const m of [...ms].reverse()) {
    const note = doc.splitTextToSize(m.note ?? '', CW - (c2[4] - M) - 4) as string[];
    const h = Math.max(8, 4 + note.length * 4.2);
    if (y + h > 280) { footer(); doc.addPage(); y = 20; head(); doc.setFontSize(10); }
    doc.setTextColor(36, 23, 21); doc.setFont('helvetica', 'normal');
    doc.text(shortDate(m.measured_on), c2[0] + 2, y + 5.5);
    doc.text(nl(m.weight_kg, 'kg'), c2[1] + 2, y + 5.5);
    doc.text(nl(m.waist_cm, 'cm'), c2[2] + 2, y + 5.5);
    doc.text(nl(m.belly_cm, 'cm'), c2[3] + 2, y + 5.5);
    doc.setTextColor(...grey); doc.text(note, c2[4] + 2, y + 5.5);
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
