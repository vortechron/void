/**
 * Stand-in project names for screen sharing.
 *
 * The mask is display-only. Rename fields, filesystem paths, and anything sent
 * to a provider keep the real title; only the labels a viewer can read on the
 * sidebar and the thread header are swapped.
 *
 * Names are assigned by position in the sorted list of real names, not by a
 * hash, so two projects never collapse onto the same stand-in and a project
 * keeps its stand-in for as long as the project list is unchanged.
 */

const MASK_WORDS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
  "Quebec",
  "Romeo",
  "Sierra",
  "Tango",
  "Uniform",
  "Victor",
  "Whiskey",
  "Xray",
  "Yankee",
  "Zulu",
] as const;

/** The stand-in for the nth real name, wrapping past the end of the word list. */
export function maskedProjectNameAt(index: number): string {
  const word = MASK_WORDS[index % MASK_WORDS.length]!;
  const round = Math.floor(index / MASK_WORDS.length);
  return round === 0 ? `Project ${word}` : `Project ${word} ${round + 1}`;
}

/**
 * Real name to stand-in, for every name the projects can display.
 *
 * Pass every label a project surface may render — the project title plus the
 * repository names a grouped project header can fall back to — so a lookup
 * never misses and leaks the real string.
 */
export function buildPrivateProjectNames(
  names: ReadonlyArray<string | null | undefined>,
): ReadonlyMap<string, string> {
  const realNames = [
    ...new Set(names.flatMap((name) => (name && name.trim().length > 0 ? [name] : []))),
  ].sort((left, right) => left.localeCompare(right));
  return new Map(realNames.map((name, index) => [name, maskedProjectNameAt(index)]));
}

/**
 * A name that is safe to show. Unknown names fall back to a generic stand-in
 * rather than the original, so a label built outside the known set cannot
 * defeat the setting.
 */
export function applyPrivateProjectName(masks: ReadonlyMap<string, string>, name: string): string {
  return masks.get(name) ?? "Project";
}
