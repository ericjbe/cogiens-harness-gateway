[CmdletBinding()]
param([ValidateSet('Initialize','Sign')][string]$Mode='Sign', [Parameter(Mandatory=$true)][string]$KeyName)
$ErrorActionPreference='Stop'
if ($KeyName -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Invalid identity name' }
if ($Mode -eq 'Initialize' -and ![Security.Cryptography.CngKey]::Exists($KeyName)) {
    $parameters=[Security.Cryptography.CngKeyCreationParameters]::new()
    $parameters.ExportPolicy=[Security.Cryptography.CngExportPolicies]::None
    $parameters.KeyUsage=[Security.Cryptography.CngKeyUsages]::Signing
    $created=[Security.Cryptography.CngKey]::Create([Security.Cryptography.CngAlgorithm]::ECDsaP256,$KeyName,$parameters)
    $created.Dispose()
}
$key=[Security.Cryptography.CngKey]::Open($KeyName)
try {
    if ($Mode -eq 'Initialize') {
        # Only public coordinates are exported. Private material remains nonexportable in Windows CNG.
        $blob=$key.Export([Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob)
        function Base64Url([byte[]]$Bytes) { [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
        @{kty='EC';crv='P-256';x=(Base64Url $blob[8..39]);y=(Base64Url $blob[40..71])}|ConvertTo-Json -Compress
    } else {
        $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
        $signer=[Security.Cryptography.ECDsaCng]::new($key)
        try { [Convert]::ToBase64String($signer.SignData($inputBytes,[Security.Cryptography.HashAlgorithmName]::SHA256)) } finally { $signer.Dispose() }
    }
} finally { $key.Dispose() }
