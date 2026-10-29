'use client';

import { CheckCircle2, ArrowDown, ArrowUp, Minus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EXAMPLE_RANGE,
  levelFor,
  timesChange,
  type Level,
  type TestResult,
} from '@/app/lib/sample-results';
import { ResultsChart, ResultsSummary, ResultsTable } from './ResultsChart';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const LEVEL = {
  normal: {
    label: 'Normal',
    sentence: 'Your level is in the normal range.',
    icon: CheckCircle2,
    pill: 'bg-green-50 text-green-800 border-green-200',
  },
  low: {
    label: 'Low',
    sentence: 'Your level is below the normal range.',
    icon: ArrowDown,
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  high: {
    label: 'High',
    sentence: 'Your level is above the normal range.',
    icon: ArrowUp,
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
  },
} satisfies Record<Level, unknown>;

export function LevelPill({ level, className }: { level: Level; className?: string }) {
  const L = LEVEL[level];
  const Icon = L.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', L.pill, className)}>
      <Icon className="h-3.5 w-3.5" /> {L.label}
    </span>
  );
}

/** Low | Normal | High bar with a "You" marker. More found = further right. */
function RangeBar({ cq }: { cq: number }) {
  const { normalFromCq, normalToCq } = EXAMPLE_RANGE;
  const left = normalToCq + 3; // Cq at the far left (least found)
  const right = normalFromCq - 3; // Cq at the far right (most found)
  const pos = (v: number) => Math.min(100, Math.max(0, ((left - v) / (left - right)) * 100));
  const lowEnd = pos(normalToCq);
  const highStart = pos(normalFromCq);
  const you = pos(cq);

  return (
    <div className="pt-7">
      <div className="relative">
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="bg-muted" style={{ width: `${lowEnd}%` }} />
          <div className="bg-green-200 border-x-2 border-white" style={{ width: `${highStart - lowEnd}%` }} />
          <div className="bg-muted flex-1" />
        </div>
        <div className="absolute -top-7 flex flex-col items-center" style={{ left: `${you}%`, transform: 'translateX(-50%)' }}>
          <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-white">You</span>
          <span className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
        </div>
        <div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-[3px] border-white bg-primary shadow"
          style={{ left: `${you}%` }}
        />
      </div>
      <div className="mt-2 grid text-xs text-muted-foreground" style={{ gridTemplateColumns: `${lowEnd}% ${highStart - lowEnd}% 1fr` }}>
        <span>Low</span>
        <span className="text-center font-medium text-green-800">Normal</span>
        <span className="text-right">High</span>
      </div>
    </div>
  );
}

function ChangeLine({ now, before }: { now: TestResult; before: TestResult }) {
  const x = timesChange(now.mean, before.mean);
  const same = x > 0.83 && x < 1.2;
  const Icon = same ? Minus : x > 1 ? ArrowUp : ArrowDown;
  const text = same
    ? 'About the same as'
    : x > 1
      ? `About ${x.toFixed(1)}× higher than`
      : `About ${(1 / x).toFixed(1)}× lower than`;
  return (
    <div className="flex items-start gap-3 rounded-xl border p-4">
      <div className="rounded-full bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-sm">
        <p className="font-semibold">
          {text} your last test
        </p>
        <p className="text-muted-foreground">
          Last test was {fmtDate(before.date)} ({LEVEL[levelFor(before.mean)].label.toLowerCase()}).
        </p>
      </div>
    </div>
  );
}

export function ResultsPlain({ tests, markerName = 'Test marker' }: { tests: TestResult[]; markerName?: string }) {
  const latest = tests[tests.length - 1];
  const prev = tests.length > 1 ? tests[tests.length - 2] : null;
  const level = levelFor(latest.mean);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{markerName}</h3>
          <LevelPill level={level} />
          <span className="text-xs text-muted-foreground">Tested {fmtDate(latest.date)}</span>
        </div>
        <p className="text-xl font-semibold tracking-tight">{LEVEL[level].sentence}</p>
        <RangeBar cq={latest.mean} />
      </div>

      {prev && <ChangeLine now={latest} before={prev} />}

      <div>
        <p className="text-sm font-semibold mb-2">All your tests</p>
        <ul className="divide-y rounded-xl border">
          {[...tests].reverse().map((t, i) => (
            <li key={t.date} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {fmtDate(t.date)}
                {i === 0 && <span className="ml-2 text-xs text-muted-foreground">Latest</span>}
              </span>
              <LevelPill level={levelFor(t.mean)} />
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        “Normal” means your result is inside the usual range the lab expects. If you have questions about your
        results, talk to your clinic.
      </p>

      <details className="group rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          See the lab numbers
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t p-4">
          <p className="text-xs text-muted-foreground">
            The lab measures a “Cq” value. A lower Cq means more was found. Each test is read 3 times and averaged.
          </p>
          <ResultsSummary tests={tests} />
          <ResultsChart tests={tests} />
          <ResultsTable tests={tests} />
        </div>
      </details>
    </div>
  );
}
