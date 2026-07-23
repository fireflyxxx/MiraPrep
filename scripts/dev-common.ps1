$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-DotEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing environment file: $Path"
    }

    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            continue
        }
        if ($line.StartsWith("export ")) {
            $line = $line.Substring(7).Trim()
        }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        $values[$key] = $value
    }
    return $values
}

function Get-OrCreateDevInternalToken {
    param([Parameter(Mandatory = $true)][string]$RuntimeDirectory)

    New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
    $tokenPath = Join-Path $RuntimeDirectory "dev-internal-token"
    if (Test-Path -LiteralPath $tokenPath -PathType Leaf) {
        $existing = (Get-Content -Raw -LiteralPath $tokenPath -Encoding UTF8).Trim()
        if ($existing -notmatch '^[a-f0-9]{64}$') {
            throw "Invalid development token in $tokenPath; expected 64 hexadecimal characters."
        }
        return $existing
    }

    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    [System.IO.File]::WriteAllText(
        $tokenPath,
        $token,
        (New-Object System.Text.UTF8Encoding($false))
    )
    return $token
}

function Resolve-RequiredCommand {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        throw "Required command '$Name' was not found in PATH."
    }
    return $command.Source
}

function Resolve-Java21Home {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:JAVA_HOME) {
        $candidates.Add($env:JAVA_HOME)
    }
    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "MiraPrep\tools\temurin-21"))
    }
    if (Test-Path -LiteralPath "E:\jdk21") {
        foreach ($directory in Get-ChildItem -LiteralPath "E:\jdk21" -Directory -ErrorAction SilentlyContinue) {
            $candidates.Add($directory.FullName)
        }
    }

    foreach ($candidate in $candidates) {
        $java = Join-Path $candidate "bin\java.exe"
        if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
            continue
        }
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $versionText = (& $java -version 2>&1 | Out-String)
        }
        finally {
            $ErrorActionPreference = $previousErrorPreference
        }
        if ($versionText -match 'version "21(?:\.|"|-)') {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }
    throw "JDK 21 was not found. Set JAVA_HOME to a JDK 21 installation."
}

function Assert-RequiredKeys {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values,
        [Parameter(Mandatory = $true)][string[]]$Keys,
        [Parameter(Mandatory = $true)][string]$SourceName
    )

    foreach ($key in $Keys) {
        if (-not $Values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Values[$key])) {
            throw "Missing required key '$key' in $SourceName."
        }
    }
}

function Assert-PortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        $owners = ($listener | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        throw "Port $Port is already in use by process $owners. Stop the existing service first."
    }
}

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StdoutPath,
        [Parameter(Mandatory = $true)][string]$StderrPath,
        [hashtable]$ProcessEnvironment = @{}
    )

    $previous = @{}
    foreach ($key in $ProcessEnvironment.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$ProcessEnvironment[$key], "Process")
    }
    try {
        return Start-Process `
            -FilePath $FilePath `
            -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory `
            -WindowStyle Hidden `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath `
            -PassThru
    }
    finally {
        foreach ($key in $ProcessEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
        }
    }
}

function New-DevProcessRecord {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process
    )

    return [ordered]@{
        name = $Name
        pid = $Process.Id
        startTimeUtc = $Process.StartTime.ToUniversalTime().ToString("o")
    }
}

function Save-DevState {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [hashtable]$Headers = @{},
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $Headers -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return $response
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $Uri"
}

function Wait-DockerContainerHealthy {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $status = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $ContainerName 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $status -in @("healthy", "running")) {
            return
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "Container $ContainerName did not become healthy."
}

function Get-DescendantProcessIds {
    param([Parameter(Mandatory = $true)][int]$ParentProcessId)

    $allProcesses = @(Get-CimInstance Win32_Process)
    $result = New-Object System.Collections.Generic.List[int]
    function Add-Children([int]$ParentId) {
        foreach ($child in $allProcesses | Where-Object { $_.ParentProcessId -eq $ParentId }) {
            Add-Children -ParentId ([int]$child.ProcessId)
            $result.Add([int]$child.ProcessId)
        }
    }
    Add-Children -ParentId $ParentProcessId
    return $result.ToArray()
}

function Stop-TrackedProcessTree {
    param([Parameter(Mandatory = $true)]$Record)

    $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
    if (-not $process) {
        return
    }
    $expectedStart = [DateTime]::Parse([string]$Record.startTimeUtc).ToUniversalTime()
    if ([Math]::Abs(($process.StartTime.ToUniversalTime() - $expectedStart).TotalSeconds) -gt 2) {
        Write-Warning "Skipped PID $($Record.pid): it has been reused by another process."
        return
    }

    foreach ($childId in Get-DescendantProcessIds -ParentProcessId $process.Id) {
        Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}
