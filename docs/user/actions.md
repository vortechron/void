# Project actions

Project actions save repeatable commands and prompts on a project. Open the action control in a
chat's top bar to run or edit them.

## Command actions

A command action runs its saved shell command in a project terminal. It can also have a
keybinding, start automatically when a worktree is created, and open a desktop preview URL.

Only command actions can use keybindings or appear as `script.{id}.run` commands. A project's
checked-in `t3.json` file can declare command actions for import, but it does not declare prompt
actions.

## Prompt actions

A prompt action saves prompt text together with an exact provider instance, model, and model
traits such as effort, thinking, fast mode, context window, or agent. Creating and editing prompt
actions is available in the web and desktop clients.

Choose one destination each time you use a prompt action:

- **Use in current chat** adds it after the existing composer text, separated by a blank line.
- **Open in new chat** creates a fresh draft for the same checkout or worktree.

Both choices fill the composer without sending. Existing attachments and other saved drafts are
preserved. Prompt actions are also available from the mobile chat action menu; a mobile new-chat
prompt uses a temporary draft so the project's regular new-task draft is not replaced.

Void never substitutes another model for a prompt action. If its saved provider or model is no
longer available, the choice is disabled until you edit the action. A provider may also require a
new chat when its model cannot be changed in the current conversation.
