if ($env:TERM_PROGRAM -eq "VSCODE") {
  # Don't load anything else in VSCode. It slows and breaks stuff.
  Write-Host "VScode!"
  return
}
# Prompt
Import-Module Terminal-Icons
Import-Module PSReadLine
Import-Module AdvancedHistory

# Load work functions
$wf = Resolve-Path -Relative "$PSScriptRoot\WorkFunctions.ps1"
if (Test-Path $wf) {
  . $wf
}

# Aliases
function ll { Get-ChildItem -Force $args }
function Get-GitCheckout { git checkout $args }
Set-Alias -Name gco -Value Get-GitCheckout
New-Alias -Name which -Value Get-Command

# Readline options
## Tab completion
Set-PSReadLineKeyHandler -Key Tab -Function Complete
Set-PSReadLineOption -ShowToolTips
if ($PSVersionTable.PSEdition -eq 'Core') {
  Set-PSReadLineOption -PredictionSource History
}

# Up/Down will do search if text already entered
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward

## Colours
$colors = @{
  'Command' = [System.ConsoleColor]::Blue
  'Parameter' = [System.ConsoleColor]::DarkBlue
  'Comment' = [System.ConsoleColor]::Green
  'Operator' = [System.ConsoleColor]::Gray
  'Variable' = [System.ConsoleColor]::Magenta
  'Keyword' = [System.ConsoleColor]::Magenta
  #'String' = [System.ConsoleColor]::DarkGray
  'Type' = [System.ConsoleColor]::DarkCyan
}
Set-PSReadLineOption -Colors $colors

# AdvancedHistory
Enable-AdvancedHistory -Unique
# Chocolatey profile
$ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
if (Test-Path($ChocolateyProfile)) {
  Import-Module "$ChocolateyProfile"
}

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

# Don't bother changing prompts if we're just using starship
if (Get-Command 'starship') {
  Invoke-Expression (&starship init powershell)
} else {
  Import-Module Posh-Git

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
  function prompt {
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
