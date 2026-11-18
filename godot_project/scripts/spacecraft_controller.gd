class_name SpacecraftController
extends Node3D

## Continuous seamless flight from planet surface -> atmosphere -> open space,
## mouse-driven pitch/yaw + touch steering, and 3-point terrain-aligned surface parking.

var ship_mesh: Node3D = null
var gear_group: Node3D = null
var camera: Camera3D = null
var vel: Vector3 = Vector3.ZERO
var landed: bool = true
var auto_landing: bool = false
var takeoff_grace: float = 0.0
var mouse_sens: float = 0.0022
var steer_input: Vector2 = Vector2.ZERO
var fire_cooldown: float = 0.0

func _ready() -> void:
	GameManager.active_ship = self
	_build_ship_model()

func _build_ship_model() -> void:
	ship_mesh = Node3D.new()
	add_child(ship_mesh)

	var hull_mat := StandardMaterial3D.new()
	hull_mat.albedo_color = Color("#e2e8f0")
	hull_mat.metallic = 0.55; hull_mat.roughness = 0.35

	var accent_mat := StandardMaterial3D.new()
	accent_mat.albedo_color = Color("#38bdf8")
	accent_mat.emission_enabled = true; accent_mat.emission = Color("#38bdf8"); accent_mat.emission_energy_multiplier = 0.45

	var dark_mat := StandardMaterial3D.new()
	dark_mat.albedo_color = Color("#1e293b")

	var body := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = Vector3(2.1, 0.95, 4.4)
	body.mesh = bm; body.material_override = hull_mat; body.position.y = 0.9
	ship_mesh.add_child(body)

	var nose := MeshInstance3D.new()
	var nm := CylinderMesh.new(); nm.top_radius = 0.1; nm.bottom_radius = 0.95; nm.height = 1.9
	nose.mesh = nm; nose.material_override = accent_mat; nose.rotation.x = -PI / 2.0; nose.position = Vector3(0.0, 0.9, -2.9)
	ship_mesh.add_child(nose)

	var wing := MeshInstance3D.new()
	var wm := BoxMesh.new(); wm.size = Vector3(7.4, 0.18, 1.8)
	wing.mesh = wm; wing.material_override = hull_mat; wing.position = Vector3(0.0, 0.85, 0.3)
	ship_mesh.add_child(wing)

	var canopy := MeshInstance3D.new()
	var cm := SphereMesh.new(); cm.radius = 0.72; cm.height = 0.85
	canopy.mesh = cm; canopy.material_override = accent_mat; canopy.position = Vector3(0.0, 1.42, -0.5)
	ship_mesh.add_child(canopy)

	# 3 Landing Gear Struts & Ground Pads (flush bottom at y = 0 in local space)
	gear_group = Node3D.new()
	ship_mesh.add_child(gear_group)
	var pads := [Vector3(0.0, 0.7, -1.9), Vector3(-1.4, 0.7, 1.2), Vector3(1.4, 0.7, 1.2)]
	for p in pads:
		var sg := Node3D.new()
		sg.position = p
		var strut := MeshInstance3D.new()
		var sm := CylinderMesh.new(); sm.top_radius = 0.08; sm.bottom_radius = 0.08; sm.height = 0.7
		strut.mesh = sm; strut.material_override = dark_mat; strut.position.y = -0.35
		sg.add_child(strut)
		var pad := MeshInstance3D.new()
		var pm := CylinderMesh.new(); pm.top_radius = 0.32; pm.bottom_radius = 0.38; pm.height = 0.12
		pad.mesh = pm; pad.material_override = accent_mat; pad.position.y = -0.64
		sg.add_child(pad)
		gear_group.add_child(sg)

	camera = Camera3D.new()
	camera.fov = 74.0; camera.far = 14000.0
	camera.position = Vector3(0.0, 3.2, 11.5)
	add_child(camera)

func _unhandled_input(event: InputEvent) -> void:
	if GameManager.play_mode != "in_ship" or GameManager.is_paused or landed:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		steer_input.x = clampf(steer_input.x - event.relative.x * mouse_sens, -1.0, 1.0)
		steer_input.y = clampf(steer_input.y - event.relative.y * mouse_sens, -1.0, 1.0)

func park_at_planet(planet: SphericalPlanet, desired_pos: Vector3) -> void:
	var aligned := align_to_surface(planet, desired_pos)
	global_position = aligned["pos"]
	global_basis = aligned["basis"]
	vel = Vector3.ZERO
	landed = true
	auto_landing = false
	gear_group.visible = true

func align_to_surface(planet: SphericalPlanet, desired_world: Vector3) -> Dictionary:
	var p_center := planet.global_position
	var radial_up := (desired_world - p_center).normalized()
	var cur_fwd := -global_basis.z
	cur_fwd = (cur_fwd - radial_up * cur_fwd.dot(radial_up))
	if cur_fwd.length_squared() < 1e-4:
		cur_fwd = Vector3.FORWARD - radial_up * radial_up.z
		if cur_fwd.length_squared() < 1e-4:
			cur_fwd = Vector3.RIGHT
	cur_fwd = cur_fwd.normalized()
	var right := cur_fwd.cross(radial_up).normalized()

	var p_nose := _sample_offset(planet, radial_up, right, cur_fwd, 0.0, 1.9)
	var p_left := _sample_offset(planet, radial_up, right, cur_fwd, -1.4, -1.2)
	var p_right := _sample_offset(planet, radial_up, right, cur_fwd, 1.4, -1.2)
	var p_center_r := float(planet.sample_mesh_surface(radial_up)["radius"])

	var surf_norm := (p_left - p_nose).cross(p_right - p_nose)
	if surf_norm.dot(radial_up) < 0.0:
		surf_norm = -surf_norm
	if surf_norm.length_squared() < 1e-6:
		surf_norm = radial_up
	surf_norm = surf_norm.normalized()
	if surf_norm.dot(radial_up) < cos(deg_to_rad(26.0)):
		surf_norm = surf_norm.lerp(radial_up, 0.55).normalized()

	var fwd := (cur_fwd - surf_norm * cur_fwd.dot(surf_norm)).normalized()
	var adj_right := fwd.cross(surf_norm).normalized()
	var target_basis := Basis(adj_right, surf_norm, -fwd)

	var lift_h := p_center_r
	var struts := [Vector3(0.0, 0.0, -1.9), Vector3(-1.4, 0.0, 1.2), Vector3(1.4, 0.0, 1.2)]
	for s_off in struts:
		var w_off := target_basis * s_off
		var pad_dir := (radial_up * p_center_r + w_off).normalized()
		var pad_r := float(planet.sample_mesh_surface(pad_dir)["radius"])
		var req_r := pad_r - w_off.dot(radial_up)
		if req_r > lift_h:
			lift_h = req_r

	return {"pos": p_center + radial_up * (lift_h + 0.03), "basis": target_basis}

func _sample_offset(planet: SphericalPlanet, up: Vector3, right: Vector3, fwd: Vector3, r_off: float, f_off: float) -> Vector3:
	var dir := (up * float(planet.profile["radius"]) + right * r_off + fwd * f_off).normalized()
	var rad := float(planet.sample_mesh_surface(dir)["radius"])
	return planet.global_position + dir * rad

func _physics_process(delta: float) -> void:
	if GameManager.play_mode != "in_ship" or GameManager.is_paused or GameManager.active_system_builder == null:
		return
	if camera != null and not camera.current:
		camera.current = true
	camera.look_at(global_position + (-global_basis.z) * 14.0, global_basis.y)

	takeoff_grace = maxf(0.0, takeoff_grace - delta)
	var planet: SphericalPlanet = GameManager.active_system_builder.get_nearest_planet(global_position)
	if planet == null:
		return

	var thrust := Input.is_action_pressed("move_forward") or Input.is_action_pressed("jump_jetpack") or bool(GameManager.touch_actions.get("jump", false)) or GameManager.touch_move_vec.y > 0.2
	var brake := Input.is_action_pressed("move_back") or GameManager.touch_move_vec.y < -0.2
	var boost := Input.is_action_pressed("sprint") or bool(GameManager.touch_actions.get("boost", false))

	if landed:
		gear_group.visible = true
		if Input.is_action_just_pressed("board_exit"):
			_exit_ship(planet)
			return
		if thrust:
			landed = false
			takeoff_grace = 1.6
			vel = global_basis.y * 28.0 + (-global_basis.z) * 18.0
			gear_group.visible = false
			GameManager.post_alert("Liftoff — Ascending Through Atmosphere")
		return

	# Steering (Mouse POV + Keyboard/Touch)
	var yaw_in := Input.get_axis("move_right", "move_left") - GameManager.touch_move_vec.x
	rotate_object_local(Vector3.UP, (yaw_in * 1.4 + steer_input.x * 2.2) * delta)
	rotate_object_local(Vector3.RIGHT, steer_input.y * 2.0 * delta)
	steer_input = steer_input.lerp(Vector2.ZERO, clampf(5.0 * delta, 0.0, 1.0))

	var ship_def: Dictionary = UniverseCatalog.SHIP_CLASSES.get(GameManager.save_data["ship"]["class_id"], UniverseCatalog.SHIP_CLASSES["explorer"])
	var max_sp := float(ship_def["boost_speed"]) if boost else float(ship_def["max_speed"])
	var fwd_dir := -global_basis.z
	if thrust:
		vel += fwd_dir * (max_sp * 1.8) * delta
	elif brake:
		vel = vel.lerp(Vector3.ZERO, clampf(4.0 * delta, 0.0, 1.0))
	else:
		vel = vel.lerp(vel * 0.985, clampf(2.0 * delta, 0.0, 1.0))

	if vel.length() > max_sp:
		vel = vel.normalized() * max_sp
	global_position += vel * delta

	# Mining / Pulse Cannon Fire in Space
	fire_cooldown = maxf(0.0, fire_cooldown - delta)
	if (Input.is_action_pressed("mine_fire") or bool(GameManager.touch_actions.get("mine", false))) and fire_cooldown <= 0.0:
		fire_cooldown = 0.25
		_fire_ship_cannons()

	# Automatic & [L] Manual 3-Point Surface Parking
	var dir_c := (global_position - planet.global_position).normalized()
	var surf_r := float(planet.sample_mesh_surface(dir_c)["radius"])
	var alt := global_position.distance_to(planet.global_position) - surf_r
	var over_water := bool(planet.profile["has_water"]) and surf_r < float(planet.profile["water_level"]) + 0.45
	var manual_land := (Input.is_action_just_pressed("land_ship") or Input.is_action_just_pressed("board_exit")) and takeoff_grace <= 0.0 and planet.profile["landable"] and not over_water and alt < 34.0
	var auto_cond := takeoff_grace <= 0.0 and planet.profile["landable"] and not over_water and alt < 18.0 and vel.length() < 85.0 and not thrust

	if manual_land or auto_cond or auto_landing:
		auto_landing = true
		gear_group.visible = true
		vel = vel.lerp(Vector3.ZERO, clampf(7.0 * delta, 0.0, 1.0))
		var target := align_to_surface(planet, global_position)
		var target_pos: Vector3 = target["pos"]
		var target_basis: Basis = target["basis"]
		global_position = global_position.lerp(target_pos, clampf(6.5 * delta, 0.0, 1.0))
		global_basis = global_basis.orthonormalized().slerp(target_basis, clampf(7.5 * delta, 0.0, 1.0))
		if global_position.distance_to(target_pos) < 0.75:
			park_at_planet(planet, global_position)
			GameManager.save_data["current_planet_id"] = planet.profile["id"]
			GameManager.post_alert("Touchdown Complete — Parked on %s" % planet.profile["name"])
	elif alt < 2.2:
		if planet.profile["landable"] and not over_water and vel.length() < 92.0:
			auto_landing = true
			vel *= 0.35
		else:
			global_position = planet.global_position + dir_c * (surf_r + 2.5)
			var rv := vel.dot(dir_c)
			if rv < 0.0:
				vel -= dir_c * (rv * 1.15)

func _fire_ship_cannons() -> void:
	var space := get_world_3d().direct_space_state
	var origin := global_position + (-global_basis.z) * 4.0
	var end := origin + (-global_basis.z) * 180.0
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(origin, end))
	if not hit.is_empty():
		var col: Object = hit["collider"]
		if col is Node and col.has_meta("resource_id"):
			GameManager.add_player_resource(str(col.get_meta("resource_id")), 6, "mine")
			col.queue_free()

func _exit_ship(planet: SphericalPlanet) -> void:
	if GameManager.active_explorer == null:
		return
	var dir := (global_position - planet.global_position).normalized()
	var tangent := (global_basis.x * 5.2)
	var exit_dir := (global_position + tangent - planet.global_position).normalized()
	GameManager.active_explorer.spawn_on_planet(planet, exit_dir)
	GameManager.play_mode = "on_foot"
	GameManager.post_alert("Disembarked on %s" % planet.profile["name"])
