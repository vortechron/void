import { MAX_FONT_FAMILY_NAME_LENGTH } from "@t3tools/contracts/settings";

interface LocalFontMetadata {
  readonly family: string;
}

type QueryLocalFonts = () => Promise<readonly LocalFontMetadata[]>;

let installedFontFamiliesPromise: Promise<readonly string[]> | null = null;

function readQueryLocalFonts(): QueryLocalFonts | null {
  if (typeof window === "undefined") return null;
  const queryLocalFonts = (window as Window & { queryLocalFonts?: QueryLocalFonts })
    .queryLocalFonts;
  return typeof queryLocalFonts === "function" ? queryLocalFonts.bind(window) : null;
}

export function supportsInstalledFontAccess(): boolean {
  return readQueryLocalFonts() !== null;
}

export function normalizeInstalledFontFamilies(
  fonts: readonly LocalFontMetadata[],
): readonly string[] {
  const families = new Map<string, string>();
  for (const font of fonts) {
    const family = font.family.trim();
    if (family.length === 0 || family.length > MAX_FONT_FAMILY_NAME_LENGTH) continue;
    const key = family.toLowerCase();
    if (!families.has(key)) {
      families.set(key, family);
    }
  }
  return [...families.values()].sort((left, right) => left.localeCompare(right));
}

export function loadInstalledFontFamilies(): Promise<readonly string[]> {
  if (installedFontFamiliesPromise) return installedFontFamiliesPromise;

  const queryLocalFonts = readQueryLocalFonts();
  if (!queryLocalFonts) {
    return Promise.reject(new Error("Installed font access is not supported by this browser."));
  }

  installedFontFamiliesPromise = queryLocalFonts().then(normalizeInstalledFontFamilies);
  void installedFontFamiliesPromise.then(
    () => {
      installedFontFamiliesPromise = null;
    },
    () => {
      installedFontFamiliesPromise = null;
    },
  );
  return installedFontFamiliesPromise;
}

export function __resetInstalledFontCacheForTests(): void {
  installedFontFamiliesPromise = null;
}
