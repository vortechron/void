import { describe, expect, it } from "vite-plus/test";

import { shouldReuseRacedDraftAfterDefaults } from "./useHandleNewThread.logic";

describe("shouldReuseRacedDraftAfterDefaults", () => {
  it("never reuses an existing draft when the caller forced a new thread", () => {
    expect(shouldReuseRacedDraftAfterDefaults({ forceNew: true, hasPromotedThread: false })).toBe(
      false,
    );
  });

  it("reuses only an unpromoted raced draft during normal new-thread creation", () => {
    expect(shouldReuseRacedDraftAfterDefaults({ forceNew: false, hasPromotedThread: false })).toBe(
      true,
    );
    expect(shouldReuseRacedDraftAfterDefaults({ forceNew: false, hasPromotedThread: true })).toBe(
      false,
    );
  });
});
