# Reference:
# https://devblogs.microsoft.com/commandline/shell-integration-in-the-windows-terminal/
# Forked from https://gist.github.com/mdgrs-mei/1599cb07ef5bc67125ebffba9c8f1e37

param
(
  [ValidateSet('WindowsTerminal', 'ITerm2', 'WezTerm')]
  [String]$TerminalProgram = $env:TERM_PROGRAM
)

# Restore hooked functions in case this script is executed accidentally twice
if ($global:shellIntegrationGlobals) {
  $function:global:PSConsoleHostReadLine = $global:shellIntegrationGlobals.originalPSConsoleHostReadLine
  $function:global:Prompt = $global:shellIntegrationGlobals.originalPrompt
}

$global:shellIntegrationGlobals = @{
  terminalProgram = $TerminalProgram
  originalPSConsoleHostReadLine = $function:global:PSConsoleHostReadLine
  originalPrompt = $function:global:Prompt
  lastCommand = $null

  getExitCode = {
    param ($lastCommandStatus)
    if ($lastCommandStatus -eq $true) {
      return 0
    }

    if ($Error[0]) {
      $lastHistory = Get-History -Count 1
      $isPowerShellError = $Error[0].InvocationInfo.HistoryId -eq $lastHistory.Id
    }

    if ($isPowerShellError) {
      return 1
    } else {
      return $LastExitCode
    }
  }
}

$function:global:PSConsoleHostReadLine = {
  

  $commandExecuted = "$([char]27)]133;C$([char]7)"
  $command = $global:shellIntegrationGlobals.originalPSConsoleHostReadLine.Invoke()

  $commandExecuted | Write-Host -NoNewline
  $command

  $global:shellIntegrationGlobals.lastCommand = $command
}

$function:global:Prompt = {
  $lastCommandStatus = $?

  if ($global:shellIntegrationGlobals.lastCommand) {
    $exitCode = $global:shellIntegrationGlobals.getExitCode.Invoke($lastCommandStatus)
    $commandFinished = "$([char]27)]133;D;$exitCode$([char]7)"
  } else {
    $commandFinished = "$([char]27)]133;D$([char]7)"
  }

  $currentLocation = $ExecutionContext.SessionState.Path.CurrentLocation
  switch ($global:shellIntegrationGlobals.terminalProgram) {
    'WindowsTerminal' { $setWorkingDirectory = "$([char]27)]9;9;`"$currentLocation`"$([char]7)" }
    'ITerm2' { $setWorkingDirectory = "$([char]27)]1337;CurrentDir=$currentLocation$([char]7)" }
    'WezTerm' {
      $provider_path = $current_location.ProviderPath -replace "\\", "/"
      $setWorkingDirectory = "$([char]27)]7;file://${env:COMPUTERNAME}/${provider_path}$([char]27)\"
    }
  }

  $promptStarted = "$([char]27)]133;A$([char]7)"
  $commandStarted = "$([char]27)]133;B$([char]7)"
  $prompt = $global:shellIntegrationGlobals.originalPrompt.Invoke()

  $commandFinished + $promptStarted + $setWorkingDirectory + $prompt + $commandStarted
}