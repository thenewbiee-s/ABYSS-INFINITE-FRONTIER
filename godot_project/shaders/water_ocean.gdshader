shader_type spatial;
render_mode specular_schlick_ggx, cull_back;

uniform vec4 water_color : source_color = vec4(0.05, 0.45, 0.78, 0.78);
uniform float wave_speed : hint_range(0.1, 4.0) = 1.2;
uniform float wave_scale : hint_range(1.0, 40.0) = 14.0;
uniform float is_lava : hint_range(0.0, 1.0) = 0.0;

void vertex() {
	float ripple = sin(VERTEX.x * 0.14 + TIME * wave_speed) * cos(VERTEX.z * 0.14 - TIME * wave_speed * 0.8);
	VERTEX += normalize(VERTEX) * ripple * 0.12;
}

void fragment() {
	float shimmer = sin((UV.x * wave_scale) + TIME * wave_speed) * cos((UV.y * wave_scale) - TIME * wave_speed * 0.7);
	ALBEDO = water_color.rgb + vec3(0.04) * shimmer;
	ROUGHNESS = mix(0.14, 0.45, is_lava);
	METALLIC = mix(0.25, 0.0, is_lava);
	EMISSION = water_color.rgb * mix(0.08, 1.15, is_lava) * (0.85 + 0.15 * shimmer);
	ALPHA = mix(water_color.a, 0.96, is_lava);
}
