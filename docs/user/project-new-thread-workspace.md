# Choose where new project threads start

Each project can choose whether new threads use its current checkout or create a new worktree.

1. Open **Settings → General**.
2. Find **Project new-thread workspace**.
3. Choose **Current checkout**, **New worktree**, or **Use default** for the project.

Grouped checkouts share this setting. If they currently use different values, the setting shows
**Mixed settings** until you choose one value for the group.

When **Use default** is selected, T3 Code checks these defaults in order:

1. `defaultThreadEnvMode` in the project's `t3.json` file.
2. The global **New threads** setting.

An explicit choice in the thread composer always wins for that thread.
