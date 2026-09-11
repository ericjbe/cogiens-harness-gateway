[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigurationPath,[string]$TaskName='Shuishu-Result-Sync',[string]$NodeExecutable=(Get-Command node.exe -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
if(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue){throw 'Refusing to overwrite an existing task'}
$script=Join-Path $PSScriptRoot 'Invoke-Sender.ps1'
if($ConfigurationPath.Contains('"') -or $NodeExecutable.Contains('"') -or $script.Contains('"')){throw 'Invalid argument path'}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$script+'" -ConfigurationPath "'+$ConfigurationPath+'" -NodeExecutable "'+$NodeExecutable+'"'
$action=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType S4U -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings|Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output 'SENDER_TASK_REGISTERED_VERIFY_FIRST_RECEIPT'
