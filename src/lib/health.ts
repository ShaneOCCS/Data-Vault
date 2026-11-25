// Turns a member's records (generic column/value rows from an admin's CSV)
// into bloodwork numbers the dashboard can chart. Matches column names loosely
// (case, units, and spaces ignored) so e.g. "LDL Cholesterol (mg/dL)" or "ldl" both work.

import type { RecordDetail } from "./member-api";

export type BiomarkerKey =
  | "ldl"
  | "hdl"
  | "triglycerides"
  | "glucose"
  | "hba1c";

export type HealthSnapshot = {
  recordId: number;
  date: string; // CSV Date column if provided, otherwise when the admin uploaded it
  ldl?: number; // mg/dL
  hdl?: number; // mg/dL
  triglycerides?: number; // mg/dL
  glucose?: number; // mg/dL
  hba1c?: number; // %
  generalHealth?: string;
  ageCategory?: string;
  sex?: string;
};

export interface BiomarkerMeta {
  key: BiomarkerKey;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  optimalRange: [number, number];
  higherIsBetter?: boolean;
}

export const BIOMARKERS: Record<BiomarkerKey, BiomarkerMeta> = {
  ldl: {
    key: "ldl",
    label: "LDL Cholesterol",
    shortLabel: "LDL",
    unit: "mg/dL",
    min: 40,
    max: 220,
    optimalRange: [40, 100],
  },
  hdl: {
    key: "hdl",
    label: "HDL Cholesterol",
    shortLabel: "HDL",
    unit: "mg/dL",
    min: 20,
    max: 100,
    optimalRange: [60, 100],
    higherIsBetter: true,
  },
  triglycerides: {
    key: "triglycerides",
    label: "Triglycerides",
    shortLabel: "Triglycerides",
    unit: "mg/dL",
    min: 40,
    max: 300,
    optimalRange: [40, 150],
  },
  glucose: {
    key: "glucose",
    label: "Fasting Glucose",
    shortLabel: "Glucose",
    unit: "mg/dL",
    min: 55,
    max: 160,
    optimalRange: [70, 99],
  },
  hba1c: {
    key: "hba1c",
    label: "HbA1c",
    shortLabel: "HbA1c",
    unit: "%",
    min: 4.0,
    max: 9.0,
    optimalRange: [4.0, 5.6],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(rec: RecordDetail, ...names: string[]): string | undefined {
  const wanted = names.map(norm);
  const f = rec.fields.find((x) => wanted.includes(norm(x.column)));
  const v = f?.value?.trim();
  return v ? v : undefined;
}

function num(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function toSnapshot(rec: RecordDetail): HealthSnapshot {
  const csvDate = pick(rec, "Date", "TestDate", "LabDate", "CollectedAt");
  const parsedCsvDate =
    csvDate && !Number.isNaN(Date.parse(csvDate))
      ? new Date(csvDate).toISOString()
      : undefined;

  return {
    recordId: rec.id,
    date: parsedCsvDate ?? rec.createdAt,
    ldl: num(pick(rec, "LDL", "LDLCholesterol", "LDLmgdL", "LDLC")),
    hdl: num(pick(rec, "HDL", "HDLCholesterol", "HDLmgdL", "HDLC")),
    triglycerides: num(pick(rec, "Triglycerides", "TriglyceridesmgdL", "Trig")),
    glucose: num(
      pick(rec, "Glucose", "FastingGlucose", "BloodGlucose", "GlucosemgdL"),
    ),
    hba1c: num(pick(rec, "HbA1c", "A1c", "GlycatedHemoglobin")),
    generalHealth: pick(rec, "GeneralHealth", "Health"),
    ageCategory: pick(rec, "AgeCategory", "Age"),
    sex: pick(rec, "Sex", "Gender"),
  };
}

/** Snapshots that have at least one bloodwork number we can chart, oldest first. */
export function healthSnapshots(records: RecordDetail[]): HealthSnapshot[] {
  return records
    .map(toSnapshot)
    .filter(
      (s) =>
        s.ldl != null ||
        s.hdl != null ||
        s.triglycerides != null ||
        s.glucose != null ||
        s.hba1c != null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.recordId - b.recordId);
}

export function evaluateBiomarker(
  meta: BiomarkerMeta,
  val: number,
): {
  status: "optimal" | "borderline" | "high";
  label: string;
  color: string;
  badgeCls: string;
} {
  const [optLo, optHi] = meta.optimalRange;

  if (meta.higherIsBetter) {
    if (val >= optLo) {
      return {
        status: "optimal",
        label: "Optimal",
        color: "#16A34A",
        badgeCls:
          "bg-status-good-soft text-status-good-ink border-status-good-line",
      };
    }
    if (val >= 40) {
      return {
        status: "borderline",
        label: "Borderline",
        color: "#D97706",
        badgeCls:
          "bg-status-warn-soft text-status-warn-ink border-status-warn-line",
      };
    }
    return {
      status: "high",
      label: "Low",
      color: "#DC2626",
      badgeCls: "bg-status-bad-soft text-status-bad-ink border-status-bad-line",
    };
  }

  if (val >= optLo && val <= optHi) {
    return {
      status: "optimal",
      label: "Optimal",
      color: "#16A34A",
      badgeCls:
        "bg-status-good-soft text-status-good-ink border-status-good-line",
    };
  }
  if (val <= optHi * 1.25) {
    return {
      status: "borderline",
      label: "Borderline",
      color: "#D97706",
      badgeCls:
        "bg-status-warn-soft text-status-warn-ink border-status-warn-line",
    };
  }
  return {
    status: "high",
    label: "Elevated",
    color: "#DC2626",
    badgeCls: "bg-status-bad-soft text-status-bad-ink border-status-bad-line",
  };
}

export const fmtDate = (iso: string, locale?: string) =>
  new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
