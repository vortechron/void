# Coding-agent thread states

Research date: 2026-08-05. Sources are official protocol documentation or
official project source.

## Decision

Void should keep **provider lifecycle state** separate from **user attention
state**. The portable model is:

```ts
type ThreadAttention = {
  runtime: "starting" | "running" | "idle";
  pending: { approvals: number; userInputs: number };
  terminal: null | {
    turnId: string;
    outcome: "completed" | "failed" | "interrupted";
  };
  actionablePlanTurnId: string | null;
  lastSeenTerminalTurnId: string | null;
};
```

This is intentionally not one enum. A turn can still be running while it waits
for approval or input, and a workspace can contain a running thread, a failed
thread, and several unseen completions at the same time.

If one icon must represent the aggregate, use this presentation priority:

1. Approval required
2. User input required
3. Failed
4. Starting or running
5. Plan ready
6. Completed but unseen
7. Idle or stopped (no attention icon)

Keep counts/sets underneath even when only the highest-priority icon is shown.

## What the harnesses actually expose

| Harness          | Execution and terminal signals                                                                                                                       | Human-blocked signals                                                                                                                                  | Plan signals                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Codex app-server | `turn/started`; `turn/completed` with `completed`, `failed`, or `interrupted`; thread status `active`, `idle`, or `systemError`                      | Native active flags `waitingOnApproval` and `waitingOnUserInput`; approval and `requestUserInput` requests resolve through `serverRequest/resolved`    | `turn/plan/updated` is progress; a completed plan item can be used to derive plan-ready                                     |
| Claude Agent SDK | A query streams messages and ends with `ResultMessage`; `is_error`/error result variants distinguish failure                                         | `canUseTool` pauses for both tool permission and `AskUserQuestion`; it stays paused until answered or cancelled                                        | Plan mode is read-only and commonly asks questions before a plan; exiting plan mode is an actionable provider-specific flow |
| ACP v1           | A turn is running while `session/prompt` is open; the response ends it with `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, or `cancelled` | Core `session/request_permission`; core `elicitation/create` for structured user input                                                                 | `session/update` plan entries have `pending`, `in_progress`, and `completed`; there is no generic plan-ready event          |
| OpenCode         | `session.status` has `busy`, `retry`, and `idle`; `session.error` is separate; `session.idle` is used as completion notification                     | `permission.asked`/`permission.replied`; `question.asked`/`question.replied`/`question.rejected`                                                       | Todo/plan progress is separate from the question used to approve leaving plan mode                                          |
| Cursor CLI       | Stream JSON has init, assistant deltas, tool started/completed, and terminal `result/success`; failure may end only with a non-zero exit and stderr  | Interactive command approval exists, but the documented stream schema has no approval/question event; native ACP supplies the portable permission flow | Plan mode is reviewable, but the documented stream schema has no plan-ready event                                           |

Primary sources:

- Codex [`TurnStatus`](https://github.com/openai/codex/blob/e87e2b495bcf8aa1950e2bb24cc95bfdc6fd473a/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L27-L35), [`ThreadStatus` and active flags](https://github.com/openai/codex/blob/e87e2b495bcf8aa1950e2bb24cc95bfdc6fd473a/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1447-L1468), and [app-server event/approval flow](https://github.com/openai/codex/blob/e87e2b495bcf8aa1950e2bb24cc95bfdc6fd473a/codex-rs/app-server/README.md#L1517-L1524)
- Claude [approval and user-input lifecycle](https://code.claude.com/docs/en/agent-sdk/user-input), [permission and plan modes](https://code.claude.com/docs/en/agent-sdk/permissions), and [Agent SDK result lifecycle](https://platform.claude.com/cookbook/claude-agent-sdk-04-migrating-from-openai-agents-sdk)
- ACP v1 [prompt lifecycle and stop reasons](https://agentclientprotocol.com/protocol/v1/prompt-turn), [permissions and tool states](https://agentclientprotocol.com/protocol/v1/tool-calls), [elicitation](https://agentclientprotocol.com/protocol/v1/elicitation), and [plan updates](https://agentclientprotocol.com/protocol/v1/agent-plan)
- OpenCode [session status schema](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-status-event.ts), [permission events](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/permission.ts), [question events](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/question.ts), and [documented completion/error notifications](https://opencode.ai/docs/plugins/)
- Cursor [stream JSON schema](https://docs.cursor.com/en/cli/reference/output-format) and [interactive command approval](https://docs.cursor.com/en/cli/using)

## State semantics for Void

| UI indicator        | Derivation                                                                      | Clear rule                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working             | Session is `starting` or `running`, unless a pending human request outranks it  | Provider leaves the active state                                                                                                                    |
| Approval required   | At least one unresolved approval request                                        | The matching request resolves; opening the thread must not clear it                                                                                 |
| User input required | At least one unresolved question/elicitation request                            | The matching request resolves; opening the thread must not clear it                                                                                 |
| Failed              | Terminal failure or provider/session error                                      | Preserve the error in the timeline; the attention badge may clear on acknowledgement or on the next turn, but must not be mistaken for cancellation |
| Plan ready          | A final, actionable proposed plan exists, not merely a plan-progress update     | Plan is implemented/dismissed, or explicitly acknowledged if Void chooses notification-style semantics                                              |
| Completed unseen    | A successful terminal turn is newer than that thread's seen watermark           | Opening **that thread** records that terminal turn as seen                                                                                          |
| Idle/stopped        | No live work, blocker, actionable plan, failure attention, or unseen completion | No indicator                                                                                                                                        |

`completed unseen` is not a Codex, Claude, ACP, OpenCode, or Cursor protocol
state. It is a Void client/read-model concern. Store the acknowledgement against
the terminal turn identity (or a monotonic completion sequence), not as one
workspace boolean. Therefore, opening one of three newly completed threads
clears only that thread; the workspace remains completed-unseen until all three
terminal turns have been acknowledged.

Likewise, `plan ready` is derived. Plan-progress events alone are insufficient:
ACP and Codex both emit plans while work is still running. Void should only show
plan-ready when it has a final actionable plan artifact.

Interrupted, cancelled, and stopped are neutral terminal outcomes, not failures
and not successful completions. They may be shown inside the thread, but should
not create the green completed-unseen indicator.

## Fit with Void's current contracts

The normalized provider contract already contains the required event families:
session/thread state, turn start/complete/abort, plan updates/final proposed
plans, approval open/resolve, user-input request/resolve, and runtime errors in
[`providerRuntime.ts`](../../../packages/contracts/src/providerRuntime.ts).

The shell read model already carries the portable UI inputs: session state,
latest terminal turn, `hasPendingApprovals`, `hasPendingUserInput`, and
`hasActionableProposedPlan` in
[`orchestration.ts`](../../../packages/contracts/src/orchestration.ts). The five
provider adapters normalize into those event families:
[`CodexAdapter.ts`](../../../apps/server/src/provider/Layers/CodexAdapter.ts),
[`ClaudeAdapter.ts`](../../../apps/server/src/provider/Layers/ClaudeAdapter.ts),
[`CursorAdapter.ts`](../../../apps/server/src/provider/Layers/CursorAdapter.ts),
[`GrokAdapter.ts`](../../../apps/server/src/provider/Layers/GrokAdapter.ts), and
[`OpenCodeAdapter.ts`](../../../apps/server/src/provider/Layers/OpenCodeAdapter.ts).

The missing concept is not another provider status. Void already persists a
per-thread visit watermark as `threadLastVisitedAtById` in
[`uiStateStore.ts`](../../../apps/web/src/uiStateStore.ts). The UI change needs
to apply that existing watermark to tab indicators and workspace aggregation,
so acknowledging one thread leaves every other unseen completion intact.
