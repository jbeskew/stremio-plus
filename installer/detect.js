'use strict';
// Detects what is installed so the installer can pick its case. Read-only. Prints JSON.
//   node detect.js            -> JSON on stdout
// Test switches (env): SPLUS_TEST_HIDE_ENHANCED=1 pretends Enhanced is absent, SPLUS_TEST_HIDE_STREMIO=1 pretends Stremio 5 is absent.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const count = (dir, suffix) => { try { return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(suffix)).length; } catch { return 0; } };

function runningImages() {
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
    return new Set(out.split(/\r?\n/).map((l) => (/^"([^"]+)"/.exec(l) || [])[1]).filter(Boolean).map((s) => s.toLowerCase()));
  } catch { return new Set(); }
}

function detect(env = process.env) {
  const local = env.LOCALAPPDATA || '', roam = env.APPDATA || '';
  const exe5 = env.STREMIO_PLUS_EXE || path.join(local, 'Programs', 'Stremio', 'stremio-shell-ng.exe');
  const exe4 = [path.join(local, 'Programs', 'LNV', 'Stremio-4', 'stremio.exe'), path.join(path.dirname(exe5), 'stremio.exe')].find(exists) || '';
  const enhData = path.join(roam, 'stremio-enhanced');
  const enhExe = path.join(local, 'Programs', 'stremio-enhanced', 'Stremio Enhanced.exe');
  const hideE = env.SPLUS_TEST_HIDE_ENHANCED === '1', hideS = env.SPLUS_TEST_HIDE_STREMIO === '1';

  const stremio5 = { found: !hideS && exists(exe5), exe: exe5 };
  const stremio4 = { found: !!exe4, exe: exe4 };
  const pluginCount = count(path.join(enhData, 'plugins'), '.plugin.js');
  const themeCount = count(path.join(enhData, 'themes'), '.theme.css');
  const enhanced = {
    found: !hideE && (exists(enhExe) || pluginCount + themeCount > 0 || exists(path.join(enhData, 'plugins'))),
    exe: enhExe, dataDir: enhData, pluginCount, themeCount,
  };
  const run = runningImages();
  const running = ['stremio-shell-ng.exe', 'stremio.exe', 'stremio enhanced.exe'].filter((n) => run.has(n));

  const importable = enhanced.found && pluginCount + themeCount > 0;
  // case 1: no Stremio 5 (install it); case 2: Stremio 5 only; case 3: Stremio 5 + Enhanced with something to import
  const kase = !stremio5.found ? 1 : importable ? 3 : 2;
  return { case: kase, needsStremio: !stremio5.found, importEnhanced: importable, stremio5, stremio4, enhanced, running };
}

module.exports = { detect };
if (require.main === module) process.stdout.write(JSON.stringify(detect(), null, 2) + '\n');
