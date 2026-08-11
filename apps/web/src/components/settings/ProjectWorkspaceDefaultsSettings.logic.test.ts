import { describe, expect, it, vi } from "vite-plus/test";

import {
  resolveGroupedProjectWorkspaceMode,
  updateGroupedProjectWorkspaceMode,
} from "./ProjectWorkspaceDefaultsSettings.logic";

describe("resolveGroupedProjectWorkspaceMode", () => {
  it("returns the shared mode and exposes mixed grouped checkouts", () => {
    expect(resolveGroupedProjectWorkspaceMode([{ defaultThreadEnvMode: null }, {}])).toBe(
      "inherit",
    );
    expect(
      resolveGroupedProjectWorkspaceMode([
        { defaultThreadEnvMode: "local" },
        { defaultThreadEnvMode: "local" },
      ]),
    ).toBe("local");
    expect(
      resolveGroupedProjectWorkspaceMode([
        { defaultThreadEnvMode: "local" },
        { defaultThreadEnvMode: "worktree" },
      ]),
    ).toBe("mixed");
  });
});

describe("updateGroupedProjectWorkspaceMode", () => {
  it("rolls earlier members back when a later grouped write fails", async () => {
    const members = [
      { id: "local", defaultThreadEnvMode: null },
      { id: "remote", defaultThreadEnvMode: "local" as const },
    ];
    const writes: Array<[string, string | null]> = [];
    const write = vi.fn(
      async (member: (typeof members)[number], mode: "local" | "worktree" | null) => {
        writes.push([member.id, mode]);
        if (member.id === "remote" && mode === "worktree") {
          return { _tag: "Failure" as const, failure: "remote unavailable" };
        }
        return { _tag: "Success" as const };
      },
    );

    const result = await updateGroupedProjectWorkspaceMode({
      members,
      nextMode: "worktree",
      currentMode: (member) => member.defaultThreadEnvMode ?? null,
      write,
    });

    expect(result).toMatchObject({
      _tag: "Failure",
      failedMember: { id: "remote" },
      rollbackFailures: [],
    });
    expect(writes).toEqual([
      ["local", "worktree"],
      ["remote", "worktree"],
      ["local", null],
    ]);
  });

  it("writes only members whose mode needs changing", async () => {
    const members = [
      { id: "already-set", defaultThreadEnvMode: "local" as const },
      { id: "needs-update", defaultThreadEnvMode: null },
    ];
    const write = vi.fn(async () => ({ _tag: "Success" as const }));

    await expect(
      updateGroupedProjectWorkspaceMode({
        members,
        nextMode: "local",
        currentMode: (member) => member.defaultThreadEnvMode ?? null,
        write,
      }),
    ).resolves.toEqual({ _tag: "Success" });
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(members[1], "local");
  });
});
