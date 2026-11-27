'use strict';
// Scans plugins/ and themes/ and parses their header comments. Three header styles are accepted:
//   1. Enhanced:   /** @name X  @version 1.0.0 ... */
//   2. Userscript: // ==Plugin== ... // ==/Plugin==     (lines like  // @name X)
//   3. Theme:      /* ==Theme== ... ==/Theme== */
// @setting, @require and @permission may repeat; every other tag is first-wins.
const fs = require('fs');
const path = require('path');

const REPEAT = new Set(['setting', 'require', 'permission']);
const KINDS = { toggle: 'toggle', text: 'input', input: 'input', color: 'color', range: 'range', select: 'select' };

function headerBlock(text) {
  const t = text.replace(/^﻿/, '');
  let m = /==(Plugin|Theme)==([\s\S]*?)==\/\1==/i.exec(t.slice(0, 16384));
  if (m) return m[2];
  m = /^\s*\/\*\*([\s\S]*?)\*\//.exec(t);
  return m ? m[1] : null;
}

function parseHeader(text) {
  const out = { setting: [], require: [], permission: [] };
  const block = headerBlock(text);
  if (block == null) return out;
  for (const line of block.split(/\r?\n/)) {
    const t = /^\s*(?:\/\/|\*)?\s*@(\w+)\s*(.*?)\s*$/.exec(line);
    if (!t) continue;
    const tag = t[1].toLowerCase();
    if (REPEAT.has(tag)) out[tag].push(t[2]);
    else if (!(t[1] in out)) out[t[1]] = t[2];
  }
  return out;
}

const numOr = (v, d) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? n : d; };

/** Normalize one setting (from an @setting line or registerSettings) into {key,type,label,description,defaultValue,options,min,max,step}. */
function normalizeSetting(s) {
  if (!s || typeof s.key !== 'string' || !s.key) return null;
  const type = KINDS[String(s.type || '').toLowerCase()];
  if (!type) return null;
  const o = { key: s.key, type, label: String(s.label == null ? s.key : s.label), description: String(s.description == null ? '' : s.description) };
  const d = s.defaultValue;
  const has = d !== undefined && d !== null && d !== '';
  if (type === 'toggle') o.defaultValue = has ? (typeof d === 'string' ? /^(true|1|yes|on)$/i.test(d) : !!d) : undefined;
  else if (type === 'range') {
    o.min = numOr(s.min, 0); o.max = numOr(s.max, 100); o.step = numOr(s.step, 1);
    o.defaultValue = has ? numOr(d, undefined) : undefined;
  } else if (type === 'select') {
    const opts = Array.isArray(s.options) ? s.options : [];
    o.options = opts.map((x) => (x && typeof x === 'object' ? { label: String(x.label == null ? x.value : x.label), value: x.value } : { label: String(x), value: x }));
    o.defaultValue = has ? d : undefined;
  } else o.defaultValue = has ? String(d) : undefined;
  return o;
}

/** @setting key | kind | label | default [| hint] [| min | max [| step]]   (select: field 5 = a,b,c options, field 6 = hint) */
function parseSetting(raw) {
  const f = raw.split('|').map((x) => x.trim());
  if (f.length < 3 || !f[0]) return null;
  const kind = (f[1] || '').toLowerCase();
  const s = { key: f[0], type: kind, label: f[2], defaultValue: f[3] };
  if (kind === 'select') { s.options = (f[4] || '').split(',').map((x) => x.trim()).filter(Boolean); s.description = f[5] || ''; }
  else if (kind === 'range') { s.description = f[4] || ''; s.min = f[5]; s.max = f[6]; s.step = f[7]; }
  else s.description = f[4] || '';
  return normalizeSetting(s);
}

/** "Name >= 2.0.0" or "Name" */
function parseRequire(raw) {
  const m = /^(.*?)\s*(>=|<=|==|>|<|=)\s*([\w.\-+]+)\s*$/.exec(raw.trim());
  if (m && m[1]) return { name: m[1].trim(), op: m[2] === '=' ? '==' : m[2], version: m[3] };
  return raw.trim() ? { name: raw.trim(), op: '', version: '' } : null;
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
function satisfies(version, op, wanted) {
  if (!op || !wanted) return true;
  if (!version) return false;
  const c = compareVersions(version, wanted);
  return op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : c === 0;
}

// APIs that need real decoded video frames. Stremio's mpv player draws outside the page, so these cannot work (the
// <video> stand-in in bootstrap.js only mirrors time/pause/volume). Returns the names found, e.g. ['requestPictureInPicture'].
const FRAME_APIS = [
  ['requestPictureInPicture', /requestPictureInPicture/],
  ['captureStream', /captureStream\s*\(/],
  ['canvas drawImage(video)', /drawImage\s*\(\s*[\w.]*[vV]ideo/],
  ['createImageBitmap(video)', /createImageBitmap\s*\(\s*[\w.]*[vV]ideo/],
  ['VideoFrame', /MediaStreamTrackProcessor|new\s+VideoFrame\s*\(/],
];
const detectFrameApis = (text) => FRAME_APIS.filter(([, re]) => re.test(text)).map(([n]) => n);

function scan(dir, suffix) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(suffix)).sort(); } catch {}
  return files.map((file) => {
    const full = path.join(dir, file);
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch {}
    const h = parseHeader(text);
    const seen = new Set();
    return {
      file,
      path: full,
      name: h.name || file.slice(0, -suffix.length),
      description: h.description || '',
      version: h.version || '',
      author: h.author || '',
      settings: h.setting.map(parseSetting).filter((s) => s && !seen.has(s.key) && seen.add(s.key)),
      requires: h.require.map(parseRequire).filter(Boolean),
      needsFrames: detectFrameApis(text),
      permissions: h.permission.map((x) => x.trim()).filter(Boolean),
      text,
    };
  });
}

const scanPlugins = (root) => scan(path.join(root, 'plugins'), '.plugin.js');
const scanThemes = (root) => scan(path.join(root, 'themes'), '.theme.css');
module.exports = { detectFrameApis, parseHeader, parseSetting, parseRequire, normalizeSetting, compareVersions, satisfies, scanPlugins, scanThemes };
