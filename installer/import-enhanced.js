'use strict';
// Copies a Stremio Enhanced user's plugins and themes into the Stremio Plus data folder. Never modifies or moves the source.
//   node import-enhanced.js --src "%APPDATA%\stremio-enhanced" --dest "%APPDATA%\StremioPlus" [--dry-run]
// Prints a JSON summary; writes <dest>\import-report.txt and merges <dest>\config.json (enabled flags, theme, notes).
const fs = require('fs');
const path = require('path');
const man = require('../launcher/manifest.js');

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };

/** Best-effort read of Enhanced's enabledPlugins / currentTheme from its Local Storage (LevelDB, read-only).
 *  Returns { enabled: Set|null, theme: string|null }; null means "could not read cleanly". */
function readEnhancedState(src) {
  const out = { enabled: null, theme: null };
  const dir = path.join(src, 'Local Storage', 'leveldb');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(ldb|log)$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t); } catch { return out; }
  const bufs = [];
  for (const { f } of files) { try { bufs.push(fs.readFileSync(path.join(dir, f)).toString('latin1')); } catch {} }
  // Only the NEWEST file holding a key counts (older files hold stale values). If that value is compressed/garbled
  // in the LevelDB block we cannot read it, so we report "unknown" instead of guessing from an old file.
  const newest = (key, re) => {
    for (const b of bufs) {
      const i = b.lastIndexOf(key);
      if (i === -1) continue;
      return re.exec(b.slice(i + key.length, i + key.length + 1500));
    }
    return null;
  };
  const e = newest('enabledPlugins', /^[^\[]{0,12}(\[(?:\s*"[^"\\\x00-\x1f]*"\s*,?)*\s*\])/);
  if (e) { try { out.enabled = new Set(JSON.parse(e[1])); } catch {} }
  const t = newest('currentTheme', /^[^"]{0,12}"([^"\\\x00-\x1f]+\.theme\.css)"/);
  if (t) out.theme = t[1];
  return out;
}

function importEnhanced({ src, dest, dryRun = false }) {
  const rep = { src, dest, dryRun, plugins: [], themes: [], notes: [], stateRead: false };
  const srcPlugins = path.join(src, 'plugins'), srcThemes = path.join(src, 'themes');
  const dstPlugins = path.join(dest, 'plugins'), dstThemes = path.join(dest, 'themes');
  if (!dryRun) for (const d of [dstPlugins, dstThemes]) fs.mkdirSync(d, { recursive: true });

  const state = readEnhancedState(src);
  rep.stateRead = state.enabled !== null;
  if (state.enabled === null) rep.notes.push('Could not read which plugins were enabled in Stremio Enhanced; imported all plugins as enabled except those that need real video frames.');

  const cfgPath = path.join(dest, 'config.json');
  const cfg = readJson(cfgPath, {});
  cfg.plugins = cfg.plugins || {}; cfg.notes = cfg.notes || {}; cfg.theme = cfg.theme || '';

  const list = (dir, suffix) => { try { return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(suffix)).sort(); } catch { return []; } };

  /** Pick a destination name: same name; identical file = already there; different file = "-enhanced" suffix; never overwrite. */
  const target = (dir, file, suffix, srcFile) => {
    let name = file;
    if (fs.existsSync(path.join(dir, name))) {
      if (same(srcFile, path.join(dir, name))) return { name, skip: true };
      const base = file.slice(0, -suffix.length);
      name = base + '-enhanced' + suffix;
      for (let n = 2; fs.existsSync(path.join(dir, name)) && !same(srcFile, path.join(dir, name)); n++) name = base + '-enhanced' + n + suffix;
      if (fs.existsSync(path.join(dir, name))) return { name, skip: true };
    }
    return { name, skip: false };
  };

  for (const file of list(srcPlugins, '.plugin.js')) {
    const from = path.join(srcPlugins, file);
    const text = readText(from) || '';
    const frames = man.detectFrameApis(text);
    const t = target(dstPlugins, file, '.plugin.js', from);
    const wasEnabled = state.enabled ? state.enabled.has(file) : true;
    const enable = wasEnabled && frames.length === 0;
    const why = [];
    if (!wasEnabled) why.push('it was switched off in Stremio Enhanced');
    if (frames.length) why.push('it needs real video frames (' + frames.join(', ') + '), which Stremio\'s player cannot provide');
    const item = { file, as: t.name, skipped: t.skip, enabled: enable, switchedOffBecause: why };
    rep.plugins.push(item);
    if (t.skip) continue;
    if (!dryRun) {
      fs.copyFileSync(from, path.join(dstPlugins, t.name));
      // plugin settings: <name>.plugin.json next to the plugin (same format in both apps); never overwrite existing settings
      const sFrom = path.join(srcPlugins, file.replace(/\.js$/i, '') + '.json');
      const sTo = path.join(dstPlugins, t.name.replace(/\.js$/i, '') + '.json');
      if (fs.existsSync(sFrom) && !fs.existsSync(sTo)) fs.copyFileSync(sFrom, sTo);
      cfg.plugins[t.name] = enable;
      cfg.notes[t.name] = 'Imported from Stremio Enhanced' + (why.length ? '; switched off because ' + why.join(' and ') : '');
    }
  }

  for (const file of list(srcThemes, '.theme.css')) {
    const from = path.join(srcThemes, file);
    const t = target(dstThemes, file, '.theme.css', from);
    rep.themes.push({ file, as: t.name, skipped: t.skip, active: state.theme === file });
    if (t.skip) continue;
    if (!dryRun) {
      fs.copyFileSync(from, path.join(dstThemes, t.name));
      if (state.theme === file && !cfg.theme) cfg.theme = t.name;
    }
  }

  if (!dryRun) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const lines = ['Stremio Plus: import from Stremio Enhanced', 'Source (left untouched): ' + src, 'Destination: ' + dest, ''];
  lines.push('Plugins:');
  for (const p of rep.plugins) lines.push('  ' + (p.skipped ? '[already there] ' : p.enabled ? '[on]  ' : '[off] ') + p.file + (p.as !== p.file ? ' -> ' + p.as : '') + (p.switchedOffBecause.length ? '  (off: ' + p.switchedOffBecause.join('; ') + ')' : ''));
  if (!rep.plugins.length) lines.push('  (none)');
  lines.push('Themes:');
  for (const t of rep.themes) lines.push('  ' + (t.skipped ? '[already there] ' : '') + t.file + (t.as !== t.file ? ' -> ' + t.as : '') + (t.active ? '  (active)' : ''));
  if (!rep.themes.length) lines.push('  (none)');
  if (rep.notes.length) { lines.push(''); rep.notes.forEach((n) => lines.push('Note: ' + n)); }
  lines.push('', 'Plugins that are off can be turned on in the Stremio Plus panel (Ctrl+Shift+P). Your Stremio account, add-ons and history need no import.');
  rep.report = lines.join('\r\n') + '\r\n';
  if (!dryRun) fs.writeFileSync(path.join(dest, 'import-report.txt'), rep.report);
  return rep;
}

module.exports = { importEnhanced, readEnhancedState };

if (require.main === module) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const src = get('--src'), dest = get('--dest');
  if (!src || !dest) { console.error('usage: node import-enhanced.js --src <enhanced data dir> --dest <stremio plus data dir> [--dry-run]'); process.exit(2); }
  const r = importEnhanced({ src, dest, dryRun: a.includes('--dry-run') });
  process.stdout.write(JSON.stringify({ ...r, report: undefined }, null, 2) + '\n');
}
