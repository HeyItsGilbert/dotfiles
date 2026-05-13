Write-Host "Loading Gilbert's VSCode profile"
Import-CommandSuite

# Transient prompt breaks the prompt detection
if (Get-Command "Disable-TransientPrompt" -ErrorAction SilentlyContinue) {
    Write-Host "Disabling transient prompt"
    Disable-TransientPrompt
}