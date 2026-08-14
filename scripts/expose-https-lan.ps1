param(
    [int]$Port = 8443
)
# Expose the WSL HTTPS backend to the Windows LAN IP (0.0.0.0) for the terminal device.
# Needs Windows admin (netsh portproxy + firewall rule). Self-elevates.

$ErrorActionPreference = "Stop"
$logFile = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\logs\expose-lan-https.txt"))

function Write-Step($msg) { Write-Host $msg; Add-Content -Path $logFile -Value $msg }

# Self-elevate
$current = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($current)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Set-Content -Path $logFile -Value "WAITING_FOR_ELEVATION"
    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`"", "-Port", "$Port"
    )
    exit
}

Set-Content -Path $logFile -Value "RUNNING"
try {
    $raw = (& wsl.exe -e hostname -I | Out-String).Trim()
    $wslAddress = ($raw -split "\s+")[0]
    if (-not $wslAddress) { throw "Cannot determine WSL IP (raw: $raw)" }

    & netsh.exe interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$Port 2>$null | Out-Null
    & netsh.exe interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$Port connectaddress=$wslAddress connectport=$Port | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to add portproxy rule" }

    $ruleName = "PsychProject-LAN-HTTPS-$Port"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null

    Write-Step "OK | WSL_IP=$wslAddress | 0.0.0.0:$Port -> ${wslAddress}:$Port | firewall=$ruleName"
} catch {
    Write-Step "ERROR | $($_.Exception.Message)"
}
