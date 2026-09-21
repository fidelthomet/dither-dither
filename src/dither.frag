precision mediump float;

uniform sampler2D image;
uniform sampler2D threshold;
uniform vec2 resolution;
uniform vec4 darkColor;
uniform vec4 lightColor;

varying vec2 v_texCoord;

vec4 dither(vec2 position, vec4 color) {
  float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec2 uv = mod(position, resolution) / resolution;
  vec4 limit = texture2D(threshold, uv);

  float dithered = brightness < limit.x ? 0.0 : 1.0;
  vec4 tone = mix(darkColor, lightColor, dithered);

  float alpha = tone.a * color.a;
  return vec4(tone.rgb * alpha, alpha);
}

void main() {
  vec4 color = texture2D(image, v_texCoord);
  gl_FragColor = dither(gl_FragCoord.xy, color);
}