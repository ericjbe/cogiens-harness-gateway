@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\deploy\m3\start-dashboard.ps1" -RepoRoot "%CD%" -ForceRestart
if errorlevel 1 pause
endlocal
