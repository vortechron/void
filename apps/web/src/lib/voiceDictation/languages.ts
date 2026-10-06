/** Reads one or more language hints from the existing saved language setting. */
export function parseDictationLanguages(value: string): ReadonlyArray<string> {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[,\s]+/)
        .filter((code) => code.length > 0),
    ),
  ];
}
