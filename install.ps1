$ErrorActionPreference = 'Stop'
# Choco packages

choco install 1password-cli chezmoi espanso nerdfont-hack starship powertoys powershell-core vale vscode wezterm -y -s'https://chocolatey.org/api/v2/'
choco install ditto --pre -y -s'https://chocolatey.org/api/v2/'

# Install via Store
# - Account Surfer
# - Windows Terminal Preview
# - Ditto Clipboard
# - WSL

# Install Modules
$mods = @{
  'Scope' = 'CurrentUser'
  'Repository' = 'PSGallery'
  #'Force' = $True
}
# ToDo: Allow additional parameters per module
@(
  'AdvancedHistory',
  'DynamicTitle',
  'Microsoft.PowerShell.ConsoleGuiTools',
  'Pester',
  'Posh-Git',
  'PSReadLine',
  'PSStyle',
  'Terminal-Icons'
) | ForEach-Object {
  if (-Not (Get-Module -ListAvailable -Name $_)) {
    Install-Module $_ @mods -Confirm:$False -Force
  }
}

# Install and apply chezmoi files
(Invoke-RestMethod -UseBasicParsing https://get.chezmoi.io/ps1) | powershell -c -
chezmoi init --apply HeyItsGilbert