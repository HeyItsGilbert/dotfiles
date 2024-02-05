#!/usr/bin/env pwsh
# profile hash: {{ include "profile.ps1" | sha256sum }}
$ErrorView = 'DetailedView'
# This could resolve to a linux directory
$Dest = $HOME
if ($Env:OneDriveCommercial) {
  $Dest = $Env:OneDriveCommercial
}
if ($Env:OneDrive) {
  $Dest = $env:OneDrive
}

$Dest += '\Documents'

$FilesToCopy = @{
  'profile.ps1' = @(
    "$Dest\PowerShell\Microsoft.dotnet-interactive_profile.ps1",
    $Profile.CurrentUserAllHosts
  )
  'powershell.config.json' = @(
    "$Dest\PowerShell\powershell.config.json"
  )
  'GitTools.ps1' = @()
  'ShellIntegration.ps1' = @()
}

# If this is windows, append WindowsPowerShell options
@('profile.ps1', 'GitTools.ps1', 'ShellIntegration.ps1') | ForEach-Object {
  $FilesToCopy.$_ += "$Dest\WindowsPowerShell\$_"
  $FilesToCopy.$_ += "$Dest\PowerShell\$_"
}

# Now we copy to all the destinations.
$FilesToCopy.Keys | ForEach-Object {
  foreach ($dest in $FilesToCopy.Item($_)) {
    Copy-Item $_ $dest
  }
}