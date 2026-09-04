param(
  [string]$RepoRoot = "D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway",
  [int]$Port = 8787,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  throw "Harness Gateway repository not found: $RepoRoot"
}

$DashboardUrl = "http://127.0.0.1:$Port/dashboard/"
$HealthUrl = "http://127.0.0.1:$Port/health"

function Test-Gateway {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Gateway)) {
  $npm = Get-Command npm -ErrorAction Stop
  $command = @"
`$env:CHG_HOST='127.0.0.1'
`$env:CHG_PORT='$Port'
Set-Location -LiteralPath '$RepoRoot'
npm run gateway
"@

  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $command
  ) -WorkingDirectory $RepoRoot | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-Gateway) { $ready = $true; break }
  }
  if (-not $ready) {
    throw "Gateway did not become healthy on port $Port. Check the Gateway PowerShell window for details."
  }
}

Write-Host "Shuishu - Cogiens Workforce OS is ready:" -ForegroundColor Green
Write-Host $DashboardUrl -ForegroundColor Cyan

if (-not $NoBrowser) {
  Start-Process $DashboardUrl
}
