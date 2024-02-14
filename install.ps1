$ErrorActionPreference = 'Stop'

# Install and apply chezmoi files
(Invoke-RestMethod -UseBasicParsing https://get.chezmoi.io/ps1) | powershell -c -
chezmoi init --apply HeyItsGilbert