extends Node

## Procedural Ambient Backsound & Polyphonic SFX Engine for Godot 4.3 (PC & Mobile).
## Synthesizes all seamless ambient loops and crisp SFX into AudioStreamWAV buffers at startup
## for ultra-low CPU usage on Android/iOS/Desktop with zero missing external audio files.

const SAMPLE_RATE := 22050

var muted: bool = false
var master_volume: float = 0.72
var current_mode: String = "menu"

var _amb_players: Dictionary = {}
var _amb_weights: Dictionary = {"space": 1.0, "planet": 0.0, "storm": 0.0, "water": 0.0}
var _thruster_player: AudioStreamPlayer = null
var _beam_player: AudioStreamPlayer = null
var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_idx: int = 0
var _sfx_bank: Dictionary = {}
var _chime_streams: Array[AudioStreamWAV] = []

var _chime_timer: float = 1.6
var _thruster_target: float = 0.0
var _thruster_pitch: float = 1.0
var _beam_active: bool = false

func _ready() -> void:
	_build_ambient_loops()
	_build_sfx_bank()
	_build_sfx_pool()
	_start_loops()

func _make_wav(samples: PackedFloat32Array, loop: bool = false) -> AudioStreamWAV:
	var n := samples.size()
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in range(n):
		var s := clampf(samples[i], -0.98, 0.98)
		bytes.encode_s16(i * 2, int(s * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SAMPLE_RATE
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = n
	else:
		wav.loop_mode = AudioStreamWAV.LOOP_DISABLED
	return wav

func _build_ambient_loops() -> void:
	# 6-second phase-locked cosmic pad loops (integer harmonic cycles for click-free looping)
	var dur := 6.0
	var n := int(SAMPLE_RATE * dur)

	var space_buf := PackedFloat32Array()
	space_buf.resize(n)
	var planet_buf := PackedFloat32Array()
	planet_buf.resize(n)
	for i in range(n):
		var t := float(i) / float(SAMPLE_RATE)
		var breath := 0.7 + 0.3 * sin(TAU * t / dur)
		# A1 (55 Hz), E2 (82.5 Hz), A2 (110 Hz), C#3/E3 gentle shimmer
		var d_space := (sin(TAU * 55.0 * t) * 0.42 + sin(TAU * 82.5 * t) * 0.28 + sin(TAU * 110.0 * t) * 0.16) * 0.34 * breath
		space_buf[i] = d_space

		var d_planet := (sin(TAU * 65.0 * t) * 0.36 + sin(TAU * 97.5 * t) * 0.24 + sin(TAU * 130.0 * t) * 0.18 + sin(TAU * 195.0 * t) * 0.08) * 0.30 * breath
		planet_buf[i] = d_planet

	_amb_players["space"] = _make_loop_player(_make_wav(space_buf, true), -8.0)
	_amb_players["planet"] = _make_loop_player(_make_wav(planet_buf, true), -40.0)

	# 4-second filtered noise loops for Storm Wind & Underwater Ocean Current
	var w_n := int(SAMPLE_RATE * 4.0)
	var storm_buf := PackedFloat32Array()
	storm_buf.resize(w_n)
	var water_buf := PackedFloat32Array()
	water_buf.resize(w_n)
	var lp_storm := 0.0
	var lp_water := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 4201
	for i in range(w_n):
		var t := float(i) / float(w_n)
		var env := sin(PI * t) # soft loop wrap fade, cross-summed below
		var white := rng.randf_range(-1.0, 1.0)
		lp_storm = lerpf(lp_storm, white, 0.065)
		lp_water = lerpf(lp_water, white, 0.024)
		var gust := 0.55 + 0.45 * sin(TAU * 2.0 * t)
		storm_buf[i] = clampf(lp_storm * 1.45 * gust * (0.4 + 0.6 * env), -0.9, 0.9)
		water_buf[i] = clampf((lp_water * 1.3 + sin(TAU * 62.0 * float(i) / float(SAMPLE_RATE)) * 0.18) * (0.5 + 0.5 * env), -0.9, 0.9)

	_amb_players["storm"] = _make_loop_player(_make_wav(storm_buf, true), -40.0)
	_amb_players["water"] = _make_loop_player(_make_wav(water_buf, true), -40.0)

	# Thruster & Mining Beam 1-second seamless loops
	var l_n := SAMPLE_RATE
	var thr_buf := PackedFloat32Array()
	thr_buf.resize(l_n)
	var bm_buf := PackedFloat32Array()
	bm_buf.resize(l_n)
	for i in range(l_n):
		var t := float(i) / float(SAMPLE_RATE)
		var saw := fmod(t * 58.0, 1.0) * 2.0 - 1.0
		thr_buf[i] = (saw * 0.28 + sin(TAU * 34.0 * t) * 0.45 + rng.randf_range(-0.08, 0.08)) * 0.45
		var wobble := sin(TAU * 14.0 * t) * 16.0
		bm_buf[i] = (sin(TAU * (195.0 + wobble) * t) * 0.55 + sin(TAU * 390.0 * t) * 0.25) * 0.4

	_thruster_player = _make_loop_player(_make_wav(thr_buf, true), -60.0)
	_beam_player = _make_loop_player(_make_wav(bm_buf, true), -60.0)

	# Pre-generate 6 ambient musical bell chime notes (A minor pentatonic / Lydian)
	var notes := [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]
	for freq in notes:
		_chime_streams.append(_synth_tone(freq, freq, 2.1, "sine", 0.16, 0.08, true))

func _make_loop_player(stream: AudioStreamWAV, init_db: float) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.volume_db = init_db
	add_child(p)
	return p

func _start_loops() -> void:
	for k in _amb_players.keys():
		_amb_players[k].play()
	_thruster_player.play()
	_beam_player.play()

func _build_sfx_pool() -> void:
	for i in range(8):
		var p := AudioStreamPlayer.new()
		add_child(p)
		_sfx_pool.append(p)

func _synth_tone(f0: float, f1: float, dur: float, wave: String = "sine", amp: float = 0.35, noise_mix: float = 0.0, soft_attack: bool = false) -> AudioStreamWAV:
	var n := int(SAMPLE_RATE * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = int(f0 * 100.0 + dur * 1000.0)
	var lp := 0.0
	for i in range(n):
		var u := float(i) / float(maxi(1, n - 1))
		var freq := lerpf(f0, f1, u)
		phase += TAU * freq / float(SAMPLE_RATE)
		var sig := 0.0
		match wave:
			"saw":
				sig = fmod(phase / TAU, 1.0) * 2.0 - 1.0
			"square":
				sig = 1.0 if sin(phase) >= 0.0 else -1.0
			"tri":
				sig = absf(fmod(phase / TAU, 1.0) * 4.0 - 2.0) - 1.0
			_:
				sig = sin(phase)
		if noise_mix > 0.0:
			lp = lerpf(lp, rng.randf_range(-1.0, 1.0), 0.32)
			sig = sig * (1.0 - noise_mix) + lp * noise_mix
		var env := pow(1.0 - u, 1.7)
		if soft_attack and u < 0.06:
			env *= (u / 0.06)
		elif u < 0.015:
			env *= (u / 0.015)
		buf[i] = sig * env * amp
	return _make_wav(buf, false)

func _synth_chord(freqs: Array, step_dur: float, amp: float = 0.28) -> AudioStreamWAV:
	var total := freqs.size() * step_dur + 0.25
	var n := int(SAMPLE_RATE * total)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for idx in range(freqs.size()):
		var f: float = float(freqs[idx])
		var start_i := int(idx * step_dur * float(SAMPLE_RATE))
		var note_len := n - start_i
		for k in range(note_len):
			var u := float(k) / float(maxi(1, note_len - 1))
			var env := minf(1.0, float(k) / 300.0) * pow(1.0 - u, 1.8)
			buf[start_i + k] += sin(TAU * f * float(k) / float(SAMPLE_RATE)) * env * amp
	return _make_wav(buf, false)

func _build_sfx_bank() -> void:
	_sfx_bank["footstep_rock"] = _synth_tone(110.0, 46.0, 0.09, "sine", 0.24, 0.25)
	_sfx_bank["footstep_snow"] = _synth_tone(92.0, 48.0, 0.08, "sine", 0.20, 0.55)
	_sfx_bank["footstep_water"] = _synth_tone(210.0, 95.0, 0.14, "sine", 0.24, 0.65)
	_sfx_bank["jump"] = _synth_tone(175.0, 390.0, 0.14, "sine", 0.30, 0.22)
	_sfx_bank["land"] = _synth_tone(145.0, 42.0, 0.18, "tri", 0.36, 0.35)
	_sfx_bank["board_airlock"] = _synth_chord([340.0, 560.0], 0.08, 0.26)
	_sfx_bank["takeoff"] = _synth_tone(80.0, 310.0, 0.55, "saw", 0.35, 0.35, true)
	_sfx_bank["touchdown"] = _synth_tone(160.0, 44.0, 0.34, "tri", 0.38, 0.40)
	_sfx_bank["scan_pulse"] = _synth_tone(460.0, 1340.0, 0.32, "sine", 0.26, 0.0)
	_sfx_bank["discovery"] = _synth_chord([523.25, 659.25, 783.99, 1046.5], 0.10, 0.24)
	_sfx_bank["laser_bolt"] = _synth_tone(940.0, 195.0, 0.14, "saw", 0.28, 0.10)
	_sfx_bank["impact_light"] = _synth_tone(260.0, 72.0, 0.14, "square", 0.28, 0.30)
	_sfx_bank["explosion"] = _synth_tone(140.0, 26.0, 0.58, "saw", 0.44, 0.65)
	_sfx_bank["pickup"] = _synth_chord([680.0, 1020.0], 0.06, 0.25)
	_sfx_bank["craft"] = _synth_chord([320.0, 480.0, 720.0], 0.08, 0.25)
	_sfx_bank["consumable"] = _synth_tone(440.0, 820.0, 0.20, "sine", 0.26, 0.25)
	_sfx_bank["ui_click"] = _synth_tone(640.0, 860.0, 0.055, "sine", 0.20, 0.0)
	_sfx_bank["warp"] = _synth_tone(110.0, 960.0, 1.15, "saw", 0.34, 0.45, true)
	_sfx_bank["warning"] = _synth_chord([720.0, 540.0], 0.14, 0.22)
	_sfx_bank["creature_growl"] = _synth_tone(165.0, 88.0, 0.34, "saw", 0.28, 0.35)
	_sfx_bank["creature_chirp"] = _synth_chord([560.0, 780.0], 0.08, 0.20)

func set_muted(val: bool) -> void:
	muted = val
	if muted:
		for k in _amb_players.keys():
			_amb_players[k].volume_db = -80.0
		_thruster_player.volume_db = -80.0
		_beam_player.volume_db = -80.0

func set_volume(val: float) -> void:
	master_volume = clampf(val, 0.0, 1.0)

func set_ambient_context(mode: String) -> void:
	current_mode = mode

func set_thruster_level(level: float, pitch_boost: float = 0.0) -> void:
	_thruster_target = clampf(level, 0.0, 1.0)
	_thruster_pitch = 1.0 + clampf(level * 0.45 + pitch_boost * 0.35, 0.0, 0.9)

func set_beam_active(active: bool) -> void:
	_beam_active = active

func play_sfx(key: String, pitch_jitter: float = 0.05) -> void:
	if muted or not _sfx_bank.has(key) or _sfx_pool.is_empty():
		return
	var p: AudioStreamPlayer = _sfx_pool[_sfx_idx]
	_sfx_idx = (_sfx_idx + 1) % _sfx_pool.size()
	p.stream = _sfx_bank[key]
	p.pitch_scale = 1.0 + randf_range(-pitch_jitter, pitch_jitter)
	p.volume_db = linear_to_db(maxf(0.01, master_volume * 0.72))
	p.play()

func _process(delta: float) -> void:
	if muted:
		return

	var target_w := {
		"space": 1.0 if current_mode in ["menu", "space"] else 0.15,
		"planet": 0.9 if current_mode == "planet_calm" else (0.55 if current_mode == "menu" else 0.0),
		"storm": 0.85 if current_mode == "planet_storm" else 0.0,
		"water": 0.85 if current_mode == "underwater" else 0.0,
	}

	var amb_scale := master_volume * 0.32
	for k in _amb_players.keys():
		_amb_weights[k] = lerpf(float(_amb_weights[k]), float(target_w[k]), clampf(delta * 2.2, 0.0, 1.0))
		var lin := float(_amb_weights[k]) * amb_scale
		_amb_players[k].volume_db = linear_to_db(lin) if lin > 0.002 else -72.0

	var thr_lin := _thruster_target * master_volume * 0.28
	_thruster_player.volume_db = linear_to_db(thr_lin) if thr_lin > 0.004 else -72.0
	_thruster_player.pitch_scale = lerpf(_thruster_player.pitch_scale, _thruster_pitch, clampf(delta * 8.0, 0.0, 1.0))

	var beam_lin := (0.22 if _beam_active else 0.0) * master_volume
	_beam_player.volume_db = linear_to_db(beam_lin) if beam_lin > 0.004 else -72.0

	# Generative ambient chimes
	_chime_timer -= delta
	if _chime_timer <= 0.0 and not _chime_streams.is_empty():
		_chime_timer = randf_range(2.4, 4.8)
		var p: AudioStreamPlayer = _sfx_pool[_sfx_idx]
		_sfx_idx = (_sfx_idx + 1) % _sfx_pool.size()
		p.stream = _chime_streams[randi_range(0, _chime_streams.size() - 1)]
		p.pitch_scale = 0.75 if current_mode == "underwater" else (0.88 if current_mode == "planet_storm" else 1.0)
		p.volume_db = linear_to_db(maxf(0.005, master_volume * 0.22))
		p.play()
