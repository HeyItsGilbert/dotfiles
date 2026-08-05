function global:Invoke-CachedCompletion {
    param(
        [Parameter(Mandatory)]
        [string]$Tool,
        [string[]]$Arguments,
        [switch]$Native
    )
    $cacheFile = [IO.Path]::Combine($HOME, '.local', 'share', 'powershell', 'CompletionCache', "$Tool.ps1")

    if (-not (Test-Path $cacheFile)) {
        $cmd = Get-Command $Tool -ErrorAction SilentlyContinue
        if (-not $cmd) { return }
        New-Item -ItemType Directory -Force (Split-Path $cacheFile) | Out-Null
        & $Tool @Arguments | Set-Content $cacheFile -Encoding UTF8
    }

    if ($Native) {
        $content = Get-Content -LiteralPath $cacheFile -Raw
        if ($content -match 'Register-ArgumentCompleter' -and $content -notmatch 'Register-ArgumentCompleter\s+-Native\b') {
            $content = $content -replace 'Register-ArgumentCompleter\s+-CommandName', 'Register-ArgumentCompleter -Native -CommandName'
            Set-Content -LiteralPath $cacheFile -Value $content -Encoding UTF8 -NoNewline
        }
    }

    # Must be dotsourced at script/global scope so helper functions
    # (e.g. __gh_escapeStringWithSpecialChars) remain available to the completer.
    $cacheFile
}

foreach ($entry in @(
    @{ Tool = 'chezmoi';  Native = $true;  Arguments = @('completion', 'powershell') },
    @{ Tool = 'gh';       Native = $true;  Arguments = @('completion', '-s', 'powershell') },
    @{ Tool = 'fnm';      Native = $false; Arguments = @('env', '--use-on-cd', '--shell', 'powershell') },
    @{ Tool = 'starship'; Native = $false; Arguments = @('init', 'powershell', '--print-full-init') }
)) {
    $cacheFile = Invoke-CachedCompletion @entry
    if ($cacheFile) { . $cacheFile }
}
if ($global:Prompts) { $global:Prompts.Starship = $function:prompt }
if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
  # --print emits the full module (sync). Default init installs an async
  # trampoline whose first prompt() call returns nothing — blank first line.
  $ompInit = oh-my-posh init pwsh --print --config ([IO.Path]::Combine($ConfigHome, 'oh-my-posh', 'config.omp.json')) | Out-String
  Invoke-Expression $ompInit
}

if (Get-Command gsudo -ErrorAction SilentlyContinue) {
    Import-Module gsudoModule
}
