import { describe, expect, it } from "vite-plus/test";

import {
  resolveDictationControlPlacement,
  resolveDictationPressIntent,
} from "./ComposerPrimaryActions";

describe("resolveDictationPressIntent", () => {
  const idle = {
    isDictating: false,
    canHoldToDictate: true,
    isPrimaryButton: true,
  } as const;

  it("arms the hold when nothing is listening yet", () => {
    expect(resolveDictationPressIntent(idle)).toBe("start-hold");
  });

  it("stops an open session", () => {
    expect(resolveDictationPressIntent({ ...idle, isDictating: true })).toBe("stop");
  });

  it("still stops a session the button could no longer start", () => {
    expect(
      resolveDictationPressIntent({ ...idle, isDictating: true, canHoldToDictate: false }),
    ).toBe("stop");
  });

  it("leaves the press alone when dictation is not on offer", () => {
    expect(resolveDictationPressIntent({ ...idle, canHoldToDictate: false })).toBe("none");
  });

  it("ignores anything but the primary button", () => {
    expect(resolveDictationPressIntent({ ...idle, isPrimaryButton: false })).toBe("none");
    expect(
      resolveDictationPressIntent({ ...idle, isDictating: true, isPrimaryButton: false }),
    ).toBe("none");
  });
});

describe("resolveDictationControlPlacement", () => {
  const resting = {
    isDictationAvailable: true,
    hasPendingAction: false,
    isRunning: false,
    showPlanFollowUpPrompt: false,
  } as const;

  it("hands the toggle to the send button while the composer rests", () => {
    expect(resolveDictationControlPlacement(resting)).toBe("send-button");
  });

  it("moves the toggle off the send button while a turn is running", () => {
    expect(resolveDictationControlPlacement({ ...resting, isRunning: true })).toBe("standalone");
  });

  it("moves the toggle off the send button while a question is waiting", () => {
    expect(resolveDictationControlPlacement({ ...resting, hasPendingAction: true })).toBe(
      "standalone",
    );
  });

  it("moves the toggle off the send button while a plan prompt is up", () => {
    expect(resolveDictationControlPlacement({ ...resting, showPlanFollowUpPrompt: true })).toBe(
      "standalone",
    );
  });

  it("offers no control at all when dictation is unavailable", () => {
    expect(resolveDictationControlPlacement({ ...resting, isDictationAvailable: false })).toBe(
      "none",
    );
    expect(
      resolveDictationControlPlacement({
        ...resting,
        isDictationAvailable: false,
        isRunning: true,
      }),
    ).toBe("none");
  });
});
