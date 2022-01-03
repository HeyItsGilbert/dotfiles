# Choco packages
cinst powershell-core -fy
cinst hackfont -fy
cinst vscode -fy

# Install Modules
Install-Module Pester -Scope CurrentUser
Install-Module Posh-Git -Scope CurrentUser
Install-Module PSReadLine -Scope CurrentUser
Install-Module AdvancedHistory -Scope CurrentUser
Install-Module Terminal-Icons -Scope CurrentUser

# Create symbolic link for windows terminal settings
$link = @{
  ItemType = SymbolicLink
  Path = "$Env:LocalAppData\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"
  Target = .\.shell\WindowsTerminal\settings.json
}
New-Item @link

# Install via Store
# - Account Surfer
# - Windows Terminal Preview
# - Ditto Clipboard
# - WSL
