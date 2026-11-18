class_name HUDController
extends CanvasLayer

## Complete sci-fi HUD, Start/Pause Menus, 30-slot Cargo, 20 Crafting Recipes,
## Galaxy Warp Map, Missions, Discovery Journal, and Mobile/HP Touch Controls.

var hud_root: Control = null
var title_panel: PanelContainer = null
var systems_panel: PanelContainer = null
var pause_panel: PanelContainer = null
var touch_root: Control = null

var status_lbl: Label = null
var planet_lbl: Label = null
var alert_lbl: Label = null
var credits_lbl: Label = null
var tab_content: VBoxContainer = null
var active_tab: String = "cargo"
var alert_timer: float = 0.0
var look_touch_idx: int = -1

func _ready() -> void:
	_build_ui()
	GameManager.state_changed.connect(_refresh)
	GameManager.alert_posted.connect(_on_alert)
	_refresh()

func _on_alert(msg: String) -> void:
	if alert_lbl != null:
		alert_lbl.text = msg
		alert_lbl.visible = true
		alert_timer = 3.5

func _build_ui() -> void:
	# Main HUD Container
	hud_root = Control.new()
	hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hud_root)

	status_lbl = Label.new()
	status_lbl.position = Vector2(18, 14)
	status_lbl.add_theme_font_size_override("font_size", 15)
	hud_root.add_child(status_lbl)

	planet_lbl = Label.new()
	planet_lbl.set_anchors_preset(Control.PRESET_TOP_WIDE)
	planet_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	planet_lbl.position = Vector2(0, 12)
	planet_lbl.add_theme_font_size_override("font_size", 15)
	hud_root.add_child(planet_lbl)

	credits_lbl = Label.new()
	credits_lbl.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	credits_lbl.position = Vector2(-210, 14)
	credits_lbl.custom_minimum_size = Vector2(190, 28)
	credits_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hud_root.add_child(credits_lbl)

	# Top-right Quick Menu Buttons (important for touch/HP as well as mouse)
	var top_btns := HBoxContainer.new()
	top_btns.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	top_btns.position = Vector2(-260, 44)
	top_btns.custom_minimum_size = Vector2(245, 34)
	hud_root.add_child(top_btns)
	_add_btn(top_btns, "MENU", func(): _toggle_systems("cargo"))
	_add_btn(top_btns, "GALAXY", func(): _toggle_systems("galaxy"))
	_add_btn(top_btns, "MUTE", func(): AudioManager.set_muted(not AudioManager.muted))
	_add_btn(top_btns, "PAUSE", func(): _toggle_pause())

	# Crosshair
	var cross := Label.new()
	cross.text = "+"
	cross.set_anchors_preset(Control.PRESET_CENTER)
	cross.add_theme_font_size_override("font_size", 24)
	hud_root.add_child(cross)

	alert_lbl = Label.new()
	alert_lbl.set_anchors_preset(Control.PRESET_TOP_WIDE)
	alert_lbl.position = Vector2(0, 82)
	alert_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	alert_lbl.visible = false
	hud_root.add_child(alert_lbl)

	# Bottom 5-Slot Hotbar
	var hotbar := HBoxContainer.new()
	hotbar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	hotbar.alignment = BoxContainer.ALIGNMENT_CENTER
	hotbar.position = Vector2(0, -54)
	hud_root.add_child(hotbar)
	for i in range(5):
		var idx := i
		_add_btn(hotbar, "[%d] USE" % (i + 1), func(): _use_hotbar(idx))

	# Mobile / HP Touch Controls
	_build_touch_controls()

	# Title Overlay (responsive for PC & HP screens)
	title_panel = PanelContainer.new()
	title_panel.anchor_left = 0.5; title_panel.anchor_right = 0.5
	title_panel.anchor_top = 0.5; title_panel.anchor_bottom = 0.5
	title_panel.offset_left = -210; title_panel.offset_right = 210
	title_panel.offset_top = -140; title_panel.offset_bottom = 140
	add_child(title_panel)
	var tv := VBoxContainer.new()
	tv.alignment = BoxContainer.ALIGNMENT_CENTER
	title_panel.add_child(tv)
	var title_lbl := Label.new()
	title_lbl.text = "ABYSS: INFINITE FRONTIER"
	title_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_lbl.add_theme_font_size_override("font_size", 24)
	tv.add_child(title_lbl)
	var sub_lbl := Label.new()
	sub_lbl.text = "36 Planetary Biomes • 47 Items • Alien Biota • Seamless Flight"
	sub_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tv.add_child(sub_lbl)
	_add_btn(tv, "LAUNCH NEW EXPEDITION", func(): GameManager.start_new_universe("slot_1"))
	_add_btn(tv, "CONTINUE SAVED UNIVERSE", func(): GameManager.load_universe_slot("slot_1"))

	# Systems Modal (Cargo / Craft / Galaxy / Missions / Journal - responsive anchors)
	systems_panel = PanelContainer.new()
	systems_panel.anchor_left = 0.08; systems_panel.anchor_right = 0.92
	systems_panel.anchor_top = 0.10; systems_panel.anchor_bottom = 0.88
	systems_panel.visible = false
	add_child(systems_panel)
	var sv := VBoxContainer.new()
	systems_panel.add_child(sv)
	var tabs := HFlowContainer.new()
	sv.add_child(tabs)
	_add_btn(tabs, "CARGO", func(): _open_tab("cargo"))
	_add_btn(tabs, "CRAFT (20)", func(): _open_tab("craft"))
	_add_btn(tabs, "GALAXY WARP", func(): _open_tab("galaxy"))
	_add_btn(tabs, "MISSIONS", func(): _open_tab("missions"))
	_add_btn(tabs, "JOURNAL", func(): _open_tab("journal"))
	_add_btn(tabs, "SAVE", func(): GameManager.save_current())
	_add_btn(tabs, "CLOSE", func(): _toggle_systems(""))

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sv.add_child(scroll)
	tab_content = VBoxContainer.new()
	tab_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(tab_content)

	# Pause Modal
	pause_panel = PanelContainer.new()
	pause_panel.anchor_left = 0.5; pause_panel.anchor_right = 0.5
	pause_panel.anchor_top = 0.5; pause_panel.anchor_bottom = 0.5
	pause_panel.offset_left = -160; pause_panel.offset_right = 160
	pause_panel.offset_top = -110; pause_panel.offset_bottom = 110
	pause_panel.visible = false
	add_child(pause_panel)
	var pv := VBoxContainer.new()
	pause_panel.add_child(pv)
	_add_btn(pv, "RESUME", func(): _toggle_pause())
	_add_btn(pv, "TOGGLE AUDIO (MUTE)", func(): AudioManager.set_muted(not AudioManager.muted))
	_add_btn(pv, "TOGGLE TOUCH HUD (HP)", func():
		GameManager.is_mobile_ui = not GameManager.is_mobile_ui
		_refresh()
	)
	_add_btn(pv, "SAVE PROGRESS", func(): GameManager.save_current())
	_add_btn(pv, "RETURN TO MENU", func():
		GameManager.play_mode = "menu"
		GameManager.is_paused = false
		_refresh()
	)

func _build_touch_controls() -> void:
	touch_root = Control.new()
	touch_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	touch_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_root.add_child(touch_root)

	# Left D-Pad Grid for Mobile/HP
	var move_grid := GridContainer.new()
	move_grid.columns = 3
	move_grid.anchor_left = 0.0; move_grid.anchor_right = 0.0
	move_grid.anchor_top = 1.0; move_grid.anchor_bottom = 1.0
	move_grid.offset_left = 18; move_grid.offset_top = -200
	touch_root.add_child(move_grid)
	move_grid.add_child(Control.new())
	_add_hold_btn(move_grid, "FWD", func(v): GameManager.touch_move_vec.y = 1.0 if v else 0.0)
	move_grid.add_child(Control.new())
	_add_hold_btn(move_grid, "LEFT", func(v): GameManager.touch_move_vec.x = -1.0 if v else 0.0)
	_add_hold_btn(move_grid, "BACK", func(v): GameManager.touch_move_vec.y = -1.0 if v else 0.0)
	_add_hold_btn(move_grid, "RIGHT", func(v): GameManager.touch_move_vec.x = 1.0 if v else 0.0)

	# Right Action Buttons for Mobile/HP
	var act_grid := GridContainer.new()
	act_grid.columns = 2
	act_grid.anchor_left = 1.0; act_grid.anchor_right = 1.0
	act_grid.anchor_top = 1.0; act_grid.anchor_bottom = 1.0
	act_grid.offset_left = -180; act_grid.offset_top = -200
	touch_root.add_child(act_grid)
	_add_hold_btn(act_grid, "BOARD/EXIT", func(v):
		if v: Input.action_press("board_exit")
		else: Input.action_release("board_exit")
	)
	_add_hold_btn(act_grid, "SCAN", func(v): GameManager.touch_actions["scan"] = v)
	_add_hold_btn(act_grid, "MINE/FIRE", func(v): GameManager.touch_actions["mine"] = v)
	_add_hold_btn(act_grid, "JET/LAUNCH", func(v): GameManager.touch_actions["jump"] = v)

func _add_btn(parent: Node, label_txt: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = label_txt
	b.custom_minimum_size = Vector2(78, 36)
	b.pressed.connect(func():
		AudioManager.play_sfx("ui_click")
		cb.call()
	)
	parent.add_child(b)
	return b

func _add_hold_btn(parent: Node, label_txt: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = label_txt
	b.custom_minimum_size = Vector2(72, 42)
	b.button_down.connect(func(): cb.call(true))
	b.button_up.connect(func(): cb.call(false))
	parent.add_child(b)
	return b

func _use_hotbar(idx: int) -> void:
	var hb: Array = GameManager.save_data.get("hotbar", [])
	if idx >= 0 and idx < hb.size():
		GameManager.use_consumable(str(hb[idx]))

func _toggle_systems(tab_name: String) -> void:
	if GameManager.play_mode == "menu":
		return
	if systems_panel.visible and (tab_name == "" or tab_name == active_tab):
		systems_panel.visible = false
		GameManager.is_paused = false
		if not GameManager.is_mobile_ui:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		if tab_name != "":
			active_tab = tab_name
		systems_panel.visible = true
		pause_panel.visible = false
		GameManager.is_paused = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		_render_tab()

func _toggle_pause() -> void:
	if GameManager.play_mode == "menu":
		return
	systems_panel.visible = false
	pause_panel.visible = not pause_panel.visible
	GameManager.is_paused = pause_panel.visible
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if pause_panel.visible or GameManager.is_mobile_ui else Input.MOUSE_MODE_CAPTURED

func _open_tab(t: String) -> void:
	active_tab = t
	_render_tab()

func _render_tab() -> void:
	for c in tab_content.get_children():
		c.queue_free()
	if GameManager.save_data.is_empty():
		return

	if active_tab == "cargo":
		var inv: Array = GameManager.save_data["player_inventory"]
		for s in inv:
			if s == null:
				continue
			var item_def: Dictionary = UniverseCatalog.ITEMS.get(s["id"], {})
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.text = "%s x%d (%s)" % [item_def.get("name", s["id"]), int(s["qty"]), item_def.get("rarity", "Common")]
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(lbl)
			if item_def.has("effect"):
				var iid := str(s["id"])
				_add_btn(row, "USE", func(): GameManager.use_consumable(iid); _render_tab())
			tab_content.add_child(row)
	elif active_tab == "craft":
		var inv: Array = GameManager.save_data["player_inventory"]
		for r in UniverseCatalog.RECIPES:
			var out_def: Dictionary = UniverseCatalog.ITEMS.get(r["output_id"], {})
			var row := HBoxContainer.new()
			var req_txt := ""
			for ing in r["ingredients"]:
				var have := GameManager.count_item(inv, ing["id"])
				req_txt += "%s %d/%d  " % [UniverseCatalog.ITEMS.get(ing["id"], {}).get("name", ing["id"]), have, int(ing["qty"])]
			var lbl := Label.new()
			lbl.text = "%s x%d  |  %s" % [out_def.get("name", r["output_id"]), int(r["output_qty"]), req_txt]
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(lbl)
			var rid := str(r["id"])
			_add_btn(row, "CRAFT", func(): GameManager.craft_recipe(rid); _render_tab())
			tab_content.add_child(row)
	elif active_tab == "galaxy":
		var sc: Dictionary = GameManager.save_data["system_coords"]
		var center := Vector3i(int(sc["x"]), int(sc["y"]), int(sc["z"]))
		var sys_list := UniverseGenerator.generate_nearby_systems(int(GameManager.save_data["universe_seed"]), center, 2)
		for sys_d in sys_list:
			var c: Vector3i = sys_d["coords"]
			var chk := GameManager.can_warp_to(c)
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.text = "%s (%s) • %d Planets • %d LY" % [sys_d["name"], sys_d["star_class"], sys_d["planets"].size(), int(chk["dist"])]
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(lbl)
			var b := _add_btn(row, "WARP" if chk["ok"] else ("HERE" if chk["dist"] == 0 else "LOCKED"), func():
				if GameManager.warp_to_system(c):
					_toggle_systems("")
			)
			b.disabled = not chk["ok"]
			tab_content.add_child(row)
	elif active_tab == "missions":
		for m in GameManager.save_data["missions"]:
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.text = "%s (%d/%d) • %d CR" % [m["title"], int(m["progress"]), int(m["required"]), int(m["credits"])]
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(lbl)
			var mid := str(m["id"])
			var b := _add_btn(row, "CLAIMED" if m["claimed"] else "CLAIM", func(): GameManager.claim_mission(mid); _render_tab())
			b.disabled = m["claimed"] or int(m["progress"]) < int(m["required"])
			tab_content.add_child(row)
	elif active_tab == "journal":
		var disc: Array = GameManager.save_data["discoveries"]
		if disc.is_empty():
			var empty_l := Label.new(); empty_l.text = "Scan alien flora, fauna, and minerals [C] to populate the Discovery Journal."; tab_content.add_child(empty_l)
		for d in disc:
			var lbl := Label.new()
			lbl.text = "[%s] %s (%s) — %s" % [d["type"], d["name"], d["rarity"], d["planet"]]
			tab_content.add_child(lbl)

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("inventory_menu"):
		_toggle_systems("cargo")
	elif event.is_action_pressed("galaxy_map"):
		_toggle_systems("galaxy")
	elif event.is_action_pressed("pause"):
		_toggle_pause()
	elif GameManager.is_mobile_ui and not GameManager.is_paused:
		if event is InputEventScreenDrag and event.position.x > get_viewport().get_visible_rect().size.x * 0.45:
			if GameManager.play_mode in ["on_foot", "build_mode"] and GameManager.active_explorer != null:
				GameManager.active_explorer.apply_look_delta(event.relative.x, event.relative.y)
			elif GameManager.play_mode == "in_ship" and GameManager.active_ship != null and not GameManager.active_ship.landed:
				GameManager.active_ship.steer_input.x = clampf(GameManager.active_ship.steer_input.x - event.relative.x * 0.004, -1.0, 1.0)
				GameManager.active_ship.steer_input.y = clampf(GameManager.active_ship.steer_input.y - event.relative.y * 0.004, -1.0, 1.0)

func _process(delta: float) -> void:
	if alert_timer > 0.0:
		alert_timer -= delta
		if alert_timer <= 0.0 and alert_lbl != null:
			alert_lbl.visible = false
	_refresh()

func _refresh() -> void:
	var in_menu := GameManager.play_mode == "menu"
	title_panel.visible = in_menu
	hud_root.visible = not in_menu
	touch_root.visible = GameManager.is_mobile_ui and not in_menu and not GameManager.is_paused
	if in_menu or GameManager.save_data.is_empty():
		return

	var s: Dictionary = GameManager.save_data["survival"]
	var sh: Dictionary = GameManager.save_data["ship"]
	if GameManager.play_mode == "in_ship":
		status_lbl.text = "%s\nSHD %d  |  HUL %d\nTHR %d%%  |  WRP %d%%" % [sh["name"], roundi(sh["shield"]), roundi(sh["hull"]), roundi(sh["launch_fuel"]), roundi(sh["warp_fuel"])]
	else:
		status_lbl.text = "SUIT HP %d  |  O2 %d%%\nHAZARD %d%%  |  JET %d%%" % [roundi(s["health"]), roundi(s["oxygen"]), roundi(s["hazard"]), roundi(s["jetpack"])]

	var pl: Dictionary = GameManager.current_planet
	planet_lbl.text = "%s (%s) • %d°C • %.1fg • %s" % [pl.get("name", "Space"), pl.get("archetype_name", ""), int(pl.get("temperature_c", 20)), float(pl.get("gravity", 9.8)), pl.get("weather", "Clear")]
	credits_lbl.text = "%d CR" % int(GameManager.save_data.get("credits", 0))
