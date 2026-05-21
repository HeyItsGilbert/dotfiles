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

Invoke-CachedCompletion chezmoi 'completion', 'powershell'
Invoke-CachedCompletion gh     'completion', '-s', 'powershell'
Invoke-CachedCompletion fnm    'env', '--use-on-cd', '--shell', 'powershell'

if (Get-Command gsudo -ErrorAction SilentlyContinue) {
    Import-Module gsudoModule
}
