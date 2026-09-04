@echo off
setlocal
set REPO=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO%deploy\m3\install-dashboard-shortcut.ps1" -RepoRoot "%REPO:~0,-1%"
if errorlevel 1 pause
endlocal
