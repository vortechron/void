import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyRemoteComposerPrompts,
  createEmptyThreadDraft,
  selectSyncableComposerPrompts,
  type ComposerThreadDraftState,
} from "./composerDraftStore";

const ENV = EnvironmentId.make("env-1");
const threadKey = (id: string) => scopedThreadKey(scopeThreadRef(ENV, ThreadId.make(id)));

function draft(overrides: Partial<ComposerThreadDraftState>): ComposerThreadDraftState {
  return { ...createEmptyThreadDraft(), ...overrides };
}

describe("selectSyncableComposerPrompts", () => {
  it("publishes unsent text written against real threads", () => {
    const state = {
      draftsByThreadKey: {
        [threadKey("a")]: draft({ prompt: "half a thought" }),
      },
    };

    expect(selectSyncableComposerPrompts(state)).toEqual({
      [threadKey("a")]: "half a thought",
    });
  });

  it("leaves draft sessions behind: their ids only exist in this browser", () => {
    const state = {
      draftsByThreadKey: {
        "draft-1": draft({ prompt: "not sent yet" }),
      },
    };

    expect(selectSyncableComposerPrompts(state)).toEqual({});
  });

  it("skips prompts that are only whitespace", () => {
    const state = {
      draftsByThreadKey: {
        [threadKey("a")]: draft({ prompt: "   " }),
      },
    };

    expect(selectSyncableComposerPrompts(state)).toEqual({});
  });
});

describe("applyRemoteComposerPrompts", () => {
  it("picks up text typed on another device", () => {
    const applied = applyRemoteComposerPrompts(
      { draftsByThreadKey: {} },
      { [threadKey("a")]: "typed on the phone" },
    );

    expect(applied.draftsByThreadKey[threadKey("a")]?.prompt).toBe("typed on the phone");
  });

  it("clears text the other device sent or deleted", () => {
    const applied = applyRemoteComposerPrompts(
      { draftsByThreadKey: { [threadKey("a")]: draft({ prompt: "stale" }) } },
      {},
    );

    expect(applied.draftsByThreadKey[threadKey("a")]).toBeUndefined();
  });

  it("keeps everything else in the draft when the prompt changes", () => {
    const attachment = {
      id: "img-1",
      name: "shot.png",
      mimeType: "image/png",
      sizeBytes: 12,
      dataUrl: "data:image/png;base64,AA==",
    };
    const applied = applyRemoteComposerPrompts(
      {
        draftsByThreadKey: {
          [threadKey("a")]: draft({ prompt: "old", persistedAttachments: [attachment] }),
        },
      },
      { [threadKey("a")]: "new" },
    );

    expect(applied.draftsByThreadKey[threadKey("a")]).toMatchObject({
      prompt: "new",
      persistedAttachments: [attachment],
    });
  });

  it("does not overwrite typing that has not been published yet", () => {
    const applied = applyRemoteComposerPrompts(
      { draftsByThreadKey: { [threadKey("a")]: draft({ prompt: "mid-sentence" }) } },
      { [threadKey("a")]: "from the other device" },
      { agreed: { [threadKey("a")]: "agreed text" } },
    );

    expect(applied.draftsByThreadKey[threadKey("a")]?.prompt).toBe("mid-sentence");
  });

  it("takes the remote value when the local prompt is the agreed one", () => {
    const applied = applyRemoteComposerPrompts(
      { draftsByThreadKey: { [threadKey("a")]: draft({ prompt: "agreed text" }) } },
      { [threadKey("a")]: "from the other device" },
      { agreed: { [threadKey("a")]: "agreed text" } },
    );

    expect(applied.draftsByThreadKey[threadKey("a")]?.prompt).toBe("from the other device");
  });

  it("never touches draft-session prompts", () => {
    const state = { draftsByThreadKey: { "draft-1": draft({ prompt: "local only" }) } };

    expect(applyRemoteComposerPrompts(state, {})).toBe(state);
  });

  it("returns the same state when there is nothing to change", () => {
    const state = { draftsByThreadKey: { [threadKey("a")]: draft({ prompt: "same" }) } };

    expect(applyRemoteComposerPrompts(state, { [threadKey("a")]: "same" })).toBe(state);
  });
});
