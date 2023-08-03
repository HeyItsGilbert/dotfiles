$global:profile_initialized = $false

if ($env:TERM_PROGRAM -eq "VSCODE") {
  # Don't load anything else in VSCode. It slows and breaks stuff.
  Write-Host "Not loading profile in VScode!"
  return
}

# Load work functions
$wf = "$PSScriptRoot\WorkFunctions.ps1"
if (Test-Path $wf -ErrorAction SilentlyContinue) {
  . $wf
}

# Snagged from the one and only @AndrewPla
# https://github.com/devops-collective-inc/PSHSummit2023/blob/main/andrew-pla-cross-platform-tuis/1%20-%20Basics/Out-ConsoleGridView%20Examples.ps1
function ocgv_history {
  param(
    [parameter(Mandatory = $true)]
    [Boolean]
    $global
  )

  $line = $null
  $cursor = $null
  [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
  if ($global) {
    # Global history
    $history = [Microsoft.PowerShell.PSConsoleReadLine]::GetHistoryItems().CommandLine 
    # reverse the items so most recent is on top
    [array]::Reverse($history) 
    $selection = $history | Select-Object -Unique | Out-ConsoleGridView -OutputMode Single -Filter $line -Title "Global Command Line History"

  } else {
    # Local history
    $history = Get-History | Sort-Object -Descending -Property Id -Unique | Select-Object CommandLine -ExpandProperty CommandLine 
    $selection = $history | Out-ConsoleGridView -OutputMode Single -Filter $line -Title "Command Line History"
  }

  if ($selection) {
    [Microsoft.PowerShell.PSConsoleReadLine]::DeleteLine()
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert($selection)
    if ($selection.StartsWith($line)) {
      [Microsoft.PowerShell.PSConsoleReadLine]::SetCursorPosition($cursor)
    } else {
      [Microsoft.PowerShell.PSConsoleReadLine]::SetCursorPosition($selection.Length)
    }
  }
}

# Aliases
# Use function because it's faster to load
function ll { Get-ChildItem -Force $args }
function Get-GitCheckout {
  [alias("gco")]
  param()
  git checkout $args
}
function which { param($bin) Get-Command $bin }

function Watch-Command {
  [alias('watch')]
  [CmdletBinding()]
  param (
    [Parameter()]
    [ScriptBLock]
    $Command,
    [Parameter()]
    [int]
    $Delay = 2
  )
  while ($true) {
    Clear-Host
    Write-Host ("Every {1}s: {0} `n" -F $Command.toString(), $Delay)
    $Command.Invoke()
    Start-Sleep -Seconds $Delay
  }
}

function Initialize-Profile {
  # Prompt
  Import-Module AdvancedHistory
  Import-Module DynamicTitle
  Import-Module Posh-Git
  Import-Module PSReadLine
  Import-Module PSStyle
  Import-Module Terminal-Icons
  # Chocolatey profile
  $ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
  if (Test-Path($ChocolateyProfile)) {
    Import-Module "$ChocolateyProfile"
  }

  # Save all output, just in case! Thanks to @vexx32
  $PSDefaultParameterValues['Out-Default:OutVariable'] = '__'
  
  # Readline options
  ## Tab completion
  Set-PSReadLineKeyHandler -Key Tab -Function Complete
  Set-PSReadLineOption -ShowToolTips

  # Up/Down will do search if text already entered
  Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
  Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward

  ## This is for Core only stuff
  if ($PSVersionTable.PSEdition -eq 'Core') {
    # AdvancedHistory
    # Enable-AdvancedHistory -Unique
    Set-PSReadLineOption -PredictionSource History
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

  ## Colors
  
  $colors = @{
    'Command' = [System.ConsoleColor]::DarkMagenta
    'Parameter' = [System.ConsoleColor]::Magenta
    'Comment' = [System.ConsoleColor]::Green
    'Operator' = [System.ConsoleColor]::Gray
    'Variable' = [System.ConsoleColor]::White
    'Keyword' = [System.ConsoleColor]::Magenta
    'String' = [System.ConsoleColor]::DarkGray
    'Type' = [System.ConsoleColor]::DarkCyan
  }
  Set-PSReadLineOption -Colors $colors

  ## Import Shell Integration Script
  $si = "$PSScriptRoot\ShellIntegration.ps1"
  if (Test-Path $si -ErrorAction SilentlyContinue) {
    $term_app = $env:TERM_PROGRAM
    # Let's check if its Windows terminal thanks to...
    # https://github.com/microsoft/terminal/issues/1040
    if ($null -ne $env:WT_SESSION) {
      $term_app = 'WindowsTerminal'
    }
    & $si -TerminalProgram $term_app
  }

  if ($env:TERM_PROGRAM -eq 'WezTerm') {
    $commandStartJob = Start-DTJobCommandPreExecutionCallback -ScriptBlock {
      param($command)
      (Get-Date), $command
    }

    $commandEndJob = Start-DTJobPromptCallback -ScriptBlock {
      Get-Date
    }

    $initializationScript = {
      if ($PSVersionTable.PSVersion.Major -eq 7) {
        $icon = "`u{ebc7}"
      } else {
        # 
        $icon = ">"
      }
      $icon
    }
    $scriptBlock = {
      param($commandStartJob, $commandEndJob)
      $commandStartDate, $command = Get-DTJobLatestOutput $commandStartJob
      $commandEndDate = Get-DTJobLatestOutput $commandEndJob
      if ($null -ne $commandStartDate) {
        if (($null -eq $commandEndDate) -or ($commandEndDate -lt $commandStartDate)) {
          $commandDuration = (Get-Date) - $commandStartDate
          $isCommandRunning = $true
        } else {
          $commandDuration = $commandEndDate - $commandStartDate
        }
      }

      if ($command) {
        $command = $command.Split()[0]
      }

      $status = ''
      if ($commandDuration) {
        if ($commandDuration.TotalSeconds -gt 1) {
          $commandSegment = "[{0}]" -f $command
          if ($isCommandRunning) {
            if ($PSVersionTable.PSVersion.Major -eq 7) {
              $status = '🏃‍♀️'
            } else {
              $status = '%'
            }
          }
        }
      }

      '{0} {1} {2} {3}' -f $status, $icon, $folder, $commandSegment
    }

    $params = @{
      ScriptBlock = $scriptBlock
      ArgumentList = $commandStartJob, $commandEndJob
      InitializationScript = $initializationScript
    }

    Start-DTTitle @params
  }
}

function prompt {
  if ($global:profile_initialized -ne $true) {
    $global:profile_initialized = $true
    Initialize-Profile
  }
  # Don't bother changing prompts if we're just using starship
  if (-Not (Get-Command 'starship')) {
    # Run once to load gitprompt setting
    Write-VcsStatus | Out-Null
    $GitPromptSettings.BeforeStatus.Text = ''
    $GitPromptSettings.AfterStatus.Text = ''

    # Check if admin
    if (-Not ($IsLinux -or $IsMacOS)) {
      $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
      if ($currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { $Script:IsAdmin = $true }
    }

    # Everything in the prompt will be executed on each new line, be smart!
    if (((Get-Item $pwd).parent.parent.name)) {
      $Path = '..\' + (Get-Item $pwd).parent.name + '\' + (Split-Path $pwd -Leaf)
    } else {
      $Path = $pwd.path
    }

    $lastRun = (Get-History -Count 1).Duration.TotalSeconds
    if ($lastRun) {
      Write-Host "[$($lastRun)s] " -ForegroundColor Black -BackgroundColor Green -NoNewline
    }

    if ($Script:IsAdmin) {
      Write-Host "$([char]0x26a1)" -ForegroundColor Black -BackgroundColor Green -NoNewline
      Write-Host "$([char]0xE0B0)$([char]0xE0B1)" -ForegroundColor Green -BackgroundColor DarkBlue -NoNewline
    } else {
      Write-Host "$([char]0x1f476)" -ForegroundColor Black -BackgroundColor Green -NoNewline
      Write-Host "$([char]0xE0B0)$([char]0xE0B1)" -ForegroundColor Green -BackgroundColor DarkBlue -NoNewline
    }

    Write-Host " $($MyInvocation.HistoryId)" -ForegroundColor White -BackgroundColor DarkBlue -NoNewline
    Write-Host "$([char]0xE0B0)$([char]0xE0B1) " -ForegroundColor DarkBlue -BackgroundColor Cyan -NoNewline
    Write-Host ($path).ToLower().TrimEnd('\') -ForegroundColor White -BackgroundColor Cyan -NoNewline
    if ((Write-VcsStatus *>&1).Length -gt 0) {
      Write-Host "$([char]0xE0B0)$([char]0xE0B1)" -ForegroundColor Cyan -BackgroundColor Magenta -NoNewline
      Write-Host "$(Write-VcsStatus)" -BackgroundColor Magenta -NoNewline
      #& $GitPromptScriptBlock
      Write-Host "$([char]0xE0B0)$("$([char]0xE0B1)" * $NestedPromptLevel)" -ForegroundColor Magenta -NoNewline
    } else {
      Write-Host "$([char]0xE0B0)$("$([char]0xE0B1)" * $NestedPromptLevel)" -ForegroundColor Cyan -NoNewline
    }
    ' '
  }
}
# Starship overwrite the prompt. Do this so its available on first open.
# There is a cost for this but it should be minimal.
if (Get-Command 'starship' -ErrorAction SilentlyContinue) {
  function Invoke-Starship-PreCommand {
    if ($global:profile_initialized -ne $true) {
      $global:profile_initialized = $true
      Initialize-Profile
    }
  }
  Invoke-Expression (&starship init powershell)
}
