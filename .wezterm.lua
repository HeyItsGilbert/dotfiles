local wezterm = require 'wezterm'
local mux = wezterm.mux
local act = wezterm.action
local config = {}
local launch_menu = {}
local haswork,work = pcall(require,"work")

--- Setup PowerShell options
if wezterm.target_triple == 'x86_64-pc-windows-msvc' then
  --- Set Pwsh as the default on Windows
  config.default_prog = { 'pwsh.exe', '-NoLogo' }

  table.insert(launch_menu, {
    label = 'PowerShell',
    args = { 'powershell.exe', '-NoLogo' },
  })
  table.insert(launch_menu, {
    label = 'Pwsh',
    args = { 'pwsh.exe', '-NoLogo' },
  })
else
  table.insert(launch_menu, {
    label = 'Pwsh',
    args = { '/usr/local/bin/pwsh', '-NoLogo' },
  })
end

--- Default config settings
config.color_scheme = 'Solarized Dark (Gogh)'
config.font = wezterm.font('Hack Nerd Font')
config.font_size = 10
config.launch_menu = launch_menu
config.default_cursor_style = 'BlinkingBar'

-- Allow overwriting for work stuff
if haswork then
  work.apply_to_config(config)
end

return config
