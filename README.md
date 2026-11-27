# Stremio Plus

Plugins and themes for the **Stremio desktop app** on Windows, with Stremio's own smooth native (mpv) playback. You get a **Stremio Plus** shortcut that opens Stremio with your plugins and themes; the normal Stremio shortcut keeps opening plain Stremio.

## Install (one click)

1. Sign in to GitHub, open this repo's **Releases** page and download **`StremioPlusSetup-<version>.exe`**.
2. Run it. Windows SmartScreen may say "Windows protected your PC" because the installer isn't code-signed: click **More info → Run anyway**.
3. Read the "What was found" page, click through, and finish. No admin rights are needed, and you don't need to install Node.js or anything else.
4. Open **Stremio Plus** from the Desktop or Start Menu.

The installer looks at what's on your PC and does the right thing:

| You have | What the installer does | What you end up with |
|---|---|---|
| **Nothing** (no Stremio, no Stremio Enhanced) | Downloads the official Stremio 5 from stremio.com, checks its digital signature (must be from Smart Code OOD), installs it, then installs Stremio Plus | One app to use. Open **Stremio Plus**, then sign in or create a Stremio account as usual |
| **Stremio**, no Enhanced | Installs Stremio Plus only | Your login, add-ons (including debrid), library, watch history and settings are all there, because Stremio Plus runs your own Stremio |
| **Stremio and Stremio Enhanced** | Same as above, and copies your Enhanced plugins and themes into Stremio Plus | Everything above, plus your Enhanced plugins (with their settings) ready to use. Enhanced itself is never changed |

Nothing is moved or deleted. Stremio (and Enhanced, if you have it) keep working exactly as before. If you only have Stremio Enhanced (no regular Stremio), the installer installs Stremio and also imports your Enhanced plugins and themes; your Stremio account itself syncs from the cloud, so sign in once.

### About the Enhanced import
- Plugins and their settings (`.plugin.json`) are **copied**. If a name already exists, the copy gets an `-enhanced` suffix; nothing is overwritten.
- Stremio Plus has a stand-in `<video>` element backed by Stremio's player, so most Enhanced plugins (skip buttons, progress, diagnostics...) run as they are.
- Plugins that need real video frames, such as **Picture-in-Picture**, screenshots or clip recorders, **cannot work** with Stremio's player. They are imported **switched off** with a note; you can still turn them on in the panel.
- The installer shows a summary at the end and writes `import-report.txt` into your Stremio Plus folder listing exactly what was imported and why anything is off.
- Which plugins were on in Enhanced can't always be read; in that case everything is imported as on, except the ones that can't work.

## Using it

- Open the panel with **Ctrl+Shift+P** (or **Plus** in Stremio's left sidebar): tick/untick plugins, pick a theme, open settings for plugins that have them.
- **Ctrl+R** (or F5, or the panel's Reload) reloads Stremio and re-reads your plugin and theme files; you stay logged in.
- Your own plugins/themes folder: Start Menu → **Stremio Plus plugins folder** (it's `%APPDATA%\StremioPlus`). Drop `Name.plugin.js` into `plugins`, `Name.theme.css` into `themes`, then Ctrl+R.
- Add-ons are installed in Stremio itself, as always, and keep working.
- **Only install plugins you trust.** A plugin is JavaScript running inside Stremio's page with the same access Stremio has, including your account session.
- Plugin format, settings, dialogs and the player API: `docs/WRITING-PLUGINS.md`.

## Things to watch

- **Start Stremio from the Stremio Plus shortcut** to get plugins. The normal Stremio shortcut opens plain Stremio. If Stremio is already open when you start Stremio Plus, you'll be asked to close and restart it (anything playing stops).
- **Updating:** run a newer `StremioPlusSetup` over the old one. Your plugins, themes and settings are kept.
- **Uninstall:** Windows Settings → Apps → Stremio Plus. It asks whether to also delete your plugins and settings (default: keep). Stremio and Enhanced are never touched.
- **Stremio 5 required.** The older Stremio 4 app (`stremio.exe`) isn't supported; the installer installs Stremio 5 next to it if needed.
- **Security:** while Stremio Plus runs, Stremio's web view has a DevTools debug port on `127.0.0.1` (this PC only, random port, checked at startup). Web pages can't use it, but **any program on this PC could find it and control the Stremio page**, including your Stremio session. Run only software you trust. Plain Stremio has no debug port.
- Windows or antivirus may question `wscript.exe` running a `.vbs` file (how the shortcut starts the launcher with no console window). It only runs the bundled Node on `launcher\launcher.js`; you can read both.
- After a Stremio update, a plugin may stop working if the player changed. Check `logs\launcher.log` (in `%APPDATA%\StremioPlus`).

## Troubleshooting

| Symptom | What to check |
|---|---|
| Nothing happens when opening Stremio Plus | Look at `%APPDATA%\StremioPlus\logs\launcher.log`. Make sure Stremio 5 is installed at `%LOCALAPPDATA%\Programs\Stremio`. |
| Download of Stremio fails or the signature check fails (new installs) | Install Stremio yourself from stremio.com/downloads, then run the setup again. |
| Plugins don't show / panel says none | Names must end in `.plugin.js` / `.theme.css` and sit directly in `plugins` / `themes`. Press Ctrl+R. |
| A plugin shows a red warning or "Blocked" | The panel shows why (an error it threw, or a missing `@require`). Details are in the log. |
| Ctrl+Shift+P does nothing | You started plain Stremio. Close it and use the Stremio Plus shortcut. |

## Install from source (git or ZIP; for developers)

Needs Windows, Stremio 5 and **Node.js 22+**. Then double-click `install.cmd` (checks requirements, creates the shortcuts; plugins live in this folder's `plugins\`). Update with `git pull`; your `plugins`, `themes` and `config.json` are git-ignored. Remove with `uninstall.cmd`. Build the installer yourself with `installer\build.ps1` (needs Inno Setup 6).

## For AI assistants

See **[docs/AI-INSTALL.md](docs/AI-INSTALL.md)**.

## More

- `docs/WRITING-PLUGINS.md`: plugin/theme format, settings, dialogs, the player bridge and `<video>` stand-in
- `docs/PROTOCOL.md`: how Stremio's page and player talk to each other
- `CLAUDE.md`: project notes for AI assistants
