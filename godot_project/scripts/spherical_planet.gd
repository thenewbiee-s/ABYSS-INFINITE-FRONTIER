class_name SphericalPlanet
extends Node3D

## Builds subdivided spherical terrain mesh + exact ConcavePolygonShape3D collider
## (zero ground clipping), ocean/lava sphere, Fresnel atmosphere, rings,
## mineable mineral crystals, procedural flora, and alien creatures.

var profile: Dictionary = {}
var terrain_body: StaticBody3D = null
var terrain_mesh_inst: MeshInstance3D = null
var atmosphere_mesh: MeshInstance3D = null
var spin_parts: Array = []
var details_populated: bool = false
var outpost_pos: Vector3 = Vector3.ZERO

const ATMOSPHERE_SHADER := preload("res://shaders/planet_atmosphere.gdshader")
const WATER_SHADER := preload("res://shaders/water_ocean.gdshader")

func setup(planet_profile: Dictionary, populate_now: bool = false) -> void:
	profile = planet_profile
	position = profile["position"]
	name = str(profile["name"]).validate_node_name()
	_build_terrain_and_collider()
	_build_water_and_atmosphere()
	if populate_now:
		populate_surface_details()

func _build_terrain_and_collider() -> void:
	var radius: float = float(profile["radius"])
	var water_lvl: float = float(profile["water_level"])
	var has_water: bool = bool(profile["has_water"])
	var c_low := Color(str(profile["g_low"]))
	var c_mid := Color(str(profile["g_mid"]))
	var c_high := Color(str(profile["g_high"]))
	var c_beach := c_low.lerp(Color("#e8d49c"), 0.55)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Subdivided Cube-Sphere (6 faces x 18x18 grid = ~3888 spherical triangles)
	var res: int = 16 if GameManager.is_mobile_ui else 20
	var faces := [
		[Vector3.RIGHT, Vector3.UP, Vector3.BACK],
		[Vector3.LEFT, Vector3.UP, Vector3.FORWARD],
		[Vector3.UP, Vector3.FORWARD, Vector3.RIGHT],
		[Vector3.DOWN, Vector3.BACK, Vector3.RIGHT],
		[Vector3.BACK, Vector3.UP, Vector3.LEFT],
		[Vector3.FORWARD, Vector3.UP, Vector3.RIGHT],
	]

	for f in faces:
		var normal_f: Vector3 = f[0]
		var axis_u: Vector3 = f[1]
		var axis_v: Vector3 = f[2]
		var grid_pts: Array = []
		var grid_cols: Array = []

		for iy in range(res + 1):
			var row_p: Array = []
			var row_c: Array = []
			var ty := (float(iy) / float(res)) * 2.0 - 1.0
			for ix in range(res + 1):
				var tx := (float(ix) / float(res)) * 2.0 - 1.0
				var cube_dir := (normal_f + axis_u * ty + axis_v * tx).normalized()
				var surf_r := UniverseGenerator.sample_surface_radius(profile, cube_dir)
				row_p.append(cube_dir * surf_r)

				var rel := surf_r - radius
				var vc := c_mid
				if has_water and surf_r < water_lvl + 0.9:
					vc = c_beach
				elif rel < -2.0:
					vc = c_low
				elif rel > float(profile["amp"]) * 0.48:
					vc = c_mid.lerp(c_high, clampf((rel - float(profile["amp"]) * 0.48) / 8.0, 0.0, 1.0))
				else:
					vc = c_low.lerp(c_mid, clampf((rel + 2.0) / 6.0, 0.0, 1.0))
				row_c.append(vc)
			grid_pts.append(row_p)
			grid_cols.append(row_c)

		for iy in range(res):
			for ix in range(res):
				var p00: Vector3 = grid_pts[iy][ix]
				var p10: Vector3 = grid_pts[iy][ix + 1]
				var p01: Vector3 = grid_pts[iy + 1][ix]
				var p11: Vector3 = grid_pts[iy + 1][ix + 1]
				var c00: Color = grid_cols[iy][ix]
				var c10: Color = grid_cols[iy][ix + 1]
				var c01: Color = grid_cols[iy + 1][ix]
				var c11: Color = grid_cols[iy + 1][ix + 1]

				st.set_color(c00); st.add_vertex(p00)
				st.set_color(c10); st.add_vertex(p10)
				st.set_color(c11); st.add_vertex(p11)

				st.set_color(c00); st.add_vertex(p00)
				st.set_color(c11); st.add_vertex(p11)
				st.set_color(c01); st.add_vertex(p01)

	st.generate_normals()
	var arr_mesh := st.commit()

	terrain_mesh_inst = MeshInstance3D.new()
	terrain_mesh_inst.name = "TerrainMesh"
	terrain_mesh_inst.mesh = arr_mesh
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.38 if profile["archetype"] in ["ice_crystal", "metallic"] else 0.85
	mat.metallic = 0.55 if profile["archetype"] in ["metallic", "machine_world"] else 0.06
	terrain_mesh_inst.material_override = mat
	add_child(terrain_mesh_inst)

	terrain_body = StaticBody3D.new()
	terrain_body.name = "TerrainCollider"
	var col_shape := CollisionShape3D.new()
	col_shape.shape = arr_mesh.create_trimesh_shape()
	terrain_body.add_child(col_shape)
	add_child(terrain_body)

func _build_water_and_atmosphere() -> void:
	var radius: float = float(profile["radius"])
	if profile["has_water"]:
		var water_inst := MeshInstance3D.new()
		var ws := SphereMesh.new()
		ws.radius = float(profile["water_level"])
		ws.height = float(profile["water_level"]) * 2.0
		ws.radial_segments = 40
		ws.rings = 24
		water_inst.mesh = ws
		var wmat := ShaderMaterial.new()
		wmat.shader = WATER_SHADER
		var wc := Color(str(profile["water_color"]))
		wc.a = 0.78
		wmat.set_shader_parameter("water_color", wc)
		wmat.set_shader_parameter("is_lava", 1.0 if profile["water_is_lava"] else 0.0)
		water_inst.material_override = wmat
		add_child(water_inst)

	atmosphere_mesh = MeshInstance3D.new()
	var amesh := SphereMesh.new()
	amesh.radius = radius * 1.15
	amesh.height = radius * 2.30
	amesh.radial_segments = 36
	amesh.rings = 20
	atmosphere_mesh.mesh = amesh
	var amat := ShaderMaterial.new()
	amat.shader = ATMOSPHERE_SHADER
	amat.set_shader_parameter("atmosphere_color", Color(str(profile["sky_horizon"])))
	amat.set_shader_parameter("intensity", clampf(float(profile["atmo"]) * 1.25, 0.35, 2.2))
	atmosphere_mesh.material_override = amat
	add_child(atmosphere_mesh)

	if profile["has_rings"]:
		var ring_inst := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = radius * 1.38
		torus.outer_radius = radius * 1.92
		ring_inst.mesh = torus
		ring_inst.scale = Vector3(1.0, 0.04, 1.0)
		ring_inst.rotation = Vector3(0.32, 0.0, 0.42)
		var rmat := StandardMaterial3D.new()
		rmat.albedo_color = Color(str(profile["ring_color"]))
		rmat.albedo_color.a = 0.55
		rmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		rmat.roughness = 0.5
		ring_inst.material_override = rmat
		add_child(ring_inst)

func sample_mesh_surface(dir_unit: Vector3) -> Dictionary:
	var n := dir_unit.normalized()
	if is_inside_tree() and terrain_body != null:
		var space := get_world_3d().direct_space_state
		var outer := global_position + n * (float(profile["radius"]) + 120.0)
		var inner := global_position + n * maxf(10.0, float(profile["radius"]) - 90.0)
		var query := PhysicsRayQueryParameters3D.create(outer, inner)
		query.collide_with_areas = false
		query.collide_with_bodies = true
		var hit := space.intersect_ray(query)
		if not hit.is_empty():
			var dist := (hit["position"] - global_position).length()
			return {"radius": dist, "normal": hit["normal"]}
	return {"radius": UniverseGenerator.sample_surface_radius(profile, n), "normal": n}

func populate_surface_details() -> void:
	if details_populated:
		return
	details_populated = true
	var rng := RandomNumberGenerator.new()
	rng.seed = int(profile["seed"]) + 4242

	var spawn_pole := Vector3(0.0, 0.968, 0.25).normalized()
	var radius: float = float(profile["radius"])
	var water_lvl: float = float(profile["water_level"])
	var has_water: bool = bool(profile["has_water"])
	var res_list: Array = profile["resources"]
	var flora_list: Array = profile["flora_species"]
	var fauna_list: Array = profile["creature_species"]

	# 1. Mineable Mineral Crystal Clusters
	var min_count := 28 if GameManager.is_mobile_ui else 44
	for i in range(min_count):
		var dir: Vector3
		if i < 12:
			dir = Vector3(rng.randf_range(-0.22, 0.22), rng.randf_range(0.91, 1.0), 0.25 + rng.randf_range(-0.22, 0.22)).normalized()
		else:
			var th := rng.randf_range(0.0, TAU)
			var ph := acos(rng.randf_range(-0.92, 0.98))
			dir = Vector3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)).normalized()
		if dir.distance_to(spawn_pole) * radius < 7.5:
			continue
		var surf := sample_mesh_surface(dir)
		var r: float = float(surf["radius"])
		if has_water and r < water_lvl + 0.45:
			continue
		var res_id: String = str(res_list[i % res_list.size()])
		_spawn_mineral_node(dir, r, res_id, rng)

	# 2. Procedural Flora
	var flora_count := 32 if GameManager.is_mobile_ui else 50
	if flora_list.size() > 0:
		for i in range(flora_count):
			var dir: Vector3
			if i < 14:
				dir = Vector3(rng.randf_range(-0.26, 0.26), rng.randf_range(0.90, 1.0), 0.25 + rng.randf_range(-0.26, 0.26)).normalized()
			else:
				var th := rng.randf_range(0.0, TAU)
				var ph := acos(rng.randf_range(-0.9, 0.98))
				dir = Vector3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)).normalized()
			if dir.distance_to(spawn_pole) * radius < 10.0:
				continue
			var surf := sample_mesh_surface(dir)
			var r: float = float(surf["radius"])
			if has_water and r < water_lvl + 0.35:
				continue
			_spawn_flora_node(dir, r, flora_list[i % flora_list.size()], rng)

	# 3. Alien Fauna Creatures (aquatic placed underwater when oceans exist)
	var fauna_count := 7 if GameManager.is_mobile_ui else 12
	if fauna_list.size() > 0:
		for i in range(fauna_count):
			var sp: Dictionary = fauna_list[i % fauna_list.size()]
			var dir := Vector3(rng.randf_range(-0.32, 0.32), 0.92, 0.25 + rng.randf_range(-0.32, 0.32)).normalized()
			var r := float(sample_mesh_surface(dir)["radius"])
			if sp["body_type"] == "aquatic" and has_water and not profile["water_is_lava"]:
				for attempt in range(10):
					var cand := Vector3(rng.randf_range(-0.7, 0.7), rng.randf_range(0.45, 0.98), rng.randf_range(-0.7, 0.7)).normalized()
					var cr := float(sample_mesh_surface(cand)["radius"])
					if cr < water_lvl - 0.9:
						dir = cand
						r = cr
						break
			var creature := AlienCreature.new()
			add_child(creature)
			creature.setup(self, sp, dir, r)

	# 4. Outpost / Ruins Landmark
	if profile["has_outpost"]:
		var out_dir := Vector3(0.28, 0.92, 0.27).normalized()
		var out_r := float(sample_mesh_surface(out_dir)["radius"])
		outpost_pos = global_position + out_dir * out_r
		_spawn_outpost_landmark(out_dir, out_r)

func _spawn_mineral_node(dir: Vector3, r: float, res_id: String, rng: RandomNumberGenerator) -> void:
	var item_def: Dictionary = UniverseCatalog.ITEMS.get(res_id, {"name": res_id, "color": "#38bdf8", "rarity": "Common"})
	var body := StaticBody3D.new()
	body.position = dir * r
	body.quaternion = Quaternion(Vector3.UP, dir)
	body.set_meta("target_type", "mineral")
	body.set_meta("resource_id", res_id)
	body.set_meta("display_name", "%s Vein" % item_def["name"])
	body.set_meta("rarity", item_def.get("rarity", "Common"))
	body.set_meta("hp", 45.0)
	add_child(body)

	var col := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 1.0
	cyl.height = 2.0
	col.shape = cyl
	col.position.y = 1.0
	body.add_child(col)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(str(item_def["color"]))
	mat.emission_enabled = true
	mat.emission = mat.albedo_color
	mat.emission_energy_multiplier = 0.55
	mat.roughness = 0.25

	for k in range(3):
		var m := MeshInstance3D.new()
		var prism := CylinderMesh.new()
		prism.top_radius = 0.02
		prism.bottom_radius = 0.36
		prism.height = rng.randf_range(1.2, 2.1)
		prism.radial_segments = 5
		m.mesh = prism
		m.material_override = mat
		m.position = Vector3((k - 1) * 0.28, prism.height * 0.45, (k % 2 - 0.5) * 0.25)
		m.rotation = Vector3(rng.randf_range(-0.25, 0.25), rng.randf_range(0, TAU), rng.randf_range(-0.25, 0.25))
		body.add_child(m)

func _spawn_flora_node(dir: Vector3, r: float, species: Dictionary, rng: RandomNumberGenerator) -> void:
	var body := StaticBody3D.new()
	body.position = dir * r
	body.quaternion = Quaternion(Vector3.UP, dir)
	body.rotate_object_local(Vector3.UP, rng.randf_range(0.0, TAU))
	body.set_meta("target_type", "flora")
	body.set_meta("resource_id", species["primary_resource"])
	body.set_meta("display_name", species["name"])
	body.set_meta("rarity", species["rarity"])
	body.set_meta("hp", 35.0)
	add_child(body)

	var s: float = float(species["scale"])
	var col := CollisionShape3D.new()
	var cap_col := CylinderShape3D.new()
	cap_col.radius = 0.7 * s
	cap_col.height = 3.0 * s
	col.shape = cap_col
	col.position.y = 1.4 * s
	body.add_child(col)

	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color(str(species["trunk_color"]))
	var cap_mat := StandardMaterial3D.new()
	cap_mat.albedo_color = Color(str(species["canopy_color"]))
	var style: String = str(species["style"])
	if style in ["biolum", "crystal", "mushroom", "flower"]:
		cap_mat.emission_enabled = true
		cap_mat.emission = Color(str(species["glow_color"]))
		cap_mat.emission_energy_multiplier = 0.65

	if style == "crystal":
		for i in range(4):
			var shard := MeshInstance3D.new()
			var cm := CylinderMesh.new()
			cm.top_radius = 0.02
			cm.bottom_radius = 0.4 * s
			cm.height = (1.6 + float(i) * 0.45) * s
			cm.radial_segments = 5
			shard.mesh = cm
			shard.material_override = cap_mat
			shard.position = Vector3(cos(float(i) * 1.57) * 0.3 * s, cm.height * 0.45, sin(float(i) * 1.57) * 0.3 * s)
			shard.rotation.z = (float(i) - 1.5) * 0.22
			body.add_child(shard)
	elif style == "mushroom":
		var stem := MeshInstance3D.new()
		var sm := CylinderMesh.new()
		sm.top_radius = 0.2 * s; sm.bottom_radius = 0.34 * s; sm.height = 2.0 * s
		stem.mesh = sm; stem.material_override = trunk_mat; stem.position.y = 1.0 * s
		body.add_child(stem)
		var cap := MeshInstance3D.new()
		var capm := SphereMesh.new()
		capm.radius = 1.15 * s; capm.height = 1.15 * s
		cap.mesh = capm; cap.material_override = cap_mat; cap.position.y = 2.0 * s
		body.add_child(cap)
	else:
		var trunk := MeshInstance3D.new()
		var tm := CylinderMesh.new()
		tm.top_radius = 0.18 * s; tm.bottom_radius = 0.35 * s; tm.height = 2.5 * s
		trunk.mesh = tm; trunk.material_override = trunk_mat; trunk.position.y = 1.25 * s
		body.add_child(trunk)
		var cr := MeshInstance3D.new()
		var crm := SphereMesh.new()
		crm.radius = 1.1 * s; crm.height = 1.8 * s
		cr.mesh = crm; cr.material_override = cap_mat; cr.position.y = 2.9 * s
		body.add_child(cr)

func _spawn_outpost_landmark(dir: Vector3, r: float) -> void:
	var grp := Node3D.new()
	grp.position = dir * (r - 0.1)
	grp.quaternion = Quaternion(Vector3.UP, dir)
	add_child(grp)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#334155")
	mat.metallic = 0.55
	var glow_mat := StandardMaterial3D.new()
	glow_mat.albedo_color = Color(str(profile["accent"]))
	glow_mat.emission_enabled = true
	glow_mat.emission = glow_mat.albedo_color
	glow_mat.emission_energy_multiplier = 1.2

	var plinth := MeshInstance3D.new()
	var pm := CylinderMesh.new()
	pm.top_radius = 4.5; pm.bottom_radius = 5.2; pm.height = 0.9
	plinth.mesh = pm; plinth.material_override = mat; plinth.position.y = 0.45
	grp.add_child(plinth)

	var tower := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(2.4, 7.5, 2.4)
	tower.mesh = bm; tower.material_override = mat; tower.position.y = 4.1
	grp.add_child(tower)

	var beacon := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0; sm.height = 2.0
	beacon.mesh = sm; beacon.material_override = glow_mat; beacon.position.y = 8.9
	grp.add_child(beacon)
	spin_parts.append(beacon)

func _process(delta: float) -> void:
	for sp in spin_parts:
		if is_instance_valid(sp):
			sp.rotate_y(delta * 1.25)
