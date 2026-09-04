param(
  [string]$RepoRoot = "D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway",
  [string]$ShortcutName = "",
  [switch]$PublicDesktop,
  [switch]$NoStartMenu
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ShortcutName)) {
  $nameCodePoints = @(0x516B, 0x56FD, 0x8054, 0x519B, 0x6307, 0x6325, 0x53F0)
  $nameChars = $nameCodePoints | ForEach-Object { [char]$_ }
  $ShortcutName = "Cogiens " + (-join $nameChars)
}

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

function New-CogiensShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $shortcut = $shell.CreateShortcut($TargetPath)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.Description = "Cogiens M-3 Joint Harness Command Center"
  $shortcut.WindowStyle = 1
  $shortcut.Save()
}

$desktopShortcut = Join-Path $desktop "$ShortcutName.lnk"
New-CogiensShortcut -TargetPath $desktopShortcut
Write-Host "[PASS] Desktop shortcut created:" -ForegroundColor Green
Write-Host "       $desktopShortcut" -ForegroundColor Cyan

if (-not $NoStartMenu) {
  $programs = [Environment]::GetFolderPath("Programs")
  $cogiensFolder = Join-Path $programs "Cogiens"
  New-Item -ItemType Directory -Path $cogiensFolder -Force | Out-Null
  $startMenuShortcut = Join-Path $cogiensFolder "$ShortcutName.lnk"
  New-CogiensShortcut -TargetPath $startMenuShortcut
  Write-Host "[PASS] Start Menu shortcut created:" -ForegroundColor Green
  Write-Host "       $startMenuShortcut" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "From now on, use the Cogiens desktop shortcut." -ForegroundColor Green
