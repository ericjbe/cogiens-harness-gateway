$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $RepoRoot 'deploy\m3\start-dashboard.ps1'

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Dashboard launcher not found: $Launcher"
}

Write-Host 'Cogiens M-3 Dashboard deployment entrypoint' -ForegroundColor Cyan
Write-Host "Repository: $RepoRoot"

& $Launcher -RepoRoot $RepoRoot
