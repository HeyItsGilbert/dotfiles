#!/usr/bin/env pwsh

Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
Install-Module PowerShellGet -Force -AllowClobber
