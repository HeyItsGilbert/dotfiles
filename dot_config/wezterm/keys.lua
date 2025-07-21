local wezterm = require("wezterm")
local bg = require("background")
local act = wezterm.action
local M = {}

--- Custom callbacks
local swap_background = wezterm.action_callback(bg.swapBgImage)
local swap_opacity = wezterm.action_callback(bg.swapBgOpacity)
---

wezterm.on("toggle-colorscheme", function(window, pane)
	local overrides = window:get_config_overrides() or {}
	if overrides.color_scheme == "Flexoki Dark" then
		overrides.color_scheme = "Adventure Time (Gogh)"
	else
		overrides.color_scheme = "Flexoki Dark"
	end
	window:set_config_overrides(overrides)
end)
wezterm.on("toggle-opacity", function(window, pane)
	wezterm.action_callback(bg.swapBgOpacity(window, pane))
end)
wezterm.on("toggle-background", function(window, pane)
	wezterm.action_callback(bg.swapBgImage(window, pane))
end)

function M.setup(config)
	--- Disable defaul keys and set some minimum ones for now.
	--- This helps with conflicting keys in pwsh
	config.disable_default_key_bindings = true
	config.keys = {
		{
			key = "E",
			mods = "CTRL|SHIFT|ALT",
			action = wezterm.action.EmitEvent("toggle-colorscheme"),
		},
		{ key = "Tab", mods = "CTRL", action = act.ActivateTabRelative(1) },
		{ key = "Tab", mods = "SHIFT|CTRL", action = act.ActivateTabRelative(-1) },
		{ key = "Enter", mods = "ALT", action = act.ToggleFullScreen },
		{ key = "!", mods = "CTRL", action = act.ActivateTab(0) },
		{ key = "!", mods = "SHIFT|CTRL", action = act.ActivateTab(0) },
		{ key = '"', mods = "ALT|CTRL", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
		{ key = '"', mods = "SHIFT|ALT|CTRL", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
		{ key = "#", mods = "CTRL", action = act.ActivateTab(2) },
		{ key = "#", mods = "SHIFT|CTRL", action = act.ActivateTab(2) },
		{ key = "$", mods = "CTRL", action = act.ActivateTab(3) },
		{ key = "$", mods = "SHIFT|CTRL", action = act.ActivateTab(3) },
		{ key = "%", mods = "CTRL", action = act.ActivateTab(4) },
		{ key = "%", mods = "SHIFT|CTRL", action = act.ActivateTab(4) },
		{ key = "%", mods = "ALT|CTRL", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
		{ key = "%", mods = "SHIFT|ALT|CTRL", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
		{ key = "&", mods = "CTRL", action = act.ActivateTab(6) },
		{ key = "&", mods = "SHIFT|CTRL", action = act.ActivateTab(6) },
		{ key = "'", mods = "SHIFT|ALT|CTRL", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
		{ key = "(", mods = "CTRL", action = act.ActivateTab(-1) },
		{ key = "(", mods = "SHIFT|CTRL", action = act.ActivateTab(-1) },
		{ key = ")", mods = "CTRL", action = act.ResetFontSize },
		{ key = ")", mods = "SHIFT|CTRL", action = act.ResetFontSize },
		{ key = "*", mods = "CTRL", action = act.ActivateTab(7) },
		{ key = "*", mods = "SHIFT|CTRL", action = act.ActivateTab(7) },
		{ key = "+", mods = "CTRL", action = act.IncreaseFontSize },
		{ key = "+", mods = "SHIFT|CTRL", action = act.IncreaseFontSize },
		{ key = "-", mods = "CTRL", action = act.DecreaseFontSize },
		{ key = "-", mods = "SHIFT|CTRL", action = act.DecreaseFontSize },
		{ key = "-", mods = "SUPER", action = act.DecreaseFontSize },
		{ key = "0", mods = "CTRL", action = act.ResetFontSize },
		{ key = "0", mods = "SHIFT|CTRL", action = act.ResetFontSize },
		{ key = "0", mods = "SUPER", action = act.ResetFontSize },
		-- I use Ctrl + Number in all my other apps.
		-- I also never have more the 5 tabs
		{ key = "1", mods = "CTRL", action = act.ActivateTab(0) },
		{ key = "2", mods = "CTRL", action = act.ActivateTab(1) },
		{ key = "3", mods = "CTRL", action = act.ActivateTab(2) },
		{ key = "4", mods = "CTRL", action = act.ActivateTab(3) },
		{ key = "5", mods = "CTRL", action = act.ActivateTab(4) },
		-- { key = '1', mods = 'SHIFT|CTRL', action = act.ActivateTab(0) },
		-- { key = '1', mods = 'SUPER', action = act.ActivateTab(0) },
		-- { key = '2', mods = 'SHIFT|CTRL', action = act.ActivateTab(1) },
		-- { key = '2', mods = 'SUPER', action = act.ActivateTab(1) },
		-- { key = '3', mods = 'SHIFT|CTRL', action = act.ActivateTab(2) },
		-- { key = '3', mods = 'SUPER', action = act.ActivateTab(2) },
		-- { key = '4', mods = 'SHIFT|CTRL', action = act.ActivateTab(3) },
		-- { key = '4', mods = 'SUPER', action = act.ActivateTab(3) },
		-- { key = '5', mods = 'SHIFT|CTRL', action = act.ActivateTab(4) },
		-- { key = '5', mods = 'SHIFT|ALT|CTRL', action = act.SplitHorizontal-- { domain =  'CurrentPaneDomain' } },
		-- { key = '5', mods = 'SUPER', action = act.ActivateTab(4) },
		-- { key = '6', mods = 'SHIFT|CTRL', action = act.ActivateTab(5) },
		-- { key = '6', mods = 'SUPER', action = act.ActivateTab(5) },
		-- { key = '7', mods = 'SHIFT|CTRL', action = act.ActivateTab(6) },
		-- { key = '7', mods = 'SUPER', action = act.ActivateTab(6) },
		-- { key = '8', mods = 'SHIFT|CTRL', action = act.ActivateTab(7) },
		-- { key = '8', mods = 'SUPER', action = act.ActivateTab(7) },
		-- { key = '9', mods = 'SHIFT|CTRL', action = act.ActivateTab(-1) },
		-- { key = '9', mods = 'SUPER', action = act.ActivateTab(-1) },
		{ key = "=", mods = "CTRL", action = act.IncreaseFontSize },
		{ key = "=", mods = "SHIFT|CTRL", action = act.IncreaseFontSize },
		{ key = "=", mods = "SUPER", action = act.IncreaseFontSize },
		{ key = "@", mods = "CTRL", action = act.ActivateTab(1) },
		{ key = "@", mods = "SHIFT|CTRL", action = act.ActivateTab(1) },
		{ key = "C", mods = "CTRL", action = act.CopyTo("Clipboard") },
		{ key = "C", mods = "SHIFT|CTRL", action = act.CopyTo("Clipboard") },
		{ key = "F", mods = "CTRL", action = act.Search("CurrentSelectionOrEmptyString") },
		{ key = "F", mods = "SHIFT|CTRL", action = act.Search("CurrentSelectionOrEmptyString") },
		{ key = "K", mods = "CTRL", action = act.ClearScrollback("ScrollbackOnly") },
		{ key = "K", mods = "SHIFT|CTRL", action = act.ClearScrollback("ScrollbackOnly") },
		{ key = "L", mods = "CTRL", action = act.ShowDebugOverlay },
		{ key = "L", mods = "SHIFT|CTRL", action = act.ShowDebugOverlay },
		{ key = "M", mods = "CTRL", action = act.Hide },
		{ key = "M", mods = "SHIFT|CTRL", action = act.Hide },
		{ key = "N", mods = "CTRL", action = act.SpawnWindow },
		{ key = "P", mods = "CTRL", action = act.ActivateCommandPalette },
		{ key = "R", mods = "CTRL", action = act.ReloadConfiguration },
		{ key = "R", mods = "SHIFT|CTRL", action = act.ReloadConfiguration },
		{ key = "T", mods = "CTRL", action = act.ShowLauncher },
		{ key = "T", mods = "SHIFT|CTRL", action = act.ShowLauncher },
		{
			key = "U",
			mods = "CTRL",
			action = act.CharSelect({ copy_on_select = true, copy_to = "ClipboardAndPrimarySelection" }),
		},
		{
			key = "U",
			mods = "SHIFT|CTRL",
			action = act.CharSelect({ copy_on_select = true, copy_to = "ClipboardAndPrimarySelection" }),
		},
		{ key = "V", mods = "CTRL", action = act.PasteFrom("Clipboard") },
		{ key = "W", mods = "CTRL", action = act.CloseCurrentTab({ confirm = true }) },
		{ key = "W", mods = "SHIFT|CTRL", action = act.CloseCurrentTab({ confirm = true }) },
		{ key = "X", mods = "CTRL", action = act.ActivateCopyMode },
		{ key = "X", mods = "SHIFT|CTRL", action = act.ActivateCopyMode },
		{ key = "Z", mods = "CTRL", action = act.TogglePaneZoomState },
		{ key = "Z", mods = "SHIFT|CTRL", action = act.TogglePaneZoomState },
		{ key = "[", mods = "SHIFT|SUPER", action = act.ActivateTabRelative(-1) },
		{ key = "]", mods = "SHIFT|SUPER", action = act.ActivateTabRelative(1) },
		{ key = "^", mods = "CTRL", action = act.ActivateTab(5) },
		{ key = "^", mods = "SHIFT|CTRL", action = act.ActivateTab(5) },
		{ key = "_", mods = "CTRL", action = act.DecreaseFontSize },
		{ key = "_", mods = "SHIFT|CTRL", action = act.DecreaseFontSize },
		{ key = "c", mods = "SHIFT|CTRL", action = act.CopyTo("Clipboard") },
		{ key = "c", mods = "SUPER", action = act.CopyTo("Clipboard") },
		{ key = "f", mods = "SHIFT|CTRL", action = act.Search("CurrentSelectionOrEmptyString") },
		{ key = "f", mods = "SUPER", action = act.Search("CurrentSelectionOrEmptyString") },
		{ key = "k", mods = "SHIFT|CTRL", action = act.ClearScrollback("ScrollbackOnly") },
		{ key = "k", mods = "SUPER", action = act.ClearScrollback("ScrollbackOnly") },
		{ key = "l", mods = "SHIFT|CTRL", action = act.ShowDebugOverlay },
		{ key = "m", mods = "SHIFT|CTRL", action = act.Hide },
		{ key = "m", mods = "SUPER", action = act.Hide },
		{ key = "n", mods = "SUPER", action = act.SpawnWindow },
		{ key = "r", mods = "SHIFT|CTRL", action = act.ReloadConfiguration },
		{ key = "r", mods = "SUPER", action = act.ReloadConfiguration },
		{ key = "t", mods = "SHIFT|CTRL", action = act.ShowLauncher },
		{ key = "t", mods = "SUPER", action = act.ShowLauncher },
		{
			key = "u",
			mods = "SHIFT|CTRL",
			action = act.CharSelect({ copy_on_select = true, copy_to = "ClipboardAndPrimarySelection" }),
		},
		{ key = "v", mods = "SUPER", action = act.PasteFrom("Clipboard") },
		{ key = "w", mods = "SHIFT|CTRL", action = act.CloseCurrentTab({ confirm = true }) },
		{ key = "w", mods = "SUPER", action = act.CloseCurrentTab({ confirm = true }) },
		{ key = "x", mods = "SHIFT|CTRL", action = act.ActivateCopyMode },
		{ key = "z", mods = "SHIFT|CTRL", action = act.TogglePaneZoomState },
		{ key = "{", mods = "SUPER", action = act.ActivateTabRelative(-1) },
		{ key = "{", mods = "SHIFT|SUPER", action = act.ActivateTabRelative(-1) },
		{ key = "}", mods = "SUPER", action = act.ActivateTabRelative(1) },
		{ key = "}", mods = "SHIFT|SUPER", action = act.ActivateTabRelative(1) },
		{ key = "phys:Space", mods = "SHIFT|CTRL", action = act.QuickSelect },
		{ key = "PageUp", mods = "SHIFT", action = act.ScrollByPage(-1) },
		{ key = "PageUp", mods = "CTRL", action = act.ActivateTabRelative(-1) },
		{ key = "PageUp", mods = "SHIFT|CTRL", action = act.MoveTabRelative(-1) },
		{ key = "PageDown", mods = "SHIFT", action = act.ScrollByPage(1) },
		{ key = "PageDown", mods = "CTRL", action = act.ActivateTabRelative(1) },
		{ key = "PageDown", mods = "SHIFT|CTRL", action = act.MoveTabRelative(1) },
		{ key = "LeftArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Left", 1 }) },
		-- Turning these off so I can use pwsh keys
		-- { key = 'LeftArrow', mods = 'SHIFT|CTRL', action = act.ActivatePaneDirection 'Left' },
		-- { key = 'RightArrow', mods = 'SHIFT|CTRL', action = act.ActivatePaneDirection 'Right' },
		-- Add these to allow quick moving between prompts
		-- Use ctrl up/down to match vscode. Shift didn't feel natural
		{ key = "UpArrow", mods = "CTRL", action = act.ScrollToPrompt(-1) },
		{ key = "DownArrow", mods = "CTRL", action = act.ScrollToPrompt(1) },
		--
		{ key = "RightArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Right", 1 }) },
		{ key = "UpArrow", mods = "SHIFT|CTRL", action = act.ActivatePaneDirection("Up") },
		{ key = "UpArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Up", 1 }) },
		{ key = "DownArrow", mods = "SHIFT|CTRL", action = act.ActivatePaneDirection("Down") },
		{ key = "DownArrow", mods = "SHIFT|ALT|CTRL", action = act.AdjustPaneSize({ "Down", 1 }) },
		{ key = "Insert", mods = "SHIFT", action = act.PasteFrom("PrimarySelection") },
		{ key = "Insert", mods = "CTRL", action = act.CopyTo("PrimarySelection") },
		{ key = "F11", mods = "NONE", action = act.ToggleFullScreen },
		{ key = "Copy", mods = "NONE", action = act.CopyTo("Clipboard") },
		{ key = "Paste", mods = "NONE", action = act.PasteFrom("Clipboard") },
		{
			key = "o",
			mods = "CTRL|SHIFT",
			-- mods = "CTRL|ALT|SHIFT",
			-- toggling opacity
			action = wezterm.action.EmitEvent("toggle-background"),
		},
		{
			key = "o",
			mods = "CTRL|ALT|SHIFT",
			-- toggling opacity
			action = wezterm.action.EmitEvent("toggle-opacity"),
		},
	}

	-- Mousing bindings
	config.mouse_bindings = {
		-- Change the default click behavior so that it only selects
		-- text and doesn't open hyperlinks
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "NONE",
			action = act.CompleteSelection("ClipboardAndPrimarySelection"),
		},

		-- and make CTRL-Click open hyperlinks
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "CTRL",
			action = act.OpenLinkAtMouseCursor,
		},
		{
			event = { Down = { streak = 3, button = "Left" } },
			action = wezterm.action.SelectTextAtMouseCursor("SemanticZone"),
			mods = "NONE",
		},
	}
end

return M
