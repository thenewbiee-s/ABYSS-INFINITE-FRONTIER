class_name AlienCreature
extends Node3D

## Procedural alien fauna supporting aquatic, floater, crawler, quadruped, biped, and flyer
## morphologies with animated limbs/fins/tentacles and spherical terrain navigation.

var planet: SphericalPlanet = null
var species: Dictionary = {}
var hp: float = 50.0
var local_pos: Vector3 = Vector3.ZERO
var heading: float = 0.0
var anim_phase: float = 0.0
var legs: Array = []
var wings: Array = []
var tentacles: Array = []
var tail_pivot: Node3D = null
var target_body: StaticBody3D = null

func setup(p_planet: SphericalPlanet, p_species: Dictionary, dir_unit: Vector3, surface_r: float) -> void:
	planet = p_planet
	species = p_species
	hp = float(species.get("hp", 50.0))
	heading = randf_range(0.0, TAU)
	anim_phase = randf_range(0.0, TAU)

	var body_type: String = str(species.get("body_type", "quadruped"))
	var hover := 0.05
	if body_type == "flyer":
		hover = 7.5
	elif body_type == "floater":
		hover = 1.2
	elif body_type == "aquatic" and planet.profile["has_water"] and not planet.profile["water_is_lava"]:
		hover = maxf(0.4, (float(planet.profile["water_level"]) - surface_r) * 0.55)

	local_pos = dir_unit.normalized() * (surface_r + hover)
	position = local_pos
	quaternion = Quaternion(Vector3.UP, dir_unit.normalized())

	_build_visual_rig()

func _build_visual_rig() -> void:
	var s: float = float(species.get("scale", 1.0))
	var body_type: String = str(species.get("body_type", "quadruped"))
	var skin_mat := StandardMaterial3D.new()
	skin_mat.albedo_color = Color(str(species.get("primary_color", "#38bdf8")))
	skin_mat.roughness = 0.55
	if species.get("biolum", false):
		skin_mat.emission_enabled = true
		skin_mat.emission = skin_mat.albedo_color
		skin_mat.emission_energy_multiplier = 0.45

	var crest_mat := StandardMaterial3D.new()
	crest_mat.albedo_color = Color(str(species.get("secondary_color", "#facc15")))
	if species.get("biolum", false):
		crest_mat.emission_enabled = true
		crest_mat.emission = crest_mat.albedo_color
		crest_mat.emission_energy_multiplier = 0.55

	var eye_mat := StandardMaterial3D.new()
	eye_mat.albedo_color = Color(str(species.get("eye_color", "#38bdf8")))
	eye_mat.emission_enabled = true
	eye_mat.emission = eye_mat.albedo_color

	target_body = StaticBody3D.new()
	target_body.set_meta("target_type", "creature")
	target_body.set_meta("creature_ref", self)
	target_body.set_meta("display_name", "%s (%s)" % [species["name"], body_type.capitalize()])
	target_body.set_meta("rarity", species.get("rarity", "Common"))
	add_child(target_body)

	var col := CollisionShape3D.new()
	var sph := SphereShape3D.new()
	sph.radius = 0.85 * s
	col.shape = sph
	col.position.y = 0.8 * s
	target_body.add_child(col)

	if body_type == "floater":
		var bell := MeshInstance3D.new()
		var bm := SphereMesh.new()
		bm.radius = 0.65 * s; bm.height = 0.85 * s
		bell.mesh = bm; bell.material_override = skin_mat; bell.position.y = 2.4 * s
		add_child(bell)
		for i in range(6):
			var piv := Node3D.new()
			var ang := (float(i) / 6.0) * TAU
			piv.position = Vector3(cos(ang) * 0.35 * s, 2.2 * s, sin(ang) * 0.35 * s)
			var tm := MeshInstance3D.new()
			var cm := CapsuleMesh.new()
			cm.radius = 0.05 * s; cm.height = 1.0 * s
			tm.mesh = cm; tm.material_override = crest_mat; tm.position.y = -0.5 * s
			piv.add_child(tm)
			add_child(piv)
			tentacles.append(piv)
	elif body_type == "aquatic":
		var swim_y := 0.7 * s
		var torso := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.42 * s; sm.height = 0.84 * s
		torso.mesh = sm; torso.material_override = skin_mat
		torso.scale = Vector3(0.75, 0.85, 1.85); torso.position.y = swim_y
		add_child(torso)
		for side in [-1.0, 1.0]:
			var fpiv := Node3D.new()
			fpiv.position = Vector3(side * 0.28 * s, swim_y, -0.2 * s)
			var fin := MeshInstance3D.new()
			var fm := BoxMesh.new()
			fm.size = Vector3(0.65 * s, 0.05 * s, 0.32 * s)
			fin.mesh = fm; fin.material_override = crest_mat; fin.position.x = side * 0.32 * s
			fpiv.add_child(fin)
			add_child(fpiv)
			wings.append(fpiv)
		tail_pivot = Node3D.new()
		tail_pivot.position = Vector3(0.0, swim_y, 0.7 * s)
		var blade := MeshInstance3D.new()
		var blm := BoxMesh.new()
		blm.size = Vector3(0.08 * s, 0.55 * s, 0.7 * s)
		blade.mesh = blm; blade.material_override = crest_mat; blade.position.z = 0.35 * s
		tail_pivot.add_child(blade)
		add_child(tail_pivot)
	else:
		var torso_y := (2.5 if body_type == "flyer" else (0.48 if body_type == "crawler" else 0.78)) * s
		var torso := MeshInstance3D.new()
		var tm := SphereMesh.new()
		tm.radius = 0.44 * s; tm.height = 0.88 * s
		torso.mesh = tm; torso.material_override = skin_mat
		torso.scale = Vector3(1.05, 0.55, 1.65) if body_type == "crawler" else Vector3(0.88, 0.78, 1.48)
		torso.position.y = torso_y
		add_child(torso)

		var head := MeshInstance3D.new()
		var hm := BoxMesh.new()
		hm.size = Vector3(0.35 * s, 0.28 * s, 0.45 * s)
		head.mesh = hm; head.material_override = skin_mat; head.position = Vector3(0.0, torso_y + 0.22 * s, -0.72 * s)
		add_child(head)

		for side in [-1.0, 1.0]:
			var eye := MeshInstance3D.new()
			var em := SphereMesh.new()
			em.radius = 0.065 * s; em.height = 0.13 * s
			eye.mesh = em; eye.material_override = eye_mat; eye.position = Vector3(side * 0.14 * s, torso_y + 0.26 * s, -0.92 * s)
			add_child(eye)

		if body_type == "flyer":
			for side in [-1.0, 1.0]:
				var wpiv := Node3D.new()
				wpiv.position = Vector3(side * 0.3 * s, torso_y + 0.1 * s, 0.0)
				var wm := MeshInstance3D.new()
				var wbm := BoxMesh.new()
				wbm.size = Vector3(1.4 * s, 0.05 * s, 0.55 * s)
				wm.mesh = wbm; wm.material_override = crest_mat; wm.position.x = side * 0.7 * s
				wpiv.add_child(wm)
				add_child(wpiv)
				wings.append(wpiv)
		else:
			var leg_count := 2 if body_type == "biped" else (6 if body_type == "crawler" else 4)
			for i in range(leg_count):
				var side := -1.0 if i % 2 == 0 else 1.0
				var row := float(floori(float(i) / 2.0))
				var z_off := 0.0 if leg_count == 2 else (-0.36 + row * (0.72 / maxf(1.0, float(leg_count) / 2.0 - 1.0))) * s
				var lpiv := Node3D.new()
				lpiv.position = Vector3(side * 0.35 * s, torso_y - 0.12 * s, z_off)
				var lm := MeshInstance3D.new()
				var cm := CapsuleMesh.new()
				cm.radius = 0.075 * s; cm.height = 0.52 * s
				lm.mesh = cm; lm.material_override = crest_mat; lm.position.y = -0.28 * s
				lpiv.add_child(lm)
				add_child(lpiv)
				legs.append(lpiv)

func take_damage(dmg: float) -> void:
	hp -= dmg
	if hp <= 0.0:
		var bt: String = str(species.get("body_type", "quadruped"))
		var drop := "kelp_sac" if bt == "aquatic" else ("biolum_spore" if species.get("biolum", false) else "mordite")
		GameManager.add_player_resource(drop, 2, "combat")
		queue_free()

func _process(delta: float) -> void:
	if planet == null or GameManager.is_paused or GameManager.play_mode == "menu":
		return
	var explorer := GameManager.active_explorer
	if explorer == null:
		return
	if global_position.distance_to(explorer.global_position) > 165.0:
		return

	heading += sin(anim_phase * 0.4) * 0.5 * delta
	var speed: float = float(species.get("speed", 4.5))
	var up_dir := local_pos.normalized()
	var north := (Vector3.FORWARD - up_dir * Vector3.FORWARD.dot(up_dir)).normalized()
	if north.length_squared() < 0.01:
		north = Vector3.RIGHT.cross(up_dir).normalized()
	var east := up_dir.cross(north).normalized()
	var move_tan := north * cos(heading) + east * sin(heading)
	local_pos += move_tan * speed * delta

	var new_dir := local_pos.normalized()
	var r := float(planet.sample_mesh_surface(new_dir)["radius"])
	var bt: String = str(species.get("body_type", "quadruped"))
	var hover := 0.04
	if bt == "flyer":
		hover = 7.5 + sin(anim_phase * 0.8) * 1.4
	elif bt == "floater":
		hover = 1.1 + sin(anim_phase * 0.7) * 0.45
	elif bt == "aquatic" and planet.profile["has_water"] and not planet.profile["water_is_lava"]:
		hover = maxf(0.35, (float(planet.profile["water_level"]) - r) * 0.52)

	local_pos = new_dir * (r + hover)
	position = local_pos
	var q_up := Quaternion(Vector3.UP, new_dir)
	var q_rot := Quaternion(Vector3.UP, heading + PI)
	quaternion = q_up * q_rot

	anim_phase += delta * speed * 1.7
	for i in range(legs.size()):
		legs[i].rotation.x = sin(anim_phase + float(i) * PI) * 0.55
	for i in range(wings.size()):
		var sign_val := 1.0 if i == 0 else -1.0
		wings[i].rotation.z = sin(anim_phase * 1.6) * 0.52 * sign_val
	for i in range(tentacles.size()):
		tentacles[i].rotation.x = sin(anim_phase * 0.7 + float(i)) * 0.28
	if tail_pivot != null:
		tail_pivot.rotation.y = sin(anim_phase * 1.8) * 0.42
