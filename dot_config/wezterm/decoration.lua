local wezterm = require("wezterm")

local M = {}
-- The filled in variant of the < symbol
local SOLID_LEFT_ARROW = wezterm.nerdfonts.pl_right_hard_divider
-- The filled in variant of the > symbol
local SOLID_RIGHT_ARROW = wezterm.nerdfonts.pl_left_hard_divider

local function is_remote_domain(pane)
	-- Get the domain object for the current pane
	local domain_name = pane:domain_name()

	-- The local domain is typically named "local" by default
	-- or "Local" if using the GUI process directly.
	-- Other domains (like ssh) will have their configured name.
	return domain_name ~= "local" and domain_name ~= "Local"
end

wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
	local edge_background = "#3c1361"
	local background = "#1b1032"
	local foreground = "#808080"

	if tab.is_active then
		background = "#2b2042"
		foreground = "#c0c0c0"
	elseif hover then
		background = "#3b3052"
		foreground = "#909090"
	end

	local edge_foreground = background

	local title = tab_title(tab)

	-- ensure that the titles fit in the available space,
	-- and that we have room for the edges.
	title = wezterm.truncate_right(title, max_width - 2)

	return {
		{ Background = { Color = edge_background } },
		{ Foreground = { Color = edge_foreground } },
		{ Text = SOLID_LEFT_ARROW },
		{ Background = { Color = background } },
		{ Foreground = { Color = foreground } },
		{ Text = "  " .. title .. "  " },
		{ Background = { Color = edge_background } },
		{ Foreground = { Color = edge_foreground } },
		{ Text = SOLID_RIGHT_ARROW },
	}
end)

function tab_title(tab_info)
	local title = tab_info.tab_title
	-- if the tab title is explicitly set, take that
	if title and #title > 0 then
		return title
	end
	-- Otherwise, use the title from the active pane
	-- in that tab
	return tab_info.active_pane.title
end

function M.setup(config, isWindows11)
	if isWindows11 then
		wezterm.log_info("Windows 11 decorations")
		-- config.window_background_opacity = 0.5
		-- config.win32_system_backdrop = "Acrylic"
		config.win32_acrylic_accent_color = "rgb(94, 64, 157)"
		config.webgpu_power_preference = "HighPerformance"
		config.front_end = "OpenGL"
		config.prefer_egl = true
		config.window_padding = {
			left = 5,
			right = 5,
			top = 5,
			bottom = 5,
		}
	end
	config.hide_tab_bar_if_only_one_tab = false
	config.default_cursor_style = "BlinkingBar"
	config.use_fancy_tab_bar = false
	config.tab_bar_at_bottom = false
	config.tab_max_width = 24
	config.window_decorations = "NONE | RESIZE"
	config.cell_width = 0.9
	config.window_frame = {
		-- The overall background color of the tab bar when
		-- the window is focused
		active_titlebar_bg = "#3c1361",

		-- The overall background color of the tab bar when
		-- the window is not focused
		inactive_titlebar_bg = "#333333",
	}
	config.colors = {
		tab_bar = {
			background = "#3c1361",
		},
	}
	config.background = {
		{
			source = { Color = "#100F0F" },
			width = "100%",
			height = "100%",
			opacity = 0.5,
		},
		{
			source = { File = wezterm.home_dir .. "\\.config\\wezterm\\backgrounds\\heyitsgilbert_logo.png" },
			repeat_x = "NoRepeat",
			repeat_y = "NoRepeat",
			vertical_align = "Bottom",
			horizontal_align = "Right",
			horizontal_offset = "-10cell",
			vertical_offset = "-2cell",
			opacity = 0.5,
			width = 249,
			height = 249,
		},
	}

	--- This was to change the background to a funny photo.
	--- wezterm.on("user-var-changed", function(window, pane, name, value)
	--- 	wezterm.log_info("var", name, value)
	--- 	local overrides = window:get_config_overrides() or {}
	--- 	if
	--- 		overrides.background ~= nil
	--- 		and overrides.background[1] ~= nil
	--- 		and name == "LastCommand"
	--- 		and value == "Error"
	--- 	then
	--- 		overrides.background[1].source = { File = "C:/Users/me/OneDrive/Pictures/goodenough.png" }
	--- 	else
	--- 		overrides.background[1].source = { File = "C:/Users/me/OneDrive/Pictures/heyitsgilbert logo.png" }
	--- 	end
	--- 	window:set_config_overrides(overrides)
	--- end)

	wezterm.on("update-right-status", function(window, pane)
		-- Each element holds the text for a cell in a "powerline" style << fade
		local cells = {}

		-- Figure out the cwd and host of the current pane.
		-- This will pick up the hostname for the remote host if your
		-- shell is using OSC 7 on the remote host.
		local cwd_uri = pane:get_current_working_dir()
		if cwd_uri then
			local cwd = ""
			local hostname = ""

			if type(cwd_uri) == "userdata" then
				-- Running on a newer version of wezterm and we have
				-- a URL object here, making this simple!

				cwd = cwd_uri.file_path
				hostname = cwd_uri.host or wezterm.hostname()
			else
				-- an older version of wezterm, 20230712-072601-f4abf8fd or earlier,
				-- which doesn't have the Url object
				cwd_uri = cwd_uri:sub(8)
				local slash = cwd_uri:find("/")
				if slash then
					hostname = cwd_uri:sub(1, slash - 1)
					-- and extract the cwd from the uri, decoding %-encoding
					cwd = cwd_uri:sub(slash):gsub("%%(%x%x)", function(hex)
						return string.char(tonumber(hex, 16))
					end)
				end
			end

			-- Remove the domain name portion of the hostname
			local dot = hostname:find("[.]")
			if dot then
				hostname = hostname:sub(1, dot - 1)
			end
			if hostname == "" then
				hostname = wezterm.hostname()
			end

			table.insert(cells, cwd)
			table.insert(cells, hostname)
		end

		-- I like my date/time in this style: "Wed Mar 3 08:14"
		local date = wezterm.strftime("%a %b %-d %H:%M")
		table.insert(cells, date)

		-- An entry for each battery (typically 0 or 1 battery)
		for _, b in ipairs(wezterm.battery_info()) do
			table.insert(cells, string.format("%.0f%%", b.state_of_charge * 100))
		end

		-- The powerline < symbol
		local LEFT_ARROW = utf8.char(0xe0b3)

		-- Color palette for the backgrounds of each cell
		local colors = {
			"#3c1361",
			"#52307c",
			"#663a82",
			"#7c5295",
			"#b491c8",
		}

		-- Foreground color for the text across the fade
		local text_fg = "#c0c0c0"

		-- The elements to be formatted
		local elements = {}
		-- How many cells have been formatted
		local num_cells = 0

		-- Translate a cell into elements
		function push(text, is_last)
			local cell_no = num_cells + 1
			table.insert(elements, { Foreground = { Color = text_fg } })
			table.insert(elements, { Background = { Color = colors[cell_no] } })
			table.insert(elements, { Text = " " .. text .. " " })
			if not is_last then
				table.insert(elements, { Foreground = { Color = colors[cell_no + 1] } })
				table.insert(elements, { Text = SOLID_LEFT_ARROW })
			end
			num_cells = num_cells + 1
		end

		while #cells > 0 do
			local cell = table.remove(cells, 1)
			push(cell, #cells == 0)
		end

		window:set_right_status(wezterm.format(elements))
	end)
end

return M
