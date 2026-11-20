'use client';

// "Export my data" for members: every record they can see, as CSV or PDF.
// Runs entirely in the browser from data the page already loaded, so nothing
// extra is sent to the server.

import type { RecordDetail } from './member-api';
import { bmiBand, fmtDate, type HealthSnapshot } from './health';
import type { TFunc } from './i18n';

/** Language for the exported file (defaults to English). */
export type ExportLang = { t: TFunc; locale?: string };
const EN: ExportLang = { t: (s) => s };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Column names in the order they first appear across all records. */
function allColumns(records: RecordDetail[]): string[] {
  const cols: string[] = [];
  for (const r of records) for (const f of r.fields) if (!cols.includes(f.column)) cols.push(f.column);
  return cols;
}

// Long decimals (e.g. BMI 34.9392148744778) are shortened in the PDF only; the CSV keeps the raw values.
const tidy = (v: string) => (/^-?\d+\.\d{3,}$/.test(v) ? Number(v).toFixed(2) : v);

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportCsv(kitId: string, records: RecordDetail[], { t }: ExportLang = EN) {
  const cols = allColumns(records);
  const lines = [
    [t('Uploaded'), ...cols].map(csvCell).join(','),
    ...records.map((r) => {
      const byCol = new Map(r.fields.map((f) => [f.column, f.value]));
      return [new Date(r.createdAt).toISOString(), ...cols.map((c) => byCol.get(c) ?? '')].map(csvCell).join(',');
    }),
  ];
  // BOM so Excel opens it as UTF-8
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `data-vault-${kitId}-${today()}.csv`);
}

export async function exportPdf(
  kitId: string,
  records: RecordDetail[],
  latest: HealthSnapshot | undefined,
  chartImages: { title: string; dataUri: string; width: number; height: number }[] = [],
  { t, locale }: ExportLang = EN
) {
  const date = (iso: string) => fmtDate(iso, locale);
  // Loaded on click so the PDF library isn't in the page's first download.
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Data Vault — ${t('Your health summary')}`, margin, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${t('KIT ID')} ${kitId}  ·  ${t('Exported {date}', { date: date(new Date().toISOString()) })}`, margin, y);
  doc.setTextColor(0);
  y += 20;

  if (latest) {
    const rows: string[][] = [];
    if (latest.bmi != null) rows.push([t('BMI'), `${latest.bmi.toFixed(1)} (${t(bmiBand(latest.bmi).label)})`]);
    if (latest.weightKg != null) rows.push([t('Weight'), `${latest.weightKg.toFixed(1)} kg`]);
    if (latest.heightM != null) rows.push([t('Height'), `${latest.heightM.toFixed(2)} m`]);
    if (latest.generalHealth) rows.push([t('General health'), t(latest.generalHealth)]);
    if (latest.hadHeartAttack != null) rows.push([t('Heart attack history'), latest.hadHeartAttack ? t('Yes') : t('No')]);
    rows.push([t('From upload on'), date(latest.date)]);
    autoTable(doc, {
      startY: y,
      head: [[t('Latest results'), '']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [46, 123, 207] },
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error lastAutoTable is added by the plugin
    y = doc.lastAutoTable.finalY + 20;
  }

  for (const img of chartImages) {
    const w = pageW - margin * 2;
    const h = (img.height / img.width) * w;
    if (y + h + 20 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(img.title, margin, y);
    y += 8;
    doc.addImage(img.dataUri, 'PNG', margin, y, w, h);
    y += h + 20;
  }

  const cols = allColumns(records);
  autoTable(doc, {
    startY: y,
    head: [[t('Uploaded'), ...cols]],
    body: records.map((r) => {
      const byCol = new Map(r.fields.map((f) => [f.column, f.value]));
      return [date(r.createdAt), ...cols.map((c) => tidy(byCol.get(c) ?? ''))];
    }),
    theme: 'striped',
    headStyles: { fillColor: [46, 123, 207] },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    horizontalPageBreak: true,
    margin: { left: margin, right: margin },
  });

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    t('This summary is for your information. Talk to your clinic about what your results mean for you.'),
    margin,
    doc.internal.pageSize.getHeight() - 20
  );

  doc.save(`data-vault-${kitId}-${today()}.pdf`);
}
