# Source Control Integrations

T3 Code connects to your Git hosting provider so you can create pull requests, review code, and manage repositories without leaving the app.

## Supported Providers

T3 Code works with the platforms your team already uses:

- **GitHub** – Pull requests, repository creation, and clone integration
- **GitLab** – Merge requests, repository publishing, and hosted clones
- **Bitbucket** – Pull request workflows (via API token authentication)
- **Azure DevOps** – Pull request support for Microsoft-hosted repositories

## What You Can Do

### Start Projects from Anywhere

**Clone repositories directly**

- Open the Command Palette (`Cmd/Ctrl + K`) → **Add Project**
- Choose **GitHub repository**, **GitLab repository**, **Bitbucket repository**, **Azure DevOps repository**, or paste any **Git URL**
- Enter the repository path (`owner/repo`, `group/project`, `workspace/repository`, or `project/repository`) or a full Git URL, pick a destination, and start coding

**Publish local projects to the cloud**

- Have a local Git repository without a remote?
- Use the **Publish Repository** action to create a new hosted repository (GitHub, GitLab, Bitbucket, or Azure DevOps), add it as your origin remote, and push, in one flow
- If the local repository has no commits yet, publishing creates the remote and wires it up but does not push. Make a commit, then push normally.

### Move Between Active Threads and Checkouts

- The sidebar lists repositories and their physical workspaces. Each repository always has a
  workspace for its original checkout and can also have one workspace per linked worktree.
- Selecting a workspace restores its own chat tabs above the conversation. Tabs never mix chats
  from different checkouts. Use **+** to start another chat in that same workspace, or use
  **Chat history** to reopen a closed chat from that workspace.
- Tab and workspace indicators show when an agent is working, needs approval or input, has a plan
  ready, failed, or completed while you were elsewhere. Opening a completed chat clears only that
  chat; the workspace stays marked until every completed chat in it has been opened.
- The original-checkout workspace follows whichever branch is currently checked out there, so you
  can work directly on `main` or another current branch without creating a worktree first.
- Uncommitted additions and deletions appear on the workspace that owns that checkout, including
  changes made directly in the original checkout.
- Right-click a repository to hide it; use **Show hidden repositories** at the bottom of the list to
  bring it back.
- Open the **Projects** menu to filter the sidebar with your own project groups. Use **Manage
  groups** to add, rename, or delete a group, then right-click or long-press a repository to add it
  to one or more groups.
- Group names in the **Projects** menu show the same working, completed, approval, input, plan,
  monitoring, and failure indicators as the rest of the sidebar. This lets you see activity in a
  group even while another group is selected.
- Open **Diff** in the right panel to review the working tree or branch changes for the active
  thread's checkout. On wider screens, drag the edge of the file tree to resize it. T3 Code
  remembers the width for the next time you open Diff.

### Read the Repository's History

Open **History** in the right panel to see the commit graph for the current project:

- Every branch is drawn as its own coloured lane, with the branch, remote, and tag labels shown
  next to each commit. Uncommitted work sits at the top of the list.
- Filter to one branch, or hide remote-tracking branches, from the toolbar above the graph.
- Right-click a branch label to check it out or copy its name. Right-click a commit to copy its
  SHA or message.
- Click a commit to open its own diff in a new tab, showing only what that commit changed.

History is available for any project in a Git repository.

### Manage Code Reviews Without Context Switching

**Create pull requests while you work**

- Push a branch and create a pull request from the Git actions controls in the toolbar
- T3 Code can suggest titles and descriptions based on your commits
- Supports GitHub Pull Requests, GitLab Merge Requests, Bitbucket Pull Requests, and Azure DevOps Pull Requests

**Stay on top of open reviews**

- See if your current branch already has an open PR/MR
- Open several reviews from the **Pull requests** page as tabs in the right panel
- While working in a thread, open linked reviews in the same compact right-panel tabs without
  leaving the conversation
- Open the review directly in your browser with one click
- Command-click (Control-click on Windows and Linux) a pull request number in the sidebar to open it in your browser instead of in T3 Code
- Check out a teammate's branch to review code locally

**Fix what you wrote, in place**

- Rewrite a pull request's title and description from the review itself, in Markdown, with a
  preview before you save
- Rewrite your own comments the same way, wherever they are shown
- Works on GitHub, GitLab, and Bitbucket. Azure DevOps takes a new title and description; its
  comments stay read-only here, as they already were

### Know Your Setup at a Glance

The **Source Control settings** page shows you exactly what's connected:

- ✅ Which providers are authenticated and ready
- ⚠️ What's missing and how to fix it
- 👤 Which account is signed in (when available)

Run a quick **Rescan** after setting up a new machine or changing credentials.

## Getting Started

### For GitHub (Recommended for most users)

1. Install the GitHub CLI on the machine running T3 Code:
   ```bash
   brew install gh
   ```
2. Sign in:
   ```bash
   gh auth login
   ```
3. Open **Settings → Source Control** in T3 Code and verify GitHub shows as authenticated

You can now clone, publish, and create pull requests.

### For GitLab

1. Install the GitLab CLI:
   ```bash
   brew install glab
   ```
2. Authenticate:
   ```bash
   glab auth login
   ```
3. Check **Settings → Source Control** to confirm the connection

### For Bitbucket

Bitbucket uses tokens instead of a CLI tool. Two options, both set as environment variables on the
machine running T3 Code.

Recommended, a Bitbucket access token:

```bash
export T3CODE_BITBUCKET_ACCESS_TOKEN="your-access-token"
```

Or an Atlassian account email plus API token, with read/write access to pull requests and
repositories, plus read access to your user account (`read:user:bitbucket`, used to verify the
connection):

```bash
export T3CODE_BITBUCKET_EMAIL="you@example.com"
export T3CODE_BITBUCKET_API_TOKEN="your-token"
```

If both are set, the access token wins. Restart T3 Code and verify the connection in **Source
Control settings**.

### For Azure DevOps

1. Install Azure CLI:
   ```bash
   brew install azure-cli
   ```
2. Add the DevOps extension:
   ```bash
   az extension add --name azure-devops
   ```
3. Sign in:
   ```bash
   az login
   ```

---

## Requirements & Troubleshooting

**Git is required** – T3 Code uses Git for all local operations. Ensure `git` is installed on your server.

**Server-side setup** – Authentication happens on the machine running T3 Code (the server), not your local browser. If you're using a hosted or team instance, your administrator may have already configured providers.

**Common issues:**

- **Provider shows "Not authenticated"** – Run the login command for that provider (e.g., `gh auth login`) in a terminal on the server, then rescan in Settings
- **Bitbucket not connecting** – Double-check your environment variables are set in the correct shell profile and the server was restarted
- **Can't push to a remote** – Verify your Git remote URL matches the provider you've authenticated with (SSH vs HTTPS remotes may need different credentials)

**Need more help?** Check your provider's CLI documentation:

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/)
