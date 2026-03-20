Write-Host "Loading Gilbert's VSCode profile"
Import-CommandSuite

# Transient prompt breaks the prompt detection
Disable-TransientPrompt