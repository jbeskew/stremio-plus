# Protocol notes (verified against stremio-shell-ng 5.0.26)

Tested with: stremio-shell-ng 5.0.26, WebView2 UI at `https://web.stremio.com/`. Scripts: `poc.js`, `test.plugin.js`.

## 1. Debug port
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=N --remote-debugging-address=127.0.0.1"` works. The env var is **appended** to shell-ng's own args: the WebView2 command line still has `--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,...` (no need to repeat them).
- `Get-NetTCPConnection -LocalPort N` → **LocalAddress 127.0.0.1 only**.
- `/json` lists the page (`https://web.stremio.com/#/...`), a service worker and a worker. CDP over Node 24's built-in `WebSocket` works with zero npm deps (no Origin rejection).
- Only one `stremio-runtime` (shell-ng's own server) was running; we start no server.
- Before launching, any running Stremio must be closed (single instance, WebView2 args are fixed per browser process).

## 2. Injection
- `Runtime.addBinding('__splus')` + `Page.addScriptToEvaluateOnNewDocument` + `Runtime.evaluate` work. Plugin → launcher via `window.__splus(string)` → `Runtime.bindingCalled`. Re-injected on page reload (verified).
- Console shows `ReferenceError: initShellComm is not defined` from the shell's own injected script, on every load. App works normally; origin not proven (cannot compare without CDP) — treat as harmless noise.

## 3. Player access (differs from the original assumption)
- **Core state: `window.core.getState('player')`** (also `window.core.dispatch`). `window.services` only holds `chromecast`; there is no `services.core.transport`. The player state has `stream.content.url`, `metaItem`, `seriesInfo {season, episode}`, `nextVideo` (e.g. `tt3398540:1:16`), `libraryItem`, `selected`, `subtitles`, `streamState`.
- Core has **no time/duration/seek**. Those live on the shell transport (`window.chrome.webview` messages, QWebChannel-like):
  - Host → page: `{"id":1,"object":"transport","type":1,"args":["mpv-prop-change",{"name":"time-pos","data":790.12}]}` (also `duration`, `pause`, `seeking`, `eof-reached`, `volume`, `path`, ...). ~4 time-pos events/s.
  - Page → host: `{"id":0,"type":6,"args":[<name>, <payload>]}`; e.g. `["mpv-set-prop",["pause",true]]`, `["mpv-set-prop",["time-pos",883.5]]`, `["mpv-command",["loadfile",url]]`, `["mpv-observe-prop","duration"]`.
  - The web app's own transport object is not exposed globally; the bridge hooks `chrome.webview.addEventListener('message')` and `postMessage` instead. **Hook must be installed in the new-document script** to see initial `duration`/`pause`; for late attach, re-send `mpv-observe-prop <name>` for time-pos, duration, pause, seeking, eof-reached — mpv re-emits the current value.
- Measured on a playing torrent stream: pause ack 26 ms, time-pos seek +30 s reached in 25 ms, resume ack 27 ms, seek back 25 ms, time-pos stays frozen while paused.

## 4. Overlay
- A fixed-position DOM button (z-index max, appended to `<html>`) is visible above the mpv video (screenshot `shot.png`), and click → `__splus` binding works.

## Design notes
- `StremioPlus.player.core()` uses `window.core.getState('player')`.
- `StremioPlus.player` state comes from the hooked `mpv-prop-change` stream (cached), seek/pause/play via `mpv-set-prop` messages above.
