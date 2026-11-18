class_name ExplorerController
extends CharacterBody3D

## Spherical 3rd-person explorer controller with exact triangle-mesh terrain grounding,
## mouse POV (MOUSE_MODE_CAPTURED) + mobile touch drag camera, jetpack, mining, and scanning.

var cam_pivot: Node3D = null
var camera: Camera3D = null
var suit_rig: Node3D = null
var arm_l: Node3D = null
var arm_r: Node3D = null
var leg_l: Node3D = null
var leg_r: Node3D = null

var yaw_offset: float = 0.0
var cam_pitch: float = -0.35
var tangent_north: Vector3 = Vector3.FORWARD
var radial_vel: float = 0.0
var tan_vel: Vector3 = Vector3.ZERO
var walk_phase: float = 0.0
var on_ground: bool = true
var mouse_sens: float = 0.0026

var mine_cooldown: float = 0.0
var scan_progress: float = 0.0
var scan_target_key: String = ""

func _ready() -> void:
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	GameManager.active_explorer = self
	_build_camera_and_suit()

func _build_camera_and_suit() -> void:
	cam_pivot = Node3D.new()
	cam_pivot.name = "CameraPivot"
	add_child(cam_pivot)

	camera = Camera3D.new()
	camera.name = "ExplorerCamera"
	camera.fov = 70.0
	camera.far = 14000.0
	camera.position = Vector3(0.0, 2.2, 6.2)
	cam_pivot.add_child(camera)

	suit_rig = Node3D.new()
	suit_rig.name = "SuitRig"
	add_child(suit_rig)

	var white_mat := StandardMaterial3D.new()
	white_mat.albedo_color = Color("#e2e8f0")
	var dark_mat := StandardMaterial3D.new()
	dark_mat.albedo_color = Color("#1e293b")
	var visor_mat := StandardMaterial3D.new()
	visor_mat.albedo_color = Color("#38bdf8")
	visor_mat.emission_enabled = true
	visor_mat.emission = Color("#38bdf8")
	visor_mat.emission_energy_multiplier = 0.55
	var orange_mat := StandardMaterial3D.new()
	orange_mat.albedo_color = Color("#f97316")

	# Torso & Jetpack
	var torso := MeshInstance3D.new()
	var tm := BoxMesh.new(); tm.size = Vector3(0.62, 0.72, 0.38)
	torso.mesh = tm; torso.material_override = white_mat; torso.position.y = 1.15
	suit_rig.add_child(torso)

	var pack := MeshInstance3D.new()
	var pm := BoxMesh.new(); pm.size = Vector3(0.46, 0.56, 0.24)
	pack.mesh = pm; pack.material_override = orange_mat; pack.position = Vector3(0.0, 1.18, 0.28)
	suit_rig.add_child(pack)

	# Helmet & Visor
	var head := MeshInstance3D.new()
	var hm := SphereMesh.new(); hm.radius = 0.26; hm.height = 0.52
	head.mesh = hm; head.material_override = white_mat; head.position.y = 1.74
	suit_rig.add_child(head)

	var visor := MeshInstance3D.new()
	var vm := SphereMesh.new(); vm.radius = 0.21; vm.height = 0.32
	visor.mesh = vm; visor.material_override = visor_mat; visor.position = Vector3(0.0, 1.75, -0.11)
	suit_rig.add_child(visor)

	# Limbs
	var leg_m := CapsuleMesh.new(); leg_m.radius = 0.11; leg_m.height = 0.62
	leg_l = Node3D.new(); leg_l.position = Vector3(-0.17, 0.72, 0.0)
	var llm := MeshInstance3D.new(); llm.mesh = leg_m; llm.material_override = dark_mat; llm.position.y = -0.34
	leg_l.add_child(llm); suit_rig.add_child(leg_l)

	leg_r = Node3D.new(); leg_r.position = Vector3(0.17, 0.72, 0.0)
	var rlm := MeshInstance3D.new(); rlm.mesh = leg_m; rlm.material_override = dark_mat; rlm.position.y = -0.34
	leg_r.add_child(rlm); suit_rig.add_child(leg_r)

	var arm_m := CapsuleMesh.new(); arm_m.radius = 0.09; arm_m.height = 0.52
	arm_l = Node3D.new(); arm_l.position = Vector3(-0.42, 1.38, 0.0)
	var lam := MeshInstance3D.new(); lam.mesh = arm_m; lam.material_override = white_mat; lam.position.y = -0.24
	arm_l.add_child(lam); suit_rig.add_child(arm_l)

	arm_r = Node3D.new(); arm_r.position = Vector3(0.42, 1.38, 0.0)
	var ram := MeshInstance3D.new(); ram.mesh = arm_m; ram.material_override = white_mat; ram.position.y = -0.24
	arm_r.add_child(ram); suit_rig.add_child(arm_r)

func apply_look_delta(dx: float, dy: float) -> void:
	yaw_offset -= dx * mouse_sens
	cam_pitch = clampf(cam_pitch - dy * mouse_sens, -1.05, 0.68)

func _unhandled_input(event: InputEvent) -> void:
	if GameManager.play_mode not in ["on_foot", "build_mode"] or GameManager.is_paused:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		apply_look_delta(event.relative.x, event.relative.y)
	elif event is InputEventMouseButton and event.pressed and not GameManager.is_mobile_ui:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func spawn_on_planet(planet: SphericalPlanet, dir_unit: Vector3) -> void:
	var n := dir_unit.normalized()
	var surf := planet.sample_mesh_surface(n)
	global_position = planet.global_position + n * (float(surf["radius"]) + 0.15)
	tangent_north = (Vector3.FORWARD - n * Vector3.FORWARD.dot(n)).normalized()
	if tangent_north.length_squared() < 0.01:
		tangent_north = Vector3.RIGHT.cross(n).normalized()
	radial_vel = 0.0
	tan_vel = Vector3.ZERO
	yaw_offset = 0.0
	if camera != null:
		camera.current = true

func _physics_process(delta: float) -> void:
	if GameManager.play_mode not in ["on_foot", "build_mode"]:
		visible = false
		return
	visible = true
	if camera != null and not camera.current:
		camera.current = true
	if GameManager.is_paused or GameManager.active_system_builder == null:
		return

	var planet: SphericalPlanet = GameManager.active_system_builder.get_nearest_planet(global_position)
	if planet == null:
		return

	var p_center := planet.global_position
	var local_up := (global_position - p_center).normalized()
	up_direction = local_up

	# Parallel-transport continuous tangent North so camera POV never flips near poles
	tangent_north = tangent_north - local_up * tangent_north.dot(local_up)
	if tangent_north.length_squared() < 1e-4:
		tangent_north = Vector3.FORWARD - local_up * local_up.z
		if tangent_north.length_squared() < 1e-4:
			tangent_north = Vector3.RIGHT
	tangent_north = tangent_north.normalized()
	var tangent_east := tangent_north.cross(local_up).normalized()

	var look_fwd := (tangent_north * cos(yaw_offset) - tangent_east * sin(yaw_offset)).normalized()
	var look_right := look_fwd.cross(local_up).normalized()

	var in_x := Input.get_axis("move_left", "move_right") + GameManager.touch_move_vec.x
	var in_y := Input.get_axis("move_back", "move_forward") + GameManager.touch_move_vec.y
	in_x = clampf(in_x, -1.0, 1.0)
	in_y = clampf(in_y, -1.0, 1.0)

	var sprinting := Input.is_action_pressed("sprint") or bool(GameManager.touch_actions.get("boost", false))
	var want_jump := Input.is_action_pressed("jump_jetpack") or bool(GameManager.touch_actions.get("jump", false))

	var move_dir := (look_fwd * in_y + look_right * in_x)
	if move_dir.length_squared() > 1.0:
		move_dir = move_dir.normalized()

	var move_speed := 15.0 if sprinting else 9.5
	var target_tan := move_dir * move_speed
	tan_vel = tan_vel.lerp(target_tan, clampf(12.0 * delta, 0.0, 1.0))

	var grav := float(planet.profile.get("gravity", 9.8))
	var jet_fuel := float(GameManager.save_data.get("survival", {}).get("jetpack", 0.0))
	var jetpacking := false
	if want_jump:
		if on_ground:
			radial_vel = 8.2
			on_ground = false
		elif jet_fuel > 1.5:
			radial_vel = minf(radial_vel + 24.0 * delta, 12.5)
			jetpacking = true

	var dist_center := global_position.distance_to(p_center)
	var in_water := bool(planet.profile["has_water"]) and dist_center < float(planet.profile["water_level"])
	if in_water:
		radial_vel += (grav * 0.45 - radial_vel * 2.5) * delta
	elif not on_ground:
		radial_vel -= grav * delta

	velocity = tan_vel + local_up * radial_vel
	move_and_slide()

	# Exact triangle mesh grounding (double-layer anti-clipping guarantee!)
	var new_dir := (global_position - p_center).normalized()
	var surf := planet.sample_mesh_surface(new_dir)
	var ground_r := float(surf["radius"])
	var new_dist := global_position.distance_to(p_center)
	if new_dist <= ground_r + 0.06:
		global_position = p_center + new_dir * (ground_r + 0.02)
		if radial_vel < 0.0:
			radial_vel = 0.0
		on_ground = true
	else:
		on_ground = false

	# Orient player & smooth camera boom
	var q_up := Quaternion(Vector3.UP, new_dir)
	var body_dir := tan_vel if tan_vel.length_squared() > 0.3 else look_fwd
	var flat_dir := (body_dir - new_dir * body_dir.dot(new_dir)).normalized()
	if flat_dir.length_squared() > 0.01:
		var ang := atan2(flat_dir.dot(look_right), flat_dir.dot(look_fwd))
		suit_rig.basis = Basis(Vector3.UP, ang)
	global_transform = Transform3D(Basis(q_up), global_position)

	# Align CameraPivot cleanly along look_fwd + cam_pitch
	var cam_fwd := (look_fwd * cos(cam_pitch) + new_dir * sin(cam_pitch)).normalized()
	var cam_pos := global_position + new_dir * 2.1 - cam_fwd * 5.8
	var cam_dir := (cam_pos - p_center).normalized()
	var cam_min_r := float(planet.sample_mesh_surface(cam_dir)["radius"]) + 1.25
	if cam_pos.distance_to(p_center) < cam_min_r:
		cam_pos = p_center + cam_dir * cam_min_r
	camera.global_position = cam_pos
	camera.look_at(global_position + new_dir * 1.45, new_dir)

	# Limb walk animation
	var sp := tan_vel.length()
	if sp > 0.4 and on_ground:
		walk_phase += delta * sp * 1.45
		leg_l.rotation.x = sin(walk_phase) * 0.65
		leg_r.rotation.x = -sin(walk_phase) * 0.65
		arm_l.rotation.x = -sin(walk_phase) * 0.5
		arm_r.rotation.x = sin(walk_phase) * 0.5
	else:
		leg_l.rotation.x = lerpf(leg_l.rotation.x, 0.0, 0.2)
		leg_r.rotation.x = lerpf(leg_r.rotation.x, 0.0, 0.2)

	var near_ship := GameManager.active_ship != null and global_position.distance_to(GameManager.active_ship.global_position) < 9.5
	GameManager.step_survival(delta, in_water, jetpacking, near_ship)
	_handle_tools(delta, planet)

func _handle_tools(delta: float, planet: SphericalPlanet) -> void:
	if Input.is_action_just_pressed("board_exit") and GameManager.active_ship != null:
		if global_position.distance_to(GameManager.active_ship.global_position) < 10.5:
			GameManager.play_mode = "in_ship"
			GameManager.active_ship.takeoff_grace = 0.6
			GameManager.post_alert("Entered %s" % GameManager.save_data["ship"]["name"])
			return

	mine_cooldown = maxf(0.0, mine_cooldown - delta)
	var do_mine := Input.is_action_pressed("mine_fire") or bool(GameManager.touch_actions.get("mine", false))
	var do_scan := Input.is_action_pressed("scan") or bool(GameManager.touch_actions.get("scan", false))
	if not do_mine and not do_scan:
		scan_progress = 0.0
		return

	var space := get_world_3d().direct_space_state
	var ray_origin := camera.global_position
	var ray_end := ray_origin + (-camera.global_transform.basis.z) * 42.0
	var query := PhysicsRayQueryParameters3D.create(ray_origin, ray_end)
	query.exclude = [get_rid()]
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		scan_progress = 0.0
		return

	var collider: Object = hit["collider"]
	if not (collider is Node) or not collider.has_meta("target_type"):
		scan_progress = 0.0
		return

	var t_type: String = str(collider.get_meta("target_type"))
	if do_scan:
		var dname: String = str(collider.get_meta("display_name"))
		if scan_target_key != dname:
			scan_target_key = dname
			scan_progress = 0.0
		scan_progress += delta * 1.15
		if scan_progress >= 1.0:
			scan_progress = 0.0
			GameManager.register_discovery("%s_%s" % [t_type, dname], dname, t_type.capitalize(), str(collider.get_meta("rarity")))

	if do_mine and mine_cooldown <= 0.0:
		mine_cooldown = 0.22
		if t_type == "creature" and collider.has_meta("creature_ref"):
			var cref: AlienCreature = collider.get_meta("creature_ref")
			if is_instance_valid(cref):
				cref.take_damage(18.0)
		elif t_type in ["mineral", "flora"]:
			var cur_hp := float(collider.get_meta("hp")) - 16.0
			collider.set_meta("hp", cur_hp)
			if cur_hp <= 0.0:
				var res_id := str(collider.get_meta("resource_id"))
				GameManager.add_player_resource(res_id, randi_range(3, 6), "mine")
				collider.queue_free()
