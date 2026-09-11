function Get-PayloadDigest {
    param([string]$Path)
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Resolve-PayloadFile {
    param([string]$Root, [string]$Relative)
    if (!$Relative -or $Relative -notmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$') { throw "Unsafe payload path: $Relative" }
    foreach ($part in $Relative.Split('/')) {
        if ($part -in @('.', '..', '.git') -or $part.EndsWith('.')) { throw "Unsafe payload path: $Relative" }
    }
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $full = [IO.Path]::GetFullPath((Join-Path $base $Relative))
    if (!$full.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Payload path escaped root" }
    $cursor = $base
    foreach ($part in @('') + $Relative.Split('/')) {
        if ($part) { $cursor = Join-Path $cursor $part }
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Payload reparse point forbidden: $cursor" }
        }
    }
    return $full
}

function Get-PayloadInventory {
    param([string]$Root)
    if (!(Test-Path -LiteralPath $Root -PathType Container)) { throw "Payload root missing" }
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if ((Get-Item -LiteralPath $base).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Payload root reparse point forbidden" }
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($base)
    $names = @()
    while ($pending.Count -gt 0) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Payload reparse point forbidden: $($item.FullName)" }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
            else { $names += $item.FullName.Substring($base.Length + 1).Replace('\', '/') }
        }
    }
    return @($names | Sort-Object)
}

function Assert-PayloadFile {
    param([string]$Path, [object]$Entry)
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Payload file absent: $($Entry.path)" }
    if ((Get-Item -LiteralPath $Path).Length -ne [long]$Entry.size_bytes) { throw "Payload size mismatch: $($Entry.path)" }
    if ((Get-PayloadDigest $Path) -cne [string]$Entry.sha256) { throw "Payload hash mismatch: $($Entry.path)" }
}

function Install-JobPayload {
    param([string]$BundleRoot, [string]$Worktree, [object]$Job, [string]$ExpectedHead)
    if ($Job.schema_version -ne 'shuishu.runner-job.v1' -or $Job.job_id -notmatch '^job_[A-Za-z0-9_-]+$') { throw "Invalid payload job" }
    if ($Job.PSObject.Properties.Name -notcontains 'payload_manifest_sha256' -or $Job.payload_manifest_sha256 -cnotmatch '^[a-f0-9]{64}$') { throw "Job payload digest missing or malformed" }
    $manifestPath = Resolve-PayloadFile $BundleRoot 'manifest.json'
    if ((Get-PayloadDigest $manifestPath) -cne $Job.payload_manifest_sha256) { throw "Job manifest digest mismatch" }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema_version -ne 'shuishu.job-payload.v2') { throw "Unsupported job payload schema" }
    if ($manifest.job_id -cne $Job.job_id -or $manifest.parent_job_id -cne $Job.parent_job_id -or $manifest.source_job_id -cne $Job.parent_job_id) { throw "Payload job or parent binding mismatch" }
    if ($manifest.expected_head -cne $ExpectedHead -or $Job.expected_head -cne $ExpectedHead) { throw "Payload HEAD mismatch" }
    if ($manifest.file_count -lt 1 -or @($manifest.files).Count -ne $manifest.file_count) { throw "Payload file count mismatch" }
    $names = @()
    $plans = @()
    $payloadRoot = Join-Path $BundleRoot 'payload'
    foreach ($entry in $manifest.files) {
        $relative = [string]$entry.path
        if ($names -contains $relative) { throw "Duplicate payload path: $relative" }
        $names += $relative
        if ($entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $entry.size_bytes -isnot [ValueType] -or [long]$entry.size_bytes -lt 0) { throw "Invalid payload metadata: $relative" }
        if ($null -ne $entry.before_sha256 -and $entry.before_sha256 -cnotmatch '^[a-f0-9]{64}$') { throw "Invalid baseline digest: $relative" }
        $source = Resolve-PayloadFile $payloadRoot $relative
        $target = Resolve-PayloadFile $Worktree $relative
        Assert-PayloadFile $source $entry
        $existing = if (Test-Path -LiteralPath $target -PathType Leaf) { Get-PayloadDigest $target } else { $null }
        if ($existing -ceq $entry.sha256) {
            Assert-PayloadFile $target $entry
            $action = 'ALREADY_APPLIED'
        } else {
            if ($existing -cne $entry.before_sha256) { throw "Unknown candidate baseline: $relative" }
            $action = 'APPLIED'
        }
        $plans += @{ entry = $entry; source = $source; target = $target; before = $existing; action = $action }
    }
    $inventory = @(Get-PayloadInventory $payloadRoot)
    if (@(Compare-Object @($names | Sort-Object) $inventory).Count -ne 0) { throw "Payload inventory mismatch" }
    # Preflight completes for every file before the first target write.
    foreach ($plan in $plans) {
        Assert-PayloadFile $plan.source $plan.entry
        if ($plan.action -eq 'APPLIED') {
            New-Item -ItemType Directory -Path (Split-Path -Parent $plan.target) -Force | Out-Null
            Copy-Item -LiteralPath $plan.source -Destination $plan.target
        }
        Assert-PayloadFile $plan.target $plan.entry
    }
    $tracked = @(& git -C $Worktree ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect candidate inventory" }
    if (@(Compare-Object @($names | Sort-Object) @($tracked | Sort-Object -Unique)).Count -ne 0) { throw "Candidate inventory mismatch" }
    if ((Get-PayloadDigest $manifestPath) -cne $Job.payload_manifest_sha256) { throw "Manifest changed during installation" }
    return [ordered]@{
        status = 'PASS'
        schema_version = 'shuishu.job-payload-verification.v2'
        job_id = $Job.job_id
        parent_job_id = $Job.parent_job_id
        manifest_path = $manifestPath
        manifest_sha256 = $Job.payload_manifest_sha256
        source_job_id = $manifest.source_job_id
        source_head = $ExpectedHead
        exact_inventory_verified = $true
        file_count = $names.Count
        files = @($plans | ForEach-Object { [ordered]@{
            path = $_.entry.path
            size_bytes = $_.entry.size_bytes
            before_sha256 = $_.before
            sha256 = $_.entry.sha256
            action = $_.action
        } })
        production_worktree_unchanged = $true
    }
}
