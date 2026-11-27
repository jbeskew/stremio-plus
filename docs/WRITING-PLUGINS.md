# Writing plugins and themes

Plugins are plain JavaScript files in `plugins/` named `Something.plugin.js`. Themes are CSS files in `themes/` named `Something.theme.css`. Copy the files in `examples/` to start.

Plugins run inside Stremio's page (`https://web.stremio.com`) with that page's full access, wrapped so that `StremioEnhancedAPI` is available as a variable. Whatever a plugin does, the user trusts it fully, so keep it small and honest.

## Header

At the very top of the file. Three styles are accepted:

```js
/**
 * @name My Plugin
 * @description What it does
 * @version 1.0.0
 * @author Me
 */
```
```js
// ==Plugin==
// @name        My Plugin
// @version     1.0.0
// ==/Plugin==
```
```css
/* ==Theme==
@name My Theme
@version 1.0.0
==/Theme== */
```

Every tag is optional (the name defaults to the filename). These tags may repeat:

| Tag | Meaning |
|---|---|
| `@setting key \| kind \| label \| default [\| hint]` | A setting shown in the plugin's **Settings** form. Kinds: `toggle`, `text`, `color`, `range` (`\| hint \| min \| max \| step`), `select` (field 5 is `a,b,c`, field 6 the hint). |
| `@require Other >= 1.0.0` | The plugin named `Other` must be enabled; it loads first. Missing, disabled or cyclic requirements block the plugin (the panel shows why). A version mismatch only logs a warning. |
| `@permission network` | Shown as a badge. Informational only; **nothing is enforced**. |

## API available to plugins

`StremioEnhancedAPI` (compatible with Stremio Enhanced plugins):

- `getSetting(key)` → saved value, else the declared default, else `null`. `saveSetting(key, value)` (strings, numbers, booleans, null).
- `registerSettings([{key, type: 'toggle'|'input'|'select'|'color'|'range', label, description?, defaultValue?, options?: [{label, value}]}])` as an alternative to `@setting`. `onSettingsSaved(cb)` runs when the user saves the form (one listener per plugin); `cb` gets the saved values.
- `showAlert(type, title, message, buttons)` → resolves to the clicked button's index (-1 for Esc). `type` is `info|warning|error|question`.
- `showPrompt(title, message, defaultValue)` → resolves to a string, or `null` if cancelled.
- `logger.info|warn|error(msg)` → written to `logs/launcher.log`.

Settings are stored in `plugins/<file>.json` next to the plugin.

`StremioPlus.player`: the player bridge (Stremio has no `<video>`; mpv draws the video under the page):

- `state()` → `{time, duration, paused, seeking, ended, path, volume}` (seconds), or `null` fields until known
- `on((type, state) => ...)` where `type` is `time|duration|pause|seeking|ended|load`; returns an unsubscribe function
- `seek(sec)`, `pause()`, `play()`, `setPaused(bool)`, `active()` (true while the player route is open)
- `core()` → Stremio's player state (`stream`, `metaItem`, `seriesInfo`, `nextVideo`, ...); `streamUrl()`

Details on the messages behind this are in `PROTOCOL.md`.

## Behaviour to know

- A plugin's code runs once per page load, after the panel's `ready`. There is no unload hook; disabling a plugin in the panel takes full effect after a restart.
- Errors are caught per plugin: a throwing plugin shows an error count in the panel and doesn't stop the others.
- Keep work out of hot paths (per-frame or per-time-update handlers should be tiny) so playback stays smooth.
- The plugin source is wrapped as `(function(StremioEnhancedAPI){ ... })(...)`, so top-level `return` works and top-level `const`s don't leak.

## Themes

A theme is a CSS file applied to Stremio's page; one is active at a time. Override Stremio's CSS variables, for example `:root { --primary-accent-color: #8a63ff; }`. See `examples/sample-dark-purple.theme.css`.
