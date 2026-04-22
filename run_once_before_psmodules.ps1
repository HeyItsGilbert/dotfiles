#!/usr/bin/env pwsh

$ModulePath = [IO.Path]::Combine($HOME, '.local', 'share', 'powershell', 'Modules')
if (-not (Test-Path $ModulePath)) {
  New-Item -ItemType Directory -Path $ModulePath -Force | Out-Null
}

Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
Save-Module PowerShellGet -Path $ModulePath -Repository PSGallery -Force
