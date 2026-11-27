'use strict';
// Stremio Plus launcher: starts stremio-shell-ng with a localhost-only DevTools port,
// then injects plugins/themes through CDP. Never modifies Stremio's install files.
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { CDP } = require('./cdp');
const { scanPlugins, scanThemes, satisfies } = require('./manifest');

const ROOT = path.resolve(__dirname, '..');
// DATA holds the user's own files (plugins/, themes/, config.json, logs/, .state/). Default: next to the program,
// so a git checkout works as before; the installer sets STREMIO_PLUS_DATA to %APPDATA%\StremioPlus so program updates never touch it.
const DATA = path.resolve(process.env.STREMIO_PLUS_DATA || ROOT);
// STREMIO_PLUS_EXE overrides the default install location of Stremio's desktop shell.
const EXE = process.env.STREMIO_PLUS_EXE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Stremio', 'stremio-shell-ng.exe');
const CONFIG = path.join(DATA, 'config.json');
const STATE_DIR = path.join(DATA, '.state');
const SESSION = path.join(STATE_DIR, 'session.json');
const LOG_FILE = path.join(DATA, 'logs', 'launcher.log');
const BOOTSTRAP = fs.readFileSync(path.join(__dirname, 'bootstrap.js'), 'utf8');
const WEB_RE = /^https:\/\/web\.stremio\.com\//;

fs.mkdirSync(STATE_DIR, { recursive: true });
for (const d of ['plugins', 'themes']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
try { if (fs.statSync(LOG_FILE).size > 1024 * 1024) fs.writeFileSync(LOG_FILE, ''); } catch {}
const log = (...a) => {
  const line = new Date().toISOString() + ' ' + a.join(' ');
  if (process.stdout.isTTY) console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- helpers ---------- */
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function writeJsonAtomic(f, obj) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
// notes: { '<plugin file>': 'text shown on its panel row' } (e.g. written by the installer's Enhanced import). Unknown keys are kept.
const loadConfig = () => { const c = readJson(CONFIG, {}); return { ...c, plugins: c.plugins || {}, theme: c.theme || '', notes: c.notes || {} }; };
const saveConfig = (c) => writeJsonAtomic(CONFIG, c);
const pluginEnabled = (cfg, file) => cfg.plugins[file] !== false; // new plugins default to enabled

// plugins/themes are scanned once per page load ('ready'); every other op reuses the cache
let scanCache = null;
const refreshScan = () => (scanCache = { plugins: scanPlugins(DATA), themes: scanThemes(DATA) });
const getPlugins = () => (scanCache || refreshScan()).plugins;
const getThemes = () => (scanCache || refreshScan()).themes;

// per-plugin runtime status, reset on every page load: { loadMs, errors, lastError, blocked }
let status = {};
let loaded = new Set();   // plugin files whose code has run on this page
let errAt = {};
let lastDoc = null;       // id of the page document that last got its plugins
const MAX_ERR_LOG = 5;    // a plugin throwing in a loop must not flood the log
const st = (file) => status[file] || (status[file] = { loadMs: null, errors: 0, lastError: '', blocked: '' });
function recordError(file, msg) {
  const s = st(file), now = Date.now();
  if (s.lastError === msg.slice(0, 300) && now - (errAt[file] || 0) < 100) return; // same error reported twice
  errAt[file] = now; s.errors++; s.lastError = msg.slice(0, 300);
  if (s.errors <= MAX_ERR_LOG) log('ERROR plugin', file, s.lastError);
  else if (s.errors === MAX_ERR_LOG + 1) log('WARN plugin', file, 'more errors suppressed');
}
/** Plugin whose code appears in the exception's location or stack (our //# sourceURL tags it), or null. */
function pluginOfException(d) {
  const hay = [d.url || '', (d.exception && d.exception.description) || ''];
  for (let t = d.stackTrace; t; t = t.parent) for (const fr of t.callFrames || []) hay.push(fr.url || '');
  const h = hay.join('\n');
  const p = getPlugins().find((x) => h.includes('stremio-plus/' + x.file));
  return p ? p.file : null;
}
const exceptionMessage = (d) => {
  const e = d.exception;
  const m = (e && (e.description || (e.value != null && String(e.value)))) || d.text || 'error';
  return String(m).split('\n')[0];
};
/** Enabled plugins in dependency order. Plugins with a missing/disabled/blocked requirement or a cycle are marked blocked. */
function planLoad(cfg, plugins) {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const state = new Map(), order = [];
  const visit = (p) => {
    const cur = state.get(p.file);
    if (cur) return cur;
    state.set(p.file, 'visiting');
    let reason = '';
    for (const rq of p.requires) {
      const dep = byName.get(rq.name);
      if (!dep) { reason = 'needs ' + rq.name + ' (not installed)'; break; }
      if (!pluginEnabled(cfg, dep.file)) { reason = 'needs ' + rq.name + ' (disabled)'; break; }
      const ds = visit(dep);
      if (ds !== 'ok') { reason = ds === 'visiting' ? 'dependency cycle with ' + rq.name : 'needs ' + rq.name + ' (blocked)'; break; }
      if (!satisfies(dep.version, rq.op, rq.version)) log('WARN plugin', p.file, 'wants', rq.name, rq.op, rq.version, 'but', dep.version || '(no version)', 'is installed');
    }
    if (reason) { st(p.file).blocked = reason; state.set(p.file, 'blocked'); log('plugin blocked:', p.file, '-', reason); }
    else { state.set(p.file, 'ok'); order.push(p); }
    return state.get(p.file);
  };
  for (const p of plugins) if (pluginEnabled(cfg, p.file)) visit(p);
  return order;
}

function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function findShell() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq stremio-shell-ng.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
    const m = /"stremio-shell-ng\.exe","(\d+)"/i.exec(out);
    return m ? +m[1] : 0;
  } catch { return 0; }
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2000 }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// The message goes through an environment variable so it is never parsed as PowerShell code.
function ask(message) {
  const ps = "Add-Type -AssemblyName System.Windows.Forms; [int][System.Windows.Forms.MessageBox]::Show($env:SPLUS_MSG,'Stremio Plus','YesNo','Question')";
  try { return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, env: { ...process.env, SPLUS_MSG: message } }).trim() === '6'; } catch { return false; }
}
function notify(message) {
  const ps = "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:SPLUS_MSG,'Stremio Plus')";
  try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, env: { ...process.env, SPLUS_MSG: message } }); } catch {}
}
function killTree(pid) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {} }
/** True if the port listens on loopback only. */
function loopbackOnly(port) {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
    const lines = out.split(/\r?\n/).filter((l) => /LISTENING/.test(l) && new RegExp('[:\\]]' + port + '\\s').test(l));
    if (!lines.length) return null;
    return lines.every((l) => /^\s*TCP\s+127\.0\.0\.1:/.test(l) || /^\s*TCP\s+\[::1\]:/.test(l));
  } catch { return null; }
}

/* ---------- plugin / theme injection ---------- */
function themeCss(cfg, themes) {
  const t = themes.find((x) => x.file === cfg.theme);
  return t ? t.text : '';
}
function wrapPlugin(p) {
  const f = JSON.stringify(p.file);
  return 'StremioPlus._mark(' + f + ');\n(function(StremioEnhancedAPI){' + p.text + '\n})(StremioPlus.apiFor(' + f + '));\n//# sourceURL=stremio-plus/' + p.file;
}
/** Settings file for a plugin; the name must match a real plugin (the page is not trusted). */
function settingsFile(file) {
  if (typeof file !== 'string' || !getPlugins().some((p) => p.file === file)) throw new Error('unknown plugin');
  const dir = path.join(DATA, 'plugins');
  const full = path.resolve(dir, file.replace(/\.js$/i, '') + '.json');
  if (!full.startsWith(dir + path.sep)) throw new Error('bad path');
  return full;
}
function checkKey(key) {
  if (typeof key !== 'string' || !key || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('bad key');
  return key;
}

async function runPlugin(cdp, p) {
  const s = st(p.file);
  s.blocked = '';
  const t0 = Date.now();
  let r;
  try { r = await cdp.call('Runtime.evaluate', { expression: wrapPlugin(p), returnByValue: false }); }
  catch (e) { recordError(p.file, String((e && e.message) || e)); return false; }
  s.loadMs = Date.now() - t0;
  if (r.exceptionDetails) { recordError(p.file, exceptionMessage(r.exceptionDetails)); return false; }
  loaded.add(p.file);
  log('plugin loaded:', p.file, '(' + s.loadMs + ' ms)');
  return true;
}

/* ---------- RPC from the page ---------- */
async function handleOp(cdp, op, data) {
  switch (op) {
    case 'ready': {
      // Once per document: the page asks (with retries) and the launcher steps in after load if it never did.
      if (data.doc) { if (data.doc === lastDoc) return true; lastDoc = data.doc; }
      const cfg = loadConfig();
      refreshScan();
      const plugins = getPlugins(), themes = getThemes();
      status = {}; loaded = new Set(); errAt = {};
      const order = planLoad(cfg, plugins);
      if (cfg.theme && !themes.some((t) => t.file === cfg.theme)) { cfg.theme = ''; saveConfig(cfg); }
      const payload = {
        plugins: plugins.map((p) => ({ file: p.file, name: p.name, description: p.description, version: p.version, author: p.author, enabled: pluginEnabled(cfg, p.file), settings: p.settings, note: cfg.notes[p.file] || '', frames: p.needsFrames, requires: p.requires, permissions: p.permissions, status: status[p.file] || null })),
        themes: themes.map((t) => ({ file: t.file, name: t.name, description: t.description, version: t.version, author: t.author })),
        theme: cfg.theme,
        css: themeCss(cfg, themes),
      };
      await cdp.call('Runtime.evaluate', { expression: 'StremioPlus._load(' + JSON.stringify(payload) + ')' });
      log('page ready: ' + plugins.length + ' plugin(s), ' + themes.length + ' theme(s)');
      for (const p of order) await runPlugin(cdp, p);
      return true;
    }
    case 'getSetting': {
      const j = readJson(settingsFile(data.file), {}); const key = checkKey(data.key);
      return Object.prototype.hasOwnProperty.call(j, key) ? j[key] : null;
    }
    case 'saveSetting': {
      const f = settingsFile(data.file); const key = checkKey(data.key);
      const j = readJson(f, {}); j[key] = data.value; writeJsonAtomic(f, j);
      return true;
    }
    case 'getSettings': {
      const j = readJson(settingsFile(data.file), {});
      if (!Array.isArray(data.keys)) return j;
      const out = {};
      for (const k of data.keys) { checkKey(k); if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = j[k]; }
      return out;
    }
    case 'saveSettings': {
      const f = settingsFile(data.file), v = data.values;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad values');
      const keys = Object.keys(v);
      for (const k of keys) {
        checkKey(k);
        if (v[k] !== null && !['string', 'number', 'boolean'].includes(typeof v[k])) throw new Error('bad value for ' + k);
      }
      const j = readJson(f, {});
      for (const k of keys) j[k] = v[k];
      writeJsonAtomic(f, j);
      return true;
    }
    case 'pluginStatus':
      return status;
    case 'setPlugin': {
      const p = getPlugins().find((x) => x.file === data.file);
      if (!p) throw new Error('unknown plugin');
      const cfg = loadConfig();
      if (data.enabled) {
        const all = getPlugins();
        const missing = p.requires.filter((rq) => { const dep = all.find((x) => x.name === rq.name); return !dep || !loaded.has(dep.file); });
        if (missing.length) throw new Error('needs ' + missing.map((m) => m.name).join(', ') + ' enabled first');
        cfg.plugins[p.file] = true; saveConfig(cfg);
        await runPlugin(cdp, p);
      } else { cfg.plugins[p.file] = false; saveConfig(cfg); log('plugin disabled:', p.file); }
      return true;
    }
    case 'setTheme': {
      const themes = getThemes();
      const t = themes.find((x) => x.file === data.file);
      if (data.file && !t) throw new Error('unknown theme');
      const cfg = loadConfig(); cfg.theme = t ? t.file : ''; saveConfig(cfg);
      return t ? t.text : '';
    }
    case 'reload':
      // Reload the page from the launcher side; the new document re-reads plugins/ and themes/ from disk.
      log('page reload requested');
      setTimeout(() => cdp.call('Page.reload', {}).catch((e) => log('WARN reload failed:', String(e.message || e))), 50);
      return true;
    case 'openFolder':
      spawn('explorer.exe', [DATA], { detached: true, stdio: 'ignore' }).unref();
      return true;
    case 'log':
      log('page ' + String(data.level || 'info').replace(/[^a-z]/gi, '') + ':', String(data.msg || '').replace(/[\r\n]+/g, ' ').slice(0, 500));
      return true;
    default:
      throw new Error('unknown op ' + op);
  }
}

/* ---------- CDP session ---------- */
async function session(port, target) {
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  const closed = new Promise((r) => cdp.on('close', r));
  // Only accept RPC from the top frame's main world on https://web.stremio.com.
  const contexts = new Map();
  let topFrameId = null;
  cdp.on('Runtime.executionContextCreated', (p) => { contexts.set(p.context.id, p.context); });
  cdp.on('Runtime.executionContextDestroyed', (p) => { contexts.delete(p.executionContextId); });
  cdp.on('Runtime.executionContextsCleared', () => { contexts.clear(); });
  cdp.on('Runtime.bindingCalled', async (p) => {
    if (p.name !== '__splusBind') return;
    const ctx = contexts.get(p.executionContextId);
    if (!ctx || !topFrameId || !ctx.auxData || ctx.auxData.frameId !== topFrameId || ctx.auxData.isDefault !== true || ctx.origin !== 'https://web.stremio.com') {
      log('WARN rejected RPC from untrusted context');
      return;
    }
    let msg; try { msg = JSON.parse(p.payload); } catch { return; }
    msg.id = Number(msg.id);
    if (!Number.isSafeInteger(msg.id) || typeof msg.op !== 'string') return;
    let ok = true, val;
    try { val = await handleOp(cdp, msg.op, msg.data || {}); } catch (e) { ok = false; val = String(e.message || e); log('ERROR op', msg.op, val); }
    try { await cdp.call('Runtime.evaluate', { expression: 'StremioPlus._reply(' + msg.id + ',' + ok + ',' + JSON.stringify(val === undefined ? null : val) + ')' }); } catch {}
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    try {
      const d = p && p.exceptionDetails; if (!d) return;
      const file = pluginOfException(d);
      if (file) recordError(file, exceptionMessage(d));
    } catch {}
  });
  // Safety net for reloads: if the new document never sent 'ready', send it from here.
  let kicking = false;
  const kick = async () => {
    if (kicking) return;
    kicking = true;
    try {
      for (let i = 0; i < 20; i++) {
        let r; try { r = await cdp.call('Runtime.evaluate', { expression: 'window.StremioPlus && StremioPlus._docId', returnByValue: true }); } catch { return; }
        const doc = r && r.result && r.result.value;
        if (doc) { if (doc !== lastDoc) { log('page did not send ready; initiating'); await handleOp(cdp, 'ready', { doc }); } return; }
        await sleep(500);
      }
    } finally { kicking = false; }
  };
  cdp.on('Page.loadEventFired', () => { setTimeout(kick, 1000); });
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  topFrameId = (await cdp.call('Page.getFrameTree')).frameTree.frame.id;
  await cdp.call('Page.setBypassCSP', { enabled: true });
  await cdp.call('Runtime.addBinding', { name: '__splusBind' });
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: BOOTSTRAP });
  await cdp.call('Runtime.evaluate', { expression: BOOTSTRAP }); // current document (late attach)
  log('attached to', target.url.slice(0, 60));
  await closed;
  log('CDP session closed');
}

async function attachLoop(port, shellAlive) {
  while (shellAlive()) {
    try {
      const targets = await getJson('http://127.0.0.1:' + port + '/json');
      const page = targets.find((t) => t.type === 'page' && WEB_RE.test(t.url));
      if (page) await session(port, page);
    } catch (e) { /* not up yet or dropped */ }
    await sleep(700);
  }
}

/* ---------- single launcher lock ---------- */
const LOCK = path.join(STATE_DIR, 'lock');
function acquireLock() {
  for (let i = 0; i < 3; i++) {
    try { const fd = fs.openSync(LOCK, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); return true; }
    catch (e) {
      if (e.code !== 'EEXIST') return false;
      let pid = 0; try { pid = parseInt(fs.readFileSync(LOCK, 'utf8'), 10); } catch {}
      if (pid && pid !== process.pid && pidAlive(pid)) return false;
      try { fs.unlinkSync(LOCK); } catch {}
    }
  }
  return false;
}
function releaseLock() { try { if (parseInt(fs.readFileSync(LOCK, 'utf8'), 10) === process.pid) fs.unlinkSync(LOCK); } catch {} }

/* ---------- main ---------- */
async function main() {
  if (!fs.existsSync(EXE)) { notify('Stremio was not found at:\n' + EXE); return process.exit(1); }
  if (!acquireLock()) { log('another launcher is already running; exiting'); return process.exit(0); }
  const prev = readJson(SESSION, null);

  let shellPid = findShell();
  let port = 0, child = null;

  if (shellPid) {
    // Stremio is already running. Reattach if it was ours (launcher died), else offer a restart.
    if (prev && prev.shellPid === shellPid && prev.port) {
      try { await getJson('http://127.0.0.1:' + prev.port + '/json/version'); port = prev.port; log('reattaching to running Stremio on port', port); } catch {}
    }
    if (!port) {
      if (!ask('Stremio is already running without plugin support.\n\nClose it and restart with Stremio Plus?\n(Anything playing will stop.)')) return process.exit(0);
      log('closing existing Stremio');
      killTree(shellPid); // the shell and the streaming server it started
      for (let i = 0; i < 20 && findShell(); i++) await sleep(250);
      shellPid = 0;
    }
  }

  if (!port) {
    port = await freePort();
    child = spawn(EXE, [], {
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port + ' --remote-debugging-address=127.0.0.1' },
      stdio: 'ignore',
    });
    shellPid = child.pid;
    child.on('exit', (c) => { log('Stremio exited', c); releaseLock(); process.exit(0); });
    log('started Stremio pid', shellPid, 'debug port', port, '(127.0.0.1)');
    for (let i = 0; i < 60; i++) { try { await getJson('http://127.0.0.1:' + port + '/json/version'); break; } catch { await sleep(500); } }
    const lb = loopbackOnly(port);
    if (lb !== true) {
      log('FATAL: debug port could not be confirmed loopback-only (' + (lb === false ? 'exposed' : 'unverified') + '); shutting down');
      killTree(shellPid);
      notify('Stremio Plus aborted: the debug port could not be confirmed as localhost-only.');
      releaseLock();
      return process.exit(1);
    }
    log('debug port loopback-only check: ok');
  }

  writeJsonAtomic(SESSION, { launcherPid: process.pid, shellPid, port });
  const alive = child ? (() => child.exitCode === null && !child.killed) : (() => findShell() === shellPid);
  const cleanup = () => { try { const s = readJson(SESSION, {}); if (s.launcherPid === process.pid) fs.unlinkSync(SESSION); } catch {} };
  if (!child) setInterval(() => { if (!alive()) { log('Stremio exited'); cleanup(); process.exit(0); } }, 2000);
  process.on('exit', () => { cleanup(); releaseLock(); });

  await attachLoop(port, alive);
}

main().catch((e) => { log('FATAL', e && e.stack || e); process.exit(1); });
