# Chezmoi modify script for ~/.glzr/glazewm/config.yaml
# Reads the base config and merges work-specific settings from config-work.yaml.
# The work file uses [section] headers that map to # work:section markers in the base.
# Content under each [section] is inserted verbatim — use the exact indentation
# needed in the final config.yaml output.
#
# config-work.yaml example:
# [startup_commands]
#     - "shell-exec some-work-tool.exe"
# [shutdown_commands]
#     - "shell-exec taskkill /IM some-work-tool.exe /F"
# [window_rules]
#   - commands: ["move --workspace 2"]
#     match:
#       - window_process: { regex: "WorkApp" }
# [ignore_rules]
#       - window_process: { equals: "WorkVPN" }

# Discard stdin (current target contents)
[Console]::In.ReadToEnd() | Out-Null

$basePath = Join-Path $env:USERPROFILE '.glzr/glazewm/config-base.yaml'
$workPath = Join-Path $env:USERPROFILE '.glzr/glazewm/config-work.yaml'

$result = Get-Content $basePath -Raw

if (Test-Path $workPath) {
    $workContent = Get-Content $workPath -Raw
    $workContent = $workContent -replace "`r`n", "`n"

    # Parse sections from work config: [section_name] followed by content until next [section] or EOF
    $sections = @{}
    $pattern = '(?m)^\[(\w+)\]\s*\n((?:(?!^\[\w+\])[\s\S])*)'
    [regex]::Matches($workContent, $pattern) | ForEach-Object {
        $name = $_.Groups[1].Value
        $content = $_.Groups[2].Value.TrimEnd()
        $sections[$name] = $content
    }

    # Replace each # work:SECTION marker with the section content followed by the marker
    foreach ($name in $sections.Keys) {
        $marker = "# work:$name"
        $content = $sections[$name]
        # Match the marker line with its leading whitespace, capture indent
        if ($result -match "(?m)^([ \t]*)$([regex]::Escape($marker))$") {
            $indent = $Matches[1]
            $result = $result -replace "(?m)^[ \t]*$([regex]::Escape($marker))$", "$content`n$indent$marker"
        }
    }
}

$result = $result -replace "`r`n", "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($result)
[Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
