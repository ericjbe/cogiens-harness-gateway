[CmdletBinding()]
param([string]$JobId, [string]$ConfigPath)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Set-StrictMode -Version Latest
$env:GIT_OPTIONAL_LOCKS='0'
$nodeDirectory=Split-Path -Parent (Get-Command node.exe -ErrorAction Stop).Source
$env:Path=$nodeDirectory+';'+$env:Path
. (Join-Path $PSScriptRoot 'PAYLOAD.v2.ps1')
$config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
$installRoot=Split-Path -Parent $PSScriptRoot
$runDir=Join-Path $config.evidence_root $JobId
$spool=[string]$config.spool_root
function Write-NewJson($Path,$Value) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force|Out-Null
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 60))
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew)
    try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
function Save-Workflow {
    $script:workflow.updated_at=[DateTime]::UtcNow.ToString('o')
    $tmp=Join-Path $runDir ('state.'+[Guid]::NewGuid().ToString('N')+'.tmp')
    Write-NewJson $tmp $script:workflow
    Move-Item -LiteralPath $tmp -Destination (Join-Path $runDir 'state.json') -Force
}
function Emit($Type,$Data) {
    $event=@{type=$Type;job_id=$JobId;occurred_at=[DateTime]::UtcNow.ToString('o');data=$Data}
    [IO.File]::AppendAllText((Join-Path $runDir 'events.jsonl'),($event|ConvertTo-Json -Compress -Depth 30)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
    Write-Output "$Type $($Data|ConvertTo-Json -Compress -Depth 5)"
}
function Is-RecoverablePayloadFailure($State) {
    if($null -eq $State -or $State.current_stage -ne '04-apply-10-plus-6-and-artifact-candidate'){return $false}
    $failed=$State.stages.PSObject.Properties[$State.current_stage]
    if($null -eq $failed){return $false}
    return [string]$failed.Value.error -match '^(Unknown clean baseline for |Candidate new path already exists: |Payload (after-hash|hash|size|file count|inventory) mismatch|Payload file absent: |Job manifest digest mismatch|Per-job payload binding or bundle missing)'
}
function Source-Job($Id) {
    if($Id -notmatch '^job_[A-Za-z0-9_-]+$'){throw 'Invalid source job id'}
    $resultPath=Join-Path (Join-Path $spool 'outbox') ($Id+'.result.json')
    $result=Get-Content -LiteralPath $resultPath -Raw|ConvertFrom-Json
    if($result.status -ne 'READY_FOR_REVIEW'){throw 'Source job must have a real READY_FOR_REVIEW result'}
    $source=Join-Path $config.worktree_root $Id
    $bundle=Join-Path (Join-Path $installRoot 'job-payloads') $Id
    $sourceJob=Get-Content -LiteralPath (Join-Path (Join-Path $spool 'completed') ($Id+'.json')) -Raw|ConvertFrom-Json
    $manifest=Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw|ConvertFrom-Json
    if($manifest.job_id -cne $Id -or $manifest.expected_head -cne $config.expected_head){throw 'Source identity mismatch'}
    foreach($entry in $manifest.files){Assert-PayloadFile (Resolve-PayloadFile (Join-Path $bundle 'payload') $entry.path) $entry}
    if(@(Compare-Object @($manifest.files.path|Sort-Object) @(Get-PayloadInventory (Join-Path $bundle 'payload'))).Count){throw 'Source bundle inventory drift'}
    return @{worktree=$source;bundle=$bundle;manifest_sha256=$sourceJob.payload_manifest_sha256;file_count=$manifest.file_count}
}
function Assert-SourceExact($Id) {
    if($Id -notmatch '^job_[A-Za-z0-9_-]+$'){throw 'Invalid source job id'}
    $source=Join-Path $config.worktree_root $Id
    $bundle=Join-Path (Join-Path $installRoot 'job-payloads') $Id
    $sourceJob=Get-Content -LiteralPath (Join-Path (Join-Path $spool 'completed') ($Id+'.json')) -Raw|ConvertFrom-Json
    if((Get-PayloadDigest (Join-Path $bundle 'manifest.json')) -cne $sourceJob.payload_manifest_sha256){throw 'Source manifest digest drift'}
    $manifest=Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw|ConvertFrom-Json
    foreach($entry in $manifest.files){Assert-PayloadFile (Resolve-PayloadFile $source $entry.path) $entry}
    $actual=@(& git -C $source ls-files --cached --others --exclude-standard|Sort-Object -Unique)
    if($LASTEXITCODE -ne 0 -or @(Compare-Object @($manifest.files.path|Sort-Object) $actual).Count){throw 'Source inventory drift'}
}
function Check-Cancel {
    if(Test-Path -LiteralPath (Join-Path (Join-Path $spool 'cancel') ($JobId+'.json'))){throw 'WORKFLOW_CANCELLED'}
}
function Invoke-Owned($File,$Arguments,$WorkingDirectory,$LogPrefix,[int]$TimeoutSeconds=300) {
    Check-Cancel
    New-Item -ItemType Directory -Path (Split-Path -Parent $LogPrefix) -Force|Out-Null
    $process=Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -RedirectStandardOutput ($LogPrefix+'.stdout.log') -RedirectStandardError ($LogPrefix+'.stderr.log') -WindowStyle Hidden -PassThru
    Write-NewJson ($LogPrefix+'.process.json') @{pid=$process.Id;file=$File;arguments=$Arguments;started_at=[DateTime]::UtcNow.ToString('o');owner_job_id=$JobId}
    $timer=[Diagnostics.Stopwatch]::StartNew()
    try{
        while(!$process.HasExited){
            Check-Cancel
            if($timer.Elapsed.TotalSeconds -gt $TimeoutSeconds){throw 'OWNED_PROCESS_TIMEOUT'}
            Start-Sleep -Milliseconds 250
            $process.Refresh()
        }
        $process.WaitForExit()
        return [int]$process.ExitCode
    }finally{
        if(!$process.HasExited){
            & taskkill.exe /PID $process.Id /T /F 2>&1|Out-Null
            $process.WaitForExit()
        }
    }
}
function Seal-Attempt($Id,$Outcome) {
    $path=Join-Path (Join-Path $spool 'outbox') ($Id+'.result.json')
    Write-NewJson $path $Outcome
    $destination=if($Outcome.status -eq 'READY_FOR_REVIEW'){'completed'}else{'failed'}
    $processing=Join-Path (Join-Path $spool 'processing') ($Id+'.json')
    if(Test-Path -LiteralPath $processing){[IO.File]::Move($processing,(Join-Path (Join-Path $spool $destination) ($Id+'.json')))}
    Emit 'attempt.completed' @{attempt_job_id=$Id;status=$Outcome.status;result=$path}
}
$created=$false
$mutex=[Threading.Mutex]::new($false,'ShuishuM3AutoRecoveryV1',[ref]$created)
if(!$mutex.WaitOne(0)){throw 'Another automatic recovery workflow is active'}
try {
    if($JobId -notmatch '^job_[A-Za-z0-9_-]+$'){throw 'Invalid workflow job id'}
    if($env:COMPUTERNAME -ne $config.expected_computer_name){throw 'Wrong computer'}
    $jobPath=Join-Path (Join-Path $spool 'processing') ($JobId+'.json')
    $job=Get-Content -LiteralPath $jobPath -Raw|ConvertFrom-Json
    if($job.job_id -cne $JobId -or $job.operation -ne 'gateway-stage-v1' -or $job.workflow -ne 'candidate-recovery-v1'){throw 'Invalid automatic recovery job'}
    if($job.expected_head -cne $config.expected_head){throw 'Workflow baseline mismatch'}
    if($job.manifest_origin -notin @('source','legacy-release')){throw 'Unsupported manifest origin'}
    $sourceId=[string]$job.source_job_id
    if(Test-Path -LiteralPath (Join-Path $runDir 'state.json')){
        $prior=Get-Content -LiteralPath (Join-Path $runDir 'state.json') -Raw|ConvertFrom-Json
        if($prior.status -eq 'READY_FOR_REVIEW'){Write-Output 'READY_FOR_REVIEW';exit 0}
        throw 'Existing workflow evidence is immutable; submit a new retry job referencing it'
    }
    New-Item -ItemType Directory -Path $runDir -Force|Out-Null
    $script:workflow=[ordered]@{schema_version='shuishu.automatic-recovery-state.v1';job_id=$JobId;source_job_id=$sourceId;status='RUNNING';created_at=[DateTime]::UtcNow.ToString('o');updated_at='';attempts=@();worktree=$null;current_stage='source-verification';last_error=$null}
    Save-Workflow
    try{
        Assert-SourceExact $sourceId
        $sourceInfo=Source-Job $sourceId
        Write-NewJson (Join-Path $runDir 'source-provenance.json') $sourceInfo
        Emit 'source.verified' $sourceInfo
        $sourceWorktree=$sourceInfo.worktree
        $parent=$sourceId
        for($number=1;$number -le 3;$number++){
            Check-Cancel
            $attemptId=$JobId+'_a'+$number
            $attemptDir=Join-Path $config.evidence_root $attemptId
            $worktree=Join-Path $config.worktree_root $attemptId
            if((Test-Path $attemptDir) -or (Test-Path $worktree)){throw 'Attempt identity collision; history must not be overwritten'}
            New-Item -ItemType Directory -Path $attemptDir|Out-Null
            $script:workflow.current_stage='create-isolated-candidate'
            Save-Workflow
            $code=Invoke-Owned 'git.exe' @('-C',$sourceWorktree,'worktree','add','--detach',$worktree,$config.expected_head) $runDir (Join-Path $attemptDir 'create-worktree')
            if($code -ne 0){throw 'Automatic worktree creation failed'}
            $legacy=($number -eq 1 -and $job.manifest_origin -eq 'legacy-release')
            $bundle=if($legacy){Join-Path $attemptDir 'assembled-source'}else{Join-Path (Join-Path $installRoot 'job-payloads') $attemptId}
            $manifest=& (Join-Path $PSScriptRoot 'ASSEMBLE-PAYLOAD.v2.ps1') -SourceWorktree $sourceWorktree -TargetWorktree $worktree -BundleRoot $bundle -JobId $attemptId -ParentJobId $parent -ExpectedHead $config.expected_head -AuditDirectory $attemptDir
            $script:workflow.worktree=$worktree
            Emit 'candidate.assembled' @{attempt_job_id=$attemptId;worktree=$worktree;files=$manifest.file_count;source_job_id=$parent}
            $script:workflow.current_stage='full-verify'
            Save-Workflow
            $testCode=Invoke-Owned $env:ComSpec @('/d','/c','npm.cmd run verify') $worktree (Join-Path $attemptDir 'pre-stage-verify')
            $testText=[IO.File]::ReadAllText((Join-Path $attemptDir 'pre-stage-verify.stdout.log'))
            $tests=[int][regex]::Match($testText,'(?m)^# tests (\d+)').Groups[1].Value
            $pass=[int][regex]::Match($testText,'(?m)^# pass (\d+)').Groups[1].Value
            $failMatch=[regex]::Match($testText,'(?m)^# fail (\d+)')
            $fail=if($failMatch.Success){[int]$failMatch.Groups[1].Value}else{-1}
            $test=@{command='npm.cmd run verify';exit_code=$testCode;tests=$tests;pass=$pass;fail=$fail}
            Write-NewJson (Join-Path $attemptDir 'pre-stage-verify.json') $test
            $attemptJob=[ordered]@{schema_version='shuishu.runner-job.v1';job_id=$attemptId;parent_job_id=$parent;root_job_id=$JobId;source_job_id=$parent;attempt=$number;operation='gateway-stage-v1';expected_head=$config.expected_head;requested_at=[DateTime]::UtcNow.ToString('o');parameters=@{}}
            if(!$legacy){$attemptJob.payload_manifest_sha256=Get-PayloadDigest (Join-Path $bundle 'manifest.json')}
            Write-NewJson (Join-Path (Join-Path $spool 'processing') ($attemptId+'.json')) $attemptJob
            if($testCode -ne 0 -or $tests -lt 65 -or $pass -ne $tests -or $fail -ne 0){
                $outcome=@{schema_version='shuishu.runner-result.v1';job_id=$attemptId;status='BLOCKED';exit_code=$testCode;error='Full verification failed; source code is not automatically rewritten';tests=$test;evidence=$attemptDir;completed_at=[DateTime]::UtcNow.ToString('o')}
                Seal-Attempt $attemptId $outcome
                $script:workflow.attempts+=@{job_id=$attemptId;status='BLOCKED';tests=$test}
                throw 'CANDIDATE_TESTS_FAILED'
            }
            Emit 'candidate.verified' @{attempt_job_id=$attemptId;tests=$tests;pass=$pass}
            $script:workflow.current_stage='stage-execution'
            Save-Workflow
            $exit=Invoke-Owned 'powershell.exe' @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'STAGE.core-v2.ps1'),'-Mode','Execute','-JobId',$attemptId,'-ConfigPath',$ConfigPath) $runDir (Join-Path $runDir ('workers/'+$attemptId))
            $stage=if(Test-Path (Join-Path $attemptDir 'state.json')){Get-Content (Join-Path $attemptDir 'state.json') -Raw|ConvertFrom-Json}else{$null}
            $success=($exit -eq 0 -and $null -ne $stage -and $stage.status -eq 'READY_FOR_REVIEW')
            $status=if($success){'READY_FOR_REVIEW'}else{'REJECTED'}
            $outcome=@{schema_version='shuishu.runner-result.v1';job_id=$attemptId;parent_job_id=$parent;root_job_id=$JobId;status=$status;exit_code=$exit;stage_state=$stage;tests=$test;evidence=$attemptDir;completed_at=[DateTime]::UtcNow.ToString('o')}
            Seal-Attempt $attemptId $outcome
            $script:workflow.attempts+=@{job_id=$attemptId;parent_job_id=$parent;status=$status;tests=$test;evidence=$attemptDir}
            if($success){
                Assert-SourceExact $sourceId
                $script:workflow.status='READY_FOR_REVIEW'
                $script:workflow.current_stage=$null
                Save-Workflow
                Emit 'workflow.completed' @{status='READY_FOR_REVIEW';attempts=$number;final_attempt=$attemptId}
                $hashes=@(Get-ChildItem -LiteralPath $runDir -File -Recurse|Where-Object Name -ne 'SHA256SUMS.txt'|Sort-Object FullName|ForEach-Object {'{0}  {1}' -f (Get-PayloadDigest $_.FullName),$_.FullName.Substring($runDir.Length+1)})
                [IO.File]::WriteAllLines((Join-Path $runDir 'SHA256SUMS.txt'),$hashes,[Text.UTF8Encoding]::new($false))
                Write-Output 'READY_FOR_REVIEW'
                exit 0
            }
            if(!(Is-RecoverablePayloadFailure $stage)){throw 'Non-payload failure; automatic integrity repair is not applicable'}
            Emit 'payload.recovery.scheduled' @{failed_job_id=$attemptId;next_attempt=$number+1;strategy='new-candidate-and-complete-source-derived-manifest'}
            $parent=$attemptId
            $sourceWorktree=$worktree
            Save-Workflow
        }
        throw 'Automatic retry limit exhausted'
    }catch{
        $script:workflow.status=if($_.Exception.Message -eq 'WORKFLOW_CANCELLED'){'CANCELLED'}else{'BLOCKED'}
        $script:workflow.last_error=$_.Exception.Message
        Save-Workflow
        Emit 'workflow.blocked' @{error=$_.Exception.Message;status=$script:workflow.status}
        exit 1
    }
}finally{
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
