param()
$ErrorActionPreference = "Stop"
$logFile = "D:\software\android\dloads\download.log"
New-Item -ItemType Directory -Force -Path "D:\software\android\dloads" | Out-Null
Set-Content -Path $logFile -Value "START $(Get-Date -Format HH:mm:ss)"

$items = @(
    @{ n = "jdk17";         u = "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20_8.zip" },
    @{ n = "cmdline-tools"; u = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" },
    @{ n = "gradle-8.2";    u = "https://mirrors.cloud.tencent.com/gradle/gradle-8.2-bin.zip" }
)

foreach ($it in $items) {
    $out = "D:\software\android\dloads\" + $it.n + ".zip"
    Add-Content $logFile "GET $($it.u)"
    & curl.exe -L --silent --show-error -o $out $it.u
    if ($LASTEXITCODE -ne 0) {
        Add-Content $logFile "FAIL $($it.n) rc=$LASTEXITCODE"
    } else {
        $size = (Get-Item $out).Length
        Add-Content $logFile "DONE $($it.n) $size bytes"
    }
}
Add-Content $logFile "ALL_DONE $(Get-Date -Format HH:mm:ss)"
