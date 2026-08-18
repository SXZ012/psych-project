param()
$ErrorActionPreference = "Stop"
$log = "D:\software\android\setup.log"
function L($m) { Write-Host $m; Add-Content -Path $log -Value $m }

$root = "D:\software\android"
$dls = "$root\dloads"

# 1) JDK
if (-not (Test-Path "$root\jdk17")) {
    L "[1/4] unzip jdk17 ..."
    Expand-Archive -Path "$dls\jdk17.zip" -DestinationPath "$root\jdk-tmp" -Force
    $dir = (Get-ChildItem "$root\jdk-tmp" -Directory | Select-Object -First 1).FullName
    Move-Item $dir "$root\jdk17"
    Remove-Item "$root\jdk-tmp" -Recurse -Force
    L "  jdk17 -> $root\jdk17"
} else { L "[1/4] jdk17 exists" }

# 2) Gradle
if (-not (Test-Path "$root\gradle-8.2")) {
    L "[2/4] unzip gradle ..."
    Expand-Archive -Path "$dls\gradle-8.2.zip" -DestinationPath $root -Force
    L "  gradle -> $root\gradle-8.2"
} else { L "[2/4] gradle exists" }

# 3) cmdline-tools -> sdk\cmdline-tools\latest
$sdk = "$root\android-sdk"
if (-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    L "[3/4] install cmdline-tools ..."
    Expand-Archive -Path "$dls\cmdline-tools.zip" -DestinationPath "$root\ct-tmp" -Force
    New-Item -ItemType Directory -Force -Path "$sdk\cmdline-tools" | Out-Null
    Move-Item "$root\ct-tmp\cmdline-tools" "$sdk\cmdline-tools\latest"
    Remove-Item "$root\ct-tmp" -Recurse -Force
    L "  sdkmanager -> $sdk\cmdline-tools\latest"
} else { L "[3/4] cmdline-tools exists" }

# 4) SDK packages (platform + build-tools), accept licenses
$env:JAVA_HOME = "$root\jdk17"
$env:PATH = "$root\jdk17\bin;$env:PATH"
$sdkmgr = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
L "[4/4] accepting licenses ..."
Set-Content -Path "$root\yes.txt" -Value ("y`n" * 20)
cmd /c "`"$sdkmgr`" --licenses < `"$root\yes.txt`"" | Out-Null
L "  installing platforms;android-34 + build-tools;34.0.0 (this takes a while) ..."
cmd /c "`"$sdkmgr`" `"platforms;android-34`" `"build-tools;34.0.0`" < `"$root\yes.txt`"" | Out-Null
if (Test-Path "$sdk\platforms\android-34") { L "  platforms: OK" } else { L "  platforms: MISSING" }
if (Test-Path "$sdk\build-tools\34.0.0") { L "  build-tools: OK" } else { L "  build-tools: MISSING" }
L "SETUP_DONE"
