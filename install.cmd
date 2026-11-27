@echo off
rem Double-click to install. Runs install.ps1 without needing to change PowerShell's execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
