# Stremio Plus: fixes the "dead" top pixel row of a maximized Stremio window on monitors whose scaling differs from the
# main display (e.g. 100% next to a 150% screen). The shell is system-DPI-aware, so Windows rounds its hidden window frame
# and leaves one row of resize border at the very top; dragging / double-clicking the title bar there does nothing.
# Windows won't let another process move a maximized window, so this nudges the mouse pointer one pixel down whenever it
# rests on that exact row over the maximized Stremio window.
# The same rounding leaves the leftmost pixel column showing a stray strip of the window border; a 1px click-through
# strip (a copy of the neighbouring column) is laid over it while Stremio is on top.
# Changes no Stremio window, file or setting. Exits when Stremio exits.
param([int]$ShellPid)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public class EF {
 [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Ri,B; }
 [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public R mon; public R work; public int f; }
 [StructLayout(LayoutKind.Sequential)] public struct PT { public int X, Y; }
 public delegate bool EP(IntPtr h, IntPtr l);
 [DllImport("user32")] static extern bool EnumWindows(EP p, IntPtr l);
 [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32")] static extern bool IsZoomed(IntPtr h);
 [DllImport("user32")] static extern int GetWindowLong(IntPtr h, int i);
 [DllImport("user32")] static extern IntPtr MonitorFromWindow(IntPtr h, int f);
 [DllImport("user32")] static extern bool GetMonitorInfo(IntPtr m, ref MI mi);
 [DllImport("user32")] static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32")] static extern bool GetCursorPos(out PT p);
 [DllImport("user32")] static extern bool SetCursorPos(int x, int y);
 [DllImport("user32")] static extern short GetAsyncKeyState(int k);
 [DllImport("user32")] static extern IntPtr WindowFromPoint(PT p);
 [DllImport("user32")] static extern IntPtr GetAncestor(IntPtr h, uint f);
 [DllImport("user32")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32", CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
 [DllImport("user32")] static extern bool DestroyWindow(IntPtr h);
 [DllImport("user32")] static extern bool ShowWindow(IntPtr h, int c);
 [DllImport("user32")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
 [DllImport("user32")] static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
 [DllImport("user32")] static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dst, ref PT pDst, ref SZ size, IntPtr src, ref PT pSrc, int key, ref BF blend, int flags);
 [DllImport("user32")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint rm);
 [DllImport("user32")] static extern IntPtr DispatchMessage(ref MSG m);
 [DllImport("gdi32")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
 [DllImport("gdi32")] static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int w, int h);
 [DllImport("gdi32")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
 [DllImport("gdi32")] static extern bool DeleteObject(IntPtr o);
 [DllImport("gdi32")] static extern bool DeleteDC(IntPtr dc);
 [DllImport("gdi32")] static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, uint rop);
 [StructLayout(LayoutKind.Sequential)] public struct SZ { public int cx, cy; }
 [StructLayout(LayoutKind.Sequential)] public struct BF { public byte Op, Flags, Alpha, Fmt; }
 [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public PT p; }
 static IntPtr strip = IntPtr.Zero; static IntPtr bmp = IntPtr.Zero; static int bmpH = 0; static bool stripShown = false; static int stripX = 0, stripY = 0;
 static bool TopIs(int x, int y) { PT q; q.X = x; q.Y = y; return GetAncestor(WindowFromPoint(q), 2) == hwnd; }
 static void HideStrip() { if (strip != IntPtr.Zero && stripShown) { ShowWindow(strip, 0); stripShown = false; } }
 // copies the pixel column right of the stray one onto a click-through topmost strip over it
 static void UpdateStrip() {
  int x = work.L, y = work.T, h = work.B - work.T;
  if (h <= 0 || !TopIs(x + 1, y + 40) || !TopIs(x + 1, y + h / 2) || !TopIs(x + 1, work.B - 40)) { HideStrip(); return; }
  if (strip == IntPtr.Zero) {
   // WS_EX_LAYERED | TRANSPARENT | TOPMOST | NOACTIVATE | TOOLWINDOW on the stock "Static" class; WS_POPUP
   strip = CreateWindowEx(0x80000 | 0x20 | 0x8 | 0x8000000 | 0x80, "Static", "", 0x80000000, x, y, 1, h, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
   if (strip == IntPtr.Zero) return;
  }
  IntPtr sdc = GetDC(IntPtr.Zero); IntPtr mdc = CreateCompatibleDC(sdc);
  if (bmp == IntPtr.Zero || bmpH != h) { if (bmp != IntPtr.Zero) DeleteObject(bmp); bmp = CreateCompatibleBitmap(sdc, 1, h); bmpH = h; }
  IntPtr old = SelectObject(mdc, bmp);
  BitBlt(mdc, 0, 0, 1, h, sdc, x + 1, y, 0x00CC0020);
  PT dst; dst.X = x; dst.Y = y; SZ sz; sz.cx = 1; sz.cy = h; PT src; src.X = 0; src.Y = 0; BF bf = new BF(); bf.Op = 0; bf.Alpha = 255; bf.Fmt = 0;
  UpdateLayeredWindow(strip, sdc, ref dst, ref sz, mdc, ref src, 0, ref bf, 2);
  SelectObject(mdc, old); DeleteDC(mdc); ReleaseDC(IntPtr.Zero, sdc);
  if (!stripShown || stripX != x || stripY != y) { SetWindowPos(strip, (IntPtr)(-1), x, y, 1, h, 0x0010 | 0x0040); stripShown = true; stripX = x; stripY = y; }
 }
 public static void Pump() { MSG m; while (strip != IntPtr.Zero && PeekMessage(out m, IntPtr.Zero, 0, 0, 1)) DispatchMessage(ref m); }
 public static void Cleanup() { if (strip != IntPtr.Zero) { DestroyWindow(strip); strip = IntPtr.Zero; } }
 static int frame = 0;
 [DllImport("shcore")] static extern int GetDpiForMonitor(IntPtr m, int t, out uint x, out uint y);
 static IntPtr hwnd; static bool active; static R work; static DateTime scanned = DateTime.MinValue;
 static IntPtr FindMain(uint pid) {
  IntPtr found = IntPtr.Zero;
  EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h) && (GetWindowLong(h, -16) & 0x00C00000) != 0) { found = h; return false; } return true; }, IntPtr.Zero);
  return found;
 }
 static void Scan(uint pid) {
  active = false; hwnd = FindMain(pid); if (hwnd == IntPtr.Zero || !IsZoomed(hwnd)) return;
  IntPtr m = MonitorFromWindow(hwnd, 2); uint mx, my; if (GetDpiForMonitor(m, 0, out mx, out my) != 0) return;
  uint wd = GetDpiForWindow(hwnd); if (wd == 0 || wd == mx) return;     // same scaling: Windows already gets it right
  var mi = new MI(); mi.cb = 40; if (!GetMonitorInfo(m, ref mi)) return;
  work = mi.work; active = true;
 }
 // one poll step; returns true while the fix is armed (caller polls fast), false when idle
 public static bool Tick(uint pid) {
  if ((DateTime.UtcNow - scanned).TotalMilliseconds > 250) { scanned = DateTime.UtcNow; Scan(pid); }
  if (!active) { HideStrip(); return false; }
  if ((frame++ & 3) == 0) UpdateStrip();
  PT p; if (!GetCursorPos(out p)) return true;
  if (p.Y == work.T && p.X >= work.L && p.X < work.Ri && (GetAsyncKeyState(1) & 0x8000) == 0 && (GetAsyncKeyState(2) & 0x8000) == 0) {
   if (GetAncestor(WindowFromPoint(p), 2) == hwnd) SetCursorPos(p.X, work.T + 1);
  }
  return true;
 }
}
'@
[void][EF]::SetProcessDpiAwarenessContext([IntPtr]-4)   # per-monitor v2: all coordinates are real pixels
$n = 0
while ($true) {
  if ($n++ % 100 -eq 0 -and -not (Get-Process -Id $ShellPid -ErrorAction SilentlyContinue)) { break }
  $armed = $false
  try { $armed = [EF]::Tick([uint32]$ShellPid) } catch {}
  [EF]::Pump()
  Start-Sleep -Milliseconds $(if ($armed) { 8 } else { 150 })
}
[EF]::Cleanup()
