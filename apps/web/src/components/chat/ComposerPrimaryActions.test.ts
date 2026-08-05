import { describe, expect, it } from "vite-plus/test";

import {
  formatPendingPrimaryActionLabel,
  resolveDictationPressIntent,
} from "./ComposerPrimaryActions";

describe("formatPendingPrimaryActionLabel", () => {
  it("returns 'Submitting...' while responding", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: true,
        questionIndex: 0,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submitting...' while responding regardless of other flags", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: true,
        questionIndex: 3,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submit' in compact mode on the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit");
  });

  it("returns 'Next' in compact mode when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Next");
  });

  it("returns 'Next question' when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Next question");
  });

  it("returns singular 'Submit answer' on the last question when it is the only question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit answer");
  });

  it("returns plural 'Submit answers' on the last question when there are multiple questions", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Submit answers");
  });

  it("returns plural 'Submit answers' for higher question indices", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 5,
      }),
    ).toBe("Submit answers");
  });
});

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
