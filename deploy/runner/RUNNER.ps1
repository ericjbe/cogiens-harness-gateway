[CmdletBinding()]
param(
    [ValidateSet("Watch", "Once", "Status")]
    [string]$Mode = "Watch",
    [string]$ConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "config.json")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

function Write-Utf8JsonAtomic {
    param([string]$Path, [object]$Value)
    $parent = Split-Path -Parent $Path
    if (!(Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $temporary = "$Path.tmp-$([Guid]::NewGuid().ToString('N'))"
    [IO.File]::WriteAllText($temporary, (($Value | ConvertTo-Json -Depth 80) + "`n"), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

if (!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw "Runner config is missing" }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.schema_version -ne "shuishu.m3-runner-stage.v1") { throw "Unsupported runner schema" }
if ($env:COMPUTERNAME -ne $config.expected_computer_name) { throw "Wrong computer: $env:COMPUTERNAME" }
if ($config.runner.transport -ne "local-durable-spool" -or $config.runner.remote_queue_enabled -eq $true) {
    throw "This release permits only local durable spool transport"
}

$spool = [string]$config.spool_root
$directories = @{}
foreach ($name in @("inbox", "processing", "completed", "failed", "outbox")) {
    $directories[$name] = Join-Path $spool $name
    New-Item -ItemType Directory -Path $directories[$name] -Force | Out-Null
}
$heartbeatPath = Join-Path $spool "runner-heartbeat.json"

function Write-Heartbeat {
    param([string]$State, [string]$CurrentJob = $null, [string]$LastError = $null)
    Write-Utf8JsonAtomic -Path $heartbeatPath -Value ([ordered]@{
        schema_version = "shuishu.m3-runner-heartbeat.v1"
        checked_at = [DateTime]::UtcNow.ToString("o")
        computer = $env:COMPUTERNAME
        pid = $PID
        state = $State
        current_job = $CurrentJob
        last_error = $LastError
        transport = "local-durable-spool"
        remote_queue_enabled = $false
        production_gateway_dependency = $false
    })
}

function Get-QueueCounts {
    $counts = @{}
    foreach ($name in $directories.Keys) {
        $counts[$name] = @(Get-ChildItem -LiteralPath $directories[$name] -Filter "*.json" -File -ErrorAction SilentlyContinue).Count
    }
    return $counts
}

function Invoke-NextJob {
    $candidate = Get-ChildItem -LiteralPath $directories.inbox -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object CreationTimeUtc, Name | Select-Object -First 1
    if ($null -eq $candidate) {
        Write-Heartbeat -State "IDLE"
        return $false
    }

    $processingPath = Join-Path $directories.processing $candidate.Name
    try {
        Move-Item -LiteralPath $candidate.FullName -Destination $processingPath -ErrorAction Stop
    } catch {
        return $true
    }

    $job = $null
    $jobId = [IO.Path]::GetFileNameWithoutExtension($processingPath)
    Write-Heartbeat -State "RUNNING" -CurrentJob $jobId
    try {
        $job = Get-Content -LiteralPath $processingPath -Raw | ConvertFrom-Json
        if ($job.schema_version -ne "shuishu.runner-job.v1") { throw "Unsupported job schema" }
        if ($job.job_id -ne $jobId -or $job.job_id -notmatch '^job_[A-Za-z0-9_-]+$') { throw "Job identity mismatch" }
        if ($job.operation -ne $config.runner.allowed_operation) { throw "Operation is not allowlisted" }
        if ($job.expected_head -ne $config.expected_head) { throw "Job HEAD differs from runner baseline" }
        # Windows PowerShell 5.1 can return a scalar/no-value projection for an
        # empty PSObject property collection. Validate the JSON shape first,
        # then force array semantics so only an empty object is accepted.
        $parameterProperty = $job.PSObject.Properties["parameters"]
        if ($null -eq $parameterProperty -or $null -eq $parameterProperty.Value) {
            throw "Job parameters must be an empty JSON object"
        }
        $parameters = $parameterProperty.Value
        if ($parameters -is [System.Collections.IDictionary]) {
            $parameterCount = $parameters.Count
        } elseif ($parameters -is [System.Management.Automation.PSCustomObject]) {
            $parameterCount = @($parameters.PSObject.Properties).Count
        } else {
            throw "Job parameters must be an empty JSON object"
        }
        if ($parameterCount -ne 0) { throw "Arbitrary job parameters are forbidden in v1" }

        $resultPath = Join-Path $directories.outbox ($jobId + ".result.json")
        if (Test-Path -LiteralPath $resultPath) {
            Move-Item -LiteralPath $processingPath -Destination (Join-Path $directories.completed $candidate.Name) -Force
            Write-Heartbeat -State "IDLE"
            return $true
        }

        $stage = Join-Path $PSScriptRoot "STAGE.ps1"
        $output = @(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stage -Mode Execute -JobId $jobId -ConfigPath $ConfigPath 2>&1 | ForEach-Object { [string]$_ })
        $exitCode = $LASTEXITCODE
        $statePath = Join-Path (Join-Path ([string]$config.evidence_root) $jobId) "state.json"
        $state = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
        $success = ($exitCode -eq 0 -and $null -ne $state -and $state.status -eq "READY_FOR_REVIEW")
        $result = [ordered]@{
            schema_version = "shuishu.runner-result.v1"
            job_id = $jobId
            operation = $job.operation
            status = $(if ($success) { "READY_FOR_REVIEW" } else { "BLOCKED" })
            completed_at = [DateTime]::UtcNow.ToString("o")
            exit_code = $exitCode
            stage_state = $state
            evidence = Split-Path -Parent $statePath
            output = $output
            production_gateway_restarted = $false
            production_worktree_changed = $false
            git_commit_created = $false
            git_push_performed = $false
            hong_kong_deployed = $false
        }
        Write-Utf8JsonAtomic -Path $resultPath -Value $result
        $destination = if ($success) { $directories.completed } else { $directories.failed }
        Move-Item -LiteralPath $processingPath -Destination (Join-Path $destination $candidate.Name) -Force
        Write-Heartbeat -State "IDLE" -LastError $(if ($success) { $null } else { "Job blocked; inspect outbox result and evidence" })
    } catch {
        $message = $_.Exception.Message
        $resultPath = Join-Path $directories.outbox ($jobId + ".result.json")
        Write-Utf8JsonAtomic -Path $resultPath -Value ([ordered]@{
            schema_version = "shuishu.runner-result.v1"
            job_id = $jobId
            operation = $(if ($null -ne $job) { $job.operation } else { $null })
            status = "REJECTED"
            completed_at = [DateTime]::UtcNow.ToString("o")
            error = $message
            production_gateway_restarted = $false
            production_worktree_changed = $false
        })
        Move-Item -LiteralPath $processingPath -Destination (Join-Path $directories.failed ([IO.Path]::GetFileName($processingPath))) -Force
        Write-Heartbeat -State "IDLE" -LastError $message
    }
    return $true
}

if ($Mode -eq "Status") {
    $task = Get-ScheduledTask -TaskName ([string]$config.runner.task_name) -ErrorAction SilentlyContinue
    [ordered]@{
        schema_version = "shuishu.m3-runner-status.v1"
        checked_at = [DateTime]::UtcNow.ToString("o")
        computer = $env:COMPUTERNAME
        scheduled_task = $(if ($null -ne $task) { $task.State.ToString() } else { "NOT_INSTALLED" })
        heartbeat = $(if (Test-Path -LiteralPath $heartbeatPath) { Get-Content -LiteralPath $heartbeatPath -Raw | ConvertFrom-Json } else { $null })
        queues = Get-QueueCounts
        transport = "local-durable-spool"
        remote_queue_enabled = $false
        production_gateway_dependency = $false
    } | ConvertTo-Json -Depth 30
    exit 0
}

$created = $false
$mutex = [Threading.Mutex]::new($false, "ShuishuM3DurableSpoolRunnerV1", [ref]$created)
if (!$mutex.WaitOne(0)) {
    if ($Mode -eq "Once") { Write-Host "RUNNER_ALREADY_ACTIVE"; exit 0 }
    throw "Another M3 Runner instance is active"
}
try {
    Write-Heartbeat -State "STARTING"
    if ($Mode -eq "Once") {
        [void](Invoke-NextJob)
        exit 0
    }
    while ($true) {
        [void](Invoke-NextJob)
        Start-Sleep -Seconds ([int]$config.runner.poll_seconds)
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
