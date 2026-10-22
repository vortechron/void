import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { MAX_FONT_FAMILY_NAME_LENGTH } from "@t3tools/contracts/settings";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import { loadInstalledFontFamilies, supportsInstalledFontAccess } from "../../installedFonts";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxListVirtualized,
  ComboboxPopup,
  ComboboxStatus,
  ComboboxTrigger,
} from "../ui/combobox";
import { SelectButton } from "../ui/select";

interface FontOption {
  readonly label: string;
  readonly source: "Built-in" | "Installed" | "Custom";
  readonly value: string;
}

type InstalledFontsState = "idle" | "loading" | "ready" | "unsupported" | "error";

function optionMatchesQuery(option: FontOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;
  return (
    option.label.toLowerCase().includes(normalizedQuery) ||
    option.value.toLowerCase().includes(normalizedQuery)
  );
}

function optionRepresentsValue(option: FontOption, value: string): boolean {
  return option.value.toLowerCase() === value.toLowerCase();
}

function installedFontsStatus(state: InstalledFontsState, count: number): string {
  if (state === "loading") return "Loading installed fonts…";
  if (state === "ready") return `${count} installed font ${count === 1 ? "family" : "families"}`;
  if (state === "unsupported") return "Type an exact family name to use a local font.";
  if (state === "error") {
    return "Could not list installed fonts. Check site permissions or type an exact family name.";
  }
  return "Installed fonts refresh when this picker opens, or type an exact family name.";
}

export function FontFamilyPicker({
  label,
  onValueChange,
  presets,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly presets: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly value: string;
}) {
  const [installedFamilies, setInstalledFamilies] = useState<readonly string[]>([]);
  const [installedFontsState, setInstalledFontsState] = useState<InstalledFontsState>("idle");
  const [query, setQuery] = useState("");
  const fontListRef = useRef<LegendListRef>(null);

  const options = (() => {
    const builtInOptions = presets.map((preset): FontOption => ({ ...preset, source: "Built-in" }));
    const reservedNames = new Set(builtInOptions.map((option) => option.value.toLowerCase()));
    const installedOptions = installedFamilies
      .filter((family) => !reservedNames.has(family.toLowerCase()))
      .map((family): FontOption => ({ label: family, source: "Installed", value: family }));
    const selectedOption = [...builtInOptions, ...installedOptions].find((option) =>
      optionRepresentsValue(option, value),
    );
    if (selectedOption || reservedNames.has(value.toLowerCase())) {
      return [...builtInOptions, ...installedOptions];
    }
    return [
      ...builtInOptions,
      { label: value, source: "Custom" as const, value },
      ...installedOptions,
    ];
  })();

  const selectedOption =
    options.find((option) => optionRepresentsValue(option, value)) ?? options[0];
  const pickerOptions = (() => {
    const customFamily = query.trim();
    if (
      customFamily.length === 0 ||
      customFamily.length > MAX_FONT_FAMILY_NAME_LENGTH ||
      options.some((option) => optionRepresentsValue(option, customFamily))
    ) {
      return options;
    }
    return [
      ...options,
      {
        label: `Use “${customFamily}”`,
        source: "Custom" as const,
        value: customFamily,
      },
    ];
  })();
  const filteredOptions = pickerOptions.filter((option) => optionMatchesQuery(option, query));

  const requestInstalledFonts = () => {
    if (installedFontsState === "loading") return;
    if (!supportsInstalledFontAccess()) {
      setInstalledFontsState("unsupported");
      return;
    }

    setInstalledFontsState("loading");
    void loadInstalledFontFamilies().then(
      (families) => {
        setInstalledFamilies(families);
        setInstalledFontsState("ready");
      },
      () => setInstalledFontsState("error"),
    );
  };

  return (
    <Combobox<FontOption>
      autoHighlight
      filteredItems={filteredOptions}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      items={pickerOptions}
      onItemHighlighted={(_option, eventDetails) => {
        if (eventDetails.index < 0 || eventDetails.reason !== "keyboard") return;
        void fontListRef.current?.scrollIndexIntoView?.({
          animated: false,
          index: eventDetails.index,
        });
      }}
      onOpenChange={(open) => {
        if (open) {
          requestInstalledFonts();
        } else {
          setQuery("");
        }
      }}
      onValueChange={(option) => {
        if (option) onValueChange(option.value);
      }}
      value={selectedOption}
      virtualized
    >
      <ComboboxTrigger aria-label={label} render={<SelectButton className="w-full sm:w-56" />}>
        {selectedOption?.label ?? value}
      </ComboboxTrigger>
      <ComboboxPopup align="end" className="flex w-72 max-w-[calc(100vw-1rem)] flex-col">
        <div className="shrink-0 px-3 pt-2.5">
          <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
            />
            <ComboboxInput
              aria-label={`Search ${label.toLowerCase()}`}
              className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search fonts…"
              showTrigger={false}
              size="sm"
              unstyled
              value={query}
            />
          </div>
        </div>
        <ComboboxEmpty>No matching fonts.</ComboboxEmpty>
        <div className="relative min-h-0 w-full max-h-64 flex-1 overflow-hidden">
          <ComboboxListVirtualized className="size-full min-w-0 p-0">
            <LegendList<FontOption>
              ref={fontListRef}
              className="scrollbar-gutter-stable overflow-x-hidden overscroll-y-contain px-1 py-1"
              data={filteredOptions}
              // Rows are memoized by item, but Base UI highlights and selects
              // virtualized rows by index. Re-render them when filtering moves
              // a surviving item to a new index.
              extraData={filteredOptions}
              drawDistance={336}
              estimatedItemSize={28}
              keyExtractor={(option) => `${option.source}:${option.value}`}
              renderItem={({ item, index }) => (
                <ComboboxItem hideIndicator index={index} value={item}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/50">
                      {item.source}
                    </span>
                  </div>
                </ComboboxItem>
              )}
              style={{ maxHeight: "16rem" }}
            />
          </ComboboxListVirtualized>
        </div>
        <ComboboxStatus className="border-t border-border/60">
          {installedFontsStatus(installedFontsState, installedFamilies.length)}
        </ComboboxStatus>
      </ComboboxPopup>
    </Combobox>
  );
}
