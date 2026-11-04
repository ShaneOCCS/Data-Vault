'use client';

// Member-facing health summary built from their records:
//   - latest numbers as plain cards (BMI with its standard category)
//   - BMI on the standard Underweight / Healthy / Overweight / Obese scale
//   - "compared with others" bar chart (averages from the mock heart dataset)
//   - BMI over time, once there are 2+ uploads
//   - export everything as CSV or PDF
// Charts use ApexCharts. It touches `window`, so it's loaded client-side only.

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Download, FileText, HeartPulse, Loader2, Ruler, Scale, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { RecordDetail } from '@/lib/member-api';
import { BMI_BANDS, bmiBand, fmtDate, healthSnapshots } from '@/lib/health';
import { HEART_REFERENCE } from '@/lib/health-reference';
import { exportCsv, exportPdf } from '@/lib/export';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Validated pair (dataviz palette check): "You" vs. the comparison averages.
const YOU = '#2E7BCF';
const OTHERS = '#D97A2B';
const INK_MUTED = '#64748B';
const GRID = '#E2E8F0';

const COMPARE_ID = 'dv-bmi-compare';
const TREND_ID = 'dv-bmi-trend';

const BAND_STYLE: Record<string, string> = {
  under: 'bg-amber-50 text-amber-800 border-amber-200',
  normal: 'bg-green-50 text-green-800 border-green-200',
  over: 'bg-amber-50 text-amber-800 border-amber-200',
  obese: 'bg-red-50 text-red-800 border-red-200',
};

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Scale; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Standard BMI scale (15–40) with a "You" marker. */
function BmiScale({ bmi }: { bmi: number }) {
  const lo = 15;
  const hi = 40;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const segs = [
    { ...BMI_BANDS[0], from: lo, cls: 'bg-amber-200' },
    { ...BMI_BANDS[1], cls: 'bg-green-300' },
    { ...BMI_BANDS[2], cls: 'bg-amber-200' },
    { ...BMI_BANDS[3], to: hi, cls: 'bg-red-200' },
  ];
  return (
    <div className="pt-8">
      <div className="relative">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {segs.map((s) => (
            <div key={s.key} className={s.cls} style={{ width: `${pos(s.to) - pos(s.from)}%` }} />
          ))}
        </div>
        <div className="absolute -top-8 flex flex-col items-center" style={{ left: `${pos(bmi)}%`, transform: 'translateX(-50%)' }}>
          <span className="whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-white">
            You · {bmi.toFixed(1)}
          </span>
          <span className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
        </div>
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow"
          style={{ left: `${pos(bmi)}%`, background: YOU }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:hidden">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.cls}`} />
            {s.label} <span className="tabular-nums">({s.key === 'under' ? `<${s.to}` : s.key === 'obese' ? `${s.from}+` : `${s.from}–${s.to}`})</span>
          </span>
        ))}
      </div>
      <div className="relative mt-2 hidden h-8 text-[11px] text-muted-foreground sm:block">
        {segs.map((s) => (
          <span
            key={s.key}
            className="absolute -translate-x-1/2 text-center leading-tight"
            style={{ left: `${(pos(s.from) + pos(s.to)) / 2}%` }}
          >
            {s.label}
            <br />
            <span className="tabular-nums">
              {s.key === 'under' ? `under ${s.to}` : s.key === 'obese' ? `${s.from}+` : `${s.from}–${s.to}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HealthSummary({ kitId, records }: { kitId: string; records: RecordDetail[] }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const snaps = useMemo(() => healthSnapshots(records), [records]);
  const latest = snaps[snaps.length - 1];
  const bmiSnaps = snaps.filter((s) => s.bmi != null);

  const compare = useMemo(() => {
    if (latest?.bmi == null) return null;
    const rows: { label: string; value: number; you?: boolean; n?: number }[] = [
      { label: 'You', value: +latest.bmi.toFixed(1), you: true },
    ];
    const age = latest.ageCategory && HEART_REFERENCE.byAge[latest.ageCategory];
    if (age) rows.push({ label: `Ages ${latest.ageCategory!.replace(/^Age /, '').replace(' to ', '–')}`, value: age.bmi, n: age.n });
    const sex = latest.sex && HEART_REFERENCE.bySex[latest.sex];
    if (sex) rows.push({ label: `${latest.sex}s`, value: sex.bmi, n: sex.n });
    rows.push({ label: 'Everyone', value: HEART_REFERENCE.all.bmi, n: HEART_REFERENCE.all.n });
    return rows;
  }, [latest]);

  const compareOptions: ApexOptions | null = compare && {
    chart: { id: COMPARE_ID, type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4, borderRadiusApplication: 'end', distributed: true, dataLabels: { position: 'top' } } },
    fill: { opacity: 1 },
    states: { hover: { filter: { type: 'darken' } } },
    colors: compare.map((r) => (r.you ? YOU : OTHERS)),
    dataLabels: {
      enabled: true,
      formatter: (v) => Number(v).toFixed(1),
      style: { fontSize: '12px', fontWeight: 600, colors: ['#fff'] },
      offsetX: -28,
    },
    legend: { show: false },
    xaxis: {
      categories: compare.map((r) => r.label),
      min: 15,
      max: 40,
      tickAmount: 5,
      title: { text: 'BMI', style: { color: INK_MUTED, fontWeight: 500 } },
      labels: { style: { colors: INK_MUTED } },
    },
    yaxis: { labels: { style: { colors: '#0F172A', fontSize: '12px' }, maxWidth: 110 } },
    grid: { borderColor: GRID, strokeDashArray: 0, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    annotations: {
      xaxis: [
        { x: 18.5, borderColor: '#94A3B8', strokeDashArray: 4 },
        { x: 25, borderColor: '#94A3B8', strokeDashArray: 4 },
        { x: 30, borderColor: '#94A3B8', strokeDashArray: 4 },
      ],
    },
    tooltip: {
      y: {
        formatter: (v, { dataPointIndex }) => {
          const r = compare[dataPointIndex];
          return r.you ? `${v.toFixed(1)} (${bmiBand(v).label})` : `${v.toFixed(1)} average of ${r.n} people`;
        },
        title: { formatter: () => 'BMI' },
      },
    },
  };

  const trendOptions: ApexOptions = {
    chart: { id: TREND_ID, type: 'line', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
    colors: [YOU],
    stroke: { width: 2, curve: 'straight' },
    markers: { size: 6, strokeColors: '#fff', strokeWidth: 2, hover: { size: 8 } },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: INK_MUTED }, datetimeUTC: false, format: 'MMM d, yyyy' },
    },
    yaxis: { labels: { style: { colors: INK_MUTED }, formatter: (v) => v.toFixed(1) }, title: { text: 'BMI', style: { color: INK_MUTED, fontWeight: 500 } } },
    grid: { borderColor: GRID },
    annotations: {
      yaxis: [
        { y: 18.5, y2: 25, fillColor: '#BBF7D0', opacity: 0.35, borderColor: 'transparent', label: { text: 'Healthy weight', style: { background: 'transparent', color: '#166534' } } },
      ],
    },
    tooltip: { x: { format: 'MMM d, yyyy' }, y: { formatter: (v) => `${v.toFixed(1)} (${bmiBand(v).label})` } },
  };

  const handleCsv = () => {
    setExporting('csv');
    try {
      exportCsv(kitId, records);
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    setExporting('pdf');
    try {
      const images: { title: string; dataUri: string; width: number; height: number }[] = [];
      const { default: ApexCharts } = await import('apexcharts');
      for (const [id, title] of [
        [COMPARE_ID, 'Your BMI compared with others'],
        [TREND_ID, 'Your BMI over time'],
      ] as const) {
        const el = document.querySelector(`#apexcharts${id}`) as HTMLElement | null;
        if (!el) continue;
        const out = (await ApexCharts.exec(id, 'dataURI', { scale: 2 })) as { imgURI?: string } | undefined;
        if (out?.imgURI) images.push({ title, dataUri: out.imgURI, width: el.clientWidth, height: el.clientHeight });
      }
      await exportPdf(kitId, records, latest, images);
    } catch {
      toast({ variant: 'destructive', title: 'Export failed', description: "We couldn't create the PDF. Please try again." });
    } finally {
      setExporting(null);
    }
  };

  const exportButtons = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCsv} disabled={!!exporting || records.length === 0}>
        {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} CSV
      </Button>
      <Button size="sm" onClick={handlePdf} disabled={!!exporting || records.length === 0}>
        {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />} PDF
      </Button>
    </div>
  );

  if (!latest) {
    // Records exist but none look like health measurements — still allow export.
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Your health summary</CardTitle>
          {exportButtons}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We couldn&apos;t find height, weight or BMI in your records, so there&apos;s nothing to chart yet. You can still export your records.
        </CardContent>
      </Card>
    );
  }

  const band = latest.bmi != null ? bmiBand(latest.bmi) : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Your health summary</CardTitle>
          <p className="text-sm text-muted-foreground">From your latest upload on {fmtDate(latest.date)}.</p>
        </div>
        {exportButtons}
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {latest.bmi != null && band && (
            <StatCard
              icon={Activity}
              label="BMI"
              value={latest.bmi.toFixed(1)}
              sub={<span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${BAND_STYLE[band.key]}`}>{band.label}</span>}
            />
          )}
          {latest.weightKg != null && <StatCard icon={Scale} label="Weight" value={<>{latest.weightKg.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kg</span></>} />}
          {latest.heightM != null && <StatCard icon={Ruler} label="Height" value={<>{latest.heightM.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">m</span></>} />}
          {latest.generalHealth && (
            <StatCard
              icon={HeartPulse}
              label="General health"
              value={<span className="text-xl">{latest.generalHealth}</span>}
              sub={latest.hadHeartAttack != null ? `Heart attack history: ${latest.hadHeartAttack ? 'Yes' : 'No'}` : 'How you rated it'}
            />
          )}
        </div>

        {latest.bmi != null && band && (
          <section className="space-y-1">
            <h3 className="text-base font-semibold">Where your BMI falls</h3>
            <p className="text-sm text-muted-foreground">
              Your BMI of {latest.bmi.toFixed(1)} is in the <span className="font-semibold text-foreground">{band.label.toLowerCase()}</span> range for adults.
            </p>
            <BmiScale bmi={latest.bmi} />
          </section>
        )}

        {compare && compareOptions && (
          <section className="space-y-2">
            <div>
              <h3 className="text-base font-semibold">Compared with others</h3>
              <p className="text-sm text-muted-foreground">Your BMI next to the average for people like you in the study.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: YOU }} /> You</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OTHERS }} /> Group average</span>
              <span>Dashed lines at 18.5, 25 and 30 mark where the BMI categories change</span>
            </div>
            <Chart options={compareOptions} series={[{ name: 'BMI', data: compare.map((r) => r.value) }]} type="bar" height={40 + compare.length * 44} />
          </section>
        )}

        <section className="space-y-2">
          <div>
            <h3 className="text-base font-semibold">Your BMI over time</h3>
            <p className="text-sm text-muted-foreground">One point for each upload.</p>
          </div>
          {bmiSnaps.length >= 2 ? (
            <Chart
              options={trendOptions}
              series={[{ name: 'BMI', data: bmiSnaps.map((s) => ({ x: new Date(s.date).getTime(), y: +s.bmi!.toFixed(1) })) }]}
              type="line"
              height={260}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              You have one result so far. After your next upload, you&apos;ll see how your BMI changes here.
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
