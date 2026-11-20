'use client';

// Member-facing health summary built from their records:
//   - latest numbers as plain cards (BMI with its standard category)
//   - BMI on the standard Underweight / Healthy / Overweight / Obese scale
//   - "compared with others" bar chart (averages from the mock heart dataset)
//   - BMI over time, once there are 2+ uploads
//   - export everything as CSV or PDF
// Charts use ApexCharts. It touches `window`, so it's loaded client-side only.

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Download, FileText, HeartPulse, Loader2, Ruler, Scale, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { RecordDetail } from '@/lib/member-api';
import { BMI_BANDS, bmiBand, fmtDate, healthSnapshots } from '@/lib/health';
import { HEART_REFERENCE } from '@/lib/health-reference';
import { exportCsv, exportPdf } from '@/lib/export';
import { useT, type TFunc } from '@/lib/i18n';
import { usePrefs, useIsDark } from '@/lib/preferences';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Validated pair (dataviz palette check): "You" vs. the comparison averages.
const YOU = '#2E7BCF';
const OTHERS = '#D97A2B';

/** Chart text/grid colours that follow light/dark, high contrast and colour-blind settings. */
function useChartColors() {
  const { prefs } = usePrefs();
  const dark = useIsDark();
  const [goodBand, setGoodBand] = useState({ fill: '#BBF7D0', ink: '#166534' });
  useEffect(() => {
    // Read the live CSS variables so the "healthy" band matches the BMI scale above.
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => `hsl(${css.getPropertyValue(name).trim().split(/\s+/).join(', ')})`;
    setGoodBand({ fill: v('--status-good'), ink: v('--status-good-ink') });
  }, [prefs.highContrast, dark]);
  const hc = prefs.highContrast;
  return {
    dark,
    ink: dark ? (hc ? '#FFFFFF' : '#E2E8F0') : hc ? '#000000' : '#0F172A',
    inkMuted: dark ? (hc ? '#E2E8F0' : '#94A3B8') : hc ? '#1E293B' : '#64748B',
    grid: dark ? '#334155' : '#E2E8F0',
    guide: dark ? '#64748B' : '#94A3B8',
    surface: dark ? (hc ? '#0F0F0F' : '#161D2E') : '#FFFFFF',
    goodBand,
  };
}

const bandRange = (t: TFunc, key: string, from: number, to: number, long: boolean) =>
  key === 'under' ? (long ? t('under {n}', { n: to }) : `<${to}`) : key === 'obese' ? `${from}+` : `${from}–${to}`;

const COMPARE_ID = 'dv-bmi-compare';
const TREND_ID = 'dv-bmi-trend';

const BAND_STYLE: Record<string, string> = {
  under: 'bg-status-warn-soft text-status-warn-ink border-status-warn-line',
  normal: 'bg-status-good-soft text-status-good-ink border-status-good-line',
  over: 'bg-status-warn-soft text-status-warn-ink border-status-warn-line',
  obese: 'bg-status-bad-soft text-status-bad-ink border-status-bad-line',
};

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Scale; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
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
  const { t } = useT();
  const lo = 15;
  const hi = 40;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const segs = [
    { ...BMI_BANDS[0], from: lo, cls: 'bg-status-warn' },
    { ...BMI_BANDS[1], cls: 'bg-status-good' },
    { ...BMI_BANDS[2], cls: 'bg-status-warn' },
    { ...BMI_BANDS[3], to: hi, cls: 'bg-status-bad' },
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
          <span className="whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background">
            {t('You')} · {bmi.toFixed(1)}
          </span>
          <span className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
        </div>
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card shadow"
          style={{ left: `${pos(bmi)}%`, background: YOU }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:hidden">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.cls}`} />
            {t(s.label)} <span className="tabular-nums">({bandRange(t, s.key, s.from, s.to, false)})</span>
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
            {t(s.label)}
            <br />
            <span className="tabular-nums">{bandRange(t, s.key, s.from, s.to, true)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HealthSummary({ kitId, records }: { kitId: string; records: RecordDetail[] }) {
  const { toast } = useToast();
  const { t, locale } = useT();
  const c = useChartColors();
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const snaps = useMemo(() => healthSnapshots(records), [records]);
  const latest = snaps[snaps.length - 1];
  const bmiSnaps = snaps.filter((s) => s.bmi != null);

  const compare = useMemo(() => {
    if (latest?.bmi == null) return null;
    const rows: { label: string; value: number; you?: boolean; n?: number }[] = [
      { label: t('You'), value: +latest.bmi.toFixed(1), you: true },
    ];
    const age = latest.ageCategory && HEART_REFERENCE.byAge[latest.ageCategory];
    if (age) rows.push({ label: t('Ages {range}', { range: latest.ageCategory!.replace(/^Age /, '').replace(' to ', '–').replace(' or older', '+') }), value: age.bmi, n: age.n });
    const sex = latest.sex && HEART_REFERENCE.bySex[latest.sex];
    if (sex) rows.push({ label: t(`${latest.sex}s`), value: sex.bmi, n: sex.n });
    rows.push({ label: t('Everyone'), value: HEART_REFERENCE.all.bmi, n: HEART_REFERENCE.all.n });
    return rows;
  }, [latest, t]);

  const compareOptions: ApexOptions | null = compare && {
    chart: { id: COMPARE_ID, type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false }, background: 'transparent' },
    theme: { mode: c.dark ? 'dark' : 'light' },
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
      title: { text: t('BMI'), style: { color: c.inkMuted, fontWeight: 500 } },
      labels: { style: { colors: c.inkMuted } },
    },
    yaxis: { labels: { style: { colors: c.ink, fontSize: '12px' }, maxWidth: 110 } },
    grid: { borderColor: c.grid, strokeDashArray: 0, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    annotations: {
      xaxis: [
        { x: 18.5, borderColor: c.guide, strokeDashArray: 4 },
        { x: 25, borderColor: c.guide, strokeDashArray: 4 },
        { x: 30, borderColor: c.guide, strokeDashArray: 4 },
      ],
    },
    tooltip: {
      y: {
        formatter: (v, { dataPointIndex }) => {
          const r = compare[dataPointIndex];
          return r.you ? `${v.toFixed(1)} (${t(bmiBand(v).label)})` : t('{value} average of {n} people', { value: v.toFixed(1), n: (r.n ?? 0).toLocaleString(locale) });
        },
        title: { formatter: () => t('BMI') },
      },
    },
  };

  const trendOptions: ApexOptions = {
    chart: { id: TREND_ID, type: 'line', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false }, background: 'transparent' },
    theme: { mode: c.dark ? 'dark' : 'light' },
    colors: [YOU],
    stroke: { width: 2, curve: 'straight' },
    markers: { size: 6, strokeColors: c.surface, strokeWidth: 2, hover: { size: 8 } },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: c.inkMuted },
        datetimeUTC: false,
        formatter: (_v, ts) => (ts == null ? '' : new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })),
      },
    },
    yaxis: { labels: { style: { colors: c.inkMuted }, formatter: (v) => v.toFixed(1) }, title: { text: t('BMI'), style: { color: c.inkMuted, fontWeight: 500 } } },
    grid: { borderColor: c.grid },
    annotations: {
      yaxis: [
        { y: 18.5, y2: 25, fillColor: c.goodBand.fill, opacity: c.dark ? 0.18 : 0.25, borderColor: 'transparent', label: { text: t('Healthy weight'), style: { background: 'transparent', color: c.goodBand.ink } } },
      ],
    },
    tooltip: { x: { formatter: (v) => fmtDate(new Date(v).toISOString(), locale) }, y: { formatter: (v) => `${v.toFixed(1)} (${t(bmiBand(v).label)})` } },
  };

  const handleCsv = () => {
    setExporting('csv');
    try {
      exportCsv(kitId, records, { t, locale });
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
        [COMPARE_ID, t('Your BMI compared with others')],
        [TREND_ID, t('Your BMI over time')],
      ] as const) {
        const el = document.querySelector(`#apexcharts${id}`) as HTMLElement | null;
        if (!el) continue;
        const out = (await ApexCharts.exec(id, 'dataURI', { scale: 2 })) as { imgURI?: string } | undefined;
        if (out?.imgURI) images.push({ title, dataUri: out.imgURI, width: el.clientWidth, height: el.clientHeight });
      }
      await exportPdf(kitId, records, latest, images, { t, locale });
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
          <CardTitle>{t('Your health summary')}</CardTitle>
          {exportButtons}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("We couldn't find height, weight or BMI in your records, so there's nothing to chart yet. You can still export your records.")}
        </CardContent>
      </Card>
    );
  }

  const band = latest.bmi != null ? bmiBand(latest.bmi) : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{t('Your health summary')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('From your latest upload on {date}.', { date: fmtDate(latest.date, locale) })}</p>
        </div>
        {exportButtons}
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {latest.bmi != null && band && (
            <StatCard
              icon={Activity}
              label={t('BMI')}
              value={latest.bmi.toFixed(1)}
              sub={<span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${BAND_STYLE[band.key]}`}>{t(band.label)}</span>}
            />
          )}
          {latest.weightKg != null && <StatCard icon={Scale} label={t('Weight')} value={<>{latest.weightKg.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kg</span></>} />}
          {latest.heightM != null && <StatCard icon={Ruler} label={t('Height')} value={<>{latest.heightM.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">m</span></>} />}
          {latest.generalHealth && (
            <StatCard
              icon={HeartPulse}
              label={t('General health')}
              value={<span className="text-xl">{t(latest.generalHealth)}</span>}
              sub={latest.hadHeartAttack != null ? t('Heart attack history: {answer}', { answer: latest.hadHeartAttack ? t('Yes') : t('No') }) : t('How you rated it')}
            />
          )}
        </div>

        {latest.bmi != null && band && (
          <section className="space-y-1">
            <h3 className="text-base font-semibold">{t('Where your BMI falls')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('Your BMI of {bmi} is in the', { bmi: latest.bmi.toFixed(1) })}{' '}
              <span className="font-semibold text-foreground">{t(band.label).toLowerCase()}</span> {t('range for adults.')}
            </p>
            <BmiScale bmi={latest.bmi} />
          </section>
        )}

        {compare && compareOptions && (
          <section className="space-y-2">
            <div>
              <h3 className="text-base font-semibold">{t('Compared with others')}</h3>
              <p className="text-sm text-muted-foreground">{t('Your BMI next to the average for people like you in the study.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: YOU }} /> {t('You')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OTHERS }} /> {t('Group average')}</span>
              <span>{t('Dashed lines at 18.5, 25 and 30 mark where the BMI categories change')}</span>
            </div>
            <Chart options={compareOptions} series={[{ name: t('BMI'), data: compare.map((r) => r.value) }]} type="bar" height={40 + compare.length * 44} />
          </section>
        )}

        <section className="space-y-2">
          <div>
            <h3 className="text-base font-semibold">{t('Your BMI over time')}</h3>
            <p className="text-sm text-muted-foreground">{t('One point for each upload.')}</p>
          </div>
          {bmiSnaps.length >= 2 ? (
            <Chart
              options={trendOptions}
              series={[{ name: t('BMI'), data: bmiSnaps.map((s) => ({ x: new Date(s.date).getTime(), y: +s.bmi!.toFixed(1) })) }]}
              type="line"
              height={260}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("You have one result so far. After your next upload, you'll see how your BMI changes here.")}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
