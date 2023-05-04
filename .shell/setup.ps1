# Choco packages
choco install nerdfont-hack starship powershell-core vscode -y -s'https://chocolatey.org/api/v2/'

# Install Modules
$mods = @{
  'Scope' = 'CurrentUser'
  'Repository' = 'PSGallery'
  'Force' = $True
}
# ToDo: Allow additional parameters per module
@(
  'Pester',
  'Posh-Git',
  'PSReadLine',
  'AdvancedHistory',
  'Terminal-Icons',
  'AnyPackage'
) | ForEach-Object {
  if (-Not (Get-Module -ListAvailable -Name $_)) {
    Install-Module $_ @mods
  }
}
$links = @(
  # Create symbolic links for windows terminal settings
  @{
    'src' = Resolve-Path "$PSScriptRoot\WindowsTerminal\settings.json"
    'dst' = Resolve-Path "$Env:LocalAppData\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"
  },
  # Create symbolic links for windows terminal settings
  @{
    'src' = Resolve-Path "$PSScriptRoot\..\.config\Microsoft.Powershell_profile.ps1"
    'dst' = Resolve-Path $PROFILE
  }
  @{
    'src' = Resolve-Path "$PSScriptRoot\..\.config\starship.toml"
    'dst' = Resolve-Path "$HOME\.config\starship.toml"
  }
)

New-Item -ItemType Directory "$HOME\.config"
$links | ForEach-Object {
  # Test path
  if(Test-Path $_.dst) {
    $current = Get-Item $_.dst
    if($current.LinkType -eq 'SymbolicLink' -And $current.Target -eq $_.src){
      Write-Host ("Symlink already setup for {0}" -F $_.dst)
      continue
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
