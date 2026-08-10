param(
    [int]$Port = 8000,
    [switch]$InstallStartupTask
)

$ErrorActionPreference = "Stop"

# netsh portproxy requires an elevated Windows PowerShell process.
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", ('"{0}"' -f $PSCommandPath),
        "-Port", $Port
    )
    if ($InstallStartupTask) {
        $arguments += "-InstallStartupTask"
    }

    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

# Asking WSL for its address also starts the WSL VM when it is not running.
$rawAddresses = (& wsl.exe -e hostname -I | Out-String).Trim()
$wslAddress = ($rawAddresses -split "\s+")[0]

$parsedAddress = $null
if (-not [Net.IPAddress]::TryParse($wslAddress, [ref]$parsedAddress)) {
    throw "Unable to determine the current WSL IPv4 address. Raw output: $rawAddresses"
}

# The address changes after WSL/Docker/Windows restarts, so always replace the old rule.
& netsh.exe interface portproxy delete v4tov4 `
    listenaddress=127.0.0.1 listenport=$Port 2>$null | Out-Null

& netsh.exe interface portproxy add v4tov4 `
    listenaddress=127.0.0.1 listenport=$Port `
    connectaddress=$wslAddress connectport=$Port | Out-Null

if ($LASTEXITCODE -ne 0) {
    throw "Failed to create the Windows-to-WSL port forwarding rule."
}

if ($InstallStartupTask) {
    $taskName = "PsychProject-WSL-PortProxy"
    $taskCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $PSCommandPath, $Port

    & schtasks.exe /Create /F /TN $taskName /SC ONLOGON /RL HIGHEST /TR $taskCommand | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "The forwarding rule was updated, but the Windows logon task could not be installed."
    }
    Write-Host "Installed startup task: $taskName" -ForegroundColor Green
}

Write-Host "WSL address: $wslAddress" -ForegroundColor Cyan
Write-Host "Forwarding: http://localhost:$Port -> http://${wslAddress}:$Port" -ForegroundColor Green

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    Write-Host ("Health check: {0}" -f ($health | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
    Write-Warning "The forwarding rule is ready, but the backend is not responding yet. Start the project in WSL and refresh the browser."
}

