import {
  PROVIDER_DISPLAY_NAMES,
  ProviderDriverKind,
  type UsageMeterMode,
  type UsageMeterSettings,
} from "@t3tools/contracts";
import { memo, useEffect, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useUsageMeterMode, useUsageMeterSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useProviderUsage, useProviderUsageAutoRefresh } from "../../lib/providerUsageState";
import { AntigravityIcon, ClaudeAI, CursorIcon, type Icon, OpenAI } from "../Icons";
import { ProviderPackageIcon } from "../chat/ProviderPackageIcon";
import { providerClients } from "../settings/providerDriverMeta";
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

function providerName(provider: ProviderDriverKind): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
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

const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> = {
  [ProviderDriverKind.make("codex")]: OpenAI,
  [ProviderDriverKind.make("claudeAgent")]: ClaudeAI,
  [ProviderDriverKind.make("cursor")]: CursorIcon,
  [ProviderDriverKind.make("antigravity")]: AntigravityIcon,
};

function ProviderIcon({
  provider,
  className,
}: {
  readonly provider: ProviderDriverKind;
  readonly className: string;
}) {
  const Icon = PROVIDER_ICON_BY_PROVIDER[provider];
  if (!Icon) {
    // Providers that live in their own package (Grok, OpenCode, Pi) ship a
    // plain-data glyph that carries its own brand colors.
    const packageIcon = providerClients.get(provider)?.icon;
    return packageIcon ? (
      <ProviderPackageIcon icon={packageIcon} className={className} aria-hidden />
    ) : null;
  }
  const accent = ACCENT_COLOR_BY_PROVIDER[provider];
  return (
    // Inline so the accent wins over each icon's own baked-in fill class.
    <Icon aria-hidden className={className} style={accent ? { fill: accent } : undefined} />
  );
}

// ── Expanded ─────────────────────────────────────────────────────────
//
// One window per line, providers stacked. The sidebar is too narrow to seat
// providers side by side: every column ended up thin enough that the window
// labels and the reset countdowns truncated to a letter or two.

const ExpandedWindowRow = memo(function ExpandedWindowRow({
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

  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
        {window.label}
      </span>
      {placement === "none" ? null : (
        // A ring is square and sizes itself; the wide styles need a fixed
        // slot, or a long label would squeeze them down to nothing.
        <span className={cn("flex shrink-0 items-center", placement === "below" && "w-12")}>
          <UsageChart
            chartStyle={settings.chartStyle}
            color={color}
            percent={percent}
            samples={samples}
          />
        </span>
      )}
      <span
        className={cn(
          "w-9 shrink-0 text-right font-semibold text-[11px] tabular-nums",
          // An unknown value is dimmed so it reads as "not reported" rather
          // than as a number worth looking at. A spent window goes red even
          // when the chart is off and has no color left to carry the alarm.
          percent === null
            ? "text-muted-foreground"
            : isExhaustedUsage(window.usedPercent)
              ? "text-red-500"
              : "text-foreground",
        )}
      >
        {formatUsagePercent(percent)}
        {percent === null ? null : (
          <span className="font-normal text-[9px] text-muted-foreground">%</span>
        )}
      </span>
      <span className="w-11 shrink-0 truncate text-right text-[10px] text-muted-foreground tabular-nums">
        {window.resetsDuration}
      </span>
    </div>
  );
});

function ExpandedProvider({
  column,
  settings,
  history,
}: {
  readonly column: UsageMeterColumn;
  readonly settings: UsageMeterSettings;
  readonly history: UsageSampleHistory;
}) {
  return (
    // Its own card, matching the minimized pills: two providers in one frame
    // read as one list, and the reset countdowns of the second get mistaken
    // for the first.
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[var(--control-radius)] border border-sidebar-border px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1">
        <ProviderIcon className="size-3 shrink-0" provider={column.provider} />
        <span className="truncate font-medium text-[10px] text-foreground">
          {providerName(column.provider)}
        </span>
      </div>
      {column.windows.map((window) => (
        <ExpandedWindowRow
          key={window.key}
          provider={column.provider}
          samples={history.get(`${column.id}:${window.key}`) ?? []}
          settings={settings}
          window={window}
        />
      ))}
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
      className="flex flex-col gap-1"
    >
      {columns.map((column) => (
        <ExpandedProvider column={column} history={history} key={column.id} settings={settings} />
      ))}
      {syncedLabel ? (
        <div className="flex items-center justify-start gap-1 px-0.5 text-[8px] text-muted-foreground">
          <span aria-hidden className="size-1 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">{syncedLabel}</span>
        </div>
      ) : null}
    </section>
  );
}

// ── Minimized ────────────────────────────────────────────────────────

/**
 * One pill per provider, stacked so each gets the sidebar's full width: the
 * icon, then every window as "percent countdown". No chart — at this size a
 * shape would be decoration, and the countdown is the part that decides
 * whether to keep working or wait. Windows wrap rather than truncate, since a
 * countdown cut to "2d…" is worse than a second line.
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
          <div className="flex min-w-0 items-center gap-1.5 rounded-[var(--control-radius)] border border-sidebar-border px-1.5 py-1">
            <ProviderIcon className="size-3.5 shrink-0" provider={column.provider} />
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-[11px] tabular-nums leading-none">
              {column.windows.map((window) => {
                const percent = resolveDisplayPercent(window.usedPercent, settings.percentageBasis);
                return (
                  <span key={window.key} style={{ color }}>
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
      className="flex flex-col gap-1"
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
