import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { moveProjectAction, upsertById } from "./projectActionScopes";

const success = (): AtomCommandResult<void, unknown> => AsyncResult.success(undefined);
const failure = (message: string): AtomCommandResult<void, unknown> =>
  AsyncResult.failure(Cause.fail(new Error(message)));
const interrupted = (): AtomCommandResult<void, unknown> => AsyncResult.failure(Cause.interrupt(1));

describe("upsertById", () => {
  const item = (id: string, label = id) => ({ id, label });

  it("appends an entry that is not in the list yet", () => {
    expect(upsertById([item("review")], item("explain"))).toEqual([
      item("review"),
      item("explain"),
    ]);
  });

  it("replaces an entry in place, keeping its position", () => {
    const updated = item("review", "Review the diff instead.");

    expect(upsertById([item("review"), item("explain")], updated)).toEqual([
      updated,
      item("explain"),
    ]);
  });
});

describe("moveProjectAction", () => {
  function recorder() {
    const calls: string[] = [];
    const orphans: Array<{ title: string; description: string }> = [];
    return { calls, orphans };
  }

  it("writes the destination before removing the source", async () => {
    const { calls, orphans } = recorder();

    const result = await moveProjectAction({
      name: "Install",
      writeDestination: async () => {
        calls.push("write");
        return success();
      },
      removeSource: async () => {
        calls.push("remove");
        return success();
      },
      reportOrphan: (input) => orphans.push(input),
    });

    expect(result._tag).toBe("Success");
    expect(calls).toEqual(["write", "remove"]);
    expect(orphans).toEqual([]);
  });

  it("leaves the source alone when the destination write fails", async () => {
    const { calls, orphans } = recorder();

    const result = await moveProjectAction({
      name: "Install",
      writeDestination: async () => failure("settings.json is read-only"),
      removeSource: async () => {
        calls.push("remove");
        return success();
      },
      reportOrphan: (input) => orphans.push(input),
    });

    expect(result._tag).toBe("Failure");
    expect(calls).toEqual([]);
    expect(orphans).toEqual([]);
  });

  it("reports the duplicate when the removal fails, and still reads as saved", async () => {
    const { orphans } = recorder();

    const result = await moveProjectAction({
      name: "Install",
      writeDestination: async () => success(),
      removeSource: async () => failure("project row is locked"),
      reportOrphan: (input) => orphans.push(input),
    });

    // The destination copy landed, so the save succeeded; the leftover is a
    // separate, non-blocking warning.
    expect(result._tag).toBe("Success");
    expect(orphans).toEqual([
      {
        title: 'Copied "Install" but could not remove the original',
        description: "project row is locked",
      },
    ]);
  });

  it("reports the duplicate when the removal is interrupted", async () => {
    const { orphans } = recorder();

    const result = await moveProjectAction({
      name: "Install",
      writeDestination: async () => success(),
      removeSource: async () => interrupted(),
      reportOrphan: (input) => orphans.push(input),
    });

    expect(result._tag).toBe("Success");
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.description).toBe(
      "The removal was interrupted. Delete whichever copy you do not want.",
    );
  });
});
