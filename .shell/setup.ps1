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


# Install via Store
# - Account Surfer
# - Windows Terminal Preview
# - Ditto Clipboard
# - WSL