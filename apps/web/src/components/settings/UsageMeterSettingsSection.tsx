/**
 * Settings for the sidebar provider usage meter.
 *
 * Every control here is presentation only. The numbers themselves come from
 * the providers, which report them while a session runs — nothing on this page
 * can make a provider produce a reading it has not sent.
 */
import {
  DEFAULT_USAGE_METER_CHART_STYLE,
  DEFAULT_USAGE_METER_MODE,
  DEFAULT_USAGE_METER_PERCENTAGE_BASIS,
  DEFAULT_USAGE_METER_REFRESH_INTERVAL_SECONDS,
  type UsageMeterChartStyle,
  type UsageMeterMode,
  type UsageMeterPercentageBasis,
  type UsageMeterRefreshIntervalSeconds,
  type UsageMeterSettings,
} from "@t3tools/contracts/settings";
import { RefreshCwIcon } from "lucide-react";
import { useCallback } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { useProviderUsage } from "../../lib/providerUsageState";
import {
  formatSyncedLabel,
  formatUsagePercent,
  latestSyncedAt,
  resolveDisplayPercent,
  selectUsageColumns,
  usageChartPlacement,
} from "../sidebar/SidebarUsageMeters.logic";
import { UsageChart } from "../sidebar/usageMeterCharts";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const MODE_OPTIONS: ReadonlyArray<{ value: UsageMeterMode; label: string }> = [
  { value: "expanded", label: "Expanded" },
  { value: "minimized", label: "Minimized" },
  { value: "off", label: "Off" },
];

const PERCENTAGE_BASIS_OPTIONS: ReadonlyArray<{
  value: UsageMeterPercentageBasis;
  label: string;
}> = [
  { value: "used", label: "Used" },
  { value: "remaining", label: "Remaining" },
];

const CHART_STYLE_OPTIONS: ReadonlyArray<{ value: UsageMeterChartStyle; label: string }> = [
  { value: "ring", label: "Ring" },
  { value: "bar", label: "Bar" },
  { value: "stepped", label: "Stepped" },
  { value: "numeric", label: "Numeric" },
  { value: "sparkline", label: "Sparkline" },
];

const REFRESH_INTERVAL_OPTIONS: ReadonlyArray<{
  value: UsageMeterRefreshIntervalSeconds;
  label: string;
}> = [
  { value: 0, label: "Off" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" },
  { value: 3600, label: "Every hour" },
];

function optionLabel<Value extends string | number>(
  options: ReadonlyArray<{ value: Value; label: string }>,
  value: Value,
): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

function matchOption<Value extends string | number>(
  options: ReadonlyArray<{ value: Value }>,
  value: unknown,
): Value | null {
  return options.find((option) => option.value === value)?.value ?? null;
}

// A rising series so every chart style has something to show, including the
// sparkline — which in the sidebar only fills in as readings actually arrive.
const PREVIEW_SAMPLES = [12, 18, 17, 24, 31, 38, 44, 52, 61, 68] as const;
const PREVIEW_USED_PERCENT = 68;
const PREVIEW_ACCENT = "#d97757";

function UsageMeterPreview({ settings }: { readonly settings: UsageMeterSettings }) {
  const percent = resolveDisplayPercent(PREVIEW_USED_PERCENT, settings.percentageBasis);
  const placement = usageChartPlacement(settings.chartStyle);
  const chart = (
    <UsageChart
      chartStyle={settings.chartStyle}
      color={PREVIEW_ACCENT}
      percent={percent}
      samples={[...PREVIEW_SAMPLES]}
    />
  );

  if (settings.mode === "off") {
    return (
      <p className="text-xs text-muted-foreground">
        The meter is hidden and no usage is requested.
      </p>
    );
  }

  if (settings.mode === "minimized") {
    return (
      <div className="flex w-48 items-center gap-1.5 rounded-lg border border-border px-1.5 py-1">
        <span className="size-3.5 shrink-0 rounded-full" style={{ background: PREVIEW_ACCENT }} />
        <span
          className="text-[11px] font-semibold tabular-nums leading-none"
          style={{ color: PREVIEW_ACCENT }}
        >
          {formatUsagePercent(percent)}%<span className="ml-1 font-normal opacity-80">4h</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-44 flex-col gap-0.5 rounded-xl border border-border px-2 py-2">
      <span className="text-[10px] font-medium text-foreground">Claude</span>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">Session</span>
        {placement === "none" ? null : (
          <span
            className={
              placement === "below"
                ? "flex w-12 shrink-0 items-center"
                : "flex shrink-0 items-center"
            }
          >
            {chart}
          </span>
        )}
        <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
          {formatUsagePercent(percent)}
          <span className="text-[9px] font-normal text-muted-foreground">%</span>
        </span>
        <span className="w-11 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
          4h
        </span>
      </div>
    </div>
  );
}

export function UsageMeterSettingsSection() {
  const usageMeter = usePrimarySettings((settings) => settings.usageMeter);
  const updateSettings = useUpdatePrimarySettings();
  const { data, isPending, refresh } = useProviderUsage();

  // The blob is replaced whole, so every write starts from the current value.
  const patchUsageMeter = useCallback(
    (patch: Partial<UsageMeterSettings>) => {
      updateSettings({ usageMeter: { ...usageMeter, ...patch } });
    },
    [updateSettings, usageMeter],
  );

  const syncedLabel = formatSyncedLabel(
    latestSyncedAt(selectUsageColumns(data, Date.now())),
    Date.now(),
  );
  const isOff = usageMeter.mode === "off";
  // The minimized pill has no room for a chart, so offering a chart style
  // there would be a control with no visible effect.
  const chartStyleApplies = usageMeter.mode === "expanded";

  return (
    <SettingsSection
      id="usage-meter"
      title="Usage meter"
      headerAction={<UsageMeterPreview settings={usageMeter} />}
    >
      <SettingsRow
        {...searchableSetting("usage-meter-mode")}
        description="How the provider usage meter appears above Settings in the sidebar. Turning it off stops the app from subscribing to usage at all."
        resetAction={
          usageMeter.mode !== DEFAULT_USAGE_METER_MODE ? (
            <SettingResetButton
              label="usage meter mode"
              onClick={() => patchUsageMeter({ mode: DEFAULT_USAGE_METER_MODE })}
            />
          ) : null
        }
        control={
          <Select
            value={usageMeter.mode}
            onValueChange={(value) => {
              const mode = matchOption(MODE_OPTIONS, value);
              if (mode) patchUsageMeter({ mode });
            }}
          >
            <SelectTrigger aria-label="Usage meter mode" className="w-full sm:w-40">
              <SelectValue>{optionLabel(MODE_OPTIONS, usageMeter.mode)}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {MODE_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        {...searchableSetting("usage-meter-percentages")}
        description="Show how much of each window is already spent, or how much is still left. Providers only report what is spent, so “remaining” is that figure inverted."
        resetAction={
          usageMeter.percentageBasis !== DEFAULT_USAGE_METER_PERCENTAGE_BASIS ? (
            <SettingResetButton
              label="usage percentages"
              onClick={() =>
                patchUsageMeter({ percentageBasis: DEFAULT_USAGE_METER_PERCENTAGE_BASIS })
              }
            />
          ) : null
        }
        control={
          <Select
            disabled={isOff}
            value={usageMeter.percentageBasis}
            onValueChange={(value) => {
              const percentageBasis = matchOption(PERCENTAGE_BASIS_OPTIONS, value);
              if (percentageBasis) patchUsageMeter({ percentageBasis });
            }}
          >
            <SelectTrigger aria-label="Usage percentages" className="w-full sm:w-40">
              <SelectValue>
                {optionLabel(PERCENTAGE_BASIS_OPTIONS, usageMeter.percentageBasis)}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {PERCENTAGE_BASIS_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        {...searchableSetting("usage-meter-chart-style")}
        description="The shape drawn next to each percentage. Sparkline plots the readings seen since this tab loaded, and falls back to a bar until it has two."
        status={chartStyleApplies ? null : "Only the expanded meter draws a chart."}
        resetAction={
          usageMeter.chartStyle !== DEFAULT_USAGE_METER_CHART_STYLE ? (
            <SettingResetButton
              label="usage chart style"
              onClick={() => patchUsageMeter({ chartStyle: DEFAULT_USAGE_METER_CHART_STYLE })}
            />
          ) : null
        }
        control={
          <Select
            disabled={!chartStyleApplies}
            value={usageMeter.chartStyle}
            onValueChange={(value) => {
              const chartStyle = matchOption(CHART_STYLE_OPTIONS, value);
              if (chartStyle) patchUsageMeter({ chartStyle });
            }}
          >
            <SelectTrigger aria-label="Usage chart style" className="w-full sm:w-40">
              <SelectValue>{optionLabel(CHART_STYLE_OPTIONS, usageMeter.chartStyle)}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {CHART_STYLE_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        {...searchableSetting("usage-meter-refresh")}
        description="Providers push usage as they report it, so this is a fallback for a stream that has gone quiet. Check now re-pulls the latest snapshot immediately."
        status={syncedLabel ?? "No usage reported yet."}
        resetAction={
          usageMeter.refreshIntervalSeconds !== DEFAULT_USAGE_METER_REFRESH_INTERVAL_SECONDS ? (
            <SettingResetButton
              label="usage refresh interval"
              onClick={() =>
                patchUsageMeter({
                  refreshIntervalSeconds: DEFAULT_USAGE_METER_REFRESH_INTERVAL_SECONDS,
                })
              }
            />
          ) : null
        }
        control={
          <>
            <Select
              disabled={isOff}
              value={String(usageMeter.refreshIntervalSeconds)}
              onValueChange={(value) => {
                const refreshIntervalSeconds = matchOption(REFRESH_INTERVAL_OPTIONS, Number(value));
                if (refreshIntervalSeconds !== null) patchUsageMeter({ refreshIntervalSeconds });
              }}
            >
              <SelectTrigger aria-label="Usage refresh interval" className="w-full sm:w-44">
                <SelectValue>
                  {optionLabel(REFRESH_INTERVAL_OPTIONS, usageMeter.refreshIntervalSeconds)}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {REFRESH_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <Button disabled={isPending} onClick={refresh} size="sm" variant="outline">
              <RefreshCwIcon className="size-3.5" />
              Check now
            </Button>
          </>
        }
      />
    </SettingsSection>
  );
}
