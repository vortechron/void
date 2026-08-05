import { type ProviderDriverKind } from "@t3tools/contracts";
import { Fragment, memo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { useProviderUsage } from "../../lib/providerUsageState";
import { PROVIDER_ICON_BY_PROVIDER } from "../chat/providerIconUtils";
import {
  formatSyncedLabel,
  formatUsagePercent,
  latestSyncedAt,
  selectUsageColumns,
  type UsageMeterColumn,
  type UsageMeterWindow,
} from "./SidebarUsageMeters.logic";

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Brand accents so the two halves stay tellable apart at meter size. */
const RING_COLOR_BY_PROVIDER: Partial<Record<string, string>> = {
  claudeAgent: "#d97757",
  codex: "#4d9fff",
};

const MUTED_RING_COLOR = "color-mix(in oklab, var(--color-muted-foreground) 70%, transparent)";
const TRACK_COLOR = "color-mix(in oklab, var(--color-muted-foreground) 22%, transparent)";
/** Past this the window is nearly spent, and the ring says so regardless of brand. */
const EXHAUSTED_PERCENT = 90;

function ringColor(provider: ProviderDriverKind, usedPercent: number | null): string {
  if (usedPercent !== null && usedPercent >= EXHAUSTED_PERCENT) return "var(--color-red-500)";
  return RING_COLOR_BY_PROVIDER[provider] ?? MUTED_RING_COLOR;
}

const UsageRing = memo(function UsageRing({
  provider,
  window,
}: {
  provider: ProviderDriverKind;
  window: UsageMeterWindow;
}) {
  // An unreported percentage draws the track only, so the ring never implies a
  // fullness the provider never stated.
  const dashOffset = RING_CIRCUMFERENCE * (1 - (window.usedPercent ?? 0) / 100);

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        <svg
          aria-hidden
          className="-rotate-90 size-[22px] shrink-0 transform-gpu"
          viewBox="0 0 24 24"
        >
          <circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            stroke={TRACK_COLOR}
            strokeWidth="2"
          />
          <circle
            className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor(provider, window.usedPercent)}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[9px] text-muted-foreground">{window.label}</span>
          <span className="font-semibold text-[13px] text-foreground tabular-nums">
            {formatUsagePercent(window.usedPercent)}
            <span className="ml-px font-normal text-[9px] text-muted-foreground">%</span>
          </span>
        </span>
      </div>
      {window.resetsLabel ? (
        <span className="truncate text-[9px] text-muted-foreground">{window.resetsLabel}</span>
      ) : null}
    </div>
  );
});

function UsageColumn({
  column,
  align,
}: {
  column: UsageMeterColumn;
  align: "start" | "center" | "end";
}) {
  const Icon = PROVIDER_ICON_BY_PROVIDER[column.provider] ?? null;
  const accent = RING_COLOR_BY_PROVIDER[column.provider];

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
        {Icon ? (
          <Icon
            aria-hidden
            className="size-3.5 shrink-0"
            // Inline so the accent wins over each icon's own baked-in fill class.
            style={accent ? { fill: accent } : undefined}
          />
        ) : null}
      </div>
      <div className="flex items-start justify-center gap-2">
        {column.windows.map((window) => (
          <UsageRing key={window.key} provider={column.provider} window={window} />
        ))}
      </div>
    </div>
  );
}

/**
 * Subscription usage the providers reported for themselves. Hidden entirely
 * until a provider has reported at least one window — an empty meter would
 * take footer space from the controls below it and say nothing.
 */
export const SidebarUsageMeters = memo(function SidebarUsageMeters() {
  const { data } = useProviderUsage();
  // Subscribing to the shared minute tick re-renders the meter so countdowns
  // and the sync label age in place. The tick value itself is a UTC-shaped
  // string with no zone marker, so the arithmetic reads the clock directly
  // rather than parsing it back as local time.
  useNowMinute();
  const nowMs = Date.now();

  const columns = selectUsageColumns(data, nowMs);
  if (columns.length === 0) return null;

  const syncedLabel = formatSyncedLabel(latestSyncedAt(columns), nowMs);
  const usageSummary = columns
    .map(
      (column) =>
        `${column.provider}: ${column.windows
          .map((window) =>
            window.usedPercent === null
              ? `${window.label} usage not reported`
              : `${window.label} ${formatUsagePercent(window.usedPercent)}% used`,
          )
          .join(", ")}`,
    )
    .join("; ");

  return (
    <section
      aria-label={`Provider usage. ${usageSummary}`}
      className="rounded-xl border border-sidebar-border px-1.5 pt-1.5 pb-1"
    >
      <div className="flex items-stretch">
        {columns.map((column, index) => (
          <Fragment key={column.id}>
            {index > 0 ? <div aria-hidden className="w-px shrink-0 bg-sidebar-border" /> : null}
            <UsageColumn
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
});
