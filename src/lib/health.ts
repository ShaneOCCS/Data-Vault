// Turns a member's records (generic column/value rows from an admin's CSV)
// into health numbers the dashboard can chart. Built for the mock heart
// dataset's columns, but matches names loosely (case and spaces ignored)
// so a lab file with e.g. "bmi" or "Weight (kg)" still works.

import type { RecordDetail } from './member-api';

export type HealthSnapshot = {
  recordId: number;
  date: string; // when the admin uploaded it
  bmi?: number;
  weightKg?: number;
  heightM?: number;
  generalHealth?: string;
  ageCategory?: string;
  sex?: string;
  hadHeartAttack?: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(rec: RecordDetail, ...names: string[]): string | undefined {
  const wanted = names.map(norm);
  const f = rec.fields.find((x) => wanted.includes(norm(x.column)));
  const v = f?.value?.trim();
  return v ? v : undefined;
}

function num(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function toSnapshot(rec: RecordDetail): HealthSnapshot {
  const heightM = num(pick(rec, 'HeightInMeters', 'Height', 'heightm'));
  const weightKg = num(pick(rec, 'WeightInKilograms', 'Weight', 'weightkg'));
  let bmi = num(pick(rec, 'BMI'));
  if (bmi == null && heightM && weightKg) bmi = weightKg / (heightM * heightM);
  const ha = pick(rec, 'HadHeartAttack', 'HeartAttack');
  return {
    recordId: rec.id,
    date: rec.createdAt,
    bmi,
    weightKg,
    heightM,
    generalHealth: pick(rec, 'GeneralHealth', 'Health'),
    ageCategory: pick(rec, 'AgeCategory', 'Age'),
    sex: pick(rec, 'Sex', 'Gender'),
    hadHeartAttack: ha == null ? undefined : ['1', 'yes', 'true', 'y'].includes(ha.toLowerCase()),
  };
}

/** Snapshots that have at least one number we can show, oldest first. */
export function healthSnapshots(records: RecordDetail[]): HealthSnapshot[] {
  return records
    .map(toSnapshot)
    .filter((s) => s.bmi != null || s.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.recordId - b.recordId);
}

// Standard adult BMI categories (WHO). These are real, widely used cut-offs.
export const BMI_BANDS = [
  { key: 'under', label: 'Underweight', from: 0, to: 18.5 },
  { key: 'normal', label: 'Healthy weight', from: 18.5, to: 25 },
  { key: 'over', label: 'Overweight', from: 25, to: 30 },
  { key: 'obese', label: 'Obese', from: 30, to: Infinity },
] as const;

export type BmiBand = (typeof BMI_BANDS)[number];

export function bmiBand(bmi: number): BmiBand {
  return BMI_BANDS.find((b) => bmi >= b.from && bmi < b.to) ?? BMI_BANDS[BMI_BANDS.length - 1];
}

export const fmtDate = (iso: string, locale?: string) =>
  new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
