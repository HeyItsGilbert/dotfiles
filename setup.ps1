$ErrorActionPreference = 'Stop'
# Choco packages
choco install espanso nerdfont-hack starship powershell-core vale vscode wezterm -y -s'https://chocolatey.org/api/v2/'

# Winget installs
winget install Microsoft.PowerToys --source winget
  

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
    Install-Module $_ @mods
  }
}

# Setup .config in home folder.
$dotConfig = "$HOME\.config"
if (-Not (Test-Path $dotConfig)) {
  New-Item -ItemType Directory 
}

$links = @(
  # Create symbolic links for windows terminal settings
  @{
    'src' = Resolve-Path "$PSScriptRoot\.shell\WindowsTerminal\settings.json"
    'dst' = "$Env:LocalAppData\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"
  },
  # Create symbolic links for windows terminal settings
  @{
    'src' = Resolve-Path "$PSScriptRoot\.config\Microsoft.Powershell_profile.ps1"
    'dst' = $PROFILE
  }
  @{
    'src' = Resolve-Path "$PSScriptRoot\.config\starship.toml"
    'dst' = "$HOME\.config\starship.toml"
  }
  @{
    'src' = Resolve-Path "$PSScriptRoot\.wezterm.lua"
    'dst' = "$HOME\.wezterm.lua"
  }
  # Symlinks for Espanso
  @{
    'src' = Resolve-Path "$PSScriptRoot\espanso\config\default.yml"
    'dst' = "$env:APPDATA\espanso\config\default.yml"
  }
)

# Add matcher files 
$matchers = Get-ChildItem -Path "$PSScriptRoot\espanso\match"
$matchers | ForEach-Object {
  $file = $_.Name
  $links += @{
    'src' = Resolve-Path "$PSScriptRoot\espanso\match\$file"
    'dst' = "$env:APPDATA\espanso\match\$file"
  }
}

$links | ForEach-Object {
  # Test path
  if (Test-Path $_.dst) {
    $current = Get-Item $_.dst
    if ($current.LinkType -eq 'SymbolicLink' -And $current.Target -eq $_.src) {
      Write-Host ("Symlink already setup for {0}" -F $_.dst)
      return
    }
    Write-Host ("File exists, let's rename prior to creating symlink: {0}" -f $_.dst)
    # If it exists, remove it
    $new = Split-Path $_.dst -Leaf
    Rename-Item $_.dst -NewName "$new.bak" -Force
  }

  # Create symlink
  Write-Host ("Creating the link between: {0} to {1}" -f $_.src, $_.dst)
  $link = @{
    ItemType = 'SymbolicLink'
    Path = $_.dst
    Target = $_.src
  }
  New-Item @link
}

# Install via Store
# - Account Surfer
# - Windows Terminal Preview
# - Ditto Clipboard
# - WSL
