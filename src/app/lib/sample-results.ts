/**
 * SAMPLE DATA for the results chart mockup.
 *
 * Source: the two CFX Maestro "Quantification Summary" exports the team shared
 * (standards for genes 4 and 9, run 2023-06-08; standards for genes 14, 15 and 19,
 * run 2023-06-09). Values are the Cq per well.
 *
 * How it's used for the mockup: every 3 wells side by side (A01-A03, A04-A06, ...)
 * are one measurement for one KIT ID, and the two runs stand in for "previous"
 * and "latest" tests. These files are really calibration standards with no KIT IDs
 * in them, so swap this out for real patient data from the backend
 * (GET /api/records) once it exists.
 */

export type PlateRun = { id: string; date: string; wells: Record<string, number | null> };

export const SAMPLE_RUNS: PlateRun[] = [
  {
    "id": "genes 4 and 9",
    "date": "2023-06-08T13:13:09Z",
    "wells": {
      "A01": 22.75,
      "A02": 22.91,
      "A03": 22.71,
      "A04": 26.1,
      "A05": 26.09,
      "A06": 26.2,
      "A07": 30.2,
      "A08": 29.93,
      "A09": 29.63,
      "A10": 33.71,
      "A11": 33.91,
      "A12": 34.29,
      "B01": 25.37,
      "B02": 25.23,
      "B03": 25.22,
      "B04": 28.98,
      "B05": 29.2,
      "B06": 29.75,
      "B07": 32.67,
      "B08": 32.3,
      "B09": 31.58,
      "B10": 36.13,
      "B11": 35.88,
      "B12": null,
      "C01": 24.94,
      "C02": 25.01,
      "C03": 25.14,
      "C04": 29.42,
      "C05": 28.07,
      "C06": 28.31,
      "C07": 32.01,
      "C08": 31.71,
      "C09": 32.04,
      "C10": 36.32,
      "C11": null,
      "C12": 36.1,
      "D01": null,
      "D02": null,
      "D03": null,
      "D04": null,
      "D05": null,
      "D06": null,
      "D07": null,
      "D08": null,
      "D09": null,
      "D10": null,
      "D11": null,
      "D12": null,
      "E01": null,
      "E02": null,
      "E03": null,
      "E04": null,
      "E05": null,
      "E06": null,
      "E07": null,
      "E08": null,
      "E09": null,
      "E10": null,
      "E11": null,
      "E12": null,
      "F01": null,
      "F02": null,
      "F03": null,
      "F04": null,
      "F05": null,
      "F06": null,
      "F07": null,
      "F08": null,
      "F09": null,
      "F10": null,
      "F11": null,
      "F12": null,
      "G01": null,
      "G02": null,
      "G03": null,
      "G04": null,
      "G05": null,
      "G06": null,
      "G07": null,
      "G08": null,
      "G09": null,
      "G10": null,
      "G11": null,
      "G12": null,
      "H01": null,
      "H02": null,
      "H03": null,
      "H04": null,
      "H05": null,
      "H06": null,
      "H07": null,
      "H08": null,
      "H09": null,
      "H10": null,
      "H11": null,
      "H12": null
    }
  },
  {
    "id": "genes 14, 15 and 19",
    "date": "2023-06-09T17:56:56Z",
    "wells": {
      "A01": 21.92,
      "A02": 22.04,
      "A03": 22.08,
      "A04": 25.27,
      "A05": 25.28,
      "A06": 25.43,
      "A07": 29.21,
      "A08": 29.28,
      "A09": 29.32,
      "A10": 33.59,
      "A11": 33.5,
      "A12": 33.14,
      "B01": 24.73,
      "B02": 24.6,
      "B03": 24.64,
      "B04": 28.3,
      "B05": 28.39,
      "B06": 28.29,
      "B07": 31.11,
      "B08": 31.31,
      "B09": 31.3,
      "B10": 37.52,
      "B11": 34.93,
      "B12": 36.46,
      "C01": 25.81,
      "C02": 26.25,
      "C03": 25.82,
      "C04": 29.55,
      "C05": 29.73,
      "C06": 30.07,
      "C07": 32.77,
      "C08": 32.91,
      "C09": 33.3,
      "C10": 36.55,
      "C11": 37.13,
      "C12": 35.94,
      "D01": 25.42,
      "D02": 25.43,
      "D03": 25.51,
      "D04": 29.42,
      "D05": 29.53,
      "D06": 29.68,
      "D07": 32.15,
      "D08": 32.51,
      "D09": 32.05,
      "D10": 37.31,
      "D11": 37.45,
      "D12": null,
      "E01": null,
      "E02": null,
      "E03": null,
      "E04": null,
      "E05": null,
      "E06": null,
      "E07": null,
      "E08": null,
      "E09": null,
      "E10": null,
      "E11": null,
      "E12": null,
      "F01": null,
      "F02": null,
      "F03": null,
      "F04": null,
      "F05": null,
      "F06": null,
      "F07": null,
      "F08": null,
      "F09": null,
      "F10": null,
      "F11": null,
      "F12": null,
      "G01": null,
      "G02": null,
      "G03": null,
      "G04": null,
      "G05": null,
      "G06": null,
      "G07": null,
      "G08": null,
      "G09": null,
      "G10": null,
      "G11": null,
      "G12": null,
      "H01": null,
      "H02": null,
      "H03": null,
      "H04": null,
      "H05": null,
      "H06": null,
      "H07": null,
      "H08": null,
      "H09": null,
      "H10": null,
      "H11": null,
      "H12": null
    }
  }
];

export type TestResult = {
  runId: string;
  date: string;
  wells: string[];
  readings: number[]; // the 3 replicate Cq values that were read (blank wells dropped)
  mean: number;
  spread: number; // max - min of the readings
};

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Well-group id like "A1" (= wells A01, A02, A03) -> its 3 well names. */
export function wellsForGroup(group: string): string[] {
  const row = group[0];
  const n = parseInt(group.slice(1), 10); // 1..4
  const first = (n - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${row}${String(first + i).padStart(2, '0')}`);
}

/**
 * Which well group belongs to which KIT ID.
 *
 * MOCK: this list is typed by hand. In the real flow the lab types each KIT ID
 * into the "Sample" column when it sets up the plate in CFX Maestro, so the
 * export already says "A01, A02, A03 = K12345". Then this list goes away.
 */
const KIT_TO_GROUP: Record<string, string> = {
  K12345: 'A1',
  K98765: 'B1',
};

function groupsWithDataInEveryRun(): string[] {
  const groups: string[] = [];
  for (const row of ROWS) for (let n = 1; n <= 4; n++) groups.push(`${row}${n}`);
  return groups.filter((g) =>
    SAMPLE_RUNS.every((run) => wellsForGroup(g).some((w) => run.wells[w] != null))
  );
}

export function groupForKit(kitId: string): string {
  if (KIT_TO_GROUP[kitId]) return KIT_TO_GROUP[kitId];
  const usable = groupsWithDataInEveryRun();
  let h = 0;
  for (const c of kitId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return usable[h % usable.length];
}

/** All tests for a KIT ID, oldest first. */
export function getSampleResultsForKit(kitId: string): { group: string; tests: TestResult[] } {
  const group = groupForKit(kitId);
  const wells = wellsForGroup(group);
  const tests = SAMPLE_RUNS.map((run) => {
    const readings = wells.map((w) => run.wells[w]).filter((v): v is number => v != null);
    const mean = readings.reduce((a, b) => a + b, 0) / (readings.length || 1);
    return {
      runId: run.id,
      date: run.date,
      wells,
      readings,
      mean,
      spread: readings.length ? Math.max(...readings) - Math.min(...readings) : 0,
    };
  })
    .filter((t) => t.readings.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { group, tests };
}

/**
 * EXAMPLE range so the page can say Low / Normal / High.
 * NOT a medical range: the real one has to come from the lab or the client,
 * per marker. In Cq terms a LOWER number means MORE was found.
 */
export const EXAMPLE_RANGE = { normalFromCq: 21.5, normalToCq: 24 };

export type Level = 'low' | 'normal' | 'high';

export function levelFor(cq: number): Level {
  if (cq > EXAMPLE_RANGE.normalToCq) return 'low'; // less found than normal
  if (cq < EXAMPLE_RANGE.normalFromCq) return 'high'; // more found than normal
  return 'normal';
}

/** How many times more (>1) or less (<1) was found in `now` compared with `before`. */
export function timesChange(nowCq: number, beforeCq: number): number {
  return Math.pow(2, beforeCq - nowCq);
}
