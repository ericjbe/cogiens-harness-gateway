param(
  [string]$RepoRoot = "D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway",
  [string]$ShortcutName = "Cogiens 八国联军指挥台",
  [switch]$PublicDesktop,
  [switch]$NoStartMenu
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$launcher = Join-Path $RepoRoot "deploy\m3\start-dashboard.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Dashboard launcher not found: $launcher"
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$shell = New-Object -ComObject WScript.Shell

if ($PublicDesktop) {
  $desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
} else {
  $desktop = [Environment]::GetFolderPath("Desktop")
}

if (-not (Test-Path -LiteralPath $desktop)) {
  throw "Desktop path not found: $desktop"
}

function New-CogiensShortcut([string]$TargetPath) {
  $shortcut = $shell.CreateShortcut($TargetPath)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.Description = "启动 Cogiens M-3 八 Harness 联合作战指挥台"
  $shortcut.WindowStyle = 1
  $shortcut.Save()
}

$desktopShortcut = Join-Path $desktop "$ShortcutName.lnk"
New-CogiensShortcut $desktopShortcut
Write-Host "[PASS] Desktop shortcut created:" -ForegroundColor Green
Write-Host "       $desktopShortcut" -ForegroundColor Cyan

if (-not $NoStartMenu) {
  $programs = [Environment]::GetFolderPath("Programs")
  $cogiensFolder = Join-Path $programs "Cogiens"
  New-Item -ItemType Directory -Path $cogiensFolder -Force | Out-Null
  $startMenuShortcut = Join-Path $cogiensFolder "$ShortcutName.lnk"
  New-CogiensShortcut $startMenuShortcut
  Write-Host "[PASS] Start Menu shortcut created:" -ForegroundColor Green
  Write-Host "       $startMenuShortcut" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "From now on, double-click '$ShortcutName' on the desktop." -ForegroundColor Green
