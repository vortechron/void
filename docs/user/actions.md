# Actions

Actions save repeatable commands and prompts. Open the action control in a chat's top bar to run
or edit them.

## Scope

Each action is either global or project-only, chosen when you add it and changeable whenever you
edit it.

- **This project** is the default. The action appears only in the project you created it in.
- **Global** stores the action on the server instead, so it appears in every project on that
  server.

Global means one server. Connecting to a second server does not carry your global actions across,
and a global prompt action's saved provider and model must exist on the server that holds it.

Moving an action between scopes saves it in the new scope first, then removes the old copy. If the
removal fails you are told about it and the action briefly exists twice; delete whichever copy you
do not want.

The scope selector is hidden when the server is too old to store global actions. Everything stays
project-only there.

Adding and editing actions is a web and desktop job. The mobile app runs and uses both scopes but
does not create, edit, or delete them.

## Command actions

A command action runs its saved shell command in a project terminal. It can also have a
keybinding, start automatically when a worktree is created, and open a desktop preview URL.

Only command actions can use keybindings or appear as `script.{id}.run` commands. A keybinding
follows its action across a scope change, and a global action's keybinding works in every project.
A project's checked-in `t3.json` file can declare command actions for import; imported actions are
always project-only, and `t3.json` does not declare prompt actions.

Each scope can have one action that runs on worktree creation. When both a project action and a
global one are set to run, only the project's runs.

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

T3 Code never substitutes another model for a prompt action. If its saved provider or model is no
longer available, the choice is disabled until you edit the action. A provider may also require a
new chat when its model cannot be changed in the current conversation.
