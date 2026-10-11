import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const stageArtworkState = vi.hoisted(() => ({
  mode: "none" as "artwork" | "none",
  variant: null as "nightly" | "dev" | null,
}));

import {
  ComposerPrimaryActions,
  formatPendingPrimaryActionLabel,
  resolveDictationControlPlacement,
  resolveDictationPressIntent,
} from "./ComposerPrimaryActions";

const availableDictation = {
  status: "idle",
  available: true,
  unavailableMessage: null,
  onStart: () => {},
  onStop: () => {},
} as const;

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => stageArtworkState.mode,
}));
vi.mock("../SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: ({ variant }: { variant: string }) => `stage-${variant}`,
  useSidebarStageBackdropVariant: (enabled = true) => (enabled ? stageArtworkState.variant : null),
}));

function renderPendingActions(
  isRunning: boolean,
  dictation: typeof availableDictation | null = null,
) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: {
        questionIndex: 0,
        isLastQuestion: true,
        canAdvance: true,
        isResponding: false,
        isComplete: true,
      },
      isRunning,
      canInterrupt: isRunning,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      dictation,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

function renderRunningActions(
  showSendWhileRunning: boolean,
  hasSendableContent: boolean,
  dictation: typeof availableDictation | null = null,
) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: null,
      isRunning: true,
      canInterrupt: true,
      showPlanFollowUpPrompt: false,
      promptHasText: hasSendableContent,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent,
      showSendWhileRunning,
      dictation,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

function renderSendButton(
  sendDisabledReason: string | null = null,
  dictation: typeof availableDictation | null = null,
) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: null,
      isRunning: false,
      canInterrupt: false,
      showPlanFollowUpPrompt: false,
      promptHasText: true,
      isSendBusy: false,
      sendDisabledReason,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: true,
      dictation,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

afterEach(() => {
  stageArtworkState.mode = "none";
  stageArtworkState.variant = null;
});

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

describe("ComposerPrimaryActions", () => {
  it("disables and labels the send button while feedback is uploading", () => {
    const markup = renderSendButton("Sending feedback");

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-label="Sending feedback"');
  });

  it("offers Stop generation while a running turn is waiting for user input", () => {
    expect(renderPendingActions(true)).toContain('aria-label="Stop generation"');
  });

  it("does not offer Stop generation for a pending request without a running turn", () => {
    expect(renderPendingActions(false)).not.toContain('aria-label="Stop generation"');
  });

  it("renders stage artwork inside the send button when artwork identification is active", () => {
    stageArtworkState.mode = "artwork";
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).toContain("stage-nightly");
  });

  it("hides stage artwork when artwork identification is inactive", () => {
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).not.toContain("stage-nightly");
  });

  it("renders a steer action alongside stop while running with a sendable draft", () => {
    const markup = renderRunningActions(true, true);

    expect(markup).toContain('aria-label="Stop generation"');
    expect(markup).toContain('aria-label="Steer message"');
    expect(markup).toContain('type="submit"');
  });

  it("keeps stop as the only action while running with an empty composer", () => {
    const markup = renderRunningActions(true, false);

    expect(markup).toContain('aria-label="Stop generation"');
    expect(markup).not.toContain('aria-label="Steer message"');
  });

  it("offers a dictation button of its own beside stop while running", () => {
    const markup = renderRunningActions(true, false, availableDictation);

    expect(markup).toContain('aria-label="Dictate"');
    expect(markup).toContain('aria-label="Stop generation"');
  });

  it("offers a dictation button of its own while a question is waiting", () => {
    const markup = renderPendingActions(false, availableDictation);

    expect(markup).toContain('aria-label="Dictate"');
  });

  it("keeps dictation on the send button while the composer rests", () => {
    const markup = renderSendButton(null, availableDictation);

    expect(markup).not.toContain('aria-label="Dictate"');
    expect(markup).toContain('aria-label="Submit message, or hold to dictate"');
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
