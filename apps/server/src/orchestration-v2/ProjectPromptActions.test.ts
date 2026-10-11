import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  type ProjectPromptAction,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { planProjectCommand } from "./ProjectCommands.ts";
import * as ProjectStore from "./ProjectStore.ts";

// Void: saved prompt actions ride the project row through V2's command, event
// and store path, the same way scripts do.

const projectId = ProjectId.make("project-prompt-actions");
const createdAt = "2026-01-01T00:00:00.000Z";

const promptActions: ReadonlyArray<ProjectPromptAction> = [
  {
    id: "review",
    name: "Review",
    icon: "lint",
    prompt: "Review the current changes.",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex-personal"),
      model: "gpt-5.4",
      options: [{ id: "effort", value: "high" }],
    },
  },
];

const createdEvent = {
  sequence: 1,
  eventId: EventId.make("event-prompt-actions-created"),
  aggregateKind: "project",
  aggregateId: projectId,
  occurredAt: createdAt,
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
  type: "project.created",
  payload: {
    projectId,
    title: "Prompts",
    workspaceRoot: "/tmp/prompts",
    defaultModelSelection: null,
    scripts: [],
    createdAt,
    updatedAt: createdAt,
  },
} as const;

describe("project prompt actions", () => {
  it("carries prompt actions from project.meta.update into the event", () => {
    const result = planProjectCommand({
      command: {
        type: "project.meta.update",
        commandId: CommandId.make("command-prompt-actions"),
        projectId,
        promptActions,
      },
      state: {
        project: {
          projectId,
          title: "Prompts",
          workspaceRoot: "/tmp/prompts",
          defaultModelSelection: null,
          defaultThreadEnvMode: null,
          autoPull: false,
          faviconPath: null,
          projectIcon: null,
          scripts: [],
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        },
        workspaceOwner: undefined,
      },
      eventId: EventId.make("event-prompt-actions-updated"),
      now: DateTime.makeUnsafe("2026-01-02T00:00:00.000Z"),
    });

    assert.isTrue(Result.isSuccess(result));
    if (Result.isSuccess(result) && result.success.type === "project.meta-updated") {
      assert.deepStrictEqual(result.success.payload.promptActions, promptActions);
    } else {
      assert.fail("expected a project.meta-updated event");
    }
  });
});

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "ProjectStoreV2 prompt actions",
  (it) => {
    it.effect("starts empty, stores an update, and keeps it across unrelated updates", () =>
      Effect.gen(function* () {
        const projects = yield* ProjectStore.ProjectStoreV2;
        yield* projects.apply(createdEvent);
        assert.deepStrictEqual(Option.getOrNull(yield* projects.get(projectId))?.promptActions, []);

        yield* projects.apply({
          ...createdEvent,
          sequence: 2,
          eventId: EventId.make("event-prompt-actions-set"),
          type: "project.meta-updated",
          payload: { projectId, promptActions, updatedAt: "2026-01-02T00:00:00.000Z" },
        });
        assert.deepStrictEqual(
          Option.getOrNull(yield* projects.get(projectId))?.promptActions,
          promptActions,
        );
        assert.deepStrictEqual(
          Option.getOrNull(yield* projects.getShell(projectId))?.promptActions,
          promptActions,
        );

        yield* projects.apply({
          ...createdEvent,
          sequence: 3,
          eventId: EventId.make("event-prompt-actions-rename"),
          type: "project.meta-updated",
          payload: { projectId, title: "Renamed", updatedAt: "2026-01-03T00:00:00.000Z" },
        });
        assert.deepStrictEqual(
          Option.getOrNull(yield* projects.get(projectId))?.promptActions,
          promptActions,
        );
      }),
    );
  },
);
