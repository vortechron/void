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
