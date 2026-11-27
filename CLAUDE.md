# Stremio Plus

Plugin/theme loader for normal Stremio (stremio-shell-ng, WebView2 UI at https://web.stremio.com, libmpv playback). Start with `docs/AI-INSTALL.md` for installing, verifying and adding plugins; it contains the safety rules.

Never modify `%LOCALAPPDATA%\Programs\Stremio` or other Stremio installs. Don't start a second streaming server. The debug port must stay loopback-only; never add `--remote-allow-origins`. Plugins are fully trusted code: read them and get the user's OK before installing one.

## Layout
- `launcher/launcher.js`: starts shell-ng with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<random> --remote-debugging-address=127.0.0.1`, verifies loopback-only, attaches over CDP (`cdp.js`), injects `bootstrap.js` at document start, handles page RPC (`__splusBind` binding), runs enabled plugins via `Runtime.evaluate` wrapped as `(function(StremioEnhancedAPI){...})(StremioPlus.apiFor(file))`. Orders plugins by `@require`, tracks per-plugin load time/errors (`pluginStatus` op). `.state/session.json` records launcher pid/port (reattach). `manifest.js` parses plugin/theme headers (3 styles; repeatable `@setting`/`@require`/`@permission`). `STREMIO_PLUS_EXE` overrides the Stremio path.
- `launcher/bootstrap.js`: page side: `window.StremioPlus` (RPC, Enhanced API shim, mpv bridge `StremioPlus.player`, themes, plugin settings forms and `showAlert`/`showPrompt` dialogs, Ctrl+Shift+P panel in Shadow DOM).
- `plugins/`, `themes/`: the user's own files (git-ignored; start empty). `examples/`: samples. `config.json` (enabled flags, active theme), `logs/`, `.state/` are local and git-ignored.
- `install.ps1`/`install.cmd`, `uninstall.ps1`/`uninstall.cmd`: shortcuts only. `docs/`: AI-INSTALL, WRITING-PLUGINS, PROTOCOL.

## Key facts
- Core state: `window.core.getState('player')` (not services.core). Time/seek are NOT in core: shell transport messages on `chrome.webview` (`mpv-prop-change`; send `{id:0,type:6,args:[name,...]}` with `mpv-set-prop`/`mpv-observe-prop`). See `docs/PROTOCOL.md`.
- Stremio has no `<video>` element; plugins needing one must use `StremioPlus.player`.
