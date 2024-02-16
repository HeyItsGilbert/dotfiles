#!/usr/bin/env pwsh
# This is the script that runs VERY early.
# This is the time to setup stuff that will be used by templates

# region Install Starship
if (-Not (Get-Command "starship")) {
  if ($IsLinux -or $IsMacOS) {
    curl -sS https://starship.rs/install.sh | sh
  } else {
    choco install starship  -y -s'https://chocolatey.org/api/v2/'
  }
}