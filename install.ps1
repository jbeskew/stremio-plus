# Stremio Plus installer: checks the requirements, then creates "Stremio Plus" shortcuts (Desktop + Start Menu)
# that run the launcher instead of plain Stremio. It does not touch Stremio's files, shortcuts, login or add-ons.
# Safe to run again (it just rewrites the shortcuts, e.g. after moving this folder).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Fail($msg) { Write-Host ''; Write-Host "PROBLEM: $msg" -ForegroundColor Red; Write-Host ''; exit 1 }

Write-Host 'Stremio Plus installer'
Write-Host "Folder: $root"
Write-Host ''

# 1. Node.js 22 or newer (the launcher uses its built-in WebSocket client; there are no npm packages to install)
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js was not found. Install it with:  winget install OpenJS.NodeJS.LTS   (or from https://nodejs.org), then open a NEW terminal and run this again." }
$ver = (& node --version).TrimStart('v')
$major = [int]($ver.Split('.')[0])
if ($major -lt 22) { Fail "Node.js $ver is too old; version 22 or newer is needed. Update it with:  winget upgrade OpenJS.NodeJS.LTS" }
Write-Host "[ok] Node.js $ver"

# 2. Stremio desktop (the version 5 app, stremio-shell-ng.exe)
$exe = if ($env:STREMIO_PLUS_EXE) { $env:STREMIO_PLUS_EXE } else { Join-Path $env:LOCALAPPDATA 'Programs\Stremio\stremio-shell-ng.exe' }
if (-not (Test-Path $exe)) {
  $old = Join-Path (Split-Path $exe) 'stremio.exe'
  if (Test-Path $old) { Fail "Found the older Stremio 4 app (stremio.exe) but Stremio Plus needs the current Stremio 5 app (stremio-shell-ng.exe). Install the latest Stremio from https://www.stremio.com/downloads and run this again." }
  Fail "Stremio was not found at $exe. Install Stremio from https://www.stremio.com/downloads and open it once, then run this again. (If it is installed somewhere else, set the STREMIO_PLUS_EXE environment variable to the full path of stremio-shell-ng.exe.)"
}
Write-Host "[ok] Stremio found: $exe"

# 3. Folders the launcher writes to
New-Item -ItemType Directory -Force (Join-Path $root 'logs'), (Join-Path $root '.state'), (Join-Path $root 'plugins'), (Join-Path $root 'themes') | Out-Null

# 4. Shortcuts
$ws = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stremio Plus.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Stremio Plus.lnk')
)
foreach ($lnk in $targets) {
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $s.Arguments = '"' + (Join-Path $root 'launcher\start-hidden.vbs') + '"'
  $s.WorkingDirectory = $root
  $s.IconLocation = (Join-Path $root 'assets\stremio-plus.ico') + ',0'
  $s.Description = 'Stremio with plugins and themes'
  $s.Save()
  Write-Host "[ok] Shortcut: $lnk"
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host '  1. Close Stremio completely (also check the system tray).'
Write-Host '  2. Start it with the "Stremio Plus" shortcut. You stay logged in, with your add-ons and watch history, as before.'
Write-Host '  3. Press Ctrl+Shift+P inside Stremio (or click "Plus" in the left sidebar) to open the Stremio Plus panel.'
Write-Host '  Plugins go in the plugins folder, themes in the themes folder. See README.md.'
