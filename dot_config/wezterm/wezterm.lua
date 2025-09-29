local wezterm = require("wezterm")
local keys = require("keys")
local fonts = require("fonts")
local decoration = require("decoration")
local background = require("background")
local haswork, work = pcall(require, "work")

local config = wezterm.config_builder()
local launch_menu = {}

local is_windows_11 = false

--- Setup PowerShell options
if wezterm.target_triple == "x86_64-pc-windows-msvc" then
	--- Grab the ver info for later use.
	local _, stdout, _ = wezterm.run_child_process({ "cmd.exe", "ver" })
	local _, _, build, _ = stdout:match("Version ([0-9]+)%.([0-9]+)%.([0-9]+)%.([0-9]+)")
	is_windows_11 = tonumber(build) >= 22000

	--- Make it look cool.
	if is_windows_11 then
		wezterm.log_info("We're running Windows 11!")
	end

	--- Set Pwsh as the default on Windows
	config.default_prog = { "pwsh.exe", "-NoLogo" }
	table.insert(launch_menu, {
		label = "Pwsh",
		args = { "pwsh.exe", "-NoLogo" },
	})
	table.insert(launch_menu, {
		label = "PowerShell",
		args = { "powershell.exe", "-NoLogo" },
	})
	table.insert(launch_menu, {
		label = "Pwsh No Profile",
		args = { "pwsh.exe", "-NoLogo", "-NoProfile" },
	})
	table.insert(launch_menu, {
		label = "PowerShell No Profile",
		args = { "powershell.exe", "-NoLogo", "-NoProfile" },
	})
else
	--- Non-Windows Machine
	table.insert(launch_menu, {
		label = "Pwsh",
		args = { "/usr/local/bin/pwsh", "-NoLogo" },
	})
	table.insert(launch_menu, {
		label = "Pwsh No Profile",
		args = { "/usr/local/bin/pwsh", "-NoLogo", "-NoProfile" },
	})
end

--- Default config settings
config.scrollback_lines = 7000
config.hyperlink_rules = wezterm.default_hyperlink_rules()
config.launch_menu = launch_menu
-- Allow overwriting for work stuff
if haswork then
	work.apply_to_config(config)
end

fonts.setup(config)
keys.setup(config)
decoration.setup(config, is_windows_11)

wezterm.on("user-var-changed", function(window, pane, name, value)
	wezterm.log_info("var", name, value)
end)

config.ssh_domains = {
	{
		name = "nuc",
		remote_address = "192.168.1.6",
		username = "gilbert",
	},
	{
		name = "docker",
		remote_address = "docker.lan",
		username = "root",
	},
}

return config
