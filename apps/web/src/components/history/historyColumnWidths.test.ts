import { describe, expect, it } from "vite-plus/test";

import {
  HISTORY_COLUMN_BOUNDS,
  NO_HISTORY_COLUMN_OVERRIDES,
  clampHistoryColumnWidth,
  historyColumnWidthStorageKey,
  historyColumnWidthVariables,
  resolveHistoryColumnWidths,
} from "./historyColumnWidths";

describe("clampHistoryColumnWidth", () => {
  it("holds a width inside the column's bounds", () => {
    expect(clampHistoryColumnWidth("date", 10)).toBe(HISTORY_COLUMN_BOUNDS.date.minWidth);
    expect(clampHistoryColumnWidth("date", 9000)).toBe(HISTORY_COLUMN_BOUNDS.date.maxWidth);
    expect(clampHistoryColumnWidth("author", 120)).toBe(120);
  });

  it("rounds to whole pixels so a drag cannot leave a fractional width", () => {
    expect(clampHistoryColumnWidth("author", 120.6)).toBe(121);
  });

  it("falls back to the default when the width is not a number", () => {
    expect(clampHistoryColumnWidth("sha", Number.NaN)).toBe(HISTORY_COLUMN_BOUNDS.sha.defaultWidth);
    expect(clampHistoryColumnWidth("sha", Number.POSITIVE_INFINITY)).toBe(
      HISTORY_COLUMN_BOUNDS.sha.defaultWidth,
    );
  });
});

describe("resolveHistoryColumnWidths", () => {
  it("defaults every column that was never dragged", () => {
    expect(resolveHistoryColumnWidths(NO_HISTORY_COLUMN_OVERRIDES, 42)).toEqual({
      graph: 42,
      date: HISTORY_COLUMN_BOUNDS.date.defaultWidth,
      author: HISTORY_COLUMN_BOUNDS.author.defaultWidth,
      sha: HISTORY_COLUMN_BOUNDS.sha.defaultWidth,
    });
  });

  it("leaves an undragged graph following the width its lanes need", () => {
    expect(resolveHistoryColumnWidths({}, 98).graph).toBe(98);
    expect(resolveHistoryColumnWidths({ graph: 220 }, 98).graph).toBe(220);
  });

  it("keeps stored widths and pulls stale ones back into range", () => {
    expect(resolveHistoryColumnWidths({ date: 200, author: 4000 }, 42)).toEqual({
      graph: 42,
      date: 200,
      author: HISTORY_COLUMN_BOUNDS.author.maxWidth,
      sha: HISTORY_COLUMN_BOUNDS.sha.defaultWidth,
    });
  });
});

describe("historyColumnWidthVariables", () => {
  it("declares one pixel variable per column", () => {
    expect(historyColumnWidthVariables({ graph: 42, date: 144, author: 96, sha: 64 })).toEqual({
      "--history-col-graph": "42px",
      "--history-col-date": "144px",
      "--history-col-author": "96px",
      "--history-col-sha": "64px",
    });
  });
});

describe("historyColumnWidthStorageKey", () => {
  it("gives each column its own key", () => {
    expect(historyColumnWidthStorageKey("graph")).toBe("t3code:history-column-width:graph");
    expect(historyColumnWidthStorageKey("date")).toBe("t3code:history-column-width:date");
    expect(historyColumnWidthStorageKey("sha")).toBe("t3code:history-column-width:sha");
  });
});
