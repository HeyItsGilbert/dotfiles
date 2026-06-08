function global:Invoke-CachedCompletion {
    param(
        [Parameter(Mandatory)]
        [string]$Tool,
        [string[]]$Arguments
    )
    $cacheFile = [IO.Path]::Combine($HOME, '.local', 'share', 'powershell', 'CompletionCache', "$Tool.ps1")

    if (-not (Test-Path $cacheFile)) {
        $cmd = Get-Command $Tool -ErrorAction SilentlyContinue
        if (-not $cmd) { return }
        New-Item -ItemType Directory -Force (Split-Path $cacheFile) | Out-Null
        & $Tool @Arguments | Set-Content $cacheFile -Encoding UTF8
    }

    . $cacheFile
}

Invoke-CachedCompletion chezmoi     'completion', 'powershell'
Invoke-CachedCompletion gh          'completion', '-s', 'powershell'
Invoke-CachedCompletion fnm         'env', '--use-on-cd', '--shell', 'powershell'
Invoke-CachedCompletion starship    'init', 'powershell', '--print-full-init'
if ($global:Prompts) { $global:Prompts.Starship = $function:prompt }
if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
    oh-my-posh init pwsh --config ([IO.Path]::Combine($ConfigHome, 'oh-my-posh', 'config.omp.json')) | Invoke-Expression
}

if (Get-Command gsudo -ErrorAction SilentlyContinue) {
    Import-Module gsudoModule
}
