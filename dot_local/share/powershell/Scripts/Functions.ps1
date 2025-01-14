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

function Test-Administrator {
  $CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
  $AdministratorRole = [Security.Principal.WindowsBuiltInRole] "Administrator"
    ([Security.Principal.WindowsPrincipal]$CurrentUser).IsInRole($AdministratorRole)
}

# Aliases
# Use function because it's faster to load
function ll {
  Get-ChildItem -Force $args 
}
function Get-GitCheckout {
  [alias("gco")]
  param()
  git checkout $args
}
function which {
  param($bin) Get-Command $bin 
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

function Get-MessageOfTheDay {
  $output = [System.Text.StringBuilder]::new()
  $dash = "." * $Host.UI.RawUI.WindowSize.Width

  [void]$output.AppendLine($dash)
  [void]$output.AppendLine("- Hostname: $(hostname)")
  [void]$output.AppendLine("- User: $(whoami)")
  [void]$output.AppendLine("- Date: $(Get-Date)")

  $outdatedPackages = (choco outdated -r) -join "`n"
  if (-not [string]::IsNullOrEmpty($outdatedPackages)) {
    [void]$output.AppendLine($dash)
    [void]$output.AppendLine("Chocolatey Packages To Update")
    [void]$output.AppendLine($outdatedPackages)
  }
  [void]$output.Append($dash)
  Write-Host $output -NoNewline
}

function Set-LocationButBetter {
    param (
        [Parameter(
            ValueFromPipeline,
            ValueFromPipelineByPropertyName
        )]
        $Path
    )

    process {
        if($MyInvocation.BoundParameters.Count -eq 0){
          $Path = $MyInvocation.InvocationName
        }
        # If this contains 3 or more period, that means move up additional levels.
        if($Path -match '^\.{2,}$'){
            $depth = $Path.Length
            $path = Get-Location
            # Start at 1 to treat the initial '..' as 1 parent.
            for ($i = 1; $i -lt $depth; $i++) {
                $path = (Split-Path $path -Parent)
            }
        }
        if ($Path -eq '-'){
            Pop-location
        } else {
            if ([System.IO.File]::Exists($Path)) {
                Push-Location (Split-Path $Path -Parent)
            }
            else {
                Push-Location $Path
            }
        }
    }
}

Remove-Item alias:cd
Set-Alias -Name cd -Value Set-LocationButBetter
Set-Alias -Name .. -Value Set-LocationButBetter
Set-Alias -Name ... -Value Set-LocationButBetter
