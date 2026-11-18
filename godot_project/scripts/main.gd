extends Node3D

## Scene root orchestrator syncing active StarSystemBuilder, Explorer, Spacecraft,
## and atmospheric sky/lighting dynamically.

@onready var sys_builder: StarSystemBuilder = $StarSystemBuilder
@onready var explorer: ExplorerController = $Explorer
@onready var spacecraft: SpacecraftController = $Spacecraft
@onready var world_env: WorldEnvironment = $WorldEnvironment

func _ready() -> void:
	GameManager.active_system_builder = sys_builder
	GameManager.system_changed.connect(_on_system_changed)

func _on_system_changed(sys_data: Dictionary) -> void:
	sys_builder.rebuild_system(sys_data)
	await get_tree().process_frame
	if sys_builder.planets.is_empty():
		return

	var starter: SphericalPlanet = sys_builder.planets[0]
	var spawn_dir := Vector3(0.0, 0.968, 0.25).normalized()
	var ship_dir := Vector3(0.05, 0.968, 0.27).normalized()

	if GameManager.play_mode == "in_ship":
		spacecraft.landed = false
		spacecraft.gear_group.visible = false
		spacecraft.global_position = starter.global_position + Vector3(0.0, 0.0, float(starter.profile["radius"]) + 420.0)
		spacecraft.look_at(starter.global_position, Vector3.UP)
	else:
		explorer.spawn_on_planet(starter, spawn_dir)
		var ship_surf_r := float(starter.sample_mesh_surface(ship_dir)["radius"])
		spacecraft.park_at_planet(starter, starter.global_position + ship_dir * ship_surf_r)

func _process(_delta: float) -> void:
	if GameManager.play_mode == "menu" or sys_builder.planets.is_empty():
		return
	var ref_pos := spacecraft.global_position if GameManager.play_mode == "in_ship" else explorer.global_position
	var nearest := sys_builder.get_nearest_planet(ref_pos)
	if nearest == null:
		return
	if not nearest.details_populated and ref_pos.distance_to(nearest.global_position) < float(nearest.profile["radius"]) + 280.0:
		nearest.populate_surface_details()

	var alt := ref_pos.distance_to(nearest.global_position) - float(nearest.profile["radius"])
	var in_atmo := alt < 130.0
	var env := world_env.environment
	if env != null and env.sky != null and env.sky.sky_material is ProceduralSkyMaterial:
		var psky: ProceduralSkyMaterial = env.sky.sky_material
		var atmo_blend := clampf(1.0 - (alt - 35.0) / 95.0, 0.0, 1.0) if in_atmo else 0.0
		var space_col := Color("#040712")
		psky.sky_top_color = space_col.lerp(Color(str(nearest.profile["sky_top"])), atmo_blend)
		psky.sky_horizon_color = Color("#0c1428").lerp(Color(str(nearest.profile["sky_horizon"])), atmo_blend)
		psky.ground_bottom_color = psky.sky_horizon_color
		psky.ground_horizon_color = psky.sky_horizon_color
		GameManager.current_planet = nearest.profile
