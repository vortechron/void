# Void fork

This repository is **Void**, a fork of T3 Code. Nothing here is upstream's; this
file and everything it describes exist only in the fork.

- Fork remote: `origin` → `https://github.com/vortechron/void.git`
- Upstream remote: `upstream` → `https://github.com/pingdotgg/t3code.git`

The rest of `AGENTS.md` is upstream's document and still applies. Where the two
disagree, this file wins.

## Branches

| Branch             | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `feature/advanced` | Dev trunk. All work lands here first.                         |
| `main`             | Stable Void. What the daily-driver app is built from.         |
| `upstream/main`    | Upstream's code. A remote-tracking ref, never a local branch. |

`main` is **not** a mirror of upstream. It is the fork's release branch, and it
carries every Void commit. Do not try to fast-forward it from `upstream/main`.

Day to day: work directly on `feature/advanced`. Cut a short-lived branch off it
only when a change needs to be reviewed in isolation, and merge it back into
`feature/advanced`.

## Syncing with upstream

Upstream is merged into the dev trunk, never into `main` directly:

```bash
git fetch upstream
git switch feature/advanced
git merge upstream/main     # resolve conflicts here, once
# build, test, use it for a bit
git switch main
git merge --no-ff feature/advanced
```

Merge, never rebase. Merging resolves each conflict one time; rebasing
re-resolves the same conflicts on every future sync. The fork does not send
changes back upstream, so a linear history buys nothing.

Sync weekly rather than monthly. Conflict cost grows faster than linearly with
the size of the gap.

### Database migrations are offset by one

Void inserted `036_ProjectionProjectPromptActions`, so from 36 onward every
upstream migration sits one number higher here. When a sync brings in new
upstream migrations, renumber them to continue Void's sequence and bump the
`toMigrationInclusive` numbers inside their tests. Check the live database
first — it is the only record of what has actually run:

```bash
sqlite3 "file:$HOME/.t3/userdata/state.sqlite?mode=ro" \
  "select migration_id, name from effect_sql_migrations order by migration_id;"
```

Never reuse an id the database has already applied under a different name.

Orchestration V2 arrived as upstream `055_OrchestrationV2` and
`056_RemoveRedundantProjectionIndexes`, so they are Void's `056` and `057`.
Upstream's `reconcileV2PreviewMigration` is deliberately absent here: it repairs
databases from upstream's V2 previews, which recorded V2 at ids 53/54 — ids
Void's ledger uses for other migrations, and no Void database ran those
previews. If upstream edits that file, keep it deleted.

Upstream's `assertV2MigrationsCanRun` in `Migrations.ts` refuses to start when a
recorded name differs at or above `FIRST_V2_MIGRATION_ID`. The constant names
the first V2 migration: upstream's `55`, Void's `56`. Keep Void's number.

V2 snapshots `state.sqlite` into `statev2.sqlite` on first launch and only the
copy receives V2 migrations, so the daily driver's V1 database stays untouched
and an older build can still open it.

### The lockfile is not a "take theirs" file

Take upstream's `pnpm-lock.yaml`, then put the fork's own entries back. Resolving
it any other way costs an hour of confusing install failures:

- **Fork patch hashes.** Void patches `@legendapp/list` beyond upstream's patch
  (list measurements under interface zoom). The lockfile stores a hash of each
  patch file, so upstream's lockfile points at a patch that does not exist here
  and every install stops with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. Replace every
  occurrence of upstream's hash with the one on `main` before installing.
- **Fork-only dependencies.** `apps/web` adds `@fontsource-variable/dm-sans` and
  `@fontsource/jetbrains-mono`, which upstream's lockfile has never resolved.
  Only after the patch hashes are right is it safe to run
  `pnpm install --no-frozen-lockfile`; run it before, and pnpm re-resolves peers
  and silently upgrades unrelated packages.

Install with the pinned pnpm from `packageManager`, not whatever is on `PATH`.
`overrides` and `patchedDependencies` live in `pnpm-workspace.yaml`, which pnpm 9
cannot read, so an older pnpm reports a config mismatch and deletes
`node_modules`. `corepack enable` once fixes it for good.

### Clean conflicts do not mean a clean merge

Most of what a sync breaks never produces a conflict marker: both sides add the
same import, or upstream deletes a declaration the fork still calls. Run
`pnpm typecheck` across every package before trusting a sync, and expect to fix
collisions in files git merged without complaint.

## Fork-owned features

These are Void's own features. Upstream has no equivalent, or has a different
one. **An upstream sync must never delete, replace, or "simplify" them.** When a
merge conflict touches something listed here, Void's side wins — unless upstream
is only refactoring an API the fork calls, in which case port the call and keep
the feature.

Most of this lives in fork-only files, which never conflict. The risk sits in
the handful of upstream files that wire them in. Those are listed under
[Wiring points](#wiring-points-to-re-check-after-every-sync); check every one
after a sync.

### 1. The Void sidebar

The most-used fork change and the one most likely to be lost in a merge.

| Piece          | Files                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout         | `apps/web/src/components/SidebarVoid.tsx`                                                                                                          |
| Project groups | `SidebarProjectGroupFilter.tsx`, `sidebarProjectGroups.ts`, `sidebarProjectGroupStatus.ts`, `sidebarHiddenProjects.ts`                             |
| Workspace rows | `SidebarWorkspaceStatusIcon.tsx`, `sidebarWorkspaceStatus.ts`, `sidebarWorkspaceDiff.ts`, `sidebarWorkspaceRefresh.ts`, `workspaceSidebarStore.ts` |
| Usage meters   | `components/sidebar/SidebarUsageMeters.tsx`, `SidebarUsageMeters.logic.ts`, `usageMeterCharts.tsx`                                                 |
| Private names  | `privateProjectNames.ts`, `hooks/usePrivateProjectNames.ts` (hides real project names while screen sharing)                                        |

`Sidebar.tsx` and `LegacySidebar.tsx` are upstream's and should always be
resolved in upstream's favour — the two projects share no code in them. Which
one renders is a three-step fall-through in `AppSidebarLayout.tsx`:

1. `voidSidebarEnabled` (default **true**) → `SidebarVoid.tsx`
2. else `legacySidebarEnabled` (upstream's key, default false) → `LegacySidebar.tsx`
3. else → upstream's `Sidebar.tsx`

Both toggles sit in **Settings → General**, and `useVoidSidebarEnabled()` holds
at `true` until client settings hydrate so a cold load never flashes the other
sidebar.

Preserve `SidebarWorkspaceRow` and the `workspaceSidebarStore` integration,
including custom labels, Pinned, and recoverable Archived workspaces. Port
useful upstream sidebar changes into `SidebarVoid.tsx` deliberately; never
replace the custom layout wholesale.

The retired `sidebarV2Enabled` key had the opposite meaning, so it was dropped
rather than renamed. Anyone who had opted into upstream's sidebar gets Void's
back and can turn it off again.

Upstream's compact sidebar rail and compact thread list target upstream's
sidebars. They do not apply here.

### 2. Thread tabs

Each workspace row in the Void sidebar lists the chats open in that checkout,
indented under the branch name. The row collapses the list, and carries "new
chat" and "chat history" buttons for that checkout. Upstream has no equivalent.
The route, not the click, opens a tab, so every way into a chat keeps the list
right.

- List: `components/sidebar/SidebarWorkspaceTabs.tsx`, `SidebarChatStatusIcon.tsx`
- Row buttons and history menu: `components/sidebar/SidebarWorkspaceRowActions.tsx`
- Wiring: `SidebarWorkspaceRow` and `SidebarRouteThreadKeyContext` in `SidebarVoid.tsx`
- `apps/web/src/components/chat/ThreadTabStatusIcon.tsx`
- `apps/web/src/hooks/useThreadTabs.ts` (route sync, opening a tab, remote closes)
- `apps/web/src/threadTabsStore.ts` (open tabs, synced across devices)
- `apps/web/src/workspaceTabListStore.ts` (which lists are expanded, this device only)

### 3. Voice dictation

Speak into the composer. OpenAI Realtime transcribes, a polish pass cleans the
text, and a user dictionary plus snippets rewrite terms. Dictation keeps its own
button while a turn is running.

- Engine: `apps/web/src/lib/voiceDictation/` — `openaiRealtime.ts`, `pcmCapture.ts`,
  `transcript.ts`, `polish.ts`, `snippets.ts`, `dictationCues.ts`, `availability.ts`, `apiKey.ts`
- Hook: `apps/web/src/hooks/useVoiceDictation.ts`
- Settings: `components/settings/VoiceSettingsPanel.tsx`, `VoiceDictationSettingsSection.tsx`,
  `VoiceDictionarySection.tsx`, `VoiceSnippetsSection.tsx`, `voiceDictationLists.ts`
- Route: `apps/web/src/routes/settings.voice.tsx`
- Docs: `docs/user/voice-dictation.md`

### 4. Git history in the right panel

A commit graph, per-commit diffs, and history actions as a right-panel surface.

- Web: `apps/web/src/components/history/` (graph, commit diff panel, ref badges,
  action dialogs, context menu), `apps/web/src/lib/gitGraph.ts`
- Server: `apps/server/src/vcs/GitHistoryActions.ts`, `GitHistoryActionCommands.ts`,
  `GitHistoryActionGuards.ts`, `apps/server/src/git/commitLog.ts`
- Contract: `packages/contracts/src/vcsHistoryAction.ts`
- Columns are resizable and persisted: `historyColumnWidths.ts`,
  `useHistoryColumnWidths.ts`, `HistoryColumnResizeHandle.tsx`
- Closed-chat history shows each chat's status: `components/chat/workspaceHistoryStatus.ts`

### 5. Diff file tree

A resizable file tree beside the diff, with a base-ref picker.

- `components/diffs/DiffFileTreeVoid.tsx`, `DiffBaseRefPicker.tsx`, `DiffToolbarActions.tsx`
- `lib/diffFileTree.ts`, `lib/diffFileTreeResize.ts`, `lib/diffPanelCss.ts`

Upstream's diff-tree work targets its own tree. Decide per change whether it is
worth porting; do not let it overwrite `DiffFileTreeVoid.tsx`.

### 6. Provider usage meters

Subscription limits read from a provider probe and shown in the sidebar. This is
not upstream's Usage page; both exist.

- Server: `apps/server/src/providerUsage/ProviderUsage.ts`, `normalize.ts`
- Claude re-reads plan usage after each turn (`refreshPlanUsage` in
  `orchestration-v2/Adapters/ClaudeAdapterV2.ts`), because the rate-limit
  stream withholds utilization until a warning threshold
- Contract: `packages/contracts/src/providerUsage.ts`
- Web: `lib/providerUsageState.ts`, `components/settings/UsageMeterSettingsSection.tsx`

### 7. Completion alerts, notifications, and sounds

- `agentCompletionAlerts.ts`, `agentCompletionNotifications.ts`, `completionSound.ts`, `lib/audioCues.ts`
- `components/AgentCompletionCoordinator.tsx`, `components/settings/AgentCompletionSettings.tsx`
- Sounds: `apps/web/src/assets/*.mp3`
- Docs: `docs/user/notifications.md`

Upstream later added its own thread notifications with
`ThreadNotificationCoordinator.tsx`. Both can coexist. Do not delete Void's
coordinator to make room for upstream's.

### 8. Project and global prompt actions

Saved prompts fired at a project, plus global ones.

- `projectPromptActions.ts`, `projectActionScopes.ts`
- Mobile: `apps/mobile/src/features/threads/projectPromptActions.ts`
- Server (V2): `promptActions` rides the project path the same way `scripts` does —
  `packages/contracts/src/project.ts` (schema, update payload),
  `orchestrationProject.ts`, `applicationEvent.ts`, then
  `orchestration-v2/ProjectCommands.ts`, `ProjectStore.ts`,
  `project/ProjectService.ts`, `ProjectMutation.ts`, and the V1 baseline in
  `persistence/Migrations/OrchestrationV2/ApplicationEventSource.ts`. Tests:
  `orchestration-v2/ProjectPromptActions.test.ts`
- The project actions menu lives in upstream's thread details panel; Void's
  props reach it through `projectActionExtras` on `ThreadDetailsPanel.tsx`
- Migration `036_ProjectionProjectPromptActions` — the reason every later
  migration is offset by one
- Docs: `docs/user/actions.md`

### 9. Appearance: glass, interface zoom, fonts, synced themes

- `void-glass.css`, `appearancePreferences.ts`, `installedFonts.ts`
- Interface zoom: `uiZoomPreference.ts`, `effectiveZoom.ts`. Zoom is per-browser,
  and every measured size and drag must stay correct under it.
- Theme sync: `hooks/useThemeServerSync.ts`
- Motion: `components/beautiful/` and `components/chat/backgroundEffects/`

### 10. Per-project workspace defaults

Choose worktree or current checkout per project when starting a thread.

- `components/settings/ProjectWorkspaceDefaultsSettings.tsx` and its `.logic.ts`
- `workspaceSessions.ts`, `hooks/useWorkspaceServerSync.ts`
- Docs: `docs/user/project-new-thread-workspace.md`

### 11. Smaller fork-owned behaviour

- **The composer never steals focus.** It focuses only on a direct user action.
  Upstream keeps reintroducing autofocus on thread open; remove it again.
- Visible panel resize grips: `components/ui/panel-resize-grip.tsx`
- Touch long-press context menus: `hooks/useLongPressContextMenu.ts`, `lib/longPress.ts`
- PWA: `public/sw.js`, `pwa/registerServiceWorker.ts`, `chunkLoadRecovery.ts`, `void-icon-*` assets
- Settings sync and Beta panel: `lib/settingsSync.ts`, `SharedSettingsMismatchAlert.tsx`,
  `BetaSettingsPanel.tsx`, `routes/settings.beta.tsx`

### Wiring points to re-check after every sync

Fork-only files cannot conflict. These upstream files carry the wiring and do:

| File                                                               | What the fork put there                   |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `apps/web/src/components/AppSidebarLayout.tsx`                     | sidebar fall-through                      |
| `apps/web/src/components/sidebar/SidebarChrome.tsx`                | `VoidMark` logo                           |
| `apps/web/src/components/ChatView.tsx`                             | tab sync, background effects, focus rules |
| `apps/web/src/components/chat/ChatComposer.tsx`                    | dictation button, pending contexts        |
| `apps/web/src/components/RightPanelTabs.tsx`, `rightPanelStore.ts` | history surface                           |
| `apps/web/src/components/DiffPanel.tsx`, `diffPanelStore.ts`       | Void diff tree                            |
| `components/settings/SettingsPanels.tsx`, `SettingsSidebarNav.tsx` | Voice, Beta, Actions, Usage pages         |
| `apps/web/src/hooks/useSettings.ts`                                | every fork setting key                    |
| `packages/contracts/src/settings.ts`                               | every fork setting schema                 |
| `apps/server/src/persistence/Migrations.ts`                        | migration list, offset by one             |
| `apps/server/src/server.ts`, `ws.ts`                               | `ProviderUsage` layer, Void RPC handlers  |
| `apps/server/src/auth/RpcAuthorization.ts`                         | read scopes for Void RPCs                 |
| `apps/server/src/observability/RpcInstrumentation.ts`              | `rpc.aggregate` label for every Void RPC  |
| `packages/contracts/src/clientRpcPermissions.ts`                   | write scope for `vcsRunHistoryAction`     |
| `apps/web/src/reopenClosedView.ts`                                 | reopening a closed commit diff            |
| `apps/web/src/components/chat/ThreadDetailsPanel.tsx`              | `projectActionExtras` (prompt actions)    |
| `apps/web/src/routes/__root.tsx`                                   | Void appearance, zoom and workspace syncs |
| `apps/web/src/routeTree.gen.ts`                                    | generated — regenerate, never hand-merge  |

A conflict in any of those means an upstream change landed next to fork wiring.
Keep both sides: take upstream's change, then put the fork's line back.

`ChatView.tsx` and `ChatComposer.tsx` follow upstream's handler rule
([Web UI](../internals/web-ui.md#handlers-in-large-components)): plain
functions, wrapped in `useStableCallback` only where they leave the component.
Fork code there must do the same. A `useCallback` brings back the old-render
memory leak upstream removed. A function a child calls while rendering, like
the prompt-action disabled reason, comes from a module-level factory
(`makeProjectPromptActionDisabledReason`) memoized on its inputs.

## Branding is deliberately minimal

The fork does **not** rename T3 Code to Void in code, docs, CLI output, dialogs
or error messages. A repo-wide rename touched ~200 upstream files and conflicted
on nearly every sync, for no benefit the daily driver could see.

The entire rebrand is now three references to one asset:

| Where        | File                                                             |
| ------------ | ---------------------------------------------------------------- |
| Sidebar logo | `apps/web/src/components/sidebar/SidebarChrome.tsx` (`VoidMark`) |
| Startup icon | `apps/web/index.html` (`#boot-shell-logo`)                       |
| Splash icon  | `apps/web/src/components/SplashScreen.tsx`                       |

The mark itself lives in `apps/web/public/void-mark.svg`, with
`void-apple-touch-icon.png` for the touch icon. Both are fork-only files, so
they never conflict.

Everything else stays upstream's: the window title, the About panel, `t3`
CLI output, the marketing site, and `docs/user/*`. If a new Void-branded string
feels tempting, it is almost certainly not worth the recurring merge cost.

To keep the rest of the fork cheap to sync:

- Prefer new files over edits to upstream files. A new file never conflicts.
  Fork-only web modules already follow this: `threadTabsStore.ts`,
  `workspaceSidebarStore.ts`, `appearancePreferences.ts`, `installedFonts.ts`.
- Leave identifiers alone. Package names (`@t3tools/*`), the desktop app id
  (`com.t3tools.t3code`), URL schemes (`t3code`, `t3code-dev`), and the T3 home
  directory (`~/.t3`) are deliberately unrenamed. Renaming them would conflict
  constantly and would orphan the existing `~/.t3` database.

## Running dev and the real app at once

Both run side by side because they use different state directories, resolved by
`packages/shared/src/devHome.ts`:

- `pnpm dev` from this checkout → `~/.t3/dev`
- The installed Void app → `~/.t3/userdata`
- A linked git worktree → that worktree's own gitignored `.t3`

`~/.t3/userdata` is live data in use by the app the developer is actually
working in. Read it, copy from it, never serve from it. This is upstream's rule
2 and it matters more here, because the daily driver is now a build of this
repo rather than a released binary.

Build the daily driver from `main`, not from `feature/advanced`:

```bash
git switch main
pnpm dist:desktop:dmg:arm64     # unsigned; macOS needs one Gatekeeper approval
```

Then switch back to `feature/advanced` before starting `pnpm dev`. One checkout
cannot serve both branches at once — the dev server would compile whatever
branch happens to be checked out.
