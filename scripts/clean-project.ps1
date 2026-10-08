param([switch]$Apply)

# Preview by default. Only disposable caches inside this project are eligible.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'backend/app')) -or
    -not (Test-Path -LiteralPath (Join-Path $projectRoot 'frontend'))) {
    throw 'Cannot identify the project root.'
}
$skip = @('.git', '.venv', 'node_modules', '.tools', 'tools', 'ziliao', 'ziliao2.0',
    '.claude', '.vscode', '.slidep', '.codex-ppt-build', 'data', 'uploads', 'media', 'logs')
$cacheNames = @('__pycache__', '.pytest_cache', '.ruff_cache', '.mypy_cache', '.vite', '.cache', '.gradle')
$queue = [Collections.Generic.Queue[string]]::new()
$targets = [Collections.Generic.List[string]]::new()
$queue.Enqueue($projectRoot)
while ($queue.Count -gt 0) {
    $directory = $queue.Dequeue()
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        if ($entry.PSIsContainer) {
            if ($entry.Name -in $cacheNames) { $targets.Add($entry.FullName) }
            elseif ($entry.Name -notin $skip) { $queue.Enqueue($entry.FullName) }
        } elseif ($entry.Extension -eq '.tsbuildinfo') { $targets.Add($entry.FullName) }
    }
}
# Dependency packages remain installed; only their explicitly named build caches are removable.
foreach ($app in @('terminal-web', 'admin-web', 'community-web')) {
    foreach ($cache in @('.vite', '.tmp')) {
        $candidate = Join-Path $projectRoot "frontend/$app/node_modules/$cache"
        if (Test-Path -LiteralPath $candidate) {
            if (-not ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                $targets.Add($candidate)
            }
        }
    }
}
# Android outputs can be regenerated; installed packages and source resources are unaffected.
$androidBuild = Join-Path $projectRoot 'android/app/build'
if (Test-Path -LiteralPath $androidBuild) {
    if (-not ((Get-Item -LiteralPath $androidBuild).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $targets.Add($androidBuild)
    }
}
$files = 0
$bytes = 0L
foreach ($target in $targets) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolved.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a path outside the workspace: $resolved"
    }
    $entry = Get-Item -LiteralPath $resolved -Force
    $contents = if ($entry.PSIsContainer) { @(Get-ChildItem -LiteralPath $resolved -File -Recurse -Force) } else { @($entry) }
    $files += $contents.Count
    $bytes += ($contents | Measure-Object -Property Length -Sum).Sum
    Write-Output $resolved.Substring($projectRoot.Length + 1)
    if ($Apply) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
Write-Output ("{0}: {1} files, {2:N2} MiB" -f $(if ($Apply) { 'Removed' } else { 'Preview' }), $files, ($bytes / 1MB))
