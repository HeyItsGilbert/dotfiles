# Run once to load gitprompt setting
Write-VcsStatus | Out-Null
$GitPromptSettings.BeforeStatus.Text = ''
$GitPromptSettings.AfterStatus.Text = ''

# Check if admin
if (-not ($IsLinux -or $IsMacOS)) {
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