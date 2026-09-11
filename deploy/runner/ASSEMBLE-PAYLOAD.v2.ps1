param(
    [string]$SourceWorktree, [string]$TargetWorktree, [string]$BundleRoot,
    [string]$JobId, [string]$ParentJobId, [string]$ExpectedHead, [string]$AuditDirectory
)
$ErrorActionPreference = 'Stop'
$env:GIT_OPTIONAL_LOCKS = '0'
. (Join-Path $PSScriptRoot 'PAYLOAD.v2.ps1')
if (Test-Path -LiteralPath $BundleRoot) { throw 'Bundle already exists; create a new immutable bundle' }
if ([IO.Path]::GetFullPath($SourceWorktree) -eq [IO.Path]::GetFullPath($TargetWorktree)) { throw 'Source and target must differ' }
foreach ($root in @($SourceWorktree, $TargetWorktree)) {
    $actual = (& git -C $root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $actual -cne $ExpectedHead) { throw 'Unexpected worktree HEAD' }
}
$sourceFiles = @(& git -C $SourceWorktree ls-files --cached --others --exclude-standard | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0 -or $sourceFiles.Count -lt 1) { throw 'Empty source inventory' }
$payload = Join-Path $BundleRoot 'payload'
New-Item -ItemType Directory -Path $payload | Out-Null
$records = @()
foreach ($relative in $sourceFiles) {
    $source = Resolve-PayloadFile $SourceWorktree $relative
    $target = Resolve-PayloadFile $TargetWorktree $relative
    $packed = Resolve-PayloadFile $payload $relative
    $before = if (Test-Path -LiteralPath $target -PathType Leaf) { Get-PayloadDigest $target } else { $null }
    $entry = [ordered]@{path=$relative;size_bytes=(Get-Item -LiteralPath $source).Length;sha256=Get-PayloadDigest $source;before_sha256=$before}
    foreach ($destination in @($target, $packed)) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination
        Assert-PayloadFile $destination $entry
    }
    Assert-PayloadFile $source $entry
    $records += $entry
}
$manifest = [ordered]@{
    schema_version='shuishu.job-payload.v2'
    job_id=$JobId
    parent_job_id=$ParentJobId
    source_job_id=$ParentJobId
    source_worktree=$SourceWorktree
    expected_head=$ExpectedHead
    created_at=[DateTime]::UtcNow.ToString('o')
    file_count=$records.Count
    files=$records
}
$manifestPath = Join-Path $BundleRoot 'manifest.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
$recordPath = Join-Path $AuditDirectory 'assembly-record.json'
[IO.File]::WriteAllText($recordPath, (@{
    job_id=$JobId;source=$SourceWorktree;target=$TargetWorktree;bundle=$BundleRoot
    manifest_sha256=Get-PayloadDigest $manifestPath
    target_changes=@($records | ForEach-Object {@{path=$_.path;before_sha256=$_.before_sha256;after_sha256=$_.sha256;size_bytes=$_.size_bytes}})
    bundle_files=@($records | ForEach-Object {@{path=('payload/'+$_.path);before_sha256=$null;after_sha256=$_.sha256;size_bytes=$_.size_bytes}})
} | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
return $manifest
