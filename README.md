# Stremio Plus

A plugin and theme loader for the **normal Stremio desktop app** on Windows. You keep Stremio's smooth native (mpv) playback and everything you already have set up. Stremio Plus only adds a way to load plugins and themes on top.

This is a clean install: **no plugins are included**. You add your own.

## What stays exactly as it is

Stremio Plus starts your own installed Stremio and adds a local connection to it. It does not replace, copy or modify Stremio, so all of this keeps working with no setup:

- your Stremio login and account
- your installed add-ons (including debrid add-ons and their settings)
- your library, watch history, continue-watching and settings
- the streaming server and playback, which are Stremio's own

Nothing in `%LOCALAPPDATA%\Programs\Stremio` is changed, and no second streaming server is started. Add-ons are still managed the normal way, in Stremio itself. Stremio Plus is for plugins (extra features) and themes (looks).

## Requirements

- Windows 10 or 11
- **Stremio 5** desktop app, installed and opened at least once ([stremio.com/downloads](https://www.stremio.com/downloads)). Expected at `%LOCALAPPDATA%\Programs\Stremio\stremio-shell-ng.exe`. The older Stremio 4 app (`stremio.exe`) does not work.
- **Node.js 22 or newer** ([nodejs.org](https://nodejs.org), or `winget install OpenJS.NodeJS.LTS`). There are no packages to download beyond Node itself.

## Install

1. Get this folder onto your PC. Either:
   - **Download ZIP**: on the GitHub page click **Code → Download ZIP**, then extract it somewhere permanent (e.g. `C:\Users\<you>\Documents\Stremio Plus`). Don't run it from inside the ZIP, and don't put it somewhere you'll delete.
   - or **git**: `git clone https://github.com/jbeskew/stremio-plus.git` (this is a private repo, so you must have accepted the invitation and be signed in to GitHub).
2. Close Stremio completely (check the system tray too).
3. Double-click **`install.cmd`**. It checks Node.js and Stremio, tells you plainly if something is missing, and creates **Stremio Plus** shortcuts on your Desktop and Start Menu.
4. Start Stremio with the new **Stremio Plus** shortcut (red icon) from now on. You should be logged in already.
5. Press **Ctrl+Shift+P** (or click **Plus** in Stremio's left sidebar) to open the Stremio Plus panel. With nothing installed it says "No plugins found", which is correct.

If you move the folder later, run `install.cmd` again so the shortcuts point at the new place.

## Adding plugins and themes

1. Put a plugin file named `Something.plugin.js` in the **`plugins`** folder, or a theme `Something.theme.css` in the **`themes`** folder. The panel's **Open folder** button opens the Stremio Plus folder.
2. Open the panel (Ctrl+Shift+P). New plugins appear **enabled**. Press **Ctrl+R** (or F5, or the panel's **Reload** button) to reload Stremio and re-read the folders; this also picks up edits to existing plugins. You stay logged in. If a file still isn't listed, close Stremio completely and start it again from the shortcut.
3. Pick one theme at a time under **Themes**. Tick or untick plugins to switch them. Enabling takes effect straight away; disabling takes full effect after a restart.
4. Plugins with settings show a **Settings** button in the panel.

Plugins written for Stremio Enhanced mostly work as they are. Examples to copy from are in `examples/`, and `docs/WRITING-PLUGINS.md` explains the plugin format and API. Plugins that need a `<video>` element (e.g. Picture-in-Picture) cannot work, because Stremio's player draws the video outside the web page.

**Only install plugins you trust.** A plugin is ordinary JavaScript that runs inside Stremio's page with the same access Stremio has, including your account session. Read it, or get it from someone you trust, before enabling it.

## Things to watch

- **Always start from the Stremio Plus shortcut.** Starting Stremio from its own shortcut works fine but has no plugins. If Stremio is already open when you start Stremio Plus, you'll be asked to close and restart it; anything playing stops.
- Stremio needs to be fully closed first, or the plugin connection can't be set up. Closing Stremio also stops the launcher.
- Node.js must be installed and on PATH, or the shortcut does nothing visible. Test with `node --version` in a terminal.
- **Updates to Stremio** can occasionally change how its player or page works. If a plugin stops working after a Stremio update, check `logs\launcher.log` and see Troubleshooting.
- **Security:** while Stremio Plus is running, Stremio's web view has a DevTools debug port on `127.0.0.1` (this PC only), on a random port chosen each launch and checked at startup. Web pages can't use it, but **any program running on this PC could find it and control the Stremio page**, including your Stremio session. Run only software you trust. Plain Stremio started from its own shortcut has no debug port.
- Windows SmartScreen or antivirus may question `wscript.exe` running a `.vbs` file (that's how the shortcut starts the launcher without a console window). It only runs `node launcher\launcher.js`; you can read both files.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Shortcut does nothing | Run `node launcher\launcher.js` in a terminal from this folder to see errors. Check `node --version` is 22+. |
| "Stremio was not found" | Install Stremio 5 first, or set the `STREMIO_PLUS_EXE` environment variable to the full path of `stremio-shell-ng.exe`, then run `install.cmd` again. |
| Plugins don't show / panel says none | Names must end in `.plugin.js` / `.theme.css` and be directly inside `plugins` / `themes`. Restart from the shortcut. |
| A plugin shows a red warning or "Blocked" | The panel shows the reason (an error it threw, or a missing `@require`). Details are in `logs\launcher.log`. |
| Ctrl+Shift+P does nothing | You started plain Stremio. Close it and use the Stremio Plus shortcut. |
| Asked to close and restart Stremio | Normal when Stremio was already open. Say Yes (playback stops) or No to cancel. |

Log file: `logs\launcher.log` (cleared when it gets large). To see what happened in the last run, open it in Notepad.

## Updating Stremio Plus

- **git:** `git pull` in this folder. Your `plugins`, `themes` and `config.json` are ignored by git, so they are never overwritten.
- **ZIP:** download the new ZIP and copy its files over the old folder, but **keep your own `plugins` and `themes` folders and `config.json`**. Then run `install.cmd` once more if the folder moved.

## Uninstall

Double-click `uninstall.cmd` (removes the shortcuts). Start Stremio from its own shortcut and it runs exactly as before. Then delete this folder if you like. Nothing else was changed.

## Using an AI assistant to set this up

See **[docs/AI-INSTALL.md](docs/AI-INSTALL.md)**. It tells an AI coding assistant (Claude Code, etc.) how to install, verify, add plugins and debug safely.

## More

- `docs/WRITING-PLUGINS.md`: plugin and theme format, settings, dialogs, the player bridge
- `docs/PROTOCOL.md`: how Stremio's page and player talk to each other (for plugin authors and debugging)
- `CLAUDE.md`: project notes for AI assistants working in this folder
