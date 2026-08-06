import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  COMMIT_LOG_FIELD_SEPARATOR as SEP,
  parseCommitDecorations,
  parseCommitLog,
} from "./commitLog.ts";

function line(fields: {
  sha: string;
  parents?: string;
  author?: string;
  authoredAt?: string;
  decorations?: string;
  subject?: string;
}): string {
  return [
    fields.sha,
    fields.parents ?? "",
    fields.author ?? "Ada Lovelace",
    fields.authoredAt ?? "2026-07-28T12:38:00+08:00",
    fields.decorations ?? "",
    fields.subject ?? "wip",
  ].join(SEP);
}

describe("parseCommitDecorations", () => {
  it("returns nothing for an empty decoration list", () => {
    expect(parseCommitDecorations("")).toEqual({ refs: [], headRefName: null });
  });

  it("marks the checked-out branch as current and reports its name", () => {
    const parsed = parseCommitDecorations("HEAD -> refs/heads/main, refs/remotes/origin/main");

    expect(parsed.headRefName).toBe("main");
    expect(parsed.refs).toEqual([
      { name: "main", kind: "local", isCurrent: true },
      { name: "origin/main", kind: "remote", isCurrent: false, remoteName: "origin" },
    ]);
  });

  it("treats a detached HEAD as its own ref", () => {
    const parsed = parseCommitDecorations("HEAD, refs/heads/feature/advanced");

    expect(parsed.headRefName).toBeNull();
    expect(parsed.refs).toEqual([
      { name: "HEAD", kind: "head", isCurrent: true },
      { name: "feature/advanced", kind: "local", isCurrent: false },
    ]);
  });

  it("strips the tag decoration prefix", () => {
    expect(parseCommitDecorations("tag: refs/tags/v1.2.0").refs).toEqual([
      { name: "v1.2.0", kind: "tag", isCurrent: false },
    ]);
  });

  it("splits remote refs using the known remote names", () => {
    expect(
      parseCommitDecorations("refs/remotes/team/fork/main", ["team/fork", "origin"]).refs,
    ).toEqual([
      { name: "team/fork/main", kind: "remote", isCurrent: false, remoteName: "team/fork" },
    ]);
  });

  it("ignores refs the graph does not badge", () => {
    expect(parseCommitDecorations("refs/t3/checkpoints/abc, refs/stash").refs).toEqual([]);
  });
});

describe("parseCommitLog", () => {
  it("parses shas, parents, and short shas", () => {
    const parsed = parseCommitLog(
      [
        line({
          sha: "f10be914aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          parents: "b4a2b05f0000 e817f79a1111",
        }),
        line({ sha: "b4a2b05f0000000000000000000000000000000a", parents: "" }),
      ].join("\n"),
    );

    expect(parsed.commits).toHaveLength(2);
    expect(parsed.commits[0]?.shortSha).toBe("f10be914");
    expect(parsed.commits[0]?.parents).toEqual(["b4a2b05f0000", "e817f79a1111"]);
    expect(parsed.commits[1]?.parents).toEqual([]);
  });

  it("keeps a subject that contains the field separator intact", () => {
    const subject = `fix: handle${SEP}embedded separators`;
    const parsed = parseCommitLog(line({ sha: "abc123", subject }));

    expect(parsed.commits[0]?.subject).toBe(subject);
  });

  it("converts the author date to UTC", () => {
    const parsed = parseCommitLog(line({ sha: "abc123", authoredAt: "2026-07-28T12:38:00+08:00" }));

    expect(DateTime.formatIso(parsed.commits[0]!.authoredAt)).toBe("2026-07-28T04:38:00.000Z");
  });

  it("reports the head branch found anywhere in the page", () => {
    const parsed = parseCommitLog(
      [
        line({ sha: "aaa111" }),
        line({ sha: "bbb222", decorations: "HEAD -> refs/heads/feature/advanced" }),
      ].join("\n"),
    );

    expect(parsed.headRefName).toBe("feature/advanced");
  });

  it("drops malformed and blank lines instead of failing the page", () => {
    const parsed = parseCommitLog(
      [
        "",
        "not-a-record",
        line({ sha: "abc123" }),
        line({ sha: "def456", authoredAt: "nope" }),
      ].join("\n"),
    );

    expect(parsed.commits.map((commit) => commit.sha)).toEqual(["abc123"]);
  });
});
