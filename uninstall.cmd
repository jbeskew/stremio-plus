@echo off
rem Double-click to remove the Stremio Plus shortcuts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
