# Removes the "Stremio Plus" shortcuts. Stremio itself was never modified, so nothing else needs undoing.
$names = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stremio Plus.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Stremio Plus.lnk')
)
foreach ($n in $names) { if (Test-Path $n) { Remove-Item $n -Force; Write-Host "Removed $n" } }
Write-Host 'Done. Launch Stremio from its own shortcut: it runs exactly as before, with no plugins and no debug port. You may delete this folder.'
