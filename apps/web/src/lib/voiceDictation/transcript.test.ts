import { describe, expect, it } from "vite-plus/test";

import {
  appendTranscriptDelta,
  completeTranscriptItem,
  emptyTranscript,
  isTranscriptSettled,
  renderTranscript,
} from "./transcript";

describe("voice dictation transcript", () => {
  it("renders deltas as they stream in", () => {
    let state = appendTranscriptDelta(emptyTranscript, "item-1", "add a ");
    state = appendTranscriptDelta(state, "item-1", "retry button");

    expect(renderTranscript(state)).toBe("add a retry button");
    expect(isTranscriptSettled(state)).toBe(false);
  });

  it("replaces the streamed deltas with the final transcript", () => {
    let state = appendTranscriptDelta(emptyTranscript, "item-1", "add a retry buton");
    state = completeTranscriptItem(state, "item-1", "Add a retry button.");

    expect(renderTranscript(state)).toBe("Add a retry button.");
    expect(isTranscriptSettled(state)).toBe(true);
  });

  it("keeps several items in arrival order", () => {
    let state = appendTranscriptDelta(emptyTranscript, "item-1", "first sentence.");
    state = appendTranscriptDelta(state, "item-2", "second sentence.");
    state = completeTranscriptItem(state, "item-1", "First sentence.");

    expect(renderTranscript(state)).toBe("First sentence. second sentence.");
  });

  it("ignores a delta that arrives after the item completed", () => {
    let state = completeTranscriptItem(emptyTranscript, "item-1", "Done.");
    state = appendTranscriptDelta(state, "item-1", " stray");

    expect(renderTranscript(state)).toBe("Done.");
  });

  it("completes an item it never saw a delta for", () => {
    const state = completeTranscriptItem(emptyTranscript, "item-1", "Only the final text.");

    expect(renderTranscript(state)).toBe("Only the final text.");
    expect(isTranscriptSettled(state)).toBe(true);
  });

  it("drops empty segments so no stray separators appear", () => {
    let state = appendTranscriptDelta(emptyTranscript, "item-1", "  ");
    state = appendTranscriptDelta(state, "item-2", "hello");

    expect(renderTranscript(state)).toBe("hello");
  });

  it("treats a fresh session as settled and empty", () => {
    expect(renderTranscript(emptyTranscript)).toBe("");
    expect(isTranscriptSettled(emptyTranscript)).toBe(true);
  });
});
