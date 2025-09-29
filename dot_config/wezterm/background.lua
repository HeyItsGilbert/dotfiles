local wezterm = require("wezterm")
local M = {}

-- Configuration constants
local BG_IMAGES = {
	{ File = "C:/Users/me/OneDrive/Pictures/heyitsgilbert logo.png" },
	{ File = "C:/Users/me/OneDrive/Pictures/goodenough.png" },
}

local OPACITY_OPTIONS = { 0.5, 0.8, 1.0 }
local DEFAULT_BG_COLOR = "#100F0F"

-- Initialize global state if not exists
if not wezterm.GLOBAL.backgroundIndex then
	wezterm.GLOBAL.backgroundIndex = 1
end
if not wezterm.GLOBAL.opacityIndex then
	wezterm.GLOBAL.opacityIndex = 1
end

-- Helper function to get the next item in a table cyclically
local function getNextItem(table, currentIndex)
	if not table or #table == 0 then
		wezterm.log_error("Empty or nil table passed to getNextItem")
		return 1, table[1]
	end
	
	local nextIndex, nextValue = next(table, currentIndex)
	if nextIndex == nil then
		nextIndex, nextValue = next(table, nil)
	end
	return nextIndex, nextValue
end

-- Validate that required image files exist
local function validateImagePaths()
	for i, img in ipairs(BG_IMAGES) do
		if img.File then
			wezterm.log_info("Background image " .. i .. ": " .. img.File)
		end
	end
end

-- Initialize validation
validateImagePaths()
-- Create the default background configuration
local function getDefaultBackground()
	wezterm.log_info("Setting up default background configuration")
	return {
		{
			source = { Color = DEFAULT_BG_COLOR },
			width = "100%",
			height = "100%",
			opacity = OPACITY_OPTIONS[wezterm.GLOBAL.opacityIndex] or OPACITY_OPTIONS[1],
		},
		{
			source = BG_IMAGES[wezterm.GLOBAL.backgroundIndex] or BG_IMAGES[1],
			repeat_x = "NoRepeat",
			repeat_y = "NoRepeat",
			vertical_align = "Bottom",
			horizontal_align = "Right",
			horizontal_offset = "-10cell",
			vertical_offset = "-2cell",
			opacity = OPACITY_OPTIONS[wezterm.GLOBAL.opacityIndex] or OPACITY_OPTIONS[1],
			width = 249,
			height = 249,
		}
	}
end

-- Reset background to default configuration
function M.resetBackground(window, _pane)
	local overrides = window:get_config_overrides() or {}
	overrides.background = getDefaultBackground()
	window:set_config_overrides(overrides)
	wezterm.log_info("Background reset to default")
end

-- Cycle through background images
function M.swapBgImage(window, _pane)
	local overrides = window:get_config_overrides() or {}
	
	-- Ensure background is initialized
	if not overrides.background then
		overrides.background = getDefaultBackground()
	end
	
	local currentIndex = wezterm.GLOBAL.backgroundIndex
	local nextIndex, nextValue = getNextItem(BG_IMAGES, currentIndex)
	
	wezterm.log_info("Switching background image from index " .. currentIndex .. " to " .. nextIndex)
	
	wezterm.GLOBAL.backgroundIndex = nextIndex
	overrides.background[2].source = nextValue
	
	window:set_config_overrides(overrides)
end

-- Cycle through opacity levels
function M.swapBgOpacity(window, _pane)
	local overrides = window:get_config_overrides() or {}
	
	-- Ensure background is initialized
	if not overrides.background then
		overrides.background = getDefaultBackground()
	end
	
	local currentIndex = wezterm.GLOBAL.opacityIndex
	local nextIndex, nextValue = getNextItem(OPACITY_OPTIONS, currentIndex)
	
	wezterm.log_info("Switching opacity from index " .. currentIndex .. " to " .. nextIndex .. " (value: " .. nextValue .. ")")
	
	wezterm.GLOBAL.opacityIndex = nextIndex
	overrides.background[1].opacity = nextValue
	overrides.background[2].opacity = nextValue
	
	window:set_config_overrides(overrides)
end

return M
