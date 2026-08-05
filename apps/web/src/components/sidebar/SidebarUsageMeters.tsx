import type { ProviderDriverKind, UsageMeterMode, UsageMeterSettings } from "@t3tools/contracts";
import { Fragment, memo, useEffect, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useUsageMeterMode, useUsageMeterSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useProviderUsage, useProviderUsageAutoRefresh } from "../../lib/providerUsageState";
import { PROVIDER_ICON_BY_PROVIDER } from "../chat/providerIconUtils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  appendUsageSamples,
  collectUsageSamples,
  formatSyncedLabel,
  formatUsagePercent,
  isExhaustedUsage,
  latestSyncedAt,
  resolveDisplayPercent,
  selectUsageColumns,
  usageChartPlacement,
  usageSampleSignature,
  type UsageMeterColumn,
  type UsageMeterWindow,
  type UsageSampleHistory,
} from "./SidebarUsageMeters.logic";
import { UsageChart } from "./usageMeterCharts";

/** Brand accents so the two halves stay tellable apart at meter size. */
const ACCENT_COLOR_BY_PROVIDER: Partial<Record<string, string>> = {
  claudeAgent: "#d97757",
  codex: "#4d9fff",
};

const MUTED_ACCENT_COLOR = "color-mix(in oklab, var(--color-muted-foreground) 70%, transparent)";

function accentColor(provider: ProviderDriverKind, usedPercent: number | null): string {
  if (isExhaustedUsage(usedPercent)) return "var(--color-red-500)";
  return ACCENT_COLOR_BY_PROVIDER[provider] ?? MUTED_ACCENT_COLOR;
}

/** Percentages are unitless on their own; the basis has to be readable out loud. */
function describeWindow(window: UsageMeterWindow, settings: UsageMeterSettings): string {
  const percent = resolveDisplayPercent(window.usedPercent, settings.percentageBasis);
  if (percent === null) return `${window.label} usage not reported`;
  const basis = settings.percentageBasis === "remaining" ? "left" : "used";
  return `${window.label} ${formatUsagePercent(percent)}% ${basis}`;
}

function describeColumns(
  columns: ReadonlyArray<UsageMeterColumn>,
  settings: UsageMeterSettings,
): string {
  return columns
    .map(
      (column) =>
        `${column.provider}: ${column.windows
          .map((window) => describeWindow(window, settings))
          .join(", ")}`,
    )
    .join("; ");
}

function ProviderIcon({
  provider,
  className,
}: {
  readonly provider: ProviderDriverKind;
  readonly className: string;
}) {
  const Icon = PROVIDER_ICON_BY_PROVIDER[provider];
  if (!Icon) return null;
  const accent = ACCENT_COLOR_BY_PROVIDER[provider];
  return (
    // Inline so the accent wins over each icon's own baked-in fill class.
    <Icon aria-hidden className={className} style={accent ? { fill: accent } : undefined} />
  );
}

// ── Expanded ─────────────────────────────────────────────────────────

const ExpandedWindow = memo(function ExpandedWindow({
  provider,
  window,
  settings,
  samples,
}: {
  readonly provider: ProviderDriverKind;
  readonly window: UsageMeterWindow;
  readonly settings: UsageMeterSettings;
  readonly samples: ReadonlyArray<number>;
}) {
  const percent = resolveDisplayPercent(window.usedPercent, settings.percentageBasis);
  const color = accentColor(provider, window.usedPercent);
  const placement = usageChartPlacement(settings.chartStyle);
  const chart = (
    <UsageChart
      chartStyle={settings.chartStyle}
      color={color}
      percent={percent}
      samples={samples}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <div className="flex w-full items-center justify-center gap-1">
        {placement === "inline" ? chart : null}
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[9px] text-muted-foreground">{window.label}</span>
          <span
            className={cn(
              "font-semibold text-[13px] tabular-nums",
              // An unknown value is dimmed so it reads as "not reported"
              // rather than as a number worth looking at.
              percent === null ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {formatUsagePercent(percent)}
            {percent === null ? null : (
              <span className="ml-px font-normal text-[9px] text-muted-foreground">%</span>
            )}
          </span>
        </span>
      </div>
      {placement === "below" ? <div className="w-full px-0.5 pt-0.5">{chart}</div> : null}
      {window.resetsDuration ? (
        <span className="truncate text-[9px] text-muted-foreground">{window.resetsDuration}</span>
      ) : null}
    </div>
  );
});

function ExpandedColumn({
  column,
  align,
  settings,
  history,
}: {
  readonly column: UsageMeterColumn;
  readonly align: "start" | "center" | "end";
  readonly settings: UsageMeterSettings;
  readonly history: UsageSampleHistory;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 px-1">
      <div
        className={cn(
          "flex",
          align === "start" && "justify-start",
          align === "center" && "justify-center",
          align === "end" && "justify-end",
        )}
      >
        <ProviderIcon className="size-3.5 shrink-0" provider={column.provider} />
      </div>
      <div className="flex items-start justify-center gap-2">
        {column.windows.map((window) => (
          <ExpandedWindow
            key={window.key}
            provider={column.provider}
            samples={history.get(`${column.id}:${window.key}`) ?? []}
            settings={settings}
            window={window}
          />
        ))}
      </div>
    </div>
  );
}

function ExpandedMeters({
  columns,
  settings,
  history,
  syncedLabel,
}: {
  readonly columns: ReadonlyArray<UsageMeterColumn>;
  readonly settings: UsageMeterSettings;
  readonly history: UsageSampleHistory;
  readonly syncedLabel: string | null;
}) {
  return (
    <section
      aria-label={`Provider usage. ${describeColumns(columns, settings)}`}
      className="rounded-xl border border-sidebar-border px-1.5 pt-1.5 pb-1"
    >
      <div className="flex items-stretch">
        {columns.map((column, index) => (
          <Fragment key={column.id}>
            {index > 0 ? <div aria-hidden className="w-px shrink-0 bg-sidebar-border" /> : null}
            <ExpandedColumn
              align={
                columns.length === 1
                  ? "center"
                  : index === 0
                    ? "start"
                    : index === columns.length - 1
                      ? "end"
                      : "center"
              }
              column={column}
              history={history}
              settings={settings}
            />
          </Fragment>
        ))}
      </div>
      {syncedLabel ? (
        <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-muted-foreground">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">{syncedLabel}</span>
        </div>
      ) : null}
    </section>
  );
}

// ── Minimized ────────────────────────────────────────────────────────

/**
 * One pill per provider: the icon, then every window as "percent countdown".
 * No chart — at this size a shape would be decoration, and the countdown is
 * the part that decides whether to keep working or wait.
 */
function MinimizedPill({
  column,
  settings,
}: {
  readonly column: UsageMeterColumn;
  readonly settings: UsageMeterSettings;
}) {
  const worstUsedPercent = column.windows.reduce<number | null>(
    (worst, window) =>
      window.usedPercent === null ? worst : Math.max(worst ?? 0, window.usedPercent),
    null,
  );
  const color = accentColor(column.provider, worstUsedPercent);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-sidebar-border px-1.5 py-1">
            <ProviderIcon className="size-3.5 shrink-0" provider={column.provider} />
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold tabular-nums leading-none">
              {column.windows.map((window) => {
                const percent = resolveDisplayPercent(window.usedPercent, settings.percentageBasis);
                return (
                  <span className="truncate" key={window.key} style={{ color }}>
                    {formatUsagePercent(percent)}
                    {percent === null ? "" : "%"}
                    {window.resetsDuration ? (
                      <span className="ml-1 font-normal opacity-80">{window.resetsDuration}</span>
                    ) : null}
                  </span>
                );
              })}
            </span>
          </div>
        }
      />
      <TooltipPopup side="top">
        {column.windows
          .map(
            (window) =>
              `${describeWindow(window, settings)}${
                window.resetsLabel ? `, ${window.resetsLabel}` : ""
              }`,
          )
          .join(" · ")}
      </TooltipPopup>
    </Tooltip>
  );
}

function MinimizedMeters({
  columns,
  settings,
}: {
  readonly columns: ReadonlyArray<UsageMeterColumn>;
  readonly settings: UsageMeterSettings;
}) {
  return (
    <section
      aria-label={`Provider usage. ${describeColumns(columns, settings)}`}
      className="flex items-stretch gap-1"
    >
      {columns.map((column) => (
        <MinimizedPill column={column} key={column.id} settings={settings} />
      ))}
    </section>
  );
}

// ── Entry point ──────────────────────────────────────────────────────

const ActiveUsageMeters = memo(function ActiveUsageMeters({
  mode,
}: {
  readonly mode: UsageMeterMode;
}) {
  const settings = useUsageMeterSettings();
  const { data, refresh } = useProviderUsage();
  useProviderUsageAutoRefresh(refresh, settings.refreshIntervalSeconds);

  // Subscribing to the shared minute tick re-renders the meter so countdowns
  // and the sync label age in place. The tick value itself is a UTC-shaped
  // string with no zone marker, so the arithmetic reads the clock directly
  // rather than parsing it back as local time.
  useNowMinute();
  const nowMs = Date.now();

  const columns = selectUsageColumns(data, nowMs);
  const samples = collectUsageSamples(columns);
  const signature = usageSampleSignature(samples);

  // The sparkline plots what this tab has watched happen; the server caches
  // only the latest reading. The append is keyed off the signature so the
  // minute tick, which only moves countdown text, never adds a duplicate
  // point — the readings themselves ride along in a ref for the same reason.
  const [history, setHistory] = useState<UsageSampleHistory>(() => new Map());
  const samplesRef = useRef(samples);
  samplesRef.current = samples;
  useEffect(() => {
    setHistory((previous) => appendUsageSamples(previous, samplesRef.current));
  }, [signature]);

  if (columns.length === 0) return null;

  if (mode === "minimized") {
    return <MinimizedMeters columns={columns} settings={settings} />;
  }
  return (
    <ExpandedMeters
      columns={columns}
      history={history}
      settings={settings}
      syncedLabel={formatSyncedLabel(latestSyncedAt(columns), nowMs)}
    />
  );
});

/**
 * Subscription usage the providers reported for themselves. Hidden entirely
 * until a provider has reported at least one window — an empty meter would
 * take footer space from the controls below it and say nothing.
 *
 * `off` unmounts the body rather than hiding it, so the usage subscription is
 * never opened for a user who does not want the meter.
 */
export const SidebarUsageMeters = memo(function SidebarUsageMeters() {
  const mode = useUsageMeterMode();
  return mode === "off" ? null : <ActiveUsageMeters mode={mode} />;
});
