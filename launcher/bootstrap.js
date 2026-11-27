// Stremio Plus page-side bootstrap. Injected by the launcher at document start (CDP).
(() => {
  'use strict';
  if (window !== window.top || location.origin !== 'https://web.stremio.com') return;
  if (window.StremioPlus) return;
  const SP = (window.StremioPlus = { version: '0.2.0', plugins: [], themes: [], theme: '', _status: {}, _docId: Date.now() + '-' + Math.random().toString(36).slice(2) });

  /* ---------- launcher RPC (CDP binding) ---------- */
  // Runs at document start after a reload, when <html> may not exist yet: nothing here may assume the DOM is ready.
  const pending = new Map();
  let nid = 0;
  SP.call = (op, data) => new Promise((res, rej) => {
    const id = ++nid; pending.set(id, { res, rej });
    try { window.__splusBind(JSON.stringify({ id, op, data })); } catch (e) { pending.delete(id); rej(e); }
  });
  SP._reply = (id, ok, val) => {
    const p = pending.get(id); if (!p) return; pending.delete(id);
    ok ? p.res(val) : p.rej(new Error(val));
  };
  // Reload = new page document: the launcher re-reads plugins/ and themes/ and runs everything fresh (like Stremio Enhanced's Ctrl+R).
  SP.reload = () => SP.call('reload').catch(() => location.reload());
  const log = (level, ...a) => { try { SP.call('log', { level, msg: a.map(String).join(' ') }).catch(() => {}); } catch (_) {} };

  /* ---------- plugin settings schemas ---------- */
  // Header @setting lines (hdr, parsed by the launcher) and registerSettings() calls (rt); runtime wins per key.
  const KINDS = { toggle: 'toggle', text: 'input', input: 'input', color: 'color', range: 'range', select: 'select' };
  const numOr = (v, d) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? n : d; };
  /** Same shape the launcher produces for @setting lines (launcher/manifest.js normalizeSetting). */
  function normSetting(s) {
    if (!s || typeof s.key !== 'string' || !s.key) return null;
    const type = KINDS[String(s.type || '').toLowerCase()];
    if (!type) return null;
    const o = { key: s.key, type, label: String(s.label == null ? s.key : s.label), description: String(s.description == null ? '' : s.description) };
    const d = s.defaultValue, has = d !== undefined && d !== null && d !== '';
    if (type === 'toggle') o.defaultValue = has ? (typeof d === 'string' ? /^(true|1|yes|on)$/i.test(d) : !!d) : undefined;
    else if (type === 'range') { o.min = numOr(s.min, 0); o.max = numOr(s.max, 100); o.step = numOr(s.step, 1); o.defaultValue = has ? numOr(d, undefined) : undefined; }
    else if (type === 'select') {
      o.options = (Array.isArray(s.options) ? s.options : []).map((x) => (x && typeof x === 'object' ? { label: String(x.label == null ? x.value : x.label), value: x.value } : { label: String(x), value: x }));
      o.defaultValue = has ? d : undefined;
    } else o.defaultValue = has ? String(d) : undefined;
    return o;
  }
  const hdr = {}, rt = {}, listeners = {};
  function schemaFor(file) {
    const map = new Map();
    (hdr[file] || []).forEach((s) => map.set(s.key, s));
    (rt[file] || []).forEach((s) => map.set(s.key, s));
    return [...map.values()];
  }
  function formDefault(s) {
    if (s.defaultValue !== undefined) return s.defaultValue;
    switch (s.type) {
      case 'toggle': return false;
      case 'range': return s.min;
      case 'select': return s.options.length ? s.options[0].value : '';
      case 'color': return '#000000';
      default: return '';
    }
  }

  /* ---------- Enhanced API shim (one per plugin) ---------- */
  SP.apiFor = (file) => ({
    // Saved value, else the schema default (header @setting or registerSettings), else null.
    getSetting: async (key) => {
      const v = await SP.call('getSetting', { file, key });
      if (v === null || v === undefined) {
        const s = schemaFor(file).find((x) => x.key === key);
        if (s && s.defaultValue !== undefined) return s.defaultValue;
      }
      return v;
    },
    saveSetting: (key, value) => SP.call('saveSetting', { file, key, value }),
    /** schema: [{ key, type: 'toggle'|'input'|'select'|'color'|'range', label, description?, defaultValue?, options?: [{label,value}] }] */
    registerSettings: (schema) => {
      if (!Array.isArray(schema)) throw new Error('registerSettings expects an array');
      rt[file] = schema.map(normSetting).filter(Boolean);
      if (view && view.file === file) { captureForm(); view.schema = schemaFor(file); renderPanel(); }
      else if (open && !view) renderPanel();
    },
    /** One listener per plugin; a later call replaces the earlier one. cb receives the saved values. */
    onSettingsSaved: (cb) => { if (typeof cb === 'function') listeners[file] = cb; },
    /** type: info|warning|error|question. Resolves to the clicked button's index (-1 for Esc / backdrop). */
    showAlert: (type, title, message, buttons) => dialog({
      kind: 'alert',
      type: ['info', 'warning', 'error', 'question'].includes(type) ? type : 'info',
      title: String(title == null ? '' : title),
      message: String(message == null ? '' : message),
      buttons: Array.isArray(buttons) && buttons.length ? buttons.map(String) : ['OK'],
    }),
    /** Resolves to the entered string, or null if cancelled. */
    showPrompt: (title, message, defaultValue) => dialog({
      kind: 'prompt', type: 'question',
      title: String(title == null ? '' : title),
      message: String(message == null ? '' : message),
      value: String(defaultValue == null ? '' : defaultValue),
    }),
    logger: {
      info: (m) => { console.info('[' + file + ']', m); log('info', file + ': ' + m); },
      warn: (m) => { console.warn('[' + file + ']', m); log('warn', file + ': ' + m); },
      error: (m) => { console.error('[' + file + ']', m); log('error', file + ': ' + m); },
    },
  });
  SP._mark = (file) => {
    document.querySelectorAll('script[data-splus-marker]').forEach((s) => { if (s.id === file) s.remove(); });
    const s = document.createElement('script');
    s.type = 'text/plain'; s.id = file; s.setAttribute('data-splus-marker', '1');
    (document.head || document.documentElement).appendChild(s);
  };
  SP._unmark = (file) => document.querySelectorAll('script[data-splus-marker]').forEach((s) => { if (s.id === file) s.remove(); });

  /* ---------- mpv player bridge ---------- */
  const P = { time: null, duration: null, paused: null, seeking: false, ended: false, path: null, volume: null, mute: null, speed: null };
  const subs = new Set();
  const state = () => ({ ...P });
  const emit = (type) => subs.forEach((fn) => { try { fn(type, state()); } catch (e) { console.error(e); } });
  const wv = window.chrome && window.chrome.webview;
  const send = (name, ...args) => {
    if (!wv) return false;
    wv.postMessage(JSON.stringify({ id: 0, type: 6, args: [name, ...args] }));
    return true;
  };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  if (wv) wv.addEventListener('message', (e) => {
    let j = e.data;
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return; } }
    const a = j && j.args;
    if (!a || a[0] !== 'mpv-prop-change' || !a[1]) return;
    const { name, data } = a[1];
    switch (name) {
      case 'time-pos': P.time = num(data); emit('time'); break;
      case 'duration': P.duration = num(data); emit('duration'); break;
      case 'pause': P.paused = !!data; emit('pause'); break;
      case 'seeking': P.seeking = !!data; emit('seeking'); break;
      case 'eof-reached': P.ended = !!data; emit('ended'); break;
      case 'volume': P.volume = num(data); emit('volume'); break;
      case 'mute': P.mute = !!data; emit('volume'); break;
      case 'speed': P.speed = num(data); emit('speed'); break;
      case 'path':
        if (data !== P.path) { P.path = data || null; P.time = null; P.duration = null; P.ended = false; emit('load'); }
        break;
    }
  });
  SP.player = {
    state,
    /** cb(type, state) with type in time|duration|pause|seeking|ended|load. Returns an unsubscribe fn. */
    on(cb) { subs.add(cb); return () => subs.delete(cb); },
    send,
    seek: (sec) => send('mpv-set-prop', ['time-pos', Math.max(0, +sec || 0)]),
    pause: () => send('mpv-set-prop', ['pause', true]),
    play: () => send('mpv-set-prop', ['pause', false]),
    setPaused: (p) => send('mpv-set-prop', ['pause', !!p]),
    /** Ask mpv to re-emit current property values (late attach). */
    reobserve: () => ['path', 'time-pos', 'duration', 'pause', 'seeking', 'eof-reached', 'volume', 'mute', 'speed'].forEach((n) => send('mpv-observe-prop', n)),
    /** True while the player route is open. */
    active: () => /^#\/player/.test(location.hash),
    /** Stremio core player state (stream, metaItem, seriesInfo, nextVideo, ...). */
    core: () => (window.core && window.core.getState ? window.core.getState('player') : Promise.resolve(null)),
    async streamUrl() {
      const s = await this.core(); let st = s && s.stream; if (st && st.content) st = st.content;
      return (st && st.url) || null;
    },
  };

  /* ---------- <video> stand-in ---------- */
  // Stremio has no <video>: mpv draws the picture under the page. Plugins written for Stremio Enhanced expect one, so while
  // the player route is open an invisible real <video> is mounted whose state mirrors the mpv bridge. It never has frames:
  // requestPictureInPicture rejects, captureStream/drawImage give nothing.
  let sv = null, svMeta = false;
  const range = () => ({ length: P.duration ? 1 : 0, start: () => 0, end: () => P.duration || 0 });
  function makeShellVideo() {
    const v = document.createElement('video');
    v.setAttribute('data-splus-video', '1');
    v.muted = true; v.removeAttribute('controls');
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:-1';
    const def = (name, get, set) => Object.defineProperty(v, name, { configurable: true, get, set });
    def('currentTime', () => (P.time == null ? 0 : P.time), (t) => { t = Math.max(0, +t || 0); P.time = t; SP.player.seek(t); });
    def('duration', () => (P.duration == null ? NaN : P.duration));
    def('paused', () => (P.paused == null ? true : P.paused));
    def('ended', () => !!P.ended);
    def('seeking', () => !!P.seeking);
    def('readyState', () => (P.duration == null ? 0 : 4));
    def('networkState', () => 1);
    def('buffered', range); def('seekable', range); def('played', range);
    def('src', () => P.path || '', () => {}); def('currentSrc', () => P.path || '');
    def('volume', () => (P.volume == null ? 1 : Math.max(0, Math.min(1, P.volume / 100))), (x) => { send('mpv-set-prop', ['volume', Math.round(Math.max(0, Math.min(1, +x || 0)) * 100)]); });
    def('muted', () => !!P.mute, (m) => { send('mpv-set-prop', ['mute', !!m]); });
    def('playbackRate', () => P.speed || 1, (r) => { if (+r > 0) send('mpv-set-prop', ['speed', +r]); });
    def('videoWidth', () => 0); def('videoHeight', () => 0);
    v.play = () => { SP.player.play(); return Promise.resolve(); };
    v.pause = () => { SP.player.pause(); };
    v.load = () => {};
    v.requestPictureInPicture = () => Promise.reject(new DOMException('Picture-in-Picture is not available with the mpv player', 'NotSupportedError'));
    v.captureStream = () => { throw new DOMException('captureStream is not available with the mpv player', 'NotSupportedError'); };
    v.getVideoPlaybackQuality = () => ({ totalVideoFrames: 0, droppedVideoFrames: 0, corruptedVideoFrames: 0, creationTime: performance.now() });
    return v;
  }
  function syncShellVideo() {
    const want = SP.player.active();
    if (want && (!sv || !sv.isConnected)) {
      const host = document.querySelector('[class*="player-container"]') || document.body;
      if (!host) return;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      sv = makeShellVideo(); svMeta = P.duration != null;
      host.appendChild(sv);
    } else if (!want && sv) { sv.remove(); sv = null; }
  }
  window.addEventListener('hashchange', syncShellVideo);
  SP.player.on((type) => {
    if (!sv) return;
    const fire = (n) => sv.dispatchEvent(new Event(n));
    switch (type) {
      case 'time': fire('timeupdate'); break;
      case 'duration': fire('durationchange'); if (P.duration != null && !svMeta) { svMeta = true; fire('loadedmetadata'); fire('canplay'); } break;
      case 'pause': if (P.paused) fire('pause'); else { fire('play'); fire('playing'); } break;
      case 'seeking': if (P.seeking) fire('seeking'); else { fire('seeked'); fire('timeupdate'); } break;
      case 'ended': if (P.ended) fire('ended'); break;
      case 'volume': fire('volumechange'); break;
      case 'speed': fire('ratechange'); break;
      case 'load': svMeta = false; fire('emptied'); fire('loadstart'); break;
    }
  });

  /* ---------- themes ---------- */
  SP.applyThemeCss = (css) => {
    let el = document.getElementById('splus-theme');
    if (!css) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'splus-theme'; (document.head || document.documentElement).appendChild(el); }
    el.textContent = css;
  };
  SP._load = (payload) => {
    SP.plugins = payload.plugins; SP.themes = payload.themes; SP.theme = payload.theme;
    SP._status = {};
    payload.plugins.forEach((p) => {
      hdr[p.file] = (p.settings || []).map(normSetting).filter(Boolean);
      if (p.status) SP._status[p.file] = p.status;
    });
    SP.applyThemeCss(payload.css);
    renderPanel();
  };

  /* ---------- panel + dialogs (Shadow DOM) ---------- */
  let host = null, root = null, open = false, hint = '';
  let view = null; // settings view: { file, name, schema, values }; null = plugin list
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = `
    :host{all:initial}
    .wrap{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:14px/1.4 system-ui,Segoe UI,sans-serif;color:#eee}
    .wrap.open{display:flex}
    .box{width:min(640px,92vw);max-height:84vh;overflow:auto;background:#1b1a24;border:1px solid #3a3850;border-radius:14px;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    h2{margin:0 0 4px;font-size:20px} h3{margin:18px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a79cff}
    .sub{color:#9a98ab;font-size:12px}
    .row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #2b2a3a}
    .row .t{flex:1;min-width:0} .row .n{font-weight:600} .row .d{color:#9a98ab;font-size:12px}
    input[type=checkbox],input[type=radio]{width:18px;height:18px;accent-color:#7b5bf5}
    .btns{display:flex;gap:10px;margin-top:18px;align-items:center}
    button{background:#2e2c42;color:#eee;border:1px solid #45435f;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit}
    button:hover{background:#3a3856} .hint{color:#ffcf6b;font-size:12px;margin-left:auto}
    .empty{color:#9a98ab;padding:8px 0}
    .b{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:#2b2a3a;color:#b9b6d6;font-size:10px;font-weight:400;vertical-align:middle}
    .err{color:#ff8a8a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .blk{color:#ffcf6b;font-size:12px}
    .meta{color:#7d7b92;font-size:11px}
    input[type=text],select{background:#14131c;color:#eee;border:1px solid #45435f;border-radius:6px;padding:6px 8px;font:inherit;min-width:170px;max-width:55%}
    input[type=range]{width:150px;accent-color:#7b5bf5}
    .val{min-width:40px;text-align:right;color:#9a98ab;font-size:12px}
    input[type=color]{width:44px;height:30px;padding:0;border:1px solid #45435f;border-radius:6px;background:none}
    .dlg{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font:14px/1.4 system-ui,Segoe UI,sans-serif;color:#eee}
    .dlg.open{display:flex}
    .dbox{width:min(440px,90vw);background:#1b1a24;border:1px solid #3a3850;border-radius:12px;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .dbox.error{border-color:#8a3a3a} .dbox.warning{border-color:#8a7a3a}
    .dt{font-size:16px;font-weight:600;margin-bottom:6px}
    .dm{white-space:pre-wrap;word-break:break-word;color:#cfcde0;margin-bottom:12px}
    .din{width:100%;max-width:100%;box-sizing:border-box;margin-bottom:12px}
    .dbtns{display:flex;justify-content:flex-end;gap:8px}
    button.pri{background:#4b3aa8;border-color:#6a58d6}`;
  function ensurePanel() {
    if (host && host.isConnected) return;
    host = document.createElement('div'); host.id = 'splus-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style><div class="wrap" id="wrap"></div><div class="dlg" id="dlg"></div>';
    // Keys typed into our inputs must not reach Stremio's own shortcuts (space, f, m, ...).
    // Our own window-level handlers (Esc, Ctrl+Shift+P) run in the capture phase, before this.
    ['keydown', 'keyup', 'keypress'].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));
    document.documentElement.appendChild(host);
    root.getElementById('wrap').addEventListener('click', (e) => { if (e.target.id === 'wrap') setOpen(false); });
  }
  function setOpen(v) {
    open = v; if (!v) view = null;
    ensurePanel(); renderPanel();
    if (v) refreshStatus();
  }
  async function refreshStatus() {
    try { const s = await SP.call('pluginStatus'); if (s && typeof s === 'object') SP._status = s; } catch (_) {}
    if (open && !view) renderPanel();
  }

  /* --- dialogs: one at a time, queued --- */
  const dlgQ = []; let dlgCur = null;
  function dialog(spec) { return new Promise((resolve) => { dlgQ.push({ spec, resolve }); if (!dlgCur) nextDialog(); }); }
  function nextDialog() {
    dlgCur = dlgQ.shift() || null;
    ensurePanel();
    const d = root.getElementById('dlg');
    if (!dlgCur) { d.classList.remove('open'); d.innerHTML = ''; return; }
    const s = dlgCur.spec, isPrompt = s.kind === 'prompt';
    const btns = isPrompt ? ['OK', 'Cancel'] : s.buttons;
    d.innerHTML = '<div class="dbox ' + esc(s.type) + '"><div class="dt">' + esc(s.title) + '</div><div class="dm">' + esc(s.message) + '</div>'
      + (isPrompt ? '<input type="text" class="din" value="' + esc(s.value) + '">' : '')
      + '<div class="dbtns">' + btns.map((b, i) => '<button data-b="' + i + '"' + (i === 0 ? ' class="pri"' : '') + '>' + esc(b) + '</button>').join('') + '</div></div>';
    d.classList.add('open');
    d.onclick = (e) => { if (e.target === d) finishDialog(-1); };
    d.querySelectorAll('button[data-b]').forEach((b) => { b.onclick = () => finishDialog(+b.dataset.b); });
    const inp = d.querySelector('.din');
    if (inp) { inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); finishDialog(0); } }; inp.focus(); inp.select(); }
    else { const first = d.querySelector('button'); if (first) first.focus(); }
  }
  function finishDialog(i) {
    const c = dlgCur; if (!c) return;
    let val = i;
    if (c.spec.kind === 'prompt') { const inp = root.querySelector('#dlg .din'); val = i === 0 && inp ? inp.value : null; }
    c.resolve(val);
    nextDialog();
  }

  /* --- plugin list --- */
  const badge = (t, title) => '<span class="b"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(t) + '</span>';
  function pluginRow(p, i) {
    const s = SP._status[p.file] || {};
    const perms = (p.permissions || []).map((x) => badge(x, 'Declared by the plugin, not enforced')).join('');
    const meta = s.loadMs != null ? '<div class="meta">loaded in ' + esc(s.loadMs) + ' ms</div>' : '';
    const note = p.note ? '<div class="meta">' + esc(p.note) + '</div>' : '';
    const frames = p.frames && p.frames.length ? '<div class="blk">Needs real video frames (' + esc(p.frames.join(', ')) + '); may not work with Stremio\'s player</div>' : '';
    const blk = s.blocked ? '<div class="blk">Blocked: ' + esc(s.blocked) + '</div>' : '';
    const err = s.errors ? '<div class="err" title="' + esc(s.lastError) + '">⚠ ' + esc(s.errors) + ' error' + (s.errors > 1 ? 's' : '') + ' · ' + esc(s.lastError) + '</div>' : '';
    return '<div class="row"><input type="checkbox" data-p="' + i + '" ' + (p.enabled ? 'checked' : '') + '><div class="t"><div class="n">' + esc(p.name)
      + ' <span class="sub">' + esc(p.version) + (p.author ? ' · ' + esc(p.author) : '') + '</span>' + perms + '</div><div class="d">' + esc(p.description) + '</div>'
      + blk + frames + err + note + meta + '</div>' + (schemaFor(p.file).length ? '<button data-s="' + i + '">Settings</button>' : '') + '</div>';
  }
  function renderList(w) {
    const pl = SP.plugins.length ? SP.plugins.map(pluginRow).join('') : '<div class="empty">No plugins found in the plugins folder.</div>';
    const th = ['<div class="row"><input type="radio" name="th" data-t="-1" ' + (SP.theme ? '' : 'checked') + '><div class="t"><div class="n">None</div></div></div>']
      .concat(SP.themes.map((t, i) => '<div class="row"><input type="radio" name="th" data-t="' + i + '" ' + (SP.theme === t.file ? 'checked' : '') + '><div class="t"><div class="n">' + esc(t.name) + ' <span class="sub">' + esc(t.version) + (t.author ? ' · ' + esc(t.author) : '') + '</span></div><div class="d">' + esc(t.description) + '</div></div></div>')).join('');
    w.innerHTML = '<div class="box"><h2>Stremio Plus</h2><div class="sub">Plugins and themes · also Ctrl+Shift+P</div><h3>Plugins</h3>' + pl + '<h3>Themes</h3>' + th + '<div class="btns"><button id="of">Open folder</button><button id="rl">Reload</button><button id="cl">Close</button><span class="hint">' + esc(hint) + '</span></div></div>';
    w.querySelectorAll('input[data-p]').forEach((el) => el.onchange = async () => {
      const p = SP.plugins[+el.dataset.p]; p.enabled = el.checked;
      try { await SP.call('setPlugin', { file: p.file, enabled: el.checked }); if (!el.checked) SP._unmark(p.file); hint = el.checked ? '' : 'Reload to fully unload'; }
      catch (e) { p.enabled = !el.checked; hint = 'Error: ' + e.message; }
      renderPanel(); refreshStatus();
    });
    w.querySelectorAll('input[data-t]').forEach((el) => el.onchange = async () => {
      const t = SP.themes[+el.dataset.t]; const file = t ? t.file : '';
      try { const css = await SP.call('setTheme', { file }); SP.theme = file; SP.applyThemeCss(css); hint = ''; } catch (e) { hint = 'Error: ' + e.message; }
      renderPanel();
    });
    w.querySelectorAll('button[data-s]').forEach((b) => { b.onclick = () => openSettings(SP.plugins[+b.dataset.s]); });
    w.querySelector('#of').onclick = () => SP.call('openFolder').catch(() => {});
    w.querySelector('#rl').onclick = () => SP.reload();
    w.querySelector('#cl').onclick = () => setOpen(false);
  }

  /* --- plugin settings form --- */
  async function openSettings(p) {
    const schema = schemaFor(p.file);
    let saved = {};
    try { saved = (await SP.call('getSettings', { file: p.file, keys: schema.map((s) => s.key) })) || {}; }
    catch (e) { hint = 'Error: ' + e.message; renderPanel(); return; }
    const values = {};
    schema.forEach((s) => { values[s.key] = saved[s.key] != null ? saved[s.key] : formDefault(s); });
    view = { file: p.file, name: p.name, schema, values }; hint = '';
    renderPanel();
  }
  function control(s, i, val) {
    const a = ' data-i="' + i + '"';
    switch (s.type) {
      case 'toggle': return '<input type="checkbox"' + a + (val ? ' checked' : '') + '>';
      case 'range': return '<input type="range"' + a + ' min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + esc(val) + '"><span class="val" data-v="' + i + '">' + esc(val) + '</span>';
      case 'select': return '<select' + a + '>' + s.options.map((o) => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
      case 'color':
        if (/^#[0-9a-f]{6}$/i.test(String(val))) return '<input type="color"' + a + ' value="' + esc(val) + '">';
        // not a plain hex colour (rgba(), named, ...): fall through to a text field
      default: return '<input type="text"' + a + ' value="' + esc(val) + '">';
    }
  }
  function readForm(w) {
    const out = {};
    w.querySelectorAll('[data-i]').forEach((el) => {
      const s = view.schema[+el.dataset.i]; if (!s) return;
      if (s.type === 'toggle') out[s.key] = el.checked;
      else if (s.type === 'range') out[s.key] = Number(el.value);
      else if (s.type === 'select') { const o = s.options.find((x) => String(x.value) === el.value); out[s.key] = o ? o.value : el.value; }
      else out[s.key] = el.value;
    });
    return out;
  }
  function captureForm() {
    const w = root && root.getElementById('wrap');
    if (view && w && w.querySelector('[data-i]')) Object.assign(view.values, readForm(w));
  }
  function renderSettings(w) {
    const v = view;
    v.schema.forEach((s) => { if (!(s.key in v.values)) v.values[s.key] = formDefault(s); });
    const rows = v.schema.map((s, i) => '<div class="row"><div class="t"><div class="n">' + esc(s.label) + '</div>' + (s.description ? '<div class="d">' + esc(s.description) + '</div>' : '') + '</div>' + control(s, i, v.values[s.key]) + '</div>').join('');
    w.innerHTML = '<div class="box"><h2>' + esc(v.name) + '</h2><div class="sub">Plugin settings</div><h3>Settings</h3>' + rows
      + '<div class="btns"><button id="sv" class="pri">Save</button><button id="rs">Reset to defaults</button><button id="bk">Back</button><span class="hint">' + esc(hint) + '</span></div></div>';
    w.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', () => {
      const out = w.querySelector('[data-v="' + el.dataset.i + '"]'); if (out) out.textContent = el.value;
    }));
    w.querySelector('#sv').onclick = async () => {
      const values = readForm(w); Object.assign(v.values, values);
      try {
        await SP.call('saveSettings', { file: v.file, values });
        hint = 'Saved';
        const cb = listeners[v.file];
        if (cb) { try { cb({ ...values }); } catch (e) { console.error('[' + v.file + '] onSettingsSaved failed', e); log('error', v.file + ': onSettingsSaved failed: ' + (e && e.message || e)); } }
      } catch (e) { hint = 'Error: ' + e.message; }
      if (view === v) renderPanel();
    };
    w.querySelector('#rs').onclick = () => {
      v.schema.forEach((s) => { v.values[s.key] = formDefault(s); });
      hint = 'Defaults restored (not saved yet)'; renderPanel();
    };
    w.querySelector('#bk').onclick = () => { view = null; hint = ''; renderPanel(); refreshStatus(); };
  }

  function renderPanel() {
    if (!root) return;
    const w = root.getElementById('wrap'); w.classList.toggle('open', open);
    if (!open) return;
    if (view) renderSettings(w); else renderList(w);
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dlgCur) { e.preventDefault(); e.stopPropagation(); finishDialog(-1); return; }
    if (e.key === 'F5' || (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); SP.reload(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); setOpen(!open); }
    else if (e.key === 'Escape' && open) { if (view) { view = null; hint = ''; renderPanel(); } else setOpen(false); }
  }, true);

  /* ---------- sidebar entry ---------- */
  const NAV_ICON = '<path fill="currentColor" fill-rule="evenodd" d="M256 48C141.1 48 48 141.1 48 256s93.1 208 208 208 208-93.1 208-208S370.9 48 256 48zM240 160h32v80h80v32h-80v80h-32v-80h-80v-32h80z"/>';
  function addNavEntry() {
    document.querySelectorAll('nav').forEach((nav) => {
      if (nav.querySelector('[data-splus-nav]')) return;
      const tabs = Array.from(nav.children).filter((e) => e.tagName === 'A' && /nav-tab-button/.test(e.className));
      const ref = tabs.find((e) => e.getAttribute('href') === '#/settings') || tabs[tabs.length - 1];
      if (!ref) return;
      const el = ref.cloneNode(true);
      el.setAttribute('data-splus-nav', '1');
      el.classList.remove('selected');
      el.removeAttribute('href');
      el.title = 'Stremio Plus';
      el.style.cursor = 'pointer';
      const lab = el.querySelector('[class*="label"]'); if (lab) lab.textContent = 'Plus';
      const svg = el.querySelector('svg'); if (svg) svg.innerHTML = NAV_ICON;
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }, true);
      ref.insertAdjacentElement('afterend', el);
    });
  }
  let navScheduled = false;
  new MutationObserver(() => {
    if (navScheduled) return;
    navScheduled = true;
    requestAnimationFrame(() => { navScheduled = false; try { addNavEntry(); if (SP.player.active()) syncShellVideo(); } catch (e) { console.error(e); } });
  }).observe(document, { childList: true, subtree: true });

  /* ---------- go ---------- */
  const callReady = (n) => SP.call('ready', { doc: SP._docId }).catch((e) => {
    if (n < 10) setTimeout(() => callReady(n + 1), 500); else console.error('[stremio-plus] ready failed', e);
  });
  const start = () => { ensurePanel(); addNavEntry(); SP.player.reobserve(); syncShellVideo(); callReady(0); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
