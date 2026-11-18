extends Node

## Central game state, survival simulation, 30-slot inventories, crafting,
## galaxy warping, trading, missions, base building, and save orchestration.

signal state_changed
signal alert_posted(msg: String)
signal system_changed(system_data: Dictionary)

var save_data: Dictionary = {}
var current_system: Dictionary = {}
var current_planet: Dictionary = {}
var play_mode: String = "menu" # "menu", "on_foot", "in_ship", "build_mode"
var is_paused: bool = false
var selected_build_part: String = "foundation"
var build_rot_y: float = 0.0
var is_mobile_ui: bool = false
var touch_move_vec: Vector2 = Vector2.ZERO
var touch_actions: Dictionary = {"jump": false, "mine": false, "scan": false, "boost": false}

var active_explorer: Node3D = null
var active_ship: Node3D = null
var active_system_builder: Node3D = null

func _ready() -> void:
	is_mobile_ui = OS.has_feature("mobile") or OS.has_feature("android") or OS.has_feature("ios")
	_ensure_input_actions()

func _ensure_input_actions() -> void:
	var fallback_keys := {
		"move_forward": KEY_W,
		"move_back": KEY_S,
		"move_left": KEY_A,
		"move_right": KEY_D,
		"jump_jetpack": KEY_SPACE,
		"sprint": KEY_SHIFT,
		"board_exit": KEY_F,
		"land_ship": KEY_L,
		"scan": KEY_C,
		"build_mode": KEY_B,
		"rotate_build": KEY_R,
		"inventory_menu": KEY_TAB,
		"galaxy_map": KEY_M,
		"pause": KEY_ESCAPE,
	}
	for act_name in fallback_keys.keys():
		if not InputMap.has_action(act_name):
			InputMap.add_action(act_name)
			var ev := InputEventKey.new()
			ev.physical_keycode = fallback_keys[act_name]
			InputMap.action_add_event(act_name, ev)
	if not InputMap.has_action("mine_fire"):
		InputMap.add_action("mine_fire")
		var mev := InputEventMouseButton.new()
		mev.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("mine_fire", mev)

func start_new_universe(slot_id: String = "slot_1", seed_val: int = 0) -> void:
	var final_seed := seed_val if seed_val > 0 else randi_range(100000, 9999999)
	current_system = UniverseGenerator.generate_star_system(final_seed, Vector3i.ZERO, true)
	current_planet = current_system["planets"][0]

	var inv: Array = _empty_slots(30)
	_add_to_array(inv, "ferrite_dust", 28)
	_add_to_array(inv, "carbon", 18)
	_add_to_array(inv, "oxygen", 15)
	_add_to_array(inv, "sodium", 12)
	_add_to_array(inv, "cobalt", 6)
	_add_to_array(inv, "copper_ore", 8)
	_add_to_array(inv, "silicate_powder", 8)
	_add_to_array(inv, "life_gel", 2)
	_add_to_array(inv, "ion_battery", 2)
	_add_to_array(inv, "launch_fuel", 2)
	_add_to_array(inv, "warp_cell", 1)

	save_data = {
		"slot_id": slot_id,
		"label": "Expedition %d" % (final_seed % 1000),
		"universe_seed": final_seed,
		"system_coords": {"x": 0, "y": 0, "z": 0},
		"current_planet_id": current_planet["id"],
		"credits": 1200,
		"survival": {
			"health": 100.0, "max_health": 100.0,
			"oxygen": 100.0, "max_oxygen": 100.0,
			"hazard": 100.0, "max_hazard": 100.0,
			"jetpack": 100.0, "max_jetpack": 100.0,
			"mining_lvl": 1, "scanner_lvl": 1, "jetpack_lvl": 1,
		},
		"ship": {
			"class_id": "explorer",
			"name": "Vanguard Pathfinder",
			"hull": 120.0, "max_hull": 120.0,
			"shield": 120.0, "max_shield": 120.0,
			"launch_fuel": 100.0, "warp_fuel": 75.0,
			"thruster_lvl": 1, "shield_lvl": 1, "weapon_lvl": 1, "hyperdrive_lvl": 1,
		},
		"player_inventory": inv,
		"ship_inventory": _empty_slots(30),
		"base_storage": _empty_slots(30),
		"hotbar": ["life_gel", "ion_battery", "med_nanite", "launch_fuel", "warp_cell"],
		"discoveries": [],
		"discovered_planets": [current_planet["id"]],
		"structures": [],
		"missions": _make_starter_missions(current_system),
	}
	play_mode = "on_foot"
	is_paused = false
	if not is_mobile_ui:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	SaveManager.save_slot(slot_id, save_data)
	system_changed.emit(current_system)
	state_changed.emit()

func load_universe_slot(slot_id: String) -> bool:
	var loaded := SaveManager.load_slot(slot_id)
	if loaded.is_empty():
		return false
	save_data = loaded
	var sc: Dictionary = save_data.get("system_coords", {"x": 0, "y": 0, "z": 0})
	var coords := Vector3i(int(sc["x"]), int(sc["y"]), int(sc["z"]))
	current_system = UniverseGenerator.generate_star_system(int(save_data["universe_seed"]), coords, coords == Vector3i.ZERO)
	current_planet = current_system["planets"][0]
	for p in current_system["planets"]:
		if p["id"] == save_data.get("current_planet_id", ""):
			current_planet = p
			break
	play_mode = "on_foot"
	is_paused = false
	if not is_mobile_ui:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	system_changed.emit(current_system)
	state_changed.emit()
	return true

func save_current() -> bool:
	if save_data.is_empty():
		return false
	var ok := SaveManager.save_slot(str(save_data.get("slot_id", "slot_1")), save_data)
	if ok:
		post_alert("Universe Progress Saved")
	return ok

func post_alert(msg: String) -> void:
	alert_posted.emit(msg)

func _empty_slots(n: int) -> Array:
	var a: Array = []
	for i in range(n):
		a.append(null)
	return a

func count_item(slots: Array, item_id: String) -> int:
	var total := 0
	for s in slots:
		if s != null and s.get("id", "") == item_id:
			total += int(s.get("qty", 0))
	return total

func _add_to_array(slots: Array, item_id: String, amount: int) -> int:
	var def: Dictionary = UniverseCatalog.ITEMS.get(item_id, {})
	var max_stack: int = int(def.get("max_stack", 99))
	var left: int = maxi(0, amount)
	for i in range(slots.size()):
		if left <= 0:
			break
		if slots[i] != null and slots[i]["id"] == item_id and int(slots[i]["qty"]) < max_stack:
			var add_q := mini(left, max_stack - int(slots[i]["qty"]))
			slots[i]["qty"] = int(slots[i]["qty"]) + add_q
			left -= add_q
	for i in range(slots.size()):
		if left <= 0:
			break
		if slots[i] == null:
			var add_q := mini(left, max_stack)
			slots[i] = {"id": item_id, "qty": add_q}
			left -= add_q
	return left

func add_player_resource(item_id: String, qty: int, source_tag: String = "mine") -> void:
	if save_data.is_empty():
		return
	var left := _add_to_array(save_data["player_inventory"], item_id, qty)
	if left > 0:
		_add_to_array(save_data["ship_inventory"], item_id, left)
	var item_name: String = str(UniverseCatalog.ITEMS.get(item_id, {}).get("name", item_id))
	post_alert("+%d %s" % [qty, item_name])
	if source_tag == "mine":
		_advance_mission("mine", 1)
	state_changed.emit()

func remove_from_array(slots: Array, item_id: String, qty: int) -> bool:
	if count_item(slots, item_id) < qty:
		return false
	var left := qty
	for i in range(slots.size() - 1, -1, -1):
		if left <= 0:
			break
		if slots[i] != null and slots[i]["id"] == item_id:
			var take := mini(left, int(slots[i]["qty"]))
			slots[i]["qty"] = int(slots[i]["qty"]) - take
			left -= take
			if int(slots[i]["qty"]) <= 0:
				slots[i] = null
	return true

func craft_recipe(recipe_id: String) -> bool:
	var recipe: Dictionary = {}
	for r in UniverseCatalog.RECIPES:
		if r["id"] == recipe_id:
			recipe = r
			break
	if recipe.is_empty():
		return false
	var inv: Array = save_data["player_inventory"]
	for ing in recipe["ingredients"]:
		if count_item(inv, ing["id"]) < int(ing["qty"]):
			post_alert("Insufficient materials")
			return false
	for ing in recipe["ingredients"]:
		remove_from_array(inv, ing["id"], int(ing["qty"]))
	_add_to_array(inv, recipe["output_id"], int(recipe["output_qty"]))
	var out_name: String = str(UniverseCatalog.ITEMS.get(recipe["output_id"], {}).get("name", recipe["output_id"]))
	post_alert("Synthesized %dx %s" % [int(recipe["output_qty"]), out_name])
	state_changed.emit()
	return true

func use_consumable(item_id: String) -> bool:
	if save_data.is_empty():
		return false
	var def: Dictionary = UniverseCatalog.ITEMS.get(item_id, {})
	if def.is_empty() or not def.has("effect"):
		return false
	var inv: Array = save_data["player_inventory"]
	if not remove_from_array(inv, item_id, 1):
		post_alert("No %s in inventory" % def["name"])
		return false
	var surv: Dictionary = save_data["survival"]
	var ship: Dictionary = save_data["ship"]
	var eff: String = str(def["effect"])
	var amt: float = float(def["amount"])
	match eff:
		"heal":
			surv["health"] = minf(float(surv["max_health"]), float(surv["health"]) + amt)
		"oxygen":
			surv["oxygen"] = minf(float(surv["max_oxygen"]), float(surv["oxygen"]) + amt)
			if item_id == "life_gel":
				surv["health"] = minf(float(surv["max_health"]), float(surv["health"]) + 40.0)
		"hazard":
			surv["hazard"] = minf(float(surv["max_hazard"]), float(surv["hazard"]) + amt)
			ship["shield"] = minf(float(ship["max_shield"]), float(ship["shield"]) + amt)
			if item_id == "thermal_cell":
				surv["oxygen"] = minf(float(surv["max_oxygen"]), float(surv["oxygen"]) + 40.0)
		"shield":
			ship["shield"] = minf(float(ship["max_shield"]), float(ship["shield"]) + amt)
			ship["hull"] = minf(float(ship["max_hull"]), float(ship["hull"]) + 45.0)
		"launch_fuel":
			ship["launch_fuel"] = minf(100.0, float(ship["launch_fuel"]) + amt)
		"warp_fuel":
			ship["warp_fuel"] = minf(100.0, float(ship["warp_fuel"]) + amt)
	post_alert("Used %s" % def["name"])
	state_changed.emit()
	return true

func step_survival(delta: float, in_water: bool, is_jetpacking: bool, near_ship: bool) -> void:
	if save_data.is_empty() or is_paused or play_mode == "menu":
		return
	var surv: Dictionary = save_data["survival"]
	var hazard_type: String = str(current_planet.get("hazard", "none"))
	var oxy_drain := 2.6 if in_water else (1.5 if hazard_type == "void" else 0.45)

	if near_ship or play_mode == "in_ship":
		surv["oxygen"] = minf(float(surv["max_oxygen"]), float(surv["oxygen"]) + 18.0 * delta)
		surv["hazard"] = minf(float(surv["max_hazard"]), float(surv["hazard"]) + 16.0 * delta)
	else:
		surv["oxygen"] = maxf(0.0, float(surv["oxygen"]) - oxy_drain * delta)

	var has_env := hazard_type != "none" and hazard_type != "void" and not near_ship and play_mode != "in_ship"
	if has_env:
		surv["hazard"] = maxf(0.0, float(surv["hazard"]) - 1.2 * delta)
	elif not near_ship:
		surv["hazard"] = minf(float(surv["max_hazard"]), float(surv["hazard"]) + 3.5 * delta)

	if float(surv["oxygen"]) <= 0.0 or (has_env and float(surv["hazard"]) <= 0.0):
		surv["health"] = maxf(0.0, float(surv["health"]) - 6.0 * delta)

	if is_jetpacking:
		var burn := 26.0 / (1.0 + (float(surv["jetpack_lvl"]) - 1.0) * 0.25)
		surv["jetpack"] = maxf(0.0, float(surv["jetpack"]) - burn * delta)
	else:
		surv["jetpack"] = minf(float(surv["max_jetpack"]), float(surv["jetpack"]) + 28.0 * delta)

func register_discovery(disc_id: String, disc_name: String, disc_type: String, rarity: String) -> void:
	if save_data.is_empty():
		return
	var list: Array = save_data["discoveries"]
	for d in list:
		if d["id"] == disc_id:
			return
	list.append({
		"id": disc_id,
		"name": disc_name,
		"type": disc_type,
		"rarity": rarity,
		"planet": current_planet.get("name", "Unknown"),
	})
	var reward := 180 if rarity == "Rare" else (350 if rarity in ["Exotic", "Mythic"] else 90)
	save_data["credits"] = int(save_data["credits"]) + reward
	_advance_mission("scan", 1)
	post_alert("Discovered %s (+%d CR)" % [disc_name, reward])
	state_changed.emit()

func can_warp_to(target_coords: Vector3i) -> Dictionary:
	var sc: Dictionary = save_data.get("system_coords", {"x": 0, "y": 0, "z": 0})
	var cur := Vector3i(int(sc["x"]), int(sc["y"]), int(sc["z"]))
	var dist_ly := roundi(Vector3(target_coords - cur).length() * 38.0)
	if dist_ly == 0:
		return {"ok": false, "dist": 0, "cost": 0, "reason": "Already in this system"}
	var ship: Dictionary = save_data["ship"]
	var ship_def: Dictionary = UniverseCatalog.SHIP_CLASSES.get(ship["class_id"], UniverseCatalog.SHIP_CLASSES["explorer"])
	var max_range := float(ship_def["warp_range"]) + (float(ship["hyperdrive_lvl"]) - 1.0) * 90.0
	if float(dist_ly) > max_range:
		return {"ok": false, "dist": dist_ly, "cost": 0, "reason": "Out of hyperdrive range"}
	var cost := maxi(15, roundi((float(dist_ly) / max_range) * 40.0))
	if float(ship["warp_fuel"]) < float(cost):
		return {"ok": false, "dist": dist_ly, "cost": cost, "reason": "Insufficient Warp Fuel"}
	return {"ok": true, "dist": dist_ly, "cost": cost, "reason": ""}

func warp_to_system(target_coords: Vector3i) -> bool:
	var check := can_warp_to(target_coords)
	if not check["ok"]:
		post_alert(str(check["reason"]))
		return false
	save_data["ship"]["warp_fuel"] = maxf(0.0, float(save_data["ship"]["warp_fuel"]) - float(check["cost"]))
	save_data["system_coords"] = {"x": target_coords.x, "y": target_coords.y, "z": target_coords.z}
	current_system = UniverseGenerator.generate_star_system(int(save_data["universe_seed"]), target_coords, target_coords == Vector3i.ZERO)
	current_planet = current_system["planets"][0]
	save_data["current_planet_id"] = current_planet["id"]
	play_mode = "in_ship"
	system_changed.emit(current_system)
	post_alert("Arrived in %s (%s)" % [current_system["name"], current_system["star_class"]])
	state_changed.emit()
	return true

func _make_starter_missions(sys_data: Dictionary) -> Array:
	var p_name: String = sys_data["planets"][0]["name"] if sys_data["planets"].size() > 0 else "Frontier World"
	return [
		{"id": "m_scan", "title": "Biosphere Survey: %s" % p_name, "type": "scan", "progress": 0, "required": 3, "credits": 950, "claimed": false},
		{"id": "m_mine", "title": "Resource Extraction Contract", "type": "mine", "progress": 0, "required": 4, "credits": 750, "claimed": false},
		{"id": "m_explore", "title": "Seamless Orbital Pioneer", "type": "explore", "progress": 0, "required": 2, "credits": 1400, "claimed": false},
	]

func _advance_mission(m_type: String, delta_cnt: int) -> void:
	for m in save_data.get("missions", []):
		if m["type"] == m_type and not m["claimed"]:
			m["progress"] = mini(int(m["required"]), int(m["progress"]) + delta_cnt)

func claim_mission(mission_id: String) -> bool:
	for m in save_data.get("missions", []):
		if m["id"] == mission_id and not m["claimed"] and int(m["progress"]) >= int(m["required"]):
			m["claimed"] = true
			save_data["credits"] = int(save_data["credits"]) + int(m["credits"])
			post_alert("Mission Claimed: +%d CR" % int(m["credits"]))
			state_changed.emit()
			return true
	return false
