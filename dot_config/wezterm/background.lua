local wezterm = require("wezterm")
local M = {}

-- Configuration constants
local BG_IMAGES = {
	{ File = "C:/Users/me/OneDrive/Pictures/heyitsgilbert logo.png" },
	{ File = "C:/Users/me/OneDrive/Pictures/goodenough.png" },
	false, -- No image option (using false instead of nil)
}

local BG_IMAGES_COUNT = 3 -- Explicitly define the count

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
	if not table then
		wezterm.log_error("Nil table passed to getNextItem")
		return 1, table[1]
	end
	
	local nextIndex = currentIndex + 1
	if nextIndex > BG_IMAGES_COUNT then
		nextIndex = 1
	end
	return nextIndex, table[nextIndex]
end

-- Validate that required image files exist
local function validateImagePaths()
	for i, img in ipairs(BG_IMAGES) do
		if img and img.File then
			wezterm.log_info("Background image " .. i .. ": " .. img.File)
		elseif img == false then
			wezterm.log_info("Background option " .. i .. ": No image")
		end
	end
end

-- Initialize validation
validateImagePaths()
-- Create the default background configuration
local function getDefaultBackground()
	wezterm.log_info("Setting up default background configuration")
	local background = {
		{
			source = { Color = DEFAULT_BG_COLOR },
			width = "100%",
			height = "100%",
			opacity = OPACITY_OPTIONS[wezterm.GLOBAL.opacityIndex] or OPACITY_OPTIONS[1],
		}
	}
	
	-- Only add image layer if there's an image selected
	local currentImage = BG_IMAGES[wezterm.GLOBAL.backgroundIndex]
	wezterm.log_info("Current background index: " .. (wezterm.GLOBAL.backgroundIndex or "nil"))
	wezterm.log_info("Current image: " .. (currentImage and (currentImage ~= false and "exists" or "false/no-image") or "nil"))
	
	if currentImage and currentImage ~= false then
		table.insert(background, {
			source = currentImage,
			repeat_x = "NoRepeat",
			repeat_y = "NoRepeat",
			vertical_align = "Bottom",
			horizontal_align = "Right",
			horizontal_offset = "-10cell",
			vertical_offset = "-2cell",
			opacity = OPACITY_OPTIONS[wezterm.GLOBAL.opacityIndex] or OPACITY_OPTIONS[1],
			width = 249,
			height = 249,
		})
	end
	
	return background
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
	
	local currentIndex = wezterm.GLOBAL.backgroundIndex
	local nextIndex, nextValue = getNextItem(BG_IMAGES, currentIndex)
	
	if nextValue and nextValue ~= false then
		wezterm.log_info("Switching background image from index " .. currentIndex .. " to " .. nextIndex)
	else
		wezterm.log_info("Switching to no background image (index " .. nextIndex .. ")")
	end
	
	wezterm.GLOBAL.backgroundIndex = nextIndex
	
	-- Regenerate the entire background configuration to handle no image case
	overrides.background = getDefaultBackground()
	
	window:set_config_overrides(overrides)
end

-- Cycle through opacity levels
function M.swapBgOpacity(window, _pane)
	local overrides = window:get_config_overrides() or {}
	
	local currentIndex = wezterm.GLOBAL.opacityIndex
	local nextIndex, nextValue = getNextItem(OPACITY_OPTIONS, currentIndex)
	
	wezterm.log_info("Switching opacity from index " .. currentIndex .. " to " .. nextIndex .. " (value: " .. nextValue .. ")")
	
	wezterm.GLOBAL.opacityIndex = nextIndex
	
	-- Regenerate the entire background configuration to handle opacity changes
	overrides.background = getDefaultBackground()
	
	window:set_config_overrides(overrides)
end

return M
