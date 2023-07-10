local wezterm = require 'wezterm'
local mux = wezterm.mux
local act = wezterm.action
local config = {}
local keys = {}
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

--- Disable defaul keys and set some minimum ones for now.
--- This helps with conflicting keys in pwsh
local act = wezterm.action
keys = {
  { key = ")",        mods = "CTRL",  action = act.ResetFontSize },
  { key = "-",        mods = "CTRL",  action = act.DecreaseFontSize },
  { key = "=",        mods = "CTRL",  action = act.IncreaseFontSize },
  { key = "N",        mods = "CTRL",  action = act.SpawnWindow },
  { key = "P",        mods = "CTRL",  action = act.ActivateCommandPalette },
  { key = "V",        mods = "CTRL",  action = act.PasteFrom("Clipboard") },
  { key = "Copy",     mods = "NONE",  action = act.CopyTo("Clipboard") },
  { key = "Paste",    mods = "NONE",  action = act.PasteFrom("Clipboard") },
  { key = "F11",      mods = "NONE",  action = act.ToggleFullScreen },
}

--- Default config settings
config.color_scheme = 'AdventureTime'
config.font = wezterm.font('Hack Nerd Font')
config.font_size = 10
config.launch_menu = launch_menu
config.default_cursor_style = 'BlinkingBar'
config.disable_default_key_bindings = true
config.keys = keys

-- Allow overwriting for work stuff
if haswork then
  work.apply_to_config(config)
end

return config
