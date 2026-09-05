param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$Workspace = "D:\FND\M3-Harness-Projects\01_projects\water-intelligence",
    [int]$TimeoutSeconds = 600,
    [int]$PollSeconds = 3
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Invoke-ShuishuRest {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [string]$Method = "GET",
        [object]$Body = $null
    )

    $headers = @{}
    if ($env:CHG_API_TOKEN) {
        $headers["Authorization"] = "Bearer $($env:CHG_API_TOKEN)"
    }

    $params = @{
        Uri = $Uri
        Method = $Method
        Headers = $headers
        TimeoutSec = 30
    }

    if ($null -ne $Body) {
        $params["ContentType"] = "application/json"
        $params["Body"] = ($Body | ConvertTo-Json -Depth 12 -Compress)
    }

    return Invoke-RestMethod @params
}

function Get-RunFailure {
    param([object]$Run)

    if ($null -ne $Run.error) {
        return $Run.error
    }

    $failedEvents = @($Run.events | Where-Object { $_.type -eq "run.failed" })
    if ($failedEvents.Count -gt 0) {
        $lastFailed = $failedEvents[$failedEvents.Count - 1]
        if ($null -ne $lastFailed.payload -and $null -ne $lastFailed.payload.error) {
            return $lastFailed.payload.error
        }
    }

    return $null
}

if (-not (Test-Path -LiteralPath $Workspace -PathType Container)) {
    throw "Workspace does not exist: $Workspace"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$auditId = Get-Date -Format "yyyyMMdd-HHmmss"
$auditDir = Join-Path $repoRoot "var\audits\h01-h08-$auditId"
New-Item -ItemType Directory -Force -Path $auditDir | Out-Null

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHUISHU H01-H08 REAL EXECUTION AUDIT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "HOST       = $env:COMPUTERNAME"
Write-Host "USER       = $env:USERNAME"
Write-Host "BASE_URL   = $BaseUrl"
Write-Host "WORKSPACE  = $Workspace"
Write-Host "AUDIT_DIR  = $auditDir"
Write-Host "TIMEOUT    = $TimeoutSeconds seconds per H unit"
Write-Host ""

$health = Invoke-ShuishuRest -Uri "$BaseUrl/health"
if ($health.status -ne "healthy") {
    throw "Gateway health is not healthy: $($health.status)"
}

$adapterPayload = Invoke-ShuishuRest -Uri "$BaseUrl/v1/adapters"
$adapters = @($adapterPayload.adapters | Where-Object { $_.id -match '^cogiens\.h0[1-8]\.local$' } | Sort-Object id)
if ($adapters.Count -ne 8) {
    throw "Expected 8 H adapters, found $($adapters.Count)"
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($adapter in $adapters) {
    $adapterId = [string]$adapter.id
    $hCode = (($adapterId -split '\.')[1]).ToUpperInvariant()
    $resourceId = [string]$adapter.health.details.resource_id
    $preflight = [string]$adapter.health.status

    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host " $hCode / $resourceId / $adapterId" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host "PRECHECK = $preflight"

    if ($preflight -ne "healthy") {
        $results.Add([pscustomobject]@{
            h = $hCode
            resource = $resourceId
            adapter = $adapterId
            precheck = $preflight
            job_id = $null
            gateway_status = "NOT_RUN"
            run_state = "NOT_RUN"
            elapsed_seconds = 0
            artifacts = 0
            verdict = "FAILED_PRECHECK"
            error_code = "ADAPTER_UNHEALTHY"
            error_message = "Adapter preflight was not healthy"
            last_event = $null
        })
        continue
    }

    $body = @{
        tenant_id = "m3-audit"
        project_id = "M3-H01-H08-AUDIT"
        task_title = "$hCode real execution smoke test"
        prompt = "Respond with exactly this text: SHUISHU_SMOKE_OK"
        workspace = $Workspace
        adapters = @($adapterId)
        timeout_seconds = $TimeoutSeconds
        max_concurrency = 1
        network = "restricted"
    }

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $job = $null
    $submitError = $null

    try {
        $job = Invoke-ShuishuRest -Uri "$BaseUrl/v1/jobs/fanout" -Method "POST" -Body $body
        Write-Host "JOB_ID   = $($job.job_id)"
    }
    catch {
        $submitError = $_.Exception.Message
    }

    if ($submitError) {
        $stopwatch.Stop()
        Write-Host "VERDICT  = SUBMIT_FAILED" -ForegroundColor Red
        Write-Host "ERROR    = $submitError" -ForegroundColor Red
        $results.Add([pscustomobject]@{
            h = $hCode
            resource = $resourceId
            adapter = $adapterId
            precheck = $preflight
            job_id = $null
            gateway_status = "SUBMIT_FAILED"
            run_state = "NOT_STARTED"
            elapsed_seconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
            artifacts = 0
            verdict = "FAILED"
            error_code = "SUBMIT_FAILED"
            error_message = $submitError
            last_event = $null
        })
        continue
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds + 30)
    $lastPrintedState = ""
    $timedOut = $false

    while ($true) {
        Start-Sleep -Seconds $PollSeconds
        $job = Invoke-ShuishuRest -Uri "$BaseUrl/v1/jobs/$($job.job_id)"
        $run = @($job.runs)[0]
        $displayState = "$($job.gateway_status)/$($run.state)"
        if ($displayState -ne $lastPrintedState) {
            Write-Host "STATE     = $displayState"
            $lastPrintedState = $displayState
        }

        if ($job.gateway_status -in @("COMPLETED", "PARTIAL", "FAILED", "CANCELLED")) {
            break
        }

        if ((Get-Date) -gt $deadline) {
            $timedOut = $true
            try {
                Invoke-ShuishuRest -Uri "$BaseUrl/v1/jobs/$($job.job_id)/cancel" -Method "POST" -Body @{ reason = "m3-audit-timeout" } | Out-Null
            }
            catch {}
            break
        }
    }

    $stopwatch.Stop()

    if ($timedOut) {
        $run = @($job.runs)[0]
        $results.Add([pscustomobject]@{
            h = $hCode
            resource = $resourceId
            adapter = $adapterId
            precheck = $preflight
            job_id = $job.job_id
            gateway_status = [string]$job.gateway_status
            run_state = [string]$run.state
            elapsed_seconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
            artifacts = @($run.artifacts).Count
            verdict = "FAILED_TIMEOUT"
            error_code = "AUDIT_TIMEOUT"
            error_message = "Audit exceeded timeout"
            last_event = if (@($run.events).Count -gt 0) { [string]$run.events[-1].type } else { $null }
        })
        Write-Host "VERDICT   = FAILED_TIMEOUT" -ForegroundColor Red
        continue
    }

    $run = @($job.runs)[0]
    $artifactCount = @($run.artifacts).Count
    $failure = Get-RunFailure -Run $run
    $errorCode = if ($null -ne $failure) { [string]$failure.code } else { $null }
    $errorMessage = if ($null -ne $failure) { [string]$failure.message } else { $null }
    $lastEvent = if (@($run.events).Count -gt 0) { [string]$run.events[-1].type } else { $null }

    if ($run.state -eq "SUCCEEDED" -and $artifactCount -ge 1) {
        $verdict = "PRODUCTION_READY"
        Write-Host "VERDICT   = PRODUCTION_READY" -ForegroundColor Green
    }
    elseif ($run.state -eq "SUCCEEDED") {
        $verdict = "EXECUTED_NO_ARTIFACT"
        Write-Host "VERDICT   = EXECUTED_NO_ARTIFACT" -ForegroundColor Yellow
    }
    else {
        $verdict = "FAILED"
        Write-Host "VERDICT   = FAILED" -ForegroundColor Red
    }

    Write-Host "ELAPSED   = $([math]::Round($stopwatch.Elapsed.TotalSeconds, 1)) s"
    Write-Host "ARTIFACTS = $artifactCount"
    if ($errorCode) { Write-Host "ERROR     = $errorCode" -ForegroundColor Red }
    if ($errorMessage) { Write-Host "MESSAGE   = $errorMessage" -ForegroundColor Red }

    $results.Add([pscustomobject]@{
        h = $hCode
        resource = $resourceId
        adapter = $adapterId
        precheck = $preflight
        job_id = $job.job_id
        gateway_status = [string]$job.gateway_status
        run_state = [string]$run.state
        elapsed_seconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
        artifacts = $artifactCount
        verdict = $verdict
        error_code = $errorCode
        error_message = $errorMessage
        last_event = $lastEvent
    })

    $job | ConvertTo-Json -Depth 30 | Out-File -LiteralPath (Join-Path $auditDir "$hCode-$($job.job_id).json") -Encoding utf8
}

$summaryJson = Join-Path $auditDir "summary.json"
$summaryCsv = Join-Path $auditDir "summary.csv"

$summary = [pscustomobject]@{
    schema_version = "shuishu.m3.h-audit.v0.1"
    audit_id = $auditId
    host = $env:COMPUTERNAME
    user = $env:USERNAME
    base_url = $BaseUrl
    workspace = $Workspace
    checked_at = (Get-Date).ToString("o")
    results = @($results)
}

$summary | ConvertTo-Json -Depth 20 | Out-File -LiteralPath $summaryJson -Encoding utf8
@($results) | Export-Csv -LiteralPath $summaryCsv -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " FINAL H01-H08 REAL EXECUTION SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
@($results) | Select-Object h,resource,precheck,run_state,elapsed_seconds,artifacts,verdict,error_code | Format-Table -AutoSize
Write-Host "SUMMARY_JSON = $summaryJson"
Write-Host "SUMMARY_CSV  = $summaryCsv"
Write-Host "============================================================" -ForegroundColor Cyan
