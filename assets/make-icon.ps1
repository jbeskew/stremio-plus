# Builds assets\stremio-plus.ico: Stremio's own icon with its purple hue rotated to red.
# Reads (never modifies) the installed stremio-shell-ng.exe.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class IconX {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] phicon, uint[] piconid, uint nIcons, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
"@
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Stremio\stremio-shell-ng.exe'
$out = Join-Path $PSScriptRoot 'stremio-plus.ico'
$sizes = 256, 64, 48, 32, 16
$entries = @()
foreach ($sz in $sizes) {
  $h = New-Object IntPtr[] 1; $id = New-Object uint32[] 1
  $n = [IconX]::PrivateExtractIcons($exe, 0, $sz, $sz, $h, $id, 1, 0)
  if ($n -lt 1 -or $h[0] -eq [IntPtr]::Zero) { continue }
  $ico = [System.Drawing.Icon]::FromHandle($h[0])
  $src = $ico.ToBitmap()
  $bmp = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $sz; $y++) { for ($x = 0; $x -lt $sz; $x++) {
    $c = $src.GetPixel($x, $y)
    if ($c.A -eq 0) { $bmp.SetPixel($x, $y, $c); continue }
    $hue = $c.GetHue(); $sat = $c.GetSaturation(); $br = $c.GetBrightness()
    # rotate the purple/blue range (about 200-320 degrees) to red (0-10 degrees)
    if ($sat -gt 0.15 -and $hue -ge 200 -and $hue -le 330) { $hue = 358 + ($hue - 260) * 0.04 }
    if ($hue -lt 0) { $hue += 360 } elseif ($hue -ge 360) { $hue -= 360 }
    $q = if ($br -lt 0.5) { $br * (1 + $sat) } else { $br + $sat - $br * $sat }; $p = 2 * $br - $q
    $f = { param($t) if ($t -lt 0) { $t += 1 } if ($t -gt 1) { $t -= 1 }
           if ($t -lt 1/6) { $p + ($q - $p) * 6 * $t } elseif ($t -lt 1/2) { $q } elseif ($t -lt 2/3) { $p + ($q - $p) * (2/3 - $t) * 6 } else { $p } }
    $hh = $hue / 360
    if ($sat -eq 0) { $r = $g = $b = $br } else { $r = & $f ($hh + 1/3); $g = & $f $hh; $b = & $f ($hh - 1/3) }
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, [int]($r * 255), [int]($g * 255), [int]($b * 255)))
  } }
  $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $entries += [pscustomobject]@{ Size = $sz; Data = $ms.ToArray() }
  $ico.Dispose(); [IconX]::DestroyIcon($h[0]) | Out-Null
}
if (-not $entries.Count) { throw 'Could not extract the Stremio icon.' }
# write a PNG-compressed .ico
$fs = [System.IO.File]::Create($out); $bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
  $d = if ($e.Size -ge 256) { 0 } else { $e.Size }
  $bw.Write([byte]$d); $bw.Write([byte]$d); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$e.Data.Length); $bw.Write([uint32]$offset)
  $offset += $e.Data.Length
}
foreach ($e in $entries) { $bw.Write($e.Data) }
$bw.Close(); $fs.Close()
Write-Host "Wrote $out ($($entries.Count) sizes)"
