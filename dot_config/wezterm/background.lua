local wezterm = require("wezterm")
local M = {}
local bgImage = {
	{ File = "C:/Users/me/OneDrive/Pictures/heyitsgilbert logo.png" },
	{ File = "C:/Users/me/OneDrive/Pictures/goodenough.png" },
}

-- Set the default background image and opaque background
function getDefaultBackground()
	wezterm.log_info("Background is nil. Setting the default")
	wezterm.GLOBAL.backgroundIndex = 1
	wezterm.GLOBAL.opacityIndex = 1
	local resultTable = {}
	resultTable[1] = {
		source = { Color = "#100F0F" },
		width = "100%",
		height = "100%",
		opacity = 1,
	}
	resultTable[2] = {
		source = {},
		repeat_x = "NoRepeat",
		repeat_y = "NoRepeat",
		vertical_align = "Bottom",
		horizontal_align = "Right",
		horizontal_offset = "-10cell",
		vertical_offset = "-2cell",
		opacity = 0.5,
		width = 249,
		height = 249,
	}
	resultTable[2].source = bgImage[1]
	wezterm.log_info("Setting default background info")
	wezterm.log_info(resultTable)
	return resultTable
end

function M.swapBgImage(window, _pane)
	local overrides = window:get_config_overrides() or {}
	wezterm.log_info(overrides)
	if overrides.background == nil then
		overrides.background = getDefaultBackground
	end
	local currentBackground = wezterm.GLOBAL.backgroundIndex
	wezterm.log_info("Index of Background")
	wezterm.log_info(currentBackground)
	local nextIndex, nextValue = next(bgImage, currentBackground)
	if nextIndex == nil then
		wezterm.log_info("Restart index")
		nextIndex = 1
	end
	wezterm.log_info("Next results")
	wezterm.log_info(nextIndex)
	wezterm.log_info(nextValue)
	wezterm.GLOBAL.backgroundIndex = nextIndex
	overrides.background[1].source = nextValue
	wezterm.log_info(overrides)
	window:set_config_overrides(overrides)
end

function M.swapBgOpacity(window, _pane)
	local opacityOptions = {
		0.5,
		0.8,
		1,
	}
	local overrides = window:get_config_overrides() or {}
	wezterm.log_info(overrides)
	if overrides.background == nil then
		-- If not set, then set it to the next item since the first is the default
		overrides.background = getDefaultBackground()
	end
	local currentBackground = wezterm.GLOBAL.opacityIndex
	wezterm.log_info("Index of Opacity")
	wezterm.log_info(currentBackground)
	local nextIndex, nextValue = next(opacityOptions, currentBackground)
	if nextIndex == nil then
		wezterm.log_info("Restart index")
		nextIndex = 1
	end
	wezterm.log_info("Next results")
	wezterm.log_info(nextIndex)
	wezterm.log_info(nextValue)
	wezterm.GLOBAL.opacityIndex = nextIndex
	overrides.background[1]["opacity"] = nextValue
	overrides.background[2]["opacity"] = nextValue
	wezterm.log_info(overrides)
	window:set_config_overrides(overrides)
end

return M
