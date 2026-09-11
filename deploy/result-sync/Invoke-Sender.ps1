[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigurationPath,[Parameter(Mandatory=$true)][string]$NodeExecutable)
$ErrorActionPreference='Stop'
$config=Get-Content -LiteralPath $ConfigurationPath -Raw|ConvertFrom-Json
$sourceRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$agent=Join-Path $sourceRoot 'packages/result-sync/agent.mjs'
if($ConfigurationPath.Contains('"') -or $agent.Contains('"')){throw 'Invalid argument path'}
$logDirectory=Join-Path ([string]$config.directory) 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force|Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$NodeExecutable
$start.Arguments='"'+$agent+'" "'+$ConfigurationPath+'" --once'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($start)
$output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
if(!$process.WaitForExit(90000)){$process.Kill();throw 'Sender cycle exceeded timeout'}
$code=$process.ExitCode
$log=Join-Path $logDirectory ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.log')
[IO.File]::WriteAllText($log,$output.Result+$errors.Result,[Text.UTF8Encoding]::new($false))
$process.Dispose()
exit $code
