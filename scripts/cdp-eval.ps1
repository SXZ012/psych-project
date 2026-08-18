param(
    [Parameter(Mandatory=$true)][string]$Js,
    [int]$TimeoutSec = 20
)
# CDP Runtime.evaluate helper: -Js '1+1' -> prints JSON result
$ErrorActionPreference = "Stop"

# 1) find the page ws url
$pages = curl.exe -s -m 6 http://127.0.0.1:9222/json | ConvertFrom-Json
$page = $pages | Where-Object { $_.type -eq "page" } | Select-Object -First 1
if (-not $page) { Write-Output '{"error":"no page"}'; exit 1 }
$wsUrl = $page.webSocketDebuggerUrl

# 2) websocket roundtrip
$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$wsUrl, $ct).Wait($TimeoutSec * 1000) | Out-Null

$payload = @{
    id = 1
    method = "Runtime.evaluate"
    params = @{
        expression = $Js
        returnByValue = $true
        awaitPromise = $true
    }
} | ConvertTo-Json -Depth 5 -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait($TimeoutSec * 1000) | Out-Null

$buf = New-Object byte[] 1048576
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
while ($true) {
    $res = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
    if (-not $res.Wait($TimeoutSec * 1000)) { break }
    $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Result.Count)
    if ($res.Result.EndOfMessage) {
        $obj = $msg | ConvertFrom-Json
        if ($obj.id -eq 1) { Write-Output ($obj.result | ConvertTo-Json -Depth 10 -Compress); break }
    }
    if ([DateTime]::UtcNow -gt $deadline) { Write-Output '{"error":"timeout"}'; break }
}
$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $ct).Wait(2000) | Out-Null
