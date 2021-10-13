# Prompt
Import-Module Posh-Git

# Run once to load gitprompt setting
Write-VcsStatus | Out-Null
$GitPromptSettings.BeforeStatus.Text = ''
$GitPromptSettings.AfterStatus.Text = ''

# Check if admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { $Script:IsAdmin = $true }

# Everything in the prompt will be executed on each new line, be smart!
function prompt {
  if (((Get-Item $pwd).parent.parent.name)) {
    $Path = '..\' + (Get-Item $pwd).parent.name + '\' + (Split-Path $pwd -Leaf)
  }
  else {
    $Path = $pwd.path
  }

  $lastRun = (Get-History -Count 1).Duration.TotalSeconds
  if ($lastRun) {
    Write-Host "[$($lastRun)s] " -ForegroundColor Black -BackgroundColor Green -NoNewline
  }

  if ($Script:IsAdmin) {
    Write-Host "⚡" -ForegroundColor Black -BackgroundColor Green -NoNewline
    Write-Host "$([char]0xE0B0)$([char]0xE0B1)" -ForegroundColor Green -BackgroundColor DarkBlue -NoNewline
  }
  else {
    Write-Host "👶🏽" -ForegroundColor Black -BackgroundColor Green -NoNewline
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
  }
  else {
    Write-Host "$([char]0xE0B0)$("$([char]0xE0B1)" * $NestedPromptLevel)" -ForegroundColor Cyan -NoNewline
  }
  ' '
}

# Aliases
function ll { Get-ChildItem -Force $args }
function Get-GitCheckout { git checkout $args }
Set-Alias -Name gco -Value Get-GitCheckout

# Readline options
## Tab completion
Set-PSReadlineKeyHandler -Key Tab -Function Complete
Set-PSReadlineOption -ShowToolTips
Set-PSReadLineOption -PredictionSource History

# Up/Down will do search if text already entered
Set-PSReadlineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadlineKeyHandler -Key DownArrow -Function HistorySearchForward

## Colours
$colors = @{}
$colors['Command'] = [System.ConsoleColor]::Blue
$colors['Parameter'] = [System.ConsoleColor]::DarkBlue
$colors['Comment'] = [System.ConsoleColor]::Green
$colors['Operator'] = [System.ConsoleColor]::Gray
$colors['Variable'] = [System.ConsoleColor]::Magenta
$colors['Keyword'] = [System.ConsoleColor]::Magenta
$colors['String'] = [System.ConsoleColor]::DarkGray
$colors['Type'] = [System.ConsoleColor]::DarkCyan
Set-PSReadLineOption -Colors $colors

# AdvancedHistory
Import-Module AdvancedHistory
Enable-AdvancedHistory -Unique