class_name UniverseGenerator
extends RefCounted

## Deterministic procedural universe, star systems, 36 planet archetypes,
## biome-specific resources, alien flora/fauna biota, and FastNoiseLite terrain sampling.

const SYLLABLES_A := ["Aet", "Vael", "Keth", "Zor", "Nyx", "Oph", "Thal", "Cy", "Vor", "Sol", "Lyr", "Drak", "Elys", "Kael", "Myr", "Xan", "Ar", "Bel", "Cor", "Iri"]
const SYLLABLES_B := ["ora", "is", "ar", "ion", "en", "ath", "os", "um", "ia", "ex", "ul", "an", "ei", "or", "us", "al", "ir", "on", "ys", "oa"]
const ROMAN := ["I", "II", "III", "IV", "V", "VI", "VII", "Prime", "Majoris", "Minoris"]
const REGION_NAMES := ["Euclid Meridian", "Veil of Cygnus", "Obsidian Expanse", "Aetheris Drift", "Vaelori Reach", "Shattered Crown", "Helios Crucible", "Elysian Spiral"]

const STAR_CLASSES := [
	{"cls": "G-Yellow", "color": "#fde68a", "weight": 28},
	{"cls": "K-Orange", "color": "#fdba74", "weight": 24},
	{"cls": "M-Red", "color": "#fca5a5", "weight": 18},
	{"cls": "F-YellowWhite", "color": "#fef9c3", "weight": 12},
	{"cls": "A-White", "color": "#e0f2fe", "weight": 8},
	{"cls": "B-Cyan", "color": "#67e8f9", "weight": 5},
	{"cls": "O-Blue", "color": "#60a5fa", "weight": 3},
	{"cls": "Binary", "color": "#f9a8d4", "weight": 6},
]

static var _noise_cache: Dictionary = {}

static func hash_coords(x: int, y: int, z: int, seed_val: int) -> int:
	var h: int = (seed_val ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647)) & 0x7FFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0x7FFFFFFF
	return h ^ (h >> 16)

static func generate_name(rng: RandomNumberGenerator, suffix: String = "") -> String:
	var a: String = SYLLABLES_A[rng.randi_range(0, SYLLABLES_A.size() - 1)]
	var b: String = SYLLABLES_B[rng.randi_range(0, SYLLABLES_B.size() - 1)]
	var c: String = SYLLABLES_B[rng.randi_range(0, SYLLABLES_B.size() - 1)] if rng.randf() > 0.55 else ""
	return "%s%s%s%s" % [a, b, c, (" " + suffix) if suffix != "" else ""]

static func get_region_name(coords: Vector3i, universe_seed: int) -> String:
	var h := hash_coords(floori(coords.x / 4.0), floori(coords.y / 4.0), floori(coords.z / 4.0), universe_seed)
	return REGION_NAMES[h % REGION_NAMES.size()]

static func _get_biome_flora_resource(style: String, archetype_id: String, rng: RandomNumberGenerator) -> String:
	if archetype_id == "ocean" or archetype_id == "deep_ocean":
		return "kelp_sac" if rng.randf() > 0.35 else "oxygen"
	if archetype_id == "radioactive":
		return "gamma_root" if rng.randf() > 0.35 else "carbon"
	match style:
		"flower", "lush":
			return "star_bulb" if rng.randf() > 0.4 else "carbon"
		"jungle":
			return "nitrogen_gas" if rng.randf() > 0.45 else "star_bulb"
		"mushroom":
			return "fungal_mould" if rng.randf() > 0.35 else "biolum_spore"
		"frozen":
			return "frost_crystal" if rng.randf() > 0.35 else "oxygen"
		"desert":
			return "cactus_flesh" if rng.randf() > 0.35 else "solanium"
		"biolum":
			return "biolum_spore" if rng.randf() > 0.35 else "oxygen"
		"crystal":
			return "quantum_crystal" if rng.randf() > 0.55 else "cobalt"
		"machine":
			return "magnetized_ferrite" if rng.randf() > 0.4 else "chromatic_metal"
		"ruin":
			return "silicate_powder" if rng.randf() > 0.5 else "gold_deposit"
		_:
			return "carbon" if rng.randf() > 0.5 else "oxygen"

static func _get_biome_resources(archetype_id: String, rarity: String, rng: RandomNumberGenerator) -> Array:
	var pool: Array = ["ferrite_dust", "carbon", "oxygen", "sodium", "copper_ore", "silicate_powder"]
	if rng.randf() > 0.25:
		pool.append("cobalt")
	match archetype_id:
		"paradise", "tropical", "jungle", "giant_forest", "alien_flower", "terraforming_exp":
			pool.append_array(["star_bulb", "nitrogen_gas", "biolum_spore"])
		"frozen", "ice_crystal":
			pool.append_array(["frost_crystal", "radon_gas", "silver_vein"])
		"volcanic", "lava":
			pool.append_array(["basalt_shard", "solanium", "sulphurine", "cadmium"])
		"desert", "rocky_desert", "canyon":
			pool.append_array(["cactus_flesh", "sulphurine", "solanium", "gold_deposit"])
		"ocean", "deep_ocean":
			pool.append_array(["kelp_sac", "nitrogen_gas", "silver_vein"])
		"swamp", "mushroom", "toxic", "acid_rain":
			pool.append_array(["fungal_mould", "mordite", "nitrogen_gas"])
		"radioactive":
			pool.append_array(["gamma_root", "radon_gas", "gold_deposit"])
		"bioluminescent", "giant_cave", "dark":
			pool.append_array(["biolum_spore", "silver_vein"])
		"metallic", "machine_world", "high_gravity":
			pool.append_array(["magnetized_ferrite", "gold_deposit", "silver_vein"])
			if archetype_id == "machine_world":
				pool.append("machine_core")
		"extreme_storm", "exotic_anomaly", "floating_island", "crystal", "low_gravity":
			pool.append_array(["storm_crystal", "quantum_crystal", "indium", "gravitino_orb"])
		"ancient_ruins", "abandoned_colony":
			pool.append_array(["gold_deposit", "ancient_relic", "gravitino_orb"])
	if rarity in ["Rare", "Exotic"] or rng.randf() > 0.5:
		pool.append("emeril")
	if rarity in ["Exotic", "Mythic"] or rng.randf() > 0.75:
		pool.append_array(["indium", "quantum_crystal"])
	var dedup: Array = []
	for item_id in pool:
		if not dedup.has(item_id):
			dedup.append(item_id)
	return dedup

static func _generate_flora_species(rng: RandomNumberGenerator, archetype_def: Dictionary) -> Array:
	var labels := {
		"lush": "Canopy", "jungle": "Frond", "mushroom": "Mycelia", "crystal": "Spire",
		"desert": "Agave", "frozen": "Cryo-Fern", "biolum": "Lantern", "flower": "Blossom",
		"ruin": "Obelisk", "machine": "Pylon", "sparse": "Shrub"
	}
	var style: String = archetype_def["flora"]
	var count: int = 2 if style == "sparse" else rng.randi_range(3, 5)
	var list: Array = []
	for i in range(count):
		var rarity: String = "Rare" if (i == count - 1 and rng.randf() > 0.55) else ("Uncommon" if rng.randf() > 0.45 else "Common")
		list.append({
			"id": "flora_%d_%d" % [i, rng.randi_range(100, 99999)],
			"name": "%s %s" % [generate_name(rng), labels.get(style, "Flora")],
			"style": style,
			"scale": rng.randf_range(0.75, 2.2),
			"trunk_color": archetype_def["g_high"],
			"canopy_color": archetype_def["accent"] if i % 2 == 0 else archetype_def["g_mid"],
			"glow_color": archetype_def["accent"],
			"primary_resource": _get_biome_flora_resource(style, archetype_def["id"], rng),
			"rarity": rarity,
		})
	return list

static func _generate_creature_species(rng: RandomNumberGenerator, archetype_def: Dictionary) -> Array:
	if not archetype_def["landable"]:
		return []
	var arch_id: String = archetype_def["id"]
	var has_real_water: bool = archetype_def["has_water"] and not archetype_def["lava"]
	var count: int = 3 if archetype_def["hazard"] == "void" else rng.randi_range(4, 6)
	var pool: Array = ["quadruped", "biped", "flyer", "crawler", "floater"]
	if arch_id in ["ocean", "deep_ocean"]:
		pool = ["aquatic", "aquatic", "flyer", "floater", "crawler"]
	elif arch_id in ["bioluminescent", "giant_cave", "exotic_anomaly", "floating_island"]:
		pool = ["floater", "flyer", "biped", "crawler"]
		if has_real_water:
			pool.append("aquatic")
	elif arch_id in ["mushroom", "swamp", "toxic", "acid_rain"]:
		pool = ["crawler", "floater", "quadruped", "biped"]
		if has_real_water:
			pool.append("aquatic")
	elif arch_id in ["desert", "volcanic", "lava", "metallic", "machine_world"]:
		pool = ["crawler", "quadruped", "biped", "flyer", "floater"]
	elif has_real_water:
		pool.append("aquatic")

	var palette := ["#f59e0b", "#38bdf8", "#a855f7", "#10b981", "#fb7185", "#eab308", "#22d3ee", "#f97316", "#c084fc", "#34d399"]
	var list: Array = []
	for i in range(count):
		var body_type: String = pool[(i + rng.randi_range(0, pool.size() - 1)) % pool.size()]
		if i == 0 and has_real_water:
			body_type = "aquatic"
		elif i == 1 and arch_id in ["bioluminescent", "exotic_anomaly", "mushroom"]:
			body_type = "floater"
		var is_predator: bool = (i == count - 1) and rng.randf() > 0.35
		var is_guardian: bool = (not is_predator) and (arch_id in ["ancient_ruins", "machine_world"]) and rng.randf() > 0.55
		var temp: String = "predator" if is_predator else ("guardian" if is_guardian else ("skittish" if rng.randf() > 0.55 else "docile"))
		var scale_val: float = rng.randf_range(0.75, 1.95)
		if body_type == "quadruped" and rng.randf() > 0.55:
			scale_val = rng.randf_range(1.45, 2.35)
		var base_hp: float = 85.0 if temp == "predator" else (110.0 if temp == "guardian" else 50.0)
		list.append({
			"id": "fauna_%d_%d" % [i, rng.randi_range(100, 99999)],
			"name": generate_name(rng),
			"body_type": body_type,
			"temperament": temp,
			"scale": scale_val,
			"primary_color": palette[rng.randi_range(0, palette.size() - 1)],
			"secondary_color": palette[rng.randi_range(0, palette.size() - 1)],
			"eye_color": "#ff2d55" if temp == "predator" else ("#facc15" if temp == "guardian" else "#38bdf8"),
			"biolum": arch_id in ["bioluminescent", "dark", "deep_ocean"] or body_type == "floater" or rng.randf() > 0.55,
			"speed": rng.randf_range(6.8, 9.5) if temp == "predator" else (rng.randf_range(5.0, 7.5) if body_type == "aquatic" else rng.randf_range(3.5, 6.2)),
			"hp": roundi(base_hp * scale_val),
			"rarity": "Rare" if (scale_val > 1.85 or body_type == "floater") else ("Uncommon" if rng.randf() > 0.55 else "Common"),
			"diet": "Carnivore" if temp == "predator" else ("Mineral Filter" if body_type == "floater" else "Herbivore"),
		})
	return list

static func generate_planet(planet_seed: int, system_id: String, system_name: String, orbit_idx: int, forced_archetype: String = "") -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = planet_seed
	var arch_list := UniverseCatalog.PLANET_ARCHETYPES
	var arch_def: Dictionary = UniverseCatalog.get_archetype(forced_archetype) if forced_archetype != "" else arch_list[rng.randi_range(0, arch_list.size() - 1)]

	var radius: float = rng.randf_range(280.0, 340.0) if arch_def["id"] == "gas_giant" else rng.randf_range(180.0, 245.0)
	var orbit_dist: float = 950.0 + float(orbit_idx) * 980.0 + rng.randf_range(0.0, 320.0)
	var orbit_angle: float = rng.randf_range(0.0, TAU)
	var tilt_y: float = rng.randf_range(-130.0, 130.0)
	var pos := Vector3(cos(orbit_angle) * orbit_dist, tilt_y, sin(orbit_angle) * orbit_dist)

	var gravity: float = snappedf(rng.randf_range(arch_def["g_min"], arch_def["g_max"]), 0.1)
	var temp_c: int = rng.randi_range(arch_def["t_min"], arch_def["t_max"])
	var weathers: Array = arch_def["weathers"]
	var weather: String = weathers[rng.randi_range(0, weathers.size() - 1)]
	var resources: Array = _get_biome_resources(arch_def["id"], arch_def["rarity"], rng)
	var suffix: String = ROMAN[orbit_idx % ROMAN.size()]
	var planet_name: String = "%s Prime" % system_name if (orbit_idx == 0 and forced_archetype != "") else "%s %s" % [generate_name(rng), suffix]

	return {
		"id": "pl_%d" % planet_seed,
		"seed": planet_seed,
		"system_id": system_id,
		"orbit_index": orbit_idx,
		"name": planet_name,
		"archetype": arch_def["id"],
		"archetype_name": arch_def["name"],
		"rarity": arch_def["rarity"],
		"radius": radius,
		"orbit_distance": orbit_dist,
		"position": pos,
		"gravity": gravity,
		"temperature_c": temp_c,
		"water_level": radius + float(arch_def["water_off"]),
		"has_water": arch_def["has_water"],
		"water_is_lava": arch_def["lava"],
		"hazard": arch_def["hazard"],
		"weather": weather,
		"resources": resources,
		"flora_species": _generate_flora_species(rng, arch_def),
		"creature_species": _generate_creature_species(rng, arch_def),
		"has_rings": rng.randf() < float(arch_def["rings"]),
		"ring_color": arch_def["accent"],
		"has_outpost": arch_def["landable"] and rng.randf() > 0.45,
		"landable": arch_def["landable"],
		"sky_top": arch_def["sky"],
		"sky_horizon": arch_def["horizon"],
		"g_low": arch_def["g_low"],
		"g_mid": arch_def["g_mid"],
		"g_high": arch_def["g_high"],
		"water_color": arch_def["water"],
		"accent": arch_def["accent"],
		"amp": float(arch_def["amp"]),
		"freq": float(arch_def["freq"]),
		"ridge": float(arch_def["ridge"]),
		"crater": float(arch_def["crater"]),
		"atmo": float(arch_def["atmo"]),
	}

static func generate_star_system(universe_seed: int, coords: Vector3i, is_home: bool = false) -> Dictionary:
	var sys_seed := hash_coords(coords.x * 31, coords.y * 17, coords.z * 53, universe_seed)
	var rng := RandomNumberGenerator.new()
	rng.seed = sys_seed

	var picked: Dictionary = STAR_CLASSES[0]
	var roll := rng.randf() * 104.0
	for s in STAR_CLASSES:
		roll -= float(s["weight"])
		if roll <= 0.0:
			picked = s
			break

	var factions := ["vaelori", "kethrax", "aetheris"]
	var faction_id: String = factions[rng.randi_range(0, factions.size() - 1)]
	var sys_name := generate_name(rng)
	var sys_id := "sys_%d" % sys_seed
	var planet_count := 5 if is_home else rng.randi_range(3, 6)
	var planets: Array = []

	for i in range(planet_count):
		var p_seed := hash_coords(sys_seed + i * 7919, i, coords.z, universe_seed)
		var forced := ""
		if is_home:
			match i:
				0: forced = "paradise"
				1: forced = "bioluminescent"
				2: forced = "volcanic"
				3: forced = "ice_crystal"
				4: forced = "ancient_ruins"
		planets.append(generate_planet(p_seed, sys_id, sys_name, i, forced))

	var st_angle := rng.randf_range(0.0, TAU)
	return {
		"id": sys_id,
		"seed": sys_seed,
		"name": sys_name,
		"region_name": get_region_name(coords, universe_seed),
		"coords": coords,
		"star_class": picked["cls"],
		"star_color": picked["color"],
		"is_binary": picked["cls"] == "Binary",
		"faction": faction_id,
		"danger": "High" if rng.randf() > 0.72 else ("Moderate" if rng.randf() > 0.35 else "Low"),
		"planets": planets,
		"has_station": is_home or rng.randf() > 0.15,
		"station_name": "%s Orbital Nexus" % sys_name,
		"station_pos": Vector3(cos(st_angle) * 1480.0, 190.0, sin(st_angle) * 1480.0),
	}

static func generate_nearby_systems(universe_seed: int, center: Vector3i, radius: int = 3) -> Array:
	var out: Array = []
	for dx in range(-radius, radius + 1):
		for dz in range(-radius, radius + 1):
			if dx * dx + dz * dz > radius * radius + 1:
				continue
			var coords := Vector3i(center.x + dx, center.y, center.z + dz)
			var is_origin := (coords.x == 0 and coords.y == 0 and coords.z == 0)
			var cell_hash := hash_coords(coords.x, coords.y, coords.z, universe_seed)
			if is_origin or (cell_hash % 100) < 58:
				out.append(generate_star_system(universe_seed, coords, is_origin))
	return out

static func _get_noise_bundle(planet_seed: int) -> Dictionary:
	if _noise_cache.has(planet_seed):
		return _noise_cache[planet_seed]
	var base := FastNoiseLite.new()
	base.seed = planet_seed
	base.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	base.fractal_type = FastNoiseLite.FRACTAL_FBM
	base.fractal_octaves = 4
	base.frequency = 1.0

	var ridge := FastNoiseLite.new()
	ridge.seed = planet_seed + 777
	ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	ridge.fractal_octaves = 3
	ridge.frequency = 1.0

	var detail := FastNoiseLite.new()
	detail.seed = planet_seed + 3331
	detail.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	detail.fractal_octaves = 2
	detail.frequency = 1.0

	var bundle := {"base": base, "ridge": ridge, "detail": detail}
	if _noise_cache.size() > 32:
		_noise_cache.clear()
	_noise_cache[planet_seed] = bundle
	return bundle

static func sample_surface_radius(planet: Dictionary, dir_unit: Vector3) -> float:
	var n := dir_unit.normalized()
	var freq: float = float(planet["freq"])
	var amp: float = float(planet["amp"])
	var bundle := _get_noise_bundle(int(planet["seed"]))
	var base_n: FastNoiseLite = bundle["base"]
	var ridge_n: FastNoiseLite = bundle["ridge"]
	var detail_n: FastNoiseLite = bundle["detail"]

	var h: float = base_n.get_noise_3dv(n * freq) * amp
	h += (ridge_n.get_noise_3dv(n * (freq * 1.4)) - 0.35) * amp * float(planet["ridge"]) * 1.3
	h += detail_n.get_noise_3dv(n * (freq * 4.5)) * (amp * 0.22)

	var crater_w: float = float(planet["crater"])
	if crater_w > 0.05:
		var crater_field := detail_n.get_noise_3dv(n * 5.2)
		if crater_field > 0.28:
			var bowl := minf(1.0, (crater_field - 0.28) * 3.5)
			h -= bowl * bowl * amp * crater_w * 1.25

	# Smooth landing plateau around spawn patch (0, 0.968, 0.25)
	var spawn_dir := Vector3(0.0, 0.968, 0.25).normalized()
	var spawn_dot := n.dot(spawn_dir)
	if spawn_dot > 0.91 and planet["landable"]:
		var flatten := minf(1.0, (spawn_dot - 0.91) / 0.06)
		var target_flat: float = 3.4
		if planet["has_water"] and not planet["water_is_lava"]:
			target_flat = maxf(4.8, float(planet["water_level"]) - float(planet["radius"]) + 4.8)
		h = lerpf(h, target_flat, flatten)

	return float(planet["radius"]) + h
