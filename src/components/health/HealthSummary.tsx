"use client";

// Member-facing bloodwork analytics dashboard:
//   - Latest biomarker radial gauge cards (LDL, HDL, Fasting Glucose, HbA1c / Triglycerides)
//   - Clinical target threshold horizontal bar chart
//   - Grouped comparison bar chart ("You vs. Cohort Average" using HEART_REFERENCE)
//   - Isolated, zero-flash multi-biomarker longitudinal trend area chart
//   - CSV and multi-chart PDF export

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";
import {
  Activity,
  Download,
  Droplets,
  FileText,
  Flame,
  HeartPulse,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { RecordDetail } from "@/lib/member-api";
import {
  BIOMARKERS,
  evaluateBiomarker,
  fmtDate,
  healthSnapshots,
  type BiomarkerKey,
  type BiomarkerMeta,
} from "@/lib/health";
import { HEART_REFERENCE } from "@/lib/health-reference";
import { exportCsv, exportPdf } from "@/lib/export";
import { useT } from "@/lib/i18n";
import { usePrefs, useIsDark } from "@/lib/preferences";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const YOU = "#2E7BCF";
const OTHERS = "#D97A2B";
const SERIES_COLORS = {
  ldl: "#2E7BCF",
  hdl: "#10B981",
  glucose: "#8B5CF6",
  triglycerides: "#F59E0B",
};

function useChartColors() {
  const { prefs } = usePrefs();
  const dark = useIsDark();
  const [goodBand, setGoodBand] = useState({ fill: "#BBF7D0", ink: "#166534" });
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) =>
      `hsl(${css.getPropertyValue(name).trim().split(/\s+/).join(", ")})`;
    setGoodBand({ fill: v("--status-good"), ink: v("--status-good-ink") });
  }, [prefs.highContrast, dark]);
  const hc = prefs.highContrast;
  return {
    dark,
    ink: dark ? (hc ? "#FFFFFF" : "#E2E8F0") : hc ? "#000000" : "#0F172A",
    inkMuted: dark ? (hc ? "#E2E8F0" : "#94A3B8") : hc ? "#1E293B" : "#64748B",
    grid: dark ? "#334155" : "#E2E8F0",
    track: dark ? "#1E293B" : "#F1F5F9",
    surface: dark ? (hc ? "#0F0F0F" : "#161D2E") : "#FFFFFF",
    goodBand,
  };
}

const COMPARE_ID = "dv-bloodwork-compare";
const TARGET_ID = "dv-bloodwork-targets";
const TREND_ID = "dv-bloodwork-trend";

function BiomarkerGaugeCard({
  icon: Icon,
  meta,
  value,
  previousValue,
  colors,
}: {
  icon: typeof Activity;
  meta: BiomarkerMeta;
  value: number;
  previousValue?: number;
  colors: ReturnType<typeof useChartColors>;
}) {
  const { t } = useT();
  const status = evaluateBiomarker(meta, value);
  const pct = Math.min(
    100,
    Math.max(8, Math.round(((value - meta.min) / (meta.max - meta.min)) * 100)),
  );
  const delta =
    previousValue != null
      ? +(value - previousValue).toFixed(meta.key === "hba1c" ? 1 : 0)
      : null;

  const gaugeOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "radialBar",
        sparkline: { enabled: true },
        animations: { enabled: false },
      },
      plotOptions: {
        radialBar: {
          startAngle: -115,
          endAngle: 115,
          hollow: { size: "64%" },
          track: { background: colors.track, strokeWidth: "100%" },
          dataLabels: {
            name: { show: false },
            value: {
              offsetY: 5,
              fontSize: "16px",
              fontWeight: 700,
              color: colors.ink,
              formatter: () =>
                meta.key === "hba1c"
                  ? value.toFixed(1)
                  : Math.round(value).toString(),
            },
          },
        },
      },
      fill: { colors: [status.color] },
      stroke: { lineCap: "round" },
    }),
    [colors.track, colors.ink, meta.key, value, status.color],
  );

  const gaugeSeries = useMemo(() => [pct], [pct]);

  return (
    <div className="flex flex-col justify-between rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {t(meta.label)}
        </span>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.badgeCls}`}
        >
          {t(status.label)}
        </span>
      </div>

      <div className="my-1 flex items-center justify-between gap-2">
        <div className="h-[104px] w-[112px] shrink-0">
          <Chart
            options={gaugeOptions}
            series={gaugeSeries}
            type="radialBar"
            height={115}
            width={112}
          />
        </div>
        <div className="flex flex-col items-end text-right">
          <span className="text-xs text-muted-foreground">{meta.unit}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            {t("Target")}:{" "}
            {meta.higherIsBetter
              ? `≥${meta.optimalRange[0]}`
              : `<${meta.optimalRange[1]}`}
          </span>
          {delta != null && delta !== 0 && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {delta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {delta > 0 ? `+${delta}` : delta} {meta.unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BiomarkerTrendSection({
  snaps,
  colors,
}: {
  snaps: ReturnType<typeof healthSnapshots>;
  colors: ReturnType<typeof useChartColors>;
}) {
  const { t, locale } = useT();
  const [activeSeries, setActiveSeries] = useState<
    Record<"ldl" | "hdl" | "glucose" | "triglycerides", boolean>
  >({
    ldl: true,
    hdl: true,
    glucose: true,
    triglycerides: false,
  });

  // Frozen references so react-apexcharts never tears down or redraws the SVG on pill click
  const trendSeries = useMemo(() => {
    const keys: ("ldl" | "hdl" | "glucose" | "triglycerides")[] = [
      "ldl",
      "hdl",
      "glucose",
      "triglycerides",
    ];
    return keys
      .map((k) => ({
        name: `${t(BIOMARKERS[k].label)} (${BIOMARKERS[k].unit})`,
        color: SERIES_COLORS[k],
        hidden: k === "triglycerides",
        data: snaps
          .filter((s) => s[k] != null)
          .map((s) => ({
            x: new Date(s.date).getTime(),
            y: Number(s[k]!.toFixed(1)),
          })),
      }))
      .filter((s) => s.data.length > 0);
  }, [snaps, t]);

  const trendOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        id: TREND_ID,
        type: "area",
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: "Inter, sans-serif",
        animations: { enabled: false },
        background: "transparent",
      },
      theme: { mode: colors.dark ? "dark" : "light" },
      stroke: { width: 2.5, curve: "smooth" },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.22,
          opacityTo: 0.02,
          stops: [0, 95, 100],
        },
      },
      markers: {
        size: 5,
        strokeColors: colors.surface,
        strokeWidth: 2,
        hover: { size: 7 },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        type: "datetime",
        labels: {
          style: { colors: colors.inkMuted },
          datetimeUTC: false,
          formatter: (_v, ts) =>
            ts == null
              ? ""
              : new Date(ts).toLocaleDateString(locale, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
        },
      },
      yaxis: {
        title: {
          text: t("mg/dL"),
          style: { color: colors.inkMuted, fontWeight: 500 },
        },
        labels: {
          style: { colors: colors.inkMuted },
          formatter: (v) => v.toFixed(0),
        },
      },
      grid: { borderColor: colors.grid, strokeDashArray: 3 },
      annotations: {
        yaxis: [
          {
            y: 70,
            y2: 100,
            fillColor: colors.goodBand.fill,
            opacity: colors.dark ? 0.14 : 0.22,
            borderColor: "transparent",
            label: {
              text: t("Optimal LDL / Glucose Zone (70–100 mg/dL)"),
              style: {
                background: "transparent",
                color: colors.goodBand.ink,
                fontSize: "11px",
              },
            },
          },
        ],
      },
      tooltip: {
        shared: true,
        x: { formatter: (v) => fmtDate(new Date(v).toISOString(), locale) },
        y: { formatter: (v) => (v == null ? "" : `${v.toFixed(1)} mg/dL`) },
      },
    }),
    [
      colors.dark,
      colors.surface,
      colors.inkMuted,
      colors.grid,
      colors.goodBand.fill,
      colors.goodBand.ink,
      locale,
      t,
    ],
  );

  const handleToggle = async (
    key: "ldl" | "hdl" | "glucose" | "triglycerides",
  ) => {
    const nextActive = !activeSeries[key];
    const seriesName = `${t(BIOMARKERS[key].label)} (${BIOMARKERS[key].unit})`;
    setActiveSeries((prev) => ({ ...prev, [key]: nextActive }));
    const { default: ApexCharts } = await import("apexcharts");
    ApexCharts.exec(
      TREND_ID,
      nextActive ? "showSeries" : "hideSeries",
      seriesName,
    );
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">
            {t("Biomarker trends over time")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Toggle biomarkers below to compare longitudinal changes across lab uploads.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["ldl", "hdl", "glucose", "triglycerides"] as const).map((key) => {
            const active = activeSeries[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleToggle(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: SERIES_COLORS[key] }}
                />
                {t(BIOMARKERS[key].label)}
              </button>
            );
          })}
        </div>
      </div>

      {snaps.length >= 2 && trendSeries.length > 0 ? (
        <div className="h-[280px] w-full">
          <Chart
            options={trendOptions}
            series={trendSeries}
            type="area"
            height={280}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t(
            "You have one lab panel so far. Upload a second panel to unlock multi-biomarker trend lines.",
          )}
        </div>
      )}
    </section>
  );
}

export function HealthSummary({
  kitId,
  records,
}: {
  kitId: string;
  records: RecordDetail[];
}) {
  const { toast } = useToast();
  const { t, locale } = useT();
  const c = useChartColors();
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const snaps = useMemo(() => healthSnapshots(records), [records]);
  const latest = snaps[snaps.length - 1];
  const previous = snaps.length >= 2 ? snaps[snaps.length - 2] : undefined;

  // Match cohort reference group (AgeCategory -> Sex -> Everyone)
  const cohort = useMemo(() => {
    if (!latest) return { label: t("Everyone"), ref: HEART_REFERENCE.all };
    if (latest.ageCategory && HEART_REFERENCE.byAge[latest.ageCategory]) {
      const range = latest.ageCategory
        .replace(/^Age /, "")
        .replace(" to ", "–")
        .replace(" or older", "+");
      return {
        label: t("Ages {range}", { range }),
        ref: HEART_REFERENCE.byAge[latest.ageCategory],
      };
    }
    if (latest.sex && HEART_REFERENCE.bySex[latest.sex]) {
      return {
        label: t(`${latest.sex}s`),
        ref: HEART_REFERENCE.bySex[latest.sex],
      };
    }
    return { label: t("Everyone"), ref: HEART_REFERENCE.all };
  }, [latest, t]);

  const compareData = useMemo(() => {
    if (!latest) return null;
    const keys: ("ldl" | "hdl" | "triglycerides" | "glucose")[] = [
      "ldl",
      "hdl",
      "triglycerides",
      "glucose",
    ];
    const available = keys.filter((k) => latest[k] != null);
    if (available.length === 0) return null;
    return {
      categories: available.map(
        (k) => `${t(BIOMARKERS[k].shortLabel)} (${BIOMARKERS[k].unit})`,
      ),
      series: [
        {
          name: t("You"),
          data: available.map((k) => Number(latest[k]!.toFixed(1))),
        },
        { name: cohort.label, data: available.map((k) => cohort.ref[k]) },
      ],
    };
  }, [latest, cohort, t]);

  const compareOptions = useMemo<ApexOptions | null>(() => {
    if (!compareData) return null;
    return {
      chart: {
        id: COMPARE_ID,
        type: "bar",
        toolbar: { show: false },
        fontFamily: "Inter, sans-serif",
        animations: { enabled: false },
        background: "transparent",
      },
      theme: { mode: c.dark ? "dark" : "light" },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "52%",
          borderRadius: 5,
          borderRadiusApplication: "end",
          dataLabels: { position: "top" },
        },
      },
      colors: [YOU, OTHERS],
      stroke: { show: true, width: 2, colors: ["transparent"] },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: { fontSize: "11px", fontWeight: 600, colors: [c.ink] },
        formatter: (v) => `${Number(v).toFixed(0)}`,
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
        labels: { colors: c.ink },
      },
      xaxis: {
        categories: compareData.categories,
        labels: { style: { colors: c.ink, fontSize: "12px" } },
        axisBorder: { color: c.grid },
      },
      yaxis: {
        title: {
          text: t("mg/dL"),
          style: { color: c.inkMuted, fontWeight: 500 },
        },
        labels: { style: { colors: c.inkMuted } },
      },
      grid: { borderColor: c.grid, strokeDashArray: 3 },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v) => `${v.toFixed(1)} mg/dL` },
      },
    };
  }, [compareData, c.dark, c.ink, c.grid, c.inkMuted, t]);

  const targetUtilization = useMemo(() => {
    if (!latest) return null;
    const items: {
      label: string;
      pctOfLimit: number;
      actual: string;
      target: string;
      color: string;
    }[] = [];
    (
      ["ldl", "hdl", "triglycerides", "glucose", "hba1c"] as BiomarkerKey[]
    ).forEach((k) => {
      const val = latest[k];
      if (val == null) return;
      const meta = BIOMARKERS[k];
      const limit = meta.higherIsBetter
        ? meta.optimalRange[0]
        : meta.optimalRange[1];
      const pct = Math.round((val / limit) * 100);
      const status = evaluateBiomarker(meta, val);
      items.push({
        label: t(meta.shortLabel),
        pctOfLimit: pct,
        actual: `${val} ${meta.unit}`,
        target: meta.higherIsBetter
          ? `≥ ${limit} ${meta.unit}`
          : `< ${limit} ${meta.unit}`,
        color: status.color,
      });
    });
    if (items.length === 0) return null;
    return {
      items,
      series: [
        { name: t("% of Target"), data: items.map((i) => i.pctOfLimit) },
      ],
    };
  }, [latest, t]);

  const targetOptions = useMemo<ApexOptions | null>(() => {
    if (!targetUtilization) return null;
    const { items } = targetUtilization;
    return {
      chart: {
        id: TARGET_ID,
        type: "bar",
        toolbar: { show: false },
        fontFamily: "Inter, sans-serif",
        animations: { enabled: false },
        background: "transparent",
      },
      theme: { mode: c.dark ? "dark" : "light" },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: "52%",
          borderRadius: 4,
          distributed: true,
          dataLabels: { position: "top" },
        },
      },
      colors: items.map((i) => i.color),
      legend: { show: false },
      dataLabels: {
        enabled: true,
        offsetX: 34,
        style: { fontSize: "11px", fontWeight: 600, colors: [c.ink] },
        formatter: (_val, opts) => items[opts.dataPointIndex]?.actual ?? "",
      },
      xaxis: {
        categories: items.map((i) => i.label),
        max: Math.max(130, ...items.map((i) => i.pctOfLimit + 15)),
        title: {
          text: t("% of Clinical Threshold (100% = Target Boundary)"),
          style: { color: c.inkMuted, fontWeight: 500 },
        },
        labels: {
          style: { colors: c.inkMuted },
          formatter: (v) => `${Math.round(Number(v))}%`,
        },
      },
      yaxis: { labels: { style: { colors: c.ink, fontSize: "12px" } } },
      grid: {
        borderColor: c.grid,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: false } },
      },
      annotations: {
        xaxis: [
          {
            x: 100,
            borderColor: c.ink,
            strokeDashArray: 4,
            label: {
              text: t("Target (100%)"),
              style: { background: c.surface, color: c.ink, fontSize: "11px" },
            },
          },
        ],
      },
      tooltip: {
        y: {
          formatter: (v, { dataPointIndex }) => {
            const item = items[dataPointIndex];
            return `${item.actual} (${v}% of ${item.target} target)`;
          },
          title: { formatter: () => t("Result") },
        },
      },
    };
  }, [targetUtilization, c.dark, c.ink, c.inkMuted, c.grid, c.surface, t]);

  const handleCsv = () => {
    setExporting("csv");
    try {
      exportCsv(kitId, records, { t, locale });
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    setExporting("pdf");
    try {
      const images: {
        title: string;
        dataUri: string;
        width: number;
        height: number;
      }[] = [];
      const { default: ApexCharts } = await import("apexcharts");
      for (const [id, title] of [
        [TARGET_ID, t("Biomarker clinical target utilization")],
        [COMPARE_ID, t("Your bloodwork compared with cohort averages")],
        [TREND_ID, t("Your bloodwork biomarkers over time")],
      ] as const) {
        const el = document.querySelector(
          `#apexcharts${id}`,
        ) as HTMLElement | null;
        if (!el) continue;
        const out = (await ApexCharts.exec(id, "dataURI", { scale: 2 })) as
          | { imgURI?: string }
          | undefined;
        if (out?.imgURI)
          images.push({
            title,
            dataUri: out.imgURI,
            width: el.clientWidth,
            height: el.clientHeight,
          });
      }
      await exportPdf(kitId, records, latest, images, { t, locale });
    } catch {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: "We couldn't create the PDF. Please try again.",
      });
    } finally {
      setExporting(null);
    }
  };

  const exportButtons = (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCsv}
        disabled={!!exporting || records.length === 0}
      >
        {exporting === "csv" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}{" "}
        CSV
      </Button>
      <Button
        size="sm"
        onClick={handlePdf}
        disabled={!!exporting || records.length === 0}
      >
        {exporting === "pdf" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 mr-2" />
        )}{" "}
        PDF
      </Button>
    </div>
  );

  if (!latest) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>{t("Your bloodwork analytics")}</CardTitle>
          {exportButtons}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t(
            "We couldn't find lipid or glucose markers in your records yet. You can still export your raw records.",
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{t("Your bloodwork analytics")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("Visual breakdown from your latest lab panel on {date}.", {
              date: fmtDate(latest.date, locale),
            })}
          </p>
        </div>
        {exportButtons}
      </CardHeader>

      <CardContent className="space-y-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {latest.ldl != null && (
            <BiomarkerGaugeCard
              icon={HeartPulse}
              meta={BIOMARKERS.ldl}
              value={latest.ldl}
              previousValue={previous?.ldl}
              colors={c}
            />
          )}
          {latest.hdl != null && (
            <BiomarkerGaugeCard
              icon={Activity}
              meta={BIOMARKERS.hdl}
              value={latest.hdl}
              previousValue={previous?.hdl}
              colors={c}
            />
          )}
          {latest.glucose != null && (
            <BiomarkerGaugeCard
              icon={Droplets}
              meta={BIOMARKERS.glucose}
              value={latest.glucose}
              previousValue={previous?.glucose}
              colors={c}
            />
          )}
          {latest.hba1c != null ? (
            <BiomarkerGaugeCard
              icon={Flame}
              meta={BIOMARKERS.hba1c}
              value={latest.hba1c}
              previousValue={previous?.hba1c}
              colors={c}
            />
          ) : (
            latest.triglycerides != null && (
              <BiomarkerGaugeCard
                icon={Flame}
                meta={BIOMARKERS.triglycerides}
                value={latest.triglycerides}
                previousValue={previous?.triglycerides}
                colors={c}
              />
            )
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {targetUtilization && targetOptions && (
            <section className="space-y-2 rounded-xl border bg-card/50 p-4">
              <div>
                <h3 className="text-base font-semibold">
                  {t("Clinical target threshold gauge")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "How each biomarker compares against its recommended clinical boundary (100%).",
                  )}
                </p>
              </div>
              <Chart
                options={targetOptions}
                series={targetUtilization.series}
                type="bar"
                height={250}
              />
            </section>
          )}

          {compareData && compareOptions && (
            <section className="space-y-2 rounded-xl border bg-card/50 p-4">
              <div>
                <h3 className="text-base font-semibold">
                  {t("Panel compared with cohort averages")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Your latest markers next to reference averages for {group} ({n} people).",
                    {
                      group: cohort.label,
                      n: cohort.ref.n.toLocaleString(locale),
                    },
                  )}
                </p>
              </div>
              <Chart
                options={compareOptions}
                series={compareData.series}
                type="bar"
                height={250}
              />
            </section>
          )}
        </div>

        <BiomarkerTrendSection snaps={snaps} colors={c} />
      </CardContent>
    </Card>
  );
}
