trap {
  Write-Warning ($_.ScriptStackTrace | Out-String)
}

function Initialize-Profile {
  Write-Host "Initializing profile..." -ForegroundColor Cyan
  [Console]::OutputEncoding = [Console]::InputEncoding = $global:OutputEncoding = [System.Text.UTF8Encoding]::new()
  # Prompt
  $ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
  $modules = @{
    "AdvancedHistory" = @{
      if = $($PSVersionTable.PSEdition -ne 'Core')
    }
    "DynamicTitle" = @{}
    "Posh-Git" = @{}
    "PSReadLine" = @{
      if = $($env:TERM_PROGRAM -ne 'vscode')
    }
    "CompletionPredictor" = @{
      if = $($PSVersionTable.PSEdition -ne 'Core')
    }
    "PSStyle" = @{
      if = $($PSVersionTable.PSEdition -eq 'Core')
    }
    "$ChocolateyProfile" = @{
      if = $(Test-Path($ChocolateyProfile))
    }
    "PSMOTD" = @{}
  }
  foreach ($module in $modules.Keys) {
    if ($modules.Item($module).ContainsKey("if") -and ($modules.Item($module).Item("if") -eq $True)) {
      continue
    }
    try {
      Import-Module $module
    } catch {
      Write-Host "Failed to import: $module. $_"
    }
  }

  # Save all output, just in case! Thanks to @vexx32
  $PSDefaultParameterValues['Out-Default:OutVariable'] = '__'

  # Register OnIdle event to redraw prompt so time on prompt is accurate
  # Register-EngineEvent -SourceIdentifier PowerShell.OnIdle { Write-Host "$([char]27)[2A$([char]27)[0G$(prompt)" -NoNewline }

  # region PSReadline options

  # Setup PSReadLineOption Splat
  $psOption = @{}
  if ([enum]::GetValues('Microsoft.PowerShell.PredictionSource') -contains 'HistoryAndPlugin') {
    $psOption['PredictionSource'] = 'HistoryAndPlugin'
  } else {
    $psOption['PredictionSource'] = 'History'
  }
  $psOption['PredictionViewStyle'] = 'InlineView'
  $psOption['ShowToolTips'] = $True
  ## Colors
  $psOption['Colors'] = @{
    'Command' = [System.ConsoleColor]::DarkMagenta
    'Parameter' = [System.ConsoleColor]::Magenta
    'Comment' = [System.ConsoleColor]::Green
    'Operator' = [System.ConsoleColor]::Gray
    'Variable' = [System.ConsoleColor]::White
    'Keyword' = [System.ConsoleColor]::Magenta
    'String' = [System.ConsoleColor]::White
    'Type' = [System.ConsoleColor]::DarkCyan
  }
  ## VI Edit Mode
  $psOption['EditMode'] = 'Vi'
  Set-PSReadLineOption @psOption

  ## Tab completion
  $keymap = @{
    Complete = 'Tab'
    HistorySearchBackward = 'UpArrow'
    HistorySearchForward = 'DownArrow'
    ValidateAndAcceptLine = 'Enter'
  }
  foreach ($key in $keymap.Keys) {
    foreach ($chord in $keymap[$key]) {
      Set-PSReadLineKeyHandler -Function $key -Chord $chord
    }
  }

  ## This is for Core only stuff
  if ($PSVersionTable.PSEdition -eq 'Core') {
    # AdvancedHistory
    # When F7 is pressed, show the local command line history in OCGV
    $parameters = @{
      Key = 'F7'
      BriefDescription = 'Show Matching History'
      LongDescription = 'Show Matching History using Out-ConsoleGridView'
      ScriptBlock = {
        ocgv_history -Global $false
      }
    }
    Set-PSReadLineKeyHandler @parameters

    # When Shift-F7 is pressed, show the local command line history in OCGV
    $parameters = @{
      Key = 'Shift-F7'
      BriefDescription = 'Show Matching Global History'
      LongDescription = 'Show Matching History for all PowerShell instances using Out-ConsoleGridView'
      ScriptBlock = {
        ocgv_history -Global $true
      }
    }
    Set-PSReadLineKeyHandler @parameters
  }

  # endregion
}
