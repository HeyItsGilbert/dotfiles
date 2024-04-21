Write-Host "Loading VSCode profile"
Import-CommandSuite

# Transient prompt breaks the prompt detection
Disable-TransientPrompt