# Builds dist\StremioPlusSetup-<version>.exe.
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-Version 0.3.0] [-Publish]
# Needs on the BUILD PC only: Inno Setup 6.1+ (winget install JRSoftware.InnoSetup) and this PC's Node.js (its node.exe is bundled).
# Users of the installer need neither.
param(
  [string]$Version = '0.3.0',
  [switch]$Publish
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$buildDir = Join-Path $here 'build'
$nodeDir = Join-Path $buildDir 'node'
New-Item -ItemType Directory -Force $nodeDir | Out-Null

# 1. Bundle node.exe: the same Node version this PC runs, downloaded from nodejs.org and checked against its SHASUMS256.txt.
$nodeVer = (& node --version).Trim()   # e.g. v24.15.0
$zipName = "node-$nodeVer-win-x64.zip"
$nodeExe = Join-Path $nodeDir 'node.exe'
$stamp = Join-Path $nodeDir 'version.txt'
if (-not (Test-Path $nodeExe) -or -not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $nodeVer) {
  $tmp = Join-Path $buildDir 'dl'; New-Item -ItemType Directory -Force $tmp | Out-Null
  $zip = Join-Path $tmp $zipName
  Write-Host "Downloading $zipName ..."
  Invoke-WebRequest "https://nodejs.org/dist/$nodeVer/$zipName" -OutFile $zip -UseBasicParsing
  $sums = (Invoke-WebRequest "https://nodejs.org/dist/$nodeVer/SHASUMS256.txt" -UseBasicParsing).Content
  $line = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($zipName) } | Select-Object -First 1)
  if (-not $line) { throw "No checksum for $zipName in SHASUMS256.txt" }
  $want = ($line.Trim() -split '\s+')[0].ToLower()
  $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($want -ne $got) { throw "Node checksum mismatch: wanted $want, got $got" }
  Write-Host "Node checksum ok ($got)"
  $ex = Join-Path $tmp 'x'; if (Test-Path $ex) { Remove-Item $ex -Recurse -Force }
  Expand-Archive $zip -DestinationPath $ex
  Copy-Item (Join-Path $ex "node-$nodeVer-win-x64\node.exe") $nodeExe -Force
  Set-Content $stamp $nodeVer
  Remove-Item $tmp -Recurse -Force
}
Write-Host "Bundling Node $nodeVer"

# 2. Compile
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 was not found. Install it with: winget install JRSoftware.InnoSetup' }
& $iscc "/DAppVersion=$Version" (Join-Path $here 'StremioPlus.iss')
if ($LASTEXITCODE -ne 0) { throw "ISCC failed ($LASTEXITCODE)" }
$out = Join-Path $here "..\dist\StremioPlusSetup-$Version.exe"
$out = (Resolve-Path $out).Path
Write-Host ''
Write-Host "Built: $out"
Write-Host ("SHA-256: " + (Get-FileHash $out -Algorithm SHA256).Hash)

# 3. Optionally publish to the GitHub repo as a release
if ($Publish) {
  $gh = (Get-Command gh -ErrorAction SilentlyContinue)
  $ghPath = if ($gh) { $gh.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
  & $ghPath release create "v$Version" $out --title "Stremio Plus $Version" --notes "One-click installer. Download StremioPlusSetup-$Version.exe and run it (Windows SmartScreen: More info, then Run anyway)."
}
