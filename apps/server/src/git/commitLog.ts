/**
 * Parsing for the commit graph feed.
 *
 * `git log` is asked for one NUL-delimited record per line so nothing here has
 * to guess where a field ends. Keeping the parsing pure keeps the driver thin
 * and lets the record/decoration edge cases be covered by unit tests instead of
 * a live repository.
 */
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import type { VcsCommit, VcsCommitRef } from "@t3tools/contracts";

import { parseRemoteRefWithRemoteNames } from "./remoteRefs.ts";

export const COMMIT_LOG_FIELD_SEPARATOR = "\0";

/**
 * sha, parents, author name, author date, decorations, subject. The subject
 * stays last because it is the only field a user can fill with punctuation.
 */
export const COMMIT_LOG_FORMAT = "%H%x00%P%x00%an%x00%aI%x00%D%x00%s";

const SHORT_SHA_LENGTH = 8;

const LOCAL_REF_PREFIX = "refs/heads/";
const REMOTE_REF_PREFIX = "refs/remotes/";
const TAG_REF_PREFIX = "refs/tags/";
const TAG_DECORATION_PREFIX = "tag: ";
const HEAD_ARROW = "HEAD -> ";

function refFromDecoration(
  decoration: string,
  remoteNames: ReadonlyArray<string>,
  isCurrent: boolean,
): VcsCommitRef | null {
  if (decoration === "HEAD") {
    return { name: "HEAD", kind: "head", isCurrent: true };
  }

  if (decoration.startsWith(TAG_DECORATION_PREFIX)) {
    const tagRef = decoration.slice(TAG_DECORATION_PREFIX.length).trim();
    const name = tagRef.startsWith(TAG_REF_PREFIX) ? tagRef.slice(TAG_REF_PREFIX.length) : tagRef;
    return name.length === 0 ? null : { name, kind: "tag", isCurrent: false };
  }

  if (decoration.startsWith(LOCAL_REF_PREFIX)) {
    const name = decoration.slice(LOCAL_REF_PREFIX.length);
    return name.length === 0 ? null : { name, kind: "local", isCurrent };
  }

  if (decoration.startsWith(REMOTE_REF_PREFIX)) {
    const name = decoration.slice(REMOTE_REF_PREFIX.length);
    if (name.length === 0) return null;
    const parsed = parseRemoteRefWithRemoteNames(name, remoteNames);
    const remoteName = parsed?.remoteName ?? name.slice(0, Math.max(name.indexOf("/"), 0));
    return {
      name,
      kind: "remote",
      isCurrent: false,
      ...(remoteName.length > 0 ? { remoteName } : {}),
    };
  }

  // Checkpoint refs, stash, and anything else the graph does not badge.
  return null;
}

/**
 * Turns a `%D` decoration list into badge-ready refs. Remote names are needed
 * because `refs/remotes/<remote>/<branch>` cannot be split on the first slash
 * when a remote is itself named with one.
 */
export function parseCommitDecorations(
  raw: string,
  remoteNames: ReadonlyArray<string> = [],
): { refs: ReadonlyArray<VcsCommitRef>; headRefName: string | null } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { refs: [], headRefName: null };

  const refs: Array<VcsCommitRef> = [];
  let headRefName: string | null = null;

  for (const entry of trimmed.split(",")) {
    const decoration = entry.trim();
    if (decoration.length === 0) continue;

    const isHeadTarget = decoration.startsWith(HEAD_ARROW);
    const target = isHeadTarget ? decoration.slice(HEAD_ARROW.length).trim() : decoration;
    const ref = refFromDecoration(target, remoteNames, isHeadTarget);
    if (!ref) continue;
    if (isHeadTarget && ref.kind === "local") headRefName = ref.name;
    refs.push(ref);
  }

  return { refs, headRefName };
}

function parseCommitLine(
  line: string,
  remoteNames: ReadonlyArray<string>,
): { commit: VcsCommit; headRefName: string | null } | null {
  const fields = line.split(COMMIT_LOG_FIELD_SEPARATOR);
  if (fields.length < 6) return null;

  const [sha = "", parentList = "", authorName = "", authoredAtRaw = "", decorations = ""] = fields;
  // Rejoin so a subject containing the separator cannot truncate itself.
  const subject = fields.slice(5).join(COMMIT_LOG_FIELD_SEPARATOR);
  if (sha.length === 0) return null;

  const authoredAt = Option.getOrNull(DateTime.make(authoredAtRaw));
  if (authoredAt === null) return null;

  const { refs, headRefName } = parseCommitDecorations(decorations, remoteNames);

  return {
    commit: {
      sha,
      shortSha: sha.slice(0, SHORT_SHA_LENGTH),
      parents: parentList.split(" ").filter((parent) => parent.length > 0),
      subject,
      authorName,
      authoredAt,
      refs,
    },
    headRefName,
  };
}

/**
 * Turns the raw stash commits `git log` returns into single graph nodes.
 *
 * A stash is a merge commit: parent 1 is the commit it was taken from, parent 2
 * is the index snapshot and parent 3 the untracked snapshot. Those snapshots
 * are implementation detail, so they are dropped from the walk and the stash is
 * re-parented onto its base — which is how it reads in Fork and Git Graph.
 */
export function decorateStashCommits(
  commits: ReadonlyArray<VcsCommit>,
  stashRefBySha: ReadonlyMap<string, string>,
): ReadonlyArray<VcsCommit> {
  if (stashRefBySha.size === 0) return commits;

  const snapshotShas = new Set<string>();
  for (const commit of commits) {
    if (!stashRefBySha.has(commit.sha)) continue;
    for (const parent of commit.parents.slice(1)) snapshotShas.add(parent);
  }

  const decorated: Array<VcsCommit> = [];
  for (const commit of commits) {
    const stashRef = stashRefBySha.get(commit.sha);
    if (stashRef !== undefined) {
      decorated.push({
        ...commit,
        parents: commit.parents.slice(0, 1),
        refs: [...commit.refs, { name: stashRef, kind: "stash", isCurrent: false }],
      });
      continue;
    }
    // A snapshot carrying a ref is a real commit that happens to be shared, so
    // it stays; an undecorated one only exists to hold the stash.
    if (snapshotShas.has(commit.sha) && commit.refs.length === 0) continue;
    decorated.push(commit);
  }
  return decorated;
}

/**
 * Parses the full `git log` payload. Malformed lines are dropped rather than
 * failing the request: a single unreadable record should not blank the graph.
 */
export function parseCommitLog(
  stdout: string,
  remoteNames: ReadonlyArray<string> = [],
): { commits: ReadonlyArray<VcsCommit>; headRefName: string | null } {
  const commits: Array<VcsCommit> = [];
  let headRefName: string | null = null;

  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = parseCommitLine(line, remoteNames);
    if (!parsed) continue;
    if (parsed.headRefName !== null) headRefName = parsed.headRefName;
    commits.push(parsed.commit);
  }

  return { commits, headRefName };
}
