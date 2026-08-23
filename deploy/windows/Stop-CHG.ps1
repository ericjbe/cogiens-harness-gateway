[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PidFile = Join-Path $Root "var\gateway.pid"
if (-not (Test-Path $PidFile)) { Write-Host "CHG is not running (PID file absent)."; exit 0 }
$GatewayPid = (Get-Content $PidFile -Raw).Trim()
if ($GatewayPid -notmatch "^\d+$") { throw "Invalid gateway PID file." }
if (Get-Process -Id ([int]$GatewayPid) -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $GatewayPid /T /F | Out-Null
}
Remove-Item $PidFile -Force
Write-Host "CHG stopped."
