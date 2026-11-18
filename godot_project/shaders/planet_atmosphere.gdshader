shader_type spatial;
render_mode unshaded, cull_front, blend_add, depth_draw_never;

uniform vec4 atmosphere_color : source_color = vec4(0.35, 0.72, 1.0, 1.0);
uniform float intensity : hint_range(0.1, 3.0) = 1.15;
uniform float rim_power : hint_range(0.8, 6.0) = 2.6;

void fragment() {
	float fresnel = pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), rim_power);
	ALBEDO = atmosphere_color.rgb * intensity;
	ALPHA = clamp(fresnel * atmosphere_color.a * 0.78, 0.0, 0.85);
}
