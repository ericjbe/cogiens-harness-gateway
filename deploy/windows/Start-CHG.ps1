[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Var = Join-Path $Root "var"
$Logs = Join-Path $Var "logs"
$PidFile = Join-Path $Var "gateway.pid"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

if (Test-Path $PidFile) {
    $ExistingPid = (Get-Content $PidFile -Raw).Trim()
    if ($ExistingPid -match "^\d+$" -and (Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue)) {
        throw "Gateway is already running with PID $ExistingPid."
    }
    Remove-Item $PidFile -Force
}

$Stdout = Join-Path $Logs "gateway.out.log"
$Stderr = Join-Path $Logs "gateway.err.log"
$Process = Start-Process -FilePath "node" `
    -ArgumentList @("apps/gateway/src/server.mjs") `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $Stdout `
    -RedirectStandardError $Stderr `
    -WindowStyle Hidden `
    -PassThru
Set-Content -Path $PidFile -Value $Process.Id -NoNewline
Start-Sleep -Milliseconds 800
if ($Process.HasExited) { throw "Gateway exited during startup. Read $Stderr" }
Write-Host "CHG started: PID $($Process.Id), http://127.0.0.1:8787"
Write-Host "Logs: $Logs"
