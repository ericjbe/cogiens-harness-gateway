param(
  [string]$RepoRoot = "D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway",
  [int]$Port = 8787,
  [switch]$NoBrowser,
  [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  throw "Harness Gateway repository not found: $RepoRoot"
}

$DashboardUrl = "http://127.0.0.1:$Port/dashboard/"
$HealthUrl = "http://127.0.0.1:$Port/health"
$LogoUrl = "http://127.0.0.1:$Port/dashboard/cogiens-mark.png"
$HeaderBootstrapUrl = "https://www.cogiens.com/brand/js/cogiens-header-bootstrap.js"
$LocalConfig = Join-Path $RepoRoot "config\harnesses.local.json"
$M3Config = Join-Path $RepoRoot "config\harnesses.m3.json"
$GatewayConfig = if (Test-Path -LiteralPath $LocalConfig) { $LocalConfig } elseif (Test-Path -LiteralPath $M3Config) { $M3Config } else { $null }
$PowerShellExe = Join-Path $PSHOME "powershell.exe"
$NodeDir = "C:\Program Files\nodejs"
$NpmCandidate = Join-Path $NodeDir "npm.cmd"

function Invoke-LocalProbe {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [int]$TimeoutSec = 3
  )

  try {
    return Invoke-WebRequest `
      -Uri $Uri `
      -UseBasicParsing `
      -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } `
      -TimeoutSec $TimeoutSec
  } catch {
    return $null
  }
}

function Test-GatewaySurface {
  $health = Invoke-LocalProbe -Uri $HealthUrl -TimeoutSec 2
  if ($null -eq $health -or $health.StatusCode -ne 200) {
    return [pscustomobject]@{ Healthy = $false; BrandReady = $false; Reason = "health endpoint is unavailable" }
  }

  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $dashboard = Invoke-LocalProbe -Uri ($DashboardUrl + "?probe=" + $stamp) -TimeoutSec 3
  if ($null -eq $dashboard -or $dashboard.StatusCode -ne 200) {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "dashboard HTML is unavailable" }
  }

  $logo = Invoke-LocalProbe -Uri ($LogoUrl + "?probe=" + $stamp) -TimeoutSec 3
  if ($null -eq $logo -or $logo.StatusCode -ne 200) {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "approved Cogiens mark route is unavailable" }
  }

  $logoType = [string]$logo.Headers["Content-Type"]
  if ($logoType -notmatch "image/png") {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "approved Cogiens mark has an unexpected content type" }
  }

  $html = [string]$dashboard.Content
  if ($html.IndexOf("/dashboard/cogiens-mark.png", [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "dashboard HTML is not using the approved Cogiens PNG mark" }
  }
  if ($html.IndexOf($HeaderBootstrapUrl, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "dashboard HTML does not contain the standard Cogiens header bootstrap" }
  }

  $csp = [string]$dashboard.Headers["Content-Security-Policy"]
  if ($csp -notmatch "www\.cogiens\.com") {
    return [pscustomobject]@{ Healthy = $true; BrandReady = $false; Reason = "running Gateway CSP does not allow the standard Cogiens header" }
  }

  return [pscustomobject]@{ Healthy = $true; BrandReady = $true; Reason = "ready" }
}

function Get-ListenerProcessId {
  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $connection) { return [int]$connection.OwningProcess }
  } catch {}

  try {
    $pattern = ":" + $Port + "\s+.*LISTENING\s+(\d+)\s*$"
    $match = netstat -ano -p tcp | Select-String -Pattern $pattern | Select-Object -First 1
    if ($null -ne $match -and $match.Matches.Count -gt 0) { return [int]$match.Matches[0].Groups[1].Value }
  } catch {}
  return $null
}

function Stop-GatewayListener {
  $listenerProcessId = Get-ListenerProcessId
  if ($null -eq $listenerProcessId) { return }

  $processInfo = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $listenerProcessId) -ErrorAction SilentlyContinue
  if ($null -eq $processInfo) { throw "Unable to inspect the process listening on port $Port." }

  $processName = [string]$processInfo.Name
  $commandLine = [string]$processInfo.CommandLine
  $isGateway = $processName -match "^node(\.exe)?$" -and $commandLine -match "server\.mjs"
  if (-not $isGateway) { throw "Port $Port is owned by an unexpected process. Refusing to stop PID $listenerProcessId ($processName)." }

  Write-Host "[RESTART] Stopping stale Gateway PID $listenerProcessId..." -ForegroundColor Yellow
  Stop-Process -Id $listenerProcessId -Force -ErrorAction Stop
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($null -eq (Get-ListenerProcessId)) { return }
  }
  throw "Gateway listener on port $Port did not stop."
}

function Resolve-NpmCommand {
  $found = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -ne $found) { return $found.Source }
  if (Test-Path -LiteralPath $NpmCandidate) { return $NpmCandidate }
  throw "npm.cmd was not found. Expected it at $NpmCandidate or on PATH."
}

function Start-Gateway {
  $npmCommand = Resolve-NpmCommand
  if (-not (Test-Path -LiteralPath $PowerShellExe)) { throw "powershell.exe not found: $PowerShellExe" }

  $configCommand = if ($null -ne $GatewayConfig) {
    "`$env:CHG_CONFIG='" + $GatewayConfig.Replace("'", "''") + "'"
  } else {
    "Remove-Item Env:CHG_CONFIG -ErrorAction SilentlyContinue"
  }

  $command = @"
`$env:Path='$NodeDir;' + `$env:Path
`$env:CHG_HOST='127.0.0.1'
`$env:CHG_PORT='$Port'
$configCommand
Set-Location -LiteralPath '$RepoRoot'
& '$npmCommand' run gateway
"@
  Write-Host "[START] Starting the current Gateway code..." -ForegroundColor Yellow
  if ($null -ne $GatewayConfig) { Write-Host "[CONFIG] $GatewayConfig" -ForegroundColor Cyan }
  Start-Process -FilePath $PowerShellExe -ArgumentList @("-NoExit","-NoProfile","-ExecutionPolicy","Bypass","-Command",$command) -WorkingDirectory $RepoRoot | Out-Null

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    $surface = Test-GatewaySurface
    if ($surface.Healthy -and $surface.BrandReady) { return }
  }
  $last = Test-GatewaySurface
  throw "Gateway did not become brand-ready on port $Port. Last check: $($last.Reason)"
}

$surface = Test-GatewaySurface
if ($ForceRestart) {
  Stop-GatewayListener
  Start-Gateway
} elseif ($surface.Healthy -and -not $surface.BrandReady) {
  Write-Host "[STALE] A healthy but outdated Gateway is still running: $($surface.Reason)" -ForegroundColor Yellow
  Stop-GatewayListener
  Start-Gateway
} elseif (-not $surface.Healthy) {
  Start-Gateway
}

$final = Test-GatewaySurface
if (-not $final.Healthy -or -not $final.BrandReady) { throw "Shuishu Dashboard verification failed: $($final.Reason)" }

$remoteHeaderStatus = "UNREACHABLE"
try {
  $remoteHeader = Invoke-WebRequest -Uri $HeaderBootstrapUrl -UseBasicParsing -TimeoutSec 8
  if ($remoteHeader.StatusCode -eq 200) { $remoteHeaderStatus = "PASS" }
} catch {
  Write-Host "[WARN] The central Cogiens header could not be reached from M-3." -ForegroundColor Yellow
}

$currentHead = "unknown"
try { $currentHead = ((& git -C $RepoRoot rev-parse --short HEAD) | Select-Object -First 1).Trim() } catch {}
$openUrl = $DashboardUrl + "?v=" + $currentHead + "-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$configDisplay = if ($null -ne $GatewayConfig) { $GatewayConfig } else { "default" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " SHUISHU DASHBOARD READY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "HEAD              = $currentHead"
Write-Host "HEALTH             = PASS"
Write-Host "APPROVED_LOGO      = PASS"
Write-Host "HEADER_MOUNT       = PASS"
Write-Host "HEADER_REMOTE      = $remoteHeaderStatus"
Write-Host "CONFIG             = $configDisplay"
Write-Host "DASHBOARD          = $DashboardUrl"
Write-Host "============================================================" -ForegroundColor Green

if (-not $NoBrowser) { Start-Process $openUrl }
