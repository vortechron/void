# Appearance

Open **Settings → Appearance** to customize how T3 Code looks in the web and desktop apps.

The default Dark palette uses warm charcoal surfaces and soft lavender accents. Light uses
warm white surfaces. Both have rounded controls, softly lit menus, and a framed glass composer.
Named and imported themes keep their own colors with the same surface styling.

## Themes

The interface theme can follow your system, use the standard Light or Dark palette, or use
Catppuccin, Dracula, Nord, Tokyo Night, Gruvbox Dark, or Solarized Dark.

Code highlighting has its own theme setting. **Default** follows the interface's light or dark
mode. Choosing a named code theme applies it to chat code blocks, file previews, search results,
and diffs without changing the rest of the interface.

## Fonts and sizes

- **UI font family** changes the interface font. Search the fonts installed on your device, or use
  one of the built-in choices.
- **UI font size** scales the standard interface text from 12 to 20 pixels.
- **Interface zoom** scales the whole interface from 50% to 150%, including spacing, icons, and
  controls rather than text alone. Zooming out fits more on screen, which helps on tablets and small
  laptop displays where the browser's own zoom is not available.
- **Code font family** changes the font used for code and diff surfaces. Search the fonts installed
  on your device, or use one of the built-in monospace choices.
- **Code font size** changes code and diff text from 10 to 20 pixels.

These preferences are saved for the current client. **Restore defaults** resets them together
with the other settings listed in the confirmation dialog.

Your browser may ask for permission before showing installed fonts. A local font is available only
on the device where it is installed; T3 Code does not upload or copy the font file. If your browser
cannot list installed fonts, type the exact font family name in the picker.

## Private project names

**Private project names** replaces your real project names with stand-ins such as _Project Alpha_
and _Project Bravo_. Turn it on before you stream or take screenshots so a viewer cannot read the
names of your projects.

The stand-ins appear in the thread sidebar, the thread header, and the project picker on the
new-thread screen. Each project keeps the same stand-in for as long as your project list is
unchanged, so the sidebar and the header always agree.

Nothing is renamed. Renaming a project, the **Settings → Projects** page, file paths, terminal
output, and anything the agent writes still use the real name.

## Motion

The main sidebar, right panel, and terminal drawer open and close immediately by default. Move the
**Panel animations** slider above 0 ms to add motion, up to 400 ms, unless reduced motion is enabled
in your operating system. Moving between threads always snaps to the selected thread's panel state
without replaying its transitions.

## Custom themes

On web and desktop, choose **Create theme** to adjust a palette, or import a T3 Code or VS Code
theme. The theme editor's color picker lets you select an area of the app to find the color to
change. Export your theme as JSON to share it.

## Environment themes

Environment themes and defaults come from the server serving your web app or the desktop app's
main local environment. app.t3.codes and additional connections do not use them.

Select a published theme in **Settings → Appearance** to follow its palette as the server updates
it. **Duplicate** makes an independent copy you can edit. A saved custom theme with the same ID
takes precedence. If the server stops publishing the selected theme, T3 Code falls back to its
standard theme.

Run this on the server to set a default and switch connected clients to it:

```bash
t3 theme set nightfall
```

Clients that are offline apply it when they reconnect. Each client applies the setting once;
choosing another theme afterward sticks until the next `t3 theme set`. Run the command again to
reapply it, even if the name is unchanged.

`t3 theme clear` removes the default without changing anyone's current theme. `t3 theme show` lists
the default and published themes.

### Publish a theme

Save a theme exported from T3 Code into `~/.t3/userdata/themes/` on the server, or the `themes`
directory under your custom state directory. The filename supplies the theme ID: `nightfall.json`
can be selected with `t3 theme set nightfall`. Keep the filename stable when updating its colors.
Do not use `system`, `light`, `dark`, or a built-in theme's ID.

For an integration that generates a palette, this shorter format also works:

```json
{
  "name": "Nightfall",
  "appearance": "dark",
  "canvas": "#1a1b26",
  "accent": "#7aa2f7",
  "colors": {
    "terminalSelection": "#292e42",
    "error": "#f7768e"
  }
}
```

Set `appearance` to `light` or `dark` and supply hex colors for `canvas` and `accent`. T3 Code
generates the rest. The optional `colors` overrides use the names in the theme editor's advanced
view.

Write updates to a temporary file and rename it into place so clients never read a partial theme.
Invalid files are not published.
