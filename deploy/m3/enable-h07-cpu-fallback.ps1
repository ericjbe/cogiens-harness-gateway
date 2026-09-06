param(
  [string]$RepoRoot = "D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway",
  [string]$Workspace = "D:\FND\M3-Harness-Projects\01_projects\water-intelligence",
  [int]$CpuPort = 11435,
  [int]$GatewayPort = 8787,
  [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

function Get-OllamaExe {
  $found = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($null -ne $found) { return $found.Source }
  $candidates = @(
    "C:\Users\admin\AppData\Local\Programs\Ollama\ollama.exe",
    "C:\Program Files\Ollama\ollama.exe",
    "D:\Ollama\ollama.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw "OLLAMA_EXE_NOT_FOUND"
}

function Wait-JsonEndpoint {
  param([string]$Uri, [int]$Seconds = 30)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 3
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "ENDPOINT_NOT_READY: $Uri"
}

function Read-HttpErrorBody {
  param([object]$ErrorRecord)
  try {
    if ($null -ne $ErrorRecord.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($ErrorRecord.Exception.Response.GetResponseStream())
      return $reader.ReadToEnd()
    }
  } catch {}
  return $ErrorRecord.Exception.Message
}

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) { throw "REPO_NOT_FOUND: $RepoRoot" }
if (-not (Test-Path -LiteralPath $Workspace -PathType Container)) { throw "WORKSPACE_NOT_FOUND: $Workspace" }

$ollama = Get-OllamaExe
$logsDir = Join-Path $RepoRoot "var\logs"
$runDir = Join-Path $RepoRoot "var\run"
New-Item -ItemType Directory -Force -Path $logsDir,$runDir | Out-Null

$outLog = Join-Path $logsDir "h07-cpu-ollama.out.log"
$errLog = Join-Path $logsDir "h07-cpu-ollama.err.log"
$pidFile = Join-Path $runDir "h07-cpu-ollama.pid"
$cpuBase = "http://127.0.0.1:$CpuPort"
$gatewayBase = "http://127.0.0.1:$GatewayPort"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHUISHU H07 CPU FALLBACK RECOVERY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "OLLAMA     = $ollama"
Write-Host "CPU_BASE   = $cpuBase"
Write-Host "GATEWAY    = $gatewayBase"
Write-Host "WORKSPACE  = $Workspace"

$cpuReady = $false
try {
  $tags = Invoke-RestMethod -Uri "$cpuBase/api/tags" -TimeoutSec 3
  $cpuReady = $true
  Write-Host "[REUSE] Existing CPU listener is responding on $CpuPort" -ForegroundColor Yellow
} catch {}

if (-not $cpuReady) {
  $oldHost = $env:OLLAMA_HOST
  $oldLib = $env:OLLAMA_LLM_LIBRARY
  $oldModels = $env:OLLAMA_MODELS
  $oldDebug = $env:OLLAMA_DEBUG
  try {
    $env:OLLAMA_HOST = "127.0.0.1:$CpuPort"
    $env:OLLAMA_LLM_LIBRARY = "cpu_avx2"
    if (Test-Path -LiteralPath "F:\ollama-models\models") {
      $env:OLLAMA_MODELS = "F:\ollama-models\models"
    }
    $env:OLLAMA_DEBUG = "1"

    Remove-Item -LiteralPath $outLog,$errLog -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $ollama -ArgumentList "serve" -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    [System.IO.File]::WriteAllText($pidFile, [string]$process.Id, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[START] CPU-only Ollama PID $($process.Id)" -ForegroundColor Yellow
  } finally {
    $env:OLLAMA_HOST = $oldHost
    $env:OLLAMA_LLM_LIBRARY = $oldLib
    $env:OLLAMA_MODELS = $oldModels
    $env:OLLAMA_DEBUG = $oldDebug
  }

  $tags = Wait-JsonEndpoint -Uri "$cpuBase/api/tags" -Seconds 45
}

$models = @($tags.models | ForEach-Object { $_.name })
if ($models -notcontains "ministral-3:14b") {
  throw "H07_MODEL_NOT_VISIBLE_ON_CPU_LISTENER"
}
Write-Host "[PASS] H07 model visible on CPU listener" -ForegroundColor Green

$smokeBody = @{
  model = "ministral-3:14b"
  prompt = "Respond with exactly: H07_CPU_DIRECT_OK"
  stream = $false
  options = @{ num_ctx = 512; num_predict = 16 }
} | ConvertTo-Json -Depth 5 -Compress

try {
  $direct = Invoke-RestMethod -Uri "$cpuBase/api/generate" -Method Post -ContentType "application/json" -Body $smokeBody -TimeoutSec $TimeoutSeconds
  $directText = [string]$direct.response
  if ([string]::IsNullOrWhiteSpace($directText)) { throw "CPU_DIRECT_EMPTY_OUTPUT" }
  Write-Host "[PASS] Direct CPU inference completed" -ForegroundColor Green
  Write-Host "DIRECT_OUTPUT = $directText"
} catch {
  Write-Host "[FAIL] Direct CPU inference failed" -ForegroundColor Red
  Write-Host (Read-HttpErrorBody -ErrorRecord $_) -ForegroundColor Red
  if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 80 }
  exit 2
}

$m3Config = Join-Path $RepoRoot "config\harnesses.m3.json"
$localConfig = Join-Path $RepoRoot "config\harnesses.local.json"
if (-not (Test-Path -LiteralPath $m3Config)) { throw "M3_CONFIG_NOT_FOUND" }

if (Test-Path -LiteralPath $localConfig) {
  $backup = "$localConfig.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $localConfig -Destination $backup -Force
  Write-Host "[BACKUP] $backup" -ForegroundColor Yellow
}

$config = Get-Content -LiteralPath $m3Config -Raw | ConvertFrom-Json
$h07 = @($config.adapters | Where-Object { $_.id -eq "cogiens.h07.local" })
if ($h07.Count -ne 1) { throw "H07_CONFIG_NOT_FOUND" }
$h07[0] | Add-Member -NotePropertyName base_url -NotePropertyValue $cpuBase -Force
$configJson = $config | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($localConfig, $configJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[PASS] Local override written: $localConfig" -ForegroundColor Green

$startDashboard = Join-Path $RepoRoot "deploy\m3\start-dashboard.ps1"
& $startDashboard -ForceRestart -NoBrowser
Start-Sleep -Seconds 2

$adaptersPayload = Invoke-RestMethod -Uri "$gatewayBase/v1/adapters" -TimeoutSec 15
$h07Adapter = @($adaptersPayload.adapters | Where-Object { $_.id -eq "cogiens.h07.local" })[0]
Write-Host "H07_PRECHECK = $($h07Adapter.health.status)"
if ($h07Adapter.health.status -ne "healthy") { throw "H07_GATEWAY_PRECHECK_FAILED" }

$jobBody = @{
  tenant_id = "m3-recovery"
  project_id = "M3-H07-CPU-FALLBACK"
  task_title = "H07 CPU fallback end-to-end smoke"
  prompt = "Respond with exactly this text: SHUISHU_H07_OK"
  workspace = $Workspace
  adapters = @("cogiens.h07.local")
  timeout_seconds = $TimeoutSeconds
  max_concurrency = 1
  network = "restricted"
} | ConvertTo-Json -Depth 8 -Compress

$job = Invoke-RestMethod -Uri "$gatewayBase/v1/jobs/fanout" -Method Post -ContentType "application/json" -Body $jobBody -TimeoutSec 30
Write-Host "JOB_ID = $($job.job_id)"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds + 30)
$last = ""
while ($true) {
  Start-Sleep -Seconds 3
  $job = Invoke-RestMethod -Uri "$gatewayBase/v1/jobs/$($job.job_id)" -TimeoutSec 15
  $run = @($job.runs)[0]
  $state = "$($job.gateway_status)/$($run.state)"
  if ($state -ne $last) {
    Write-Host "STATE  = $state"
    $last = $state
  }
  if ($job.gateway_status -in @("COMPLETED","PARTIAL","FAILED","CANCELLED")) { break }
  if ((Get-Date) -gt $deadline) { throw "H07_JOB_TIMEOUT" }
}

$run = @($job.runs)[0]
$artifactCount = @($run.artifacts).Count
$messageEvent = @($run.events | Where-Object { $_.type -eq "assistant.message.completed" } | Select-Object -Last 1)
if ($messageEvent.Count -gt 0) { Write-Host "OUTPUT = $($messageEvent[0].payload.message)" }
Write-Host "ARTIFACTS = $artifactCount"

if ($run.state -eq "SUCCEEDED" -and $artifactCount -ge 1) {
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " H07_RESULT = PASS" -ForegroundColor Green
  Write-Host " SUCCEEDED + ARTIFACT" -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
  exit 0
}

$failedEvent = @($run.events | Where-Object { $_.type -eq "run.failed" } | Select-Object -Last 1)
if ($failedEvent.Count -gt 0) {
  Write-Host "ERROR = $($failedEvent[0].payload.error.code)" -ForegroundColor Red
  Write-Host "MESSAGE = $($failedEvent[0].payload.error.message)" -ForegroundColor Red
}
Write-Host "H07_RESULT = FAIL" -ForegroundColor Red
exit 3
