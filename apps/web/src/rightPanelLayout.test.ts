import { describe, expect, it } from "vite-plus/test";

import {
  getRightPanelSheetDefaultWidth,
  getRightPanelSheetMaxWidth,
  RIGHT_PANEL_SHEET_MIN_WIDTH,
} from "./rightPanelLayout";

describe("getRightPanelSheetMaxWidth", () => {
  it("leaves a strip of backdrop uncovered so outside press still dismisses", () => {
    expect(getRightPanelSheetMaxWidth(820)).toBe(772);
  });

  it("never reports a maximum below the minimum", () => {
    // A 360px phone minus the gutter is 312, under the 320px minimum. Returning
    // that would make useResizableWidth persist the minimum over a stored width.
    expect(getRightPanelSheetMaxWidth(360)).toBe(RIGHT_PANEL_SHEET_MIN_WIDTH);
  });
});

describe("getRightPanelSheetDefaultWidth", () => {
  it("opens at 42% of a tablet viewport", () => {
    expect(getRightPanelSheetDefaultWidth(820)).toBe(344);
  });

  it("caps at 448px once 42% would exceed it", () => {
    expect(getRightPanelSheetDefaultWidth(1_400)).toBe(448);
  });

  it("uses the wider compact ratio below 760px", () => {
    expect(getRightPanelSheetDefaultWidth(400)).toBe(352);
  });

  it("caps the compact ratio at 384px", () => {
    expect(getRightPanelSheetDefaultWidth(600)).toBe(384);
  });

  it("stays inside the maximum on a narrow phone", () => {
    expect(getRightPanelSheetDefaultWidth(390)).toBe(342);
  });
});
