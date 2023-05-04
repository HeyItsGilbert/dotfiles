# Choco packages
# ToDo: Setup community repo if its not setup
choco install nerdfont-hack -s'https://chocolatey.org/api/v2/'
choco install starship -fy -s'https://chocolatey.org/api/v2/'
choco install powershell-core -fy -s'https://chocolatey.org/api/v2/'
choco install vscode -fy -s'https://chocolatey.org/api/v2/'

# Install Modules
$mods = @{
  'Scope' = 'CurrentUser'
  'Repository' = 'PSGallery'
  'Force' = $True
}
Install-Module Pester @mods
Install-Module Posh-Git @mods
Install-Module PSReadLine @mods
Install-Module AdvancedHistory @mods
Install-Module Terminal-Icons @mods

$links = @(
  # Create symbolic links for windows terminal settings
  @{
    'src' = "$PSScriptRoot\WindowsTerminal\settings.json"
    'dst' = "$Env:LocalAppData\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"
  },
  # Create symbolic links for windows terminal settings
  @{
    'src' = "$PSScriptRoot\..\.config\Microsoft.Powershell_profile.ps1"
    'dst' = $PROFILE
  }
  @{
    'src' = "$PSScriptRoot\..\.config\starship.toml"
    'dst' = "$HOME\.config\starship.toml"
  }
)

New-Item -ItemType Directory "$HOME\.config"
$links | ForEach-Object {
  # Test path
  if(Test-Path $_.dst) {
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
