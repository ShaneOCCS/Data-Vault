'use client';

import { useEffect, useRef, useState } from 'react';
import type { TestResult } from '@/app/lib/sample-results';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function niceTicks(min: number, max: number) {
  const lo = Math.floor(min);
  const hi = Math.ceil(max);
  const step = hi - lo > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi: ticks[ticks.length - 1] < hi ? hi : ticks[ticks.length - 1], ticks };
}

/**
 * One KIT ID's measurement over time.
 * Big dot = average of the 3 readings, small dots = each reading, line = change between tests.
 * Plain SVG so it stays light and matches the site; hover a test for details.
 */
export function ResultsChart({ tests }: { tests: TestResult[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so text stays 11px on every screen.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const pad = { top: 16, right: 16, bottom: 32, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const all = tests.flatMap((t) => t.readings);
  const { lo, hi, ticks } = niceTicks(Math.min(...all) - 0.5, Math.max(...all) + 0.5);
  const y = (v: number) => pad.top + ((v - lo) / (hi - lo)) * innerH;
  const slot = innerW / Math.max(tests.length, 1);
  const x = (i: number) => pad.left + slot * i + slot / 2;

  const linePath = tests.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(t.mean)}`).join(' ');
  const hovered = hover != null ? tests[hover] : null;

  return (
    <div className="relative" ref={boxRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Your results over time">
        {/* grid + y axis (lower Cq is at the top: more was detected) */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
              {t}
            </text>
          </g>
        ))}

        {/* x labels */}
        {tests.map((t, i) => (
          <text key={t.date} x={x(i)} y={H - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {fmtDate(t.date)}
          </text>
        ))}

        {/* hover column */}
        {hover != null && (
          <rect x={x(hover) - slot / 2} y={pad.top} width={slot} height={innerH} className="fill-primary/5" />
        )}

        {/* change line */}
        {tests.length > 1 && <path d={linePath} fill="none" className="stroke-primary" strokeWidth={2} />}

        {/* readings + averages */}
        {tests.map((t, i) => (
          <g key={t.date}>
            {t.readings.map((r, j) => (
              <circle key={j} cx={x(i) + (j - 1) * 10} cy={y(r)} r={3.5} className="fill-primary/35" />
            ))}
            <circle cx={x(i)} cy={y(t.mean)} r={6} className="fill-primary stroke-white" strokeWidth={2} />
          </g>
        ))}

        {/* hit targets, wider than the marks */}
        {tests.map((t, i) => (
          <rect
            key={t.date}
            x={x(i) - slot / 2}
            y={pad.top}
            width={slot}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${fmtDate(t.date)}: average ${t.mean.toFixed(2)}`}
          />
        ))}
      </svg>

      {hovered && hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(x(hover), 90), W - 90),
            top: y(Math.min(...hovered.readings)),
            transform: 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <p className="font-semibold text-foreground">{fmtDate(hovered.date)}</p>
          <p className="text-muted-foreground mt-0.5">
            Average <span className="font-semibold text-foreground">{hovered.mean.toFixed(2)}</span>
          </p>
          <p className="text-muted-foreground">Readings {hovered.readings.map((r) => r.toFixed(2)).join(' · ')}</p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary/35" /> Each of the 3 readings
        </span>
        <span>Cq value · lower means more was detected</span>
      </div>
    </div>
  );
}

export function ResultsTable({ tests }: { tests: TestResult[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 sm:px-4 py-2 font-medium">Test date</th>
            <th className="px-3 sm:px-4 py-2 font-medium">Average Cq</th>
            <th className="px-3 sm:px-4 py-2 font-medium">3 readings</th>
            <th className="hidden sm:table-cell px-3 sm:px-4 py-2 font-medium">Wells</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...tests].reverse().map((t) => (
            <tr key={t.date}>
              <td className="px-3 sm:px-4 py-2.5">{fmtDate(t.date)}</td>
              <td className="px-3 sm:px-4 py-2.5 font-semibold tabular-nums">{t.mean.toFixed(2)}</td>
              <td className="px-3 sm:px-4 py-2.5 tabular-nums text-muted-foreground">{t.readings.map((r) => r.toFixed(2)).join(', ')}</td>
              <td className="hidden sm:table-cell px-3 sm:px-4 py-2.5 font-mono text-xs text-muted-foreground">{t.wells[0]}–{t.wells[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsSummary({ tests }: { tests: TestResult[] }) {
  const latest = tests[tests.length - 1];
  const prev = tests.length > 1 ? tests[tests.length - 2] : null;
  const diff = prev ? latest.mean - prev.mean : null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <div className="rounded-xl border p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">Latest result</p>
        <p className="mt-1 text-lg sm:text-2xl font-semibold tabular-nums">{latest.mean.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(latest.date)}</p>
      </div>
      <div className="rounded-xl border p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">Change from last test</p>
        <p className="mt-1 text-lg sm:text-2xl font-semibold tabular-nums">
          {diff == null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(2)}`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{prev ? `vs ${fmtDate(prev.date)}` : 'First test'}</p>
      </div>
      <div className="rounded-xl border p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">Reading consistency</p>
        <p className="mt-1 text-lg sm:text-2xl font-semibold tabular-nums">±{(latest.spread / 2).toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">How close the 3 readings were</p>
      </div>
    </div>
  );
}
