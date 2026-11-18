class_name StarSystemBuilder
extends Node3D

## Builds the active star system: glowing central star, binary companion,
## Orbital Nexus Space Station, 28-node mineable asteroid belt, and SphericalPlanets.

var planets: Array = []
var station_pos: Vector3 = Vector3(1480.0, 190.0, 0.0)

func rebuild_system(sys_data: Dictionary) -> void:
	for c in get_children():
		c.queue_free()
	planets.clear()

	# Central Star
	var star_mesh := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 65.0; sm.height = 130.0
	star_mesh.mesh = sm
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(str(sys_data["star_color"]))
	smat.emission_enabled = true
	smat.emission = smat.albedo_color
	smat.emission_energy_multiplier = 2.0
	star_mesh.material_override = smat
	add_child(star_mesh)

	if sys_data.get("is_binary", false):
		var comp := MeshInstance3D.new()
		var cm := SphereMesh.new()
		cm.radius = 38.0; cm.height = 76.0
		comp.mesh = cm
		comp.position = Vector3(165.0, 40.0, -90.0)
		var cmat := StandardMaterial3D.new()
		cmat.albedo_color = Color("#60a5fa")
		cmat.emission_enabled = true
		cmat.emission = cmat.albedo_color
		cmat.emission_energy_multiplier = 1.8
		comp.material_override = cmat
		add_child(comp)

	# Starfield
	var mm := MultiMeshInstance3D.new()
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.instance_count = 750
	var bmesh := BoxMesh.new()
	bmesh.size = Vector3(4.0, 4.0, 4.0)
	multi.mesh = bmesh
	var star_rng := RandomNumberGenerator.new()
	star_rng.seed = int(sys_data["seed"]) + 111
	for i in range(multi.instance_count):
		var dir := Vector3(star_rng.randf_range(-1.0, 1.0), star_rng.randf_range(-1.0, 1.0), star_rng.randf_range(-1.0, 1.0)).normalized()
		multi.set_instance_transform(i, Transform3D(Basis(), dir * star_rng.randf_range(4800.0, 7200.0)))
	mm.multimesh = multi
	var st_mat := StandardMaterial3D.new()
	st_mat.albedo_color = Color.WHITE
	st_mat.emission_enabled = true
	st_mat.emission = Color("#bae6fd")
	mm.material_override = st_mat
	add_child(mm)

	# Planets
	var p_list: Array = sys_data["planets"]
	for i in range(p_list.size()):
		var sp := SphericalPlanet.new()
		add_child(sp)
		sp.setup(p_list[i], i == 0)
		planets.append(sp)

	# Orbital Nexus Space Station
	if sys_data.get("has_station", true):
		station_pos = sys_data["station_pos"]
		_spawn_station(station_pos)

	# 28-node Mineable Asteroid Belt between Planet 0 & Planet 1
	var p0_pos: Vector3 = p_list[0]["position"] if p_list.size() > 0 else Vector3.ZERO
	var ast_res := ["ferrite_dust", "tritium_cluster", "copper_ore", "cobalt", "silver_vein", "gold_deposit", "emeril", "quantum_crystal"]
	for i in range(28):
		var ang := (float(i) / 28.0) * TAU
		var dist := 520.0 + float(i % 4) * 95.0
		var apos := p0_pos + Vector3(cos(ang) * dist, (float(i % 5) - 2.0) * 35.0, sin(ang) * dist)
		var rid: String = ast_res[i % ast_res.size()]
		var idef: Dictionary = UniverseCatalog.ITEMS.get(rid, {"name": rid, "color": "#64748b"})
		var ast := StaticBody3D.new()
		ast.position = apos
		ast.set_meta("target_type", "mineral")
		ast.set_meta("resource_id", rid)
		ast.set_meta("display_name", "%s Asteroid" % idef["name"])
		ast.set_meta("rarity", idef.get("rarity", "Uncommon"))
		ast.set_meta("hp", 35.0)
		add_child(ast)

		var col := CollisionShape3D.new()
		var sph := SphereShape3D.new()
		sph.radius = 4.2
		col.shape = sph
		ast.add_child(col)

		var amesh := MeshInstance3D.new()
		var sphm := SphereMesh.new()
		sphm.radius = 3.8; sphm.height = 7.6; sphm.radial_segments = 8; sphm.rings = 5
		amesh.mesh = sphm
		var amat := StandardMaterial3D.new()
		amat.albedo_color = Color(str(idef["color"]))
		amat.roughness = 0.7
		amesh.material_override = amat
		ast.add_child(amesh)

func _spawn_station(pos: Vector3) -> void:
	var st_root := Node3D.new()
	st_root.name = "OrbitalStation"
	st_root.position = pos
	add_child(st_root)

	var hull_mat := StandardMaterial3D.new()
	hull_mat.albedo_color = Color("#334155")
	hull_mat.metallic = 0.72
	var glow_mat := StandardMaterial3D.new()
	glow_mat.albedo_color = Color("#38bdf8")
	glow_mat.emission_enabled = true
	glow_mat.emission = Color("#38bdf8")
	glow_mat.emission_energy_multiplier = 1.4

	var core := MeshInstance3D.new()
	var cm := BoxMesh.new()
	cm.size = Vector3(26.0, 22.0, 38.0)
	core.mesh = cm; core.material_override = hull_mat
	st_root.add_child(core)

	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 28.0; tm.outer_radius = 32.0
	ring.mesh = tm; ring.material_override = glow_mat
	st_root.add_child(ring)

func get_nearest_planet(ref_pos: Vector3) -> SphericalPlanet:
	if planets.is_empty():
		return null
	var best: SphericalPlanet = planets[0]
	var best_d := ref_pos.distance_to(best.global_position)
	for p in planets:
		var d := ref_pos.distance_to(p.global_position)
		if d < best_d:
			best_d = d
			best = p
	return best
