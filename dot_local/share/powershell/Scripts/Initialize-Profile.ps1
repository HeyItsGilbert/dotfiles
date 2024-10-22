function Initialize-Profile
{
  trap
  { Write-Warning ($_.ScriptStackTrace | Out-String) 
  }

  Write-Host "Initializing profile..." -ForegroundColor Cyan
  # Prompt
  $ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
  $modules = @{
    "AdvancedHistory" = @{}
    "DynamicTitle" = @{}

    "Posh-Git" = @{}
    "PSReadLine" = @{}
    "CompletionPredictor" = @{}
    "PSStyle" = @{
      if = ($PSVersionTable.PSEdition -ne 'Core')
    }
    "Terminal-Icons" = @{}
    "$ChocolateyProfile" = @{
      if = (Test-Path($ChocolateyProfile))
    }
    "PSMOTD" = @{}
  }
  foreach ($module in $modules.Keys)
  {
    if($modules.Item($module).ContainsKey("if"))
    {
      if($modules.Item($module).Item("if"))
      {
        continue
      }
    }
    Import-Module $module
  }

  # Save all output, just in case! Thanks to @vexx32
  $PSDefaultParameterValues['Out-Default:OutVariable'] = '__'

  # Register OnIdle event to redraw prompt so time on prompt is accurate
  # Register-EngineEvent -SourceIdentifier PowerShell.OnIdle { Write-Host "$([char]27)[2A$([char]27)[0G$(prompt)" -NoNewline }

  # region PSReadline options

  # Setup PSReadLineOption Splat
  $psOption = @{}
  if ($PSVersionTable.PSEdition -ne 'Core')
  {
    $psOption['PredictionSource'] = 'History'
  } else
  {
    $psOption['PredictionSource'] = 'HistoryAndPlugin'
  }
  $psOption['PredictionViewStyle'] = 'ListView'
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
  foreach ($key in $keymap.Keys)
  {
    foreach ($chord in $keymap[$key])
    {
      Set-PSReadLineKeyHandler -Function $key -Chord $chord
    }
  }

  ## This is for Core only stuff
  if ($PSVersionTable.PSEdition -eq 'Core')
  {
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


  ## Import Shell Integration Script
  $term_app = $env:TERM_PROGRAM
  # Let's check if its Windows terminal thanks to...
  # https://github.com/microsoft/terminal/issues/1040
  if ($null -ne $env:WT_SESSION)
  {
    $term_app = 'WindowsTerminal'
  }
  #Set-ShellIntegration -TerminalProgram $term_app

  # Add chezmoi auto complete
  Invoke-Expression (& { ( chezmoi completion powershell | Out-String ) })

  # Add z for file navigation
  Invoke-Expression (& { ( zoxide init powershell | Out-String ) })

  # Completion for gh cli
  Invoke-Expression (& { ( gh completion -s powershell | Out-String) })

  if (Test-Administrator)
  {
    $Env:ISELEVATEDSESSION = $true
  }

  # Get MOTD
  Get-MOTD
}
