[CmdletBinding()]
param(
    [ValidateSet("Execute", "Resume", "Status", "Rollback")]
    [string]$Mode = "Execute",
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^job_[A-Za-z0-9_-]+$')]
    [string]$JobId,
    [string]$ConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "config.json")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

function ConvertTo-Hashtable {
    param([object]$InputObject)
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $table = @{}
        foreach ($key in $InputObject.Keys) { $table[$key] = ConvertTo-Hashtable $InputObject[$key] }
        return $table
    }
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $table = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $table[$property.Name] = ConvertTo-Hashtable $property.Value
        }
        return $table
    }
    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        return @($InputObject | ForEach-Object { ConvertTo-Hashtable $_ })
    }
    return $InputObject
}

function Write-Utf8JsonAtomic {
    param([string]$Path, [object]$Value)
    $parent = Split-Path -Parent $Path
    if (!(Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $temporary = "$Path.tmp-$([Guid]::NewGuid().ToString('N'))"
    [IO.File]::WriteAllText($temporary, (($Value | ConvertTo-Json -Depth 100) + "`n"), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Get-Sha256Lower {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Invoke-External {
    param([string]$Command, [string[]]$Arguments, [string]$WorkingDirectory = "")
    $previous = Get-Location
    $exitCode = -1
    try {
        if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
        $lines = @(& $Command @Arguments 2>&1 | ForEach-Object { [string]$_ })
        $exitCode = $LASTEXITCODE
    } finally {
        Set-Location $previous
    }
    if ($exitCode -ne 0) {
        throw "$Command failed with exit code $exitCode`: $($lines -join [Environment]::NewLine)"
    }
    return ($lines -join [Environment]::NewLine)
}

function Save-State {
    $script:State.updated_at = [DateTime]::UtcNow.ToString("o")
    Write-Utf8JsonAtomic -Path (Join-Path $script:RunDir "state.json") -Value $script:State
}

function Add-Event {
    param([string]$Type, [string]$Stage, [object]$Data)
    $record = [ordered]@{
        occurred_at = [DateTime]::UtcNow.ToString("o")
        type = $Type
        stage = $Stage
        job_id = $JobId
        data = $Data
    }
    [IO.File]::AppendAllText((Join-Path $script:RunDir "events.jsonl"), (($record | ConvertTo-Json -Compress -Depth 40) + "`n"), [Text.UTF8Encoding]::new($false))
}

function Invoke-Stage {
    param([string]$Name, [scriptblock]$Body)
    if ($script:State.stages.ContainsKey($Name) -and $script:State.stages[$Name].status -eq "SUCCEEDED") {
        Write-Host "[SKIP] $Name" -ForegroundColor DarkGray
        return
    }
    $started = [DateTime]::UtcNow.ToString("o")
    $script:State.status = "RUNNING"
    $script:State.current_stage = $Name
    $script:State.stages[$Name] = [ordered]@{ status = "RUNNING"; started_at = $started }
    Save-State
    Add-Event -Type "stage.started" -Stage $Name -Data @{}
    Write-Host "[START] $Name" -ForegroundColor Cyan
    try {
        $result = & $Body
        $script:State.stages[$Name] = [ordered]@{
            status = "SUCCEEDED"
            started_at = $started
            completed_at = [DateTime]::UtcNow.ToString("o")
            result = $result
        }
        Save-State
        Add-Event -Type "stage.succeeded" -Stage $Name -Data $result
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } catch {
        $message = $_.Exception.Message
        $script:State.status = "BLOCKED"
        $script:State.stages[$Name] = [ordered]@{
            status = "FAILED"
            started_at = $started
            completed_at = [DateTime]::UtcNow.ToString("o")
            error = $message
        }
        Save-State
        Add-Event -Type "stage.failed" -Stage $Name -Data @{ error = $message }
        throw "GATEWAY_STAGE_BLOCKED at $Name`: $message"
    }
}

function Get-GitSnapshot {
    param([string]$Repository)
    $head = (Invoke-External -Command "git" -Arguments @("-C", $Repository, "rev-parse", "HEAD")).Trim()
    $originMain = (Invoke-External -Command "git" -Arguments @("-C", $Repository, "rev-parse", "origin/main")).Trim()
    $branch = (Invoke-External -Command "git" -Arguments @("-C", $Repository, "branch", "--show-current")).Trim()
    $porcelain = Invoke-External -Command "git" -Arguments @("-C", $Repository, "status", "--porcelain=v1", "--untracked-files=all")
    $entries = @()
    foreach ($line in @($porcelain -split "`r?`n" | Where-Object { $_ })) {
        if ($line.Length -lt 4) { continue }
        $relative = $line.Substring(3).Trim().Replace('/', '\')
        if ($relative -match " -> ") { $relative = ($relative -split " -> ")[-1] }
        $absolute = Join-Path $Repository $relative
        $entries += [ordered]@{
            status = $line.Substring(0, 2)
            path = $relative.Replace('\', '/')
            exists = Test-Path -LiteralPath $absolute -PathType Leaf
            sha256 = $(if (Test-Path -LiteralPath $absolute -PathType Leaf) { Get-Sha256Lower $absolute } else { $null })
        }
    }
    return [ordered]@{
        captured_at = [DateTime]::UtcNow.ToString("o")
        repository = $Repository
        head = $head
        origin_main = $originMain
        branch = $branch
        porcelain = $porcelain
        entries = $entries
    }
}

function Assert-ExpectedDirtyPaths {
    param([object]$Snapshot)
    $actual = @($Snapshot.entries | ForEach-Object { [string]$_.path })
    foreach ($required in $script:Config.expected_dirty_paths) {
        $normalized = ([string]$required).Replace('\', '/')
        if ($actual -notcontains $normalized) { throw "Required preserved dirty path is absent: $normalized" }
    }
}

function Assert-ProductionUnchanged {
    param([object]$Before, [object]$After)
    if ($Before.head -ne $After.head) { throw "Production HEAD changed during isolated staging" }
    if ($Before.origin_main -ne $After.origin_main) { throw "origin/main changed during isolated staging" }
    if ($Before.porcelain -ne $After.porcelain) { throw "Production dirty set changed during isolated staging" }
    $beforeMap = @{}
    foreach ($entry in $Before.entries) { $beforeMap[$entry.path] = $entry.sha256 }
    foreach ($entry in $After.entries) {
        if (!$beforeMap.ContainsKey($entry.path) -or $beforeMap[$entry.path] -ne $entry.sha256) {
            throw "Production dirty file bytes changed: $($entry.path)"
        }
    }
}

function Resolve-ConfigCandidate {
    param([string]$Worktree, [object[]]$Candidates)
    foreach ($relative in $Candidates) {
        $candidate = Join-Path $Worktree ([string]$relative)
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw "No isolated Gateway configuration candidate exists"
}

function Invoke-IsolatedGatewayCheck {
    param(
        [string]$Label,
        [string]$Worktree,
        [string]$ConfigFile,
        [string]$DataRoot,
        [bool]$RequireCatalog
    )
    $port = [int]$script:Config.isolated_port
    $hostName = [string]$script:Config.isolated_host
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if ($listeners.Count -ne 0) { throw "Isolated port $port is already occupied; no process was stopped" }
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
    $logDir = Join-Path $script:RunDir ("runtime-" + $Label)
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $stdout = Join-Path $logDir "stdout.log"
    $stderr = Join-Path $logDir "stderr.log"
    $node = (Get-Command node -ErrorAction Stop).Source
    $saved = @{}
    foreach ($name in @("CHG_CONFIG", "CHG_HOST", "CHG_PORT", "CHG_DATA_ROOT")) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }
    $process = $null
    try {
        $env:CHG_CONFIG = $ConfigFile
        $env:CHG_HOST = $hostName
        $env:CHG_PORT = [string]$port
        $env:CHG_DATA_ROOT = $DataRoot
        $process = Start-Process -FilePath $node -ArgumentList @("apps/gateway/src/server.mjs") -WorkingDirectory $Worktree -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
        Write-Utf8JsonAtomic -Path (Join-Path $logDir "owned-process.json") -Value @{ job_id = $JobId; pid = $process.Id; port = $port; started_at = [DateTime]::UtcNow.ToString("o") }
        $base = "http://${hostName}:$port"
        $health = $null
        for ($attempt = 1; $attempt -le 60; $attempt++) {
            if ($process.HasExited) { break }
            try {
                $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 3
                break
            } catch {
                Start-Sleep -Seconds 1
            }
        }
        if ($null -eq $health) {
            $errorTail = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 80) -join "`n" } else { "" }
            throw "Isolated $Label Gateway did not become healthy on $base. stderr=$errorTail"
        }
        $dashboard = Invoke-WebRequest -Uri "$base/dashboard/" -UseBasicParsing -TimeoutSec 10
        if ($dashboard.StatusCode -ne 200) { throw "Isolated dashboard HTTP $($dashboard.StatusCode)" }
        $catalogSummary = $null
        if ($RequireCatalog) {
            $catalog = Invoke-RestMethod -Uri "$base/v1/model-harness/catalog" -TimeoutSec 10
            $catalogSummary = $catalog.summary
            if ([int]$catalog.summary.total -ne 16 -or [int]$catalog.summary.free -ne 10 -or [int]$catalog.summary.paid -ne 6) {
                throw "Candidate catalog is not 10 free + 6 paid"
            }
            if ($catalog.customer_access_ready -eq $true) { throw "Candidate unexpectedly enables customer access" }
        }
        $report = [ordered]@{
            status = "PASS"
            label = $Label
            url = $base
            port = $port
            config = $ConfigFile
            data_root = $DataRoot
            dashboard_http = $dashboard.StatusCode
            health = $health
            catalog_summary = $catalogSummary
            production_port_touched = $false
        }
        Write-Utf8JsonAtomic -Path (Join-Path $logDir "report.json") -Value $report
        return $report
    } finally {
        foreach ($name in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process")
        }
        if ($null -ne $process -and !$process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
        }
    }
}

if (!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw "Runner config is missing: $ConfigPath" }
$script:Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($script:Config.schema_version -ne "shuishu.m3-runner-stage.v1") { throw "Unsupported runner schema" }
if ($env:COMPUTERNAME -ne $script:Config.expected_computer_name) { throw "Wrong computer: $env:COMPUTERNAME" }
if ([int]$script:Config.isolated_port -eq 8787) { throw "Isolated port must never be production port 8787" }

$script:RunDir = Join-Path ([string]$script:Config.evidence_root) $JobId
$statePath = Join-Path $script:RunDir "state.json"
if ($Mode -eq "Execute") {
    if (Test-Path -LiteralPath $statePath) {
        $Mode = "Resume"
    } else {
        New-Item -ItemType Directory -Path $script:RunDir -Force | Out-Null
        $script:State = [ordered]@{
            schema_version = "shuishu.m3-runner-stage-state.v1"
            job_id = $JobId
            status = "CREATED"
            created_at = [DateTime]::UtcNow.ToString("o")
            updated_at = [DateTime]::UtcNow.ToString("o")
            current_stage = $null
            worktree = $null
            stages = @{}
        }
        Save-State
    }
}
if ($Mode -ne "Execute" -or (Test-Path -LiteralPath $statePath)) {
    if (!(Test-Path -LiteralPath $statePath)) { throw "No state exists for $JobId" }
    $script:State = ConvertTo-Hashtable (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
}

if ($Mode -eq "Status") {
    Get-Content -LiteralPath $statePath -Raw
    exit 0
}

if ($Mode -eq "Rollback") {
    $worktree = [string]$script:State.worktree
    if (!$worktree) { Write-Host "NO_OWNED_WORKTREE; EVIDENCE_RETAINED=$script:RunDir"; exit 0 }
    $full = [IO.Path]::GetFullPath($worktree)
    $allowed = [IO.Path]::GetFullPath([string]$script:Config.worktree_root).TrimEnd('\') + '\'
    if (!$full.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw "Rollback target is outside worktree_root" }
    $marker = Join-Path $script:RunDir "worktree-owner.json"
    if (!(Test-Path -LiteralPath $marker)) { throw "Rollback ownership marker is absent" }
    $owner = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    if ($owner.job_id -ne $JobId) { throw "Rollback ownership mismatch" }
    if ([IO.Path]::GetFullPath([string]$owner.worktree) -ne $full) { throw "Rollback worktree marker mismatch" }
    Invoke-External -Command "git" -Arguments @("-C", [string]$script:Config.target_repository, "worktree", "remove", "--force", $full) | Out-Null
    $script:State.status = "ROLLED_BACK"
    $script:State.worktree = $null
    Save-State
    Write-Host "ROLLBACK_PASS; PRODUCTION_WORKTREE_UNCHANGED=true; EVIDENCE_RETAINED=$script:RunDir"
    exit 0
}

$created = $false
$mutex = [Threading.Mutex]::new($false, "ShuishuM3GatewayRunnerStageV1", [ref]$created)
if (!$mutex.WaitOne(0)) { throw "Another isolated Gateway staging job is active" }
try {
    Invoke-Stage "01-production-gateway-readonly-diagnostic" {
        $dir = Join-Path $script:RunDir "01-production-diagnostic"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $port = 8787
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess)
        $processes = @()
        foreach ($listener in $listeners) {
            $processes += @(Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue | Select-Object ProcessId, Name, ExecutablePath, CommandLine)
        }
        $http = [ordered]@{ reachable = $false; status_code = $null; error = $null }
        try {
            $response = Invoke-WebRequest -Uri "$($script:Config.production_gateway_url)/dashboard/" -UseBasicParsing -TimeoutSec 5
            $http.reachable = $true
            $http.status_code = $response.StatusCode
        } catch {
            $http.error = $_.Exception.Message
        }
        $repo = [string]$script:Config.target_repository
        $recentLogs = @()
        $logRoot = Join-Path $repo "var\logs"
        if (Test-Path -LiteralPath $logRoot) {
            $recentLogs = @(Get-ChildItem -LiteralPath $logRoot -File -Recurse -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 25 LastWriteTime, Length, FullName)
        }
        $packageScripts = $null
        $packagePath = Join-Path $repo "package.json"
        if (Test-Path -LiteralPath $packagePath) {
            $packageScripts = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).scripts
        }
        $tasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match "Shuishu|Gateway|Harness" } | Select-Object TaskName, TaskPath, State)
        $report = [ordered]@{
            status = "DIAGNOSTIC_COMPLETE"
            production_gateway_offline_is_not_a_stage_blocker = $true
            listener = $listeners
            process = $processes
            http = $http
            package_scripts = $packageScripts
            recent_log_files = $recentLogs
            related_scheduled_tasks = $tasks
            actions_taken = @("READ_ONLY")
        }
        Write-Utf8JsonAtomic -Path (Join-Path $dir "report.json") -Value $report
        return @{ report = (Join-Path $dir "report.json"); reachable = $http.reachable; production_service_changed = $false }
    }

    Invoke-Stage "02-git-invariants-and-dirty-preservation" {
        $repo = [IO.Path]::GetFullPath([string]$script:Config.target_repository)
        if (!(Test-Path -LiteralPath $repo)) { throw "M3 repository is absent: $repo" }
        $snapshot = Get-GitSnapshot -Repository $repo
        if ($snapshot.head -ne $script:Config.expected_head) { throw "M3 HEAD differs from frozen baseline" }
        if ($snapshot.origin_main -ne $script:Config.expected_origin_main) { throw "M3 origin/main differs from frozen baseline" }
        Assert-ExpectedDirtyPaths -Snapshot $snapshot
        $agentFiles = @()
        $cursor = [IO.DirectoryInfo]$repo
        while ($null -ne $cursor) {
            $candidate = Join-Path $cursor.FullName "AGENTS.md"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $agentFiles += $candidate }
            $cursor = $cursor.Parent
        }
        $agentFiles += @(Get-ChildItem -LiteralPath $repo -Filter "AGENTS.md" -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' } | ForEach-Object FullName)
        $agentFiles = @($agentFiles | Sort-Object -Unique)
        if ($agentFiles.Count -eq 0) { throw "No applicable M3 AGENTS.md was found" }
        $agentRules = @($agentFiles | ForEach-Object {
            @{ path = $_; sha256 = Get-Sha256Lower $_; content = [IO.File]::ReadAllText($_) }
        })
        $report = [ordered]@{
            status = "PASS"
            snapshot = $snapshot
            agents = $agentRules
            expected_dirty_paths_present = $true
            production_worktree_write_performed = $false
        }
        $dir = Join-Path $script:RunDir "02-git"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Utf8JsonAtomic -Path (Join-Path $dir "before.json") -Value $report
        return @{ report = (Join-Path $dir "before.json"); head = $snapshot.head; dirty_preserved = $true }
    }

    Invoke-Stage "03-clean-baseline-isolated-runtime" {
        $repo = [string]$script:Config.target_repository
        $worktreeRoot = [IO.Path]::GetFullPath([string]$script:Config.worktree_root)
        New-Item -ItemType Directory -Path $worktreeRoot -Force | Out-Null
        $worktree = Join-Path $worktreeRoot $JobId
        if (!(Test-Path -LiteralPath $worktree)) {
            Invoke-External -Command "git" -Arguments @("-C", $repo, "worktree", "add", "--detach", $worktree, [string]$script:Config.expected_head) | Out-Null
        }
        $marker = Join-Path $script:RunDir "worktree-owner.json"
        if (Test-Path -LiteralPath $marker) {
            $owner = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
            if ($owner.job_id -ne $JobId) { throw "Existing worktree belongs to another job" }
        } else {
            Write-Utf8JsonAtomic -Path $marker -Value @{ job_id = $JobId; expected_head = $script:Config.expected_head; production_repository = $repo; worktree = $worktree }
        }
        $actual = (Invoke-External -Command "git" -Arguments @("-C", $worktree, "rev-parse", "HEAD")).Trim()
        if ($actual -ne $script:Config.expected_head) { throw "Isolated worktree HEAD mismatch" }
        $script:State.worktree = $worktree
        Save-State
        $config = Resolve-ConfigCandidate -Worktree $worktree -Candidates $script:Config.baseline_config_candidates
        $data = Join-Path $script:RunDir "isolated-data\baseline"
        $runtime = Invoke-IsolatedGatewayCheck -Label "baseline" -Worktree $worktree -ConfigFile $config -DataRoot $data -RequireCatalog $false
        return @{ worktree = $worktree; source_head = $actual; runtime = $runtime; production_port_touched = $false }
    }

    Invoke-Stage "04-apply-10-plus-6-and-artifact-candidate" {
        $worktree = [string]$script:State.worktree
        $installRoot = Split-Path -Parent $PSScriptRoot

        $jobPath = Join-Path (Join-Path ([string]$script:Config.spool_root) "processing") ($JobId + ".json")
        $queuedJob = if (Test-Path -LiteralPath $jobPath -PathType Leaf) { Get-Content -LiteralPath $jobPath -Raw | ConvertFrom-Json } else { $null }
        $bundleRoot = Join-Path (Join-Path $installRoot "job-payloads") $JobId
        $pin = if ($null -ne $queuedJob) { $queuedJob.PSObject.Properties["payload_manifest_sha256"] } else { $null }
        $attempt = if ($null -ne $queuedJob) { $queuedJob.PSObject.Properties["attempt"] } else { $null }
        if ($null -ne $pin -or (Test-Path -LiteralPath $bundleRoot) -or ($null -ne $attempt -and [int]$attempt.Value -ge 4)) {
            if ($null -eq $queuedJob -or $queuedJob.job_id -cne $JobId) { throw "Per-job payload requires the matching processing job" }
            if ($null -eq $pin -or !(Test-Path -LiteralPath $bundleRoot -PathType Container)) { throw "Per-job payload binding or bundle missing; legacy fallback forbidden" }
            . (Join-Path $PSScriptRoot "PAYLOAD.v2.ps1")
            $report = Install-JobPayload -BundleRoot $bundleRoot -Worktree $worktree -Job $queuedJob -ExpectedHead ([string]$script:Config.expected_head)
            $dir = Join-Path $script:RunDir "04-candidate"
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Utf8JsonAtomic -Path (Join-Path $dir "merge-report.json") -Value $report
            return @{ report = (Join-Path $dir "merge-report.json"); manifest_sha256 = $report.manifest_sha256; file_count = $report.file_count; applied = @($report.files | Where-Object action -eq "APPLIED").Count }
        }
        $manifest = Get-Content -LiteralPath (Join-Path $installRoot "payload-manifest.json") -Raw | ConvertFrom-Json
        $changes = @()
        foreach ($item in $manifest.files) {
            $relative = ([string]$item.path).Replace('/', '\')
            $source = Join-Path (Join-Path $installRoot "payload") $relative
            $target = Join-Path $worktree $relative
            if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Payload file absent: $($item.path)" }
            if ((Get-Sha256Lower $source) -ne $item.after) { throw "Payload after-hash mismatch: $($item.path)" }
            $existing = if (Test-Path -LiteralPath $target -PathType Leaf) { Get-Sha256Lower $target } else { $null }
            if ($existing -eq $item.after) {
                $changes += @{ path = $item.path; action = "ALREADY_APPLIED" }
                continue
            }
            if ($null -ne $item.before) {
                if ($existing -ne $item.before) { throw "Unknown clean baseline for $($item.path)" }
            } elseif ($null -ne $existing) {
                throw "Candidate new path already exists: $($item.path)"
            }
            $parent = Split-Path -Parent $target
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target
            if ((Get-Sha256Lower $target) -ne $item.after) { throw "Installed candidate hash mismatch: $($item.path)" }
            $changes += @{ path = $item.path; action = "APPLIED" }
        }
        $dir = Join-Path $script:RunDir "04-candidate"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $report = [ordered]@{
            status = "PASS"
            includes_model_harness_console_10_free_6_paid = $true
            includes_process_adapter_real_artifacts = $true
            includes_product_specification = $true
            source_head = $script:Config.expected_head
            files = $changes
            production_worktree_unchanged = $true
        }
        Write-Utf8JsonAtomic -Path (Join-Path $dir "merge-report.json") -Value $report
        return @{ report = (Join-Path $dir "merge-report.json"); applied = @($changes | Where-Object action -eq "APPLIED").Count }
    }

    Invoke-Stage "05-candidate-tests" {
        $worktree = [string]$script:State.worktree
        $dir = Join-Path $script:RunDir "05-tests"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $command = [string]$script:Config.verify_command[0]
        $arguments = @($script:Config.verify_command | Select-Object -Skip 1 | ForEach-Object { [string]$_ })
        try {
            $output = Invoke-External -Command $command -Arguments $arguments -WorkingDirectory $worktree
            [IO.File]::WriteAllText((Join-Path $dir "verify.log"), ($output + "`n"), [Text.UTF8Encoding]::new($false))
        } catch {
            [IO.File]::WriteAllText((Join-Path $dir "verify.log"), ($_.Exception.Message + "`n"), [Text.UTF8Encoding]::new($false))
            throw
        }
        return @{ command = (@($command) + $arguments) -join " "; log = (Join-Path $dir "verify.log") }
    }

    Invoke-Stage "06-candidate-isolated-runtime" {
        $worktree = [string]$script:State.worktree
        $config = Resolve-ConfigCandidate -Worktree $worktree -Candidates $script:Config.candidate_config_candidates
        $data = Join-Path $script:RunDir "isolated-data\candidate"
        $runtime = Invoke-IsolatedGatewayCheck -Label "candidate" -Worktree $worktree -ConfigFile $config -DataRoot $data -RequireCatalog $true
        return @{ runtime = $runtime; model_slots = "10-free+6-paid"; customer_access_ready = $false; production_port_touched = $false }
    }

    Invoke-Stage "07-final-production-preservation-gate" {
        $repo = [string]$script:Config.target_repository
        $beforeReport = Get-Content -LiteralPath (Join-Path $script:RunDir "02-git\before.json") -Raw | ConvertFrom-Json
        $after = Get-GitSnapshot -Repository $repo
        Assert-ExpectedDirtyPaths -Snapshot $after
        Assert-ProductionUnchanged -Before $beforeReport.snapshot -After $after
        $dir = Join-Path $script:RunDir "07-preservation"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $report = [ordered]@{
            status = "PASS"
            before = $beforeReport.snapshot
            after = $after
            production_worktree_unchanged = $true
            production_gateway_restarted = $false
            git_commit_created = $false
            git_push_performed = $false
            hong_kong_deployed = $false
            secrets_accessed = $false
        }
        Write-Utf8JsonAtomic -Path (Join-Path $dir "report.json") -Value $report
        return @{ report = (Join-Path $dir "report.json"); production_worktree_unchanged = $true }
    }

    $script:State.status = "READY_FOR_REVIEW"
    $script:State.current_stage = $null
    Save-State
    $hashes = Get-ChildItem -LiteralPath $script:RunDir -File -Recurse |
        Where-Object Name -ne "SHA256SUMS.txt" |
        Sort-Object FullName |
        ForEach-Object { "{0}  {1}" -f (Get-Sha256Lower $_.FullName), $_.FullName.Substring($script:RunDir.Length + 1).Replace('\','/') }
    [IO.File]::WriteAllLines((Join-Path $script:RunDir "SHA256SUMS.txt"), $hashes, [Text.UTF8Encoding]::new($false))
    Write-Host "READY_FOR_REVIEW"
    Write-Host "EVIDENCE=$script:RunDir"
    Write-Host "ISOLATED_WORKTREE=$($script:State.worktree)"
    Write-Host "PRODUCTION_GATEWAY_RESTARTED=false"
    Write-Host "PRODUCTION_WORKTREE_UNCHANGED=true"
    Write-Host "HONG_KONG_DEPLOYED=false"
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
