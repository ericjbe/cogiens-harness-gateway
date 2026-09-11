[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Repository,
  [Parameter(Mandatory=$true)][string]$InstallRoot,
  [int]$IsolatedPort=18789,
  [string]$ProductionGatewayUrl='http://127.0.0.1:8787'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($Repository).TrimEnd('\')
$destination=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if($destination -eq $repo -or $destination.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase) -or $repo.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Runner installation must not overlap the repository'}
if(Test-Path -LiteralPath $destination){throw 'Refusing to overwrite an existing Runner installation'}
if($IsolatedPort -eq 8787 -or $IsolatedPort -lt 1024){throw 'Invalid isolated port'}
$head=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Invalid repository'}
$origin=(& git -C $repo rev-parse refs/remotes/origin/main).Trim();if($LASTEXITCODE -ne 0){throw 'Origin baseline missing'}
$dirty=@(& git -C $repo status --porcelain=v1|ForEach-Object{$_.Substring(3)})
New-Item -ItemType Directory -Path (Join-Path $destination 'runner')|Out-Null
$changes=@()
foreach($name in @('RUNNER.ps1','STAGE.ps1','STAGE.core-v2.ps1','AUTO-RECOVER.v1.ps1','PAYLOAD.v2.ps1','ASSEMBLE-PAYLOAD.v2.ps1')){
  $source=Join-Path $PSScriptRoot $name;$target=Join-Path (Join-Path $destination 'runner') $name
  Copy-Item -LiteralPath $source -Destination $target
  $changes+=@{path=('runner/'+$name);before_sha256=$null;after_sha256=(Get-FileHash -LiteralPath $target).Hash}
}
$config=@{
 schema_version='shuishu.m3-runner-stage.v1';expected_computer_name=$env:COMPUTERNAME
 expected_head=$head;expected_origin_main=$origin;target_repository=$repo;install_root=$destination
 worktree_root=(Join-Path $destination 'worktrees');evidence_root=(Join-Path $destination 'evidence');spool_root=(Join-Path $destination 'spool')
 isolated_host='127.0.0.1';isolated_port=$IsolatedPort;production_gateway_url=$ProductionGatewayUrl
 baseline_config_candidates=@('config/harnesses.example.json');candidate_config_candidates=@('config/hk.json','config/harnesses.example.json')
 verify_command=@('npm.cmd','run','verify');expected_dirty_paths=$dirty
 runner=@{task_name='Shuishu-Runner';poll_seconds=15;allowed_operation='gateway-stage-v1';transport='local-durable-spool';remote_queue_enabled=$false}
}
[IO.File]::WriteAllText((Join-Path $destination 'config.json'),($config|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $destination 'installation-audit.json'),($changes|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output 'INSTALLED_NOT_STARTED'
