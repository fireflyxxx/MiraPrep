$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$commonScript = Join-Path $repoRoot "scripts\dev-common.ps1"
$upScript = Join-Path $repoRoot "scripts\dev-up.ps1"
$downScript = Join-Path $repoRoot "scripts\dev-down.ps1"

foreach ($requiredScript in @($commonScript, $upScript, $downScript)) {
    if (-not (Test-Path -LiteralPath $requiredScript -PathType Leaf)) {
        throw "Missing required development script: $requiredScript"
    }
}

. $commonScript

$testRuntime = Join-Path ([System.IO.Path]::GetTempPath()) "miraprep-dev-script-test-$PID"
try {
    $firstToken = Get-OrCreateDevInternalToken -RuntimeDirectory $testRuntime
    $secondToken = Get-OrCreateDevInternalToken -RuntimeDirectory $testRuntime

    if ($firstToken -notmatch '^[a-f0-9]{64}$') {
        throw "Generated internal token is not a 64-character hexadecimal value"
    }
    if ($firstToken -ne $secondToken) {
        throw "Development internal token was not reused"
    }

    $dotenvPath = Join-Path $testRuntime "sample.env"
    @"
PLAIN=value
QUOTED="value with spaces"
EMPTY=
"@ | Set-Content -LiteralPath $dotenvPath -Encoding UTF8
    $dotenv = Read-DotEnvFile -Path $dotenvPath
    if ($dotenv["PLAIN"] -ne "value" -or $dotenv["QUOTED"] -ne "value with spaces") {
        throw "Dotenv parsing did not preserve expected values"
    }

    & $upScript -ValidateOnly | Out-Null

    $readme = Get-Content -Raw -Encoding UTF8 (Join-Path $repoRoot "README.md")
    if ($readme -notmatch [regex]::Escape(".\scripts\dev-up.ps1")) {
        throw "README does not document the one-click start command"
    }
    if ($readme -notmatch [regex]::Escape(".\scripts\dev-down.ps1")) {
        throw "README does not document the one-click stop command"
    }

    $gitignore = Get-Content -Raw -Encoding UTF8 (Join-Path $repoRoot ".gitignore")
    if ($gitignore -notmatch '(?m)^/\.runtime/$') {
        throw ".runtime is not ignored"
    }
}
finally {
    if (Test-Path -LiteralPath $testRuntime) {
        Remove-Item -LiteralPath $testRuntime -Recurse -Force
    }
}

Write-Host "Development script contract tests passed."
