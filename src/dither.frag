precision mediump float;

uniform sampler2D image;
uniform sampler2D threshold;

uniform vec2 resolution;

varying vec2 v_texCoord;

vec4 dither(vec2 position, vec4 color) {
  float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec2 vecMod = vec2(mod(position.x, resolution.x), mod(position.y, resolution.y));
  vec2 uv = vecMod / resolution.xy;
  vec4 limit = texture2D(threshold, uv);

  float dithered = brightness < limit.x ? 0.0 : 1.0;
  return vec4(dithered, dithered, dithered, 1.0);
}

void main() {
   vec4 color = texture2D(image, v_texCoord);
   gl_FragColor = dither(gl_FragCoord.xy, color);
}