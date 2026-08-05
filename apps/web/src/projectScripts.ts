import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
  type T3ProjectFileScript,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { upsertById } from "~/projectActionScopes";
const isScriptRunCommand = Schema.is(SCRIPT_RUN_COMMAND_PATTERN);

export interface ProjectScriptInput {
  readonly name: ProjectScript["name"];
  readonly command: ProjectScript["command"];
  readonly icon: ProjectScript["icon"];
  readonly runOnWorktreeCreate: ProjectScript["runOnWorktreeCreate"];
  readonly previewUrl: Exclude<ProjectScript["previewUrl"], undefined> | null;
  readonly autoOpenPreview: boolean;
}

export function buildProjectScript(id: string, input: ProjectScriptInput): ProjectScript {
  return {
    id,
    name: input.name,
    command: input.command,
    icon: input.icon,
    runOnWorktreeCreate: input.runOnWorktreeCreate,
    ...(input.previewUrl === null
      ? {}
      : {
          previewUrl: input.previewUrl,
          autoOpenPreview: input.autoOpenPreview,
        }),
  };
}

function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "script";
  }
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, "") || "script";
}

export const commandForProjectScript = (scriptId: string): KeybindingCommand =>
  SCRIPT_RUN_COMMAND_PATTERN.make(`script.${scriptId}.run`);

export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!isScriptRunCommand(trimmed)) {
    return null;
  }
  const [prefix, , suffix] = SCRIPT_RUN_COMMAND_PATTERN.parts;
  return trimmed.slice(prefix.literal.length, -suffix.literal.length);
}

export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds));
  const baseId = normalizeScriptId(name);
  if (!taken.has(baseId)) return baseId;

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`;
    const safeCandidate =
      candidate.length <= MAX_SCRIPT_ID_LENGTH
        ? candidate
        : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`;
    if (!taken.has(safeCandidate)) {
      return safeCandidate;
    }
    suffix += 1;
  }

  // This last-resort fallback only triggers after exhausting thousands of suffixes.
  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

export function primaryProjectScript(scripts: ReadonlyArray<ProjectScript>): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate);
  return regular ?? scripts[0] ?? null;
}

/**
 * The `t3.json` scripts this project has not imported yet.
 *
 * Matched against the project's own actions only. Importing always lands on the
 * project, so a global action that happens to share a name lives somewhere else
 * entirely and must not hide the import from every project on the server.
 */
export function importableFileScripts(
  fileScripts: ReadonlyArray<T3ProjectFileScript>,
  projectScripts: ReadonlyArray<ProjectScript>,
): ReadonlyArray<T3ProjectFileScript> {
  return fileScripts.filter(
    (fileScript) =>
      !projectScripts.some(
        (script) =>
          script.command === fileScript.command ||
          script.name.toLowerCase() === fileScript.name.toLowerCase(),
      ),
  );
}

/**
 * Add or replace a script in one scope's list, keeping at most one setup
 * script in it.
 *
 * Exclusivity is per-list on purpose: a project and the server may each define
 * a setup action, and the project's wins when a worktree is created.
 */
export function withScriptUpsert(
  scripts: ReadonlyArray<ProjectScript>,
  next: ProjectScript,
): ReadonlyArray<ProjectScript> {
  const merged = upsertById(scripts, next);
  if (!next.runOnWorktreeCreate) return merged;
  return merged.map((script) =>
    script.id === next.id || !script.runOnWorktreeCreate
      ? script
      : { ...script, runOnWorktreeCreate: false },
  );
}
