import * as THREE from 'three';

// 天空穹顶：渐变 + 动画风格的积云 + 太阳/月亮/星星
const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999; // 永远在最远处
}`;

const frag = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir, uCloudLit, uCloudShade;
uniform float uTime, uSunSize, uGlow, uStars, uMoon, uCover, uCloudAlpha, uScales;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float worley(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float md = 1.0;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 r = g + hash2(i + g) * 0.85 - f;
    md = min(md, dot(r, r));
  }
  return sqrt(md);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  s *= 1.07;
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uTop, t);
  col = mix(col, uBottom, 1.0 - smoothstep(-0.25, 0.0, y));

  float sd = max(dot(d, uSunDir), 0.0);
  float hz = 1.0 - smoothstep(0.0, 0.5, abs(y));
  col += uSunColor * (pow(sd, 5.0) * 0.28 * (0.4 + hz) + pow(sd, 60.0) * 0.6) * uGlow;

  // 星星
  if (uStars > 0.0 && y > 0.0) {
    vec3 sp = d * 280.0;
    vec3 cell = floor(sp);
    float h = hash3(cell);
    if (h > 0.985) {
      vec3 c = cell + 0.5 + (vec3(hash3(cell + 1.3), hash3(cell + 2.7), hash3(cell + 4.1)) - 0.5) * 0.6;
      float dd = length(sp - c);
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 6.0) + h * 40.0);
      float b = smoothstep(0.32, 0.0, dd) * (h - 0.985) * 66.0 * tw;
      col += vec3(0.85, 0.9, 1.0) * b * uStars * smoothstep(0.0, 0.25, y);
    }
    // 银河一样淡淡的一条
    float band = exp(-pow(dot(d, normalize(vec3(0.6, 0.3, -0.75))) * 4.0, 2.0));
    col += vec3(0.25, 0.28, 0.45) * band * fbm(d.xz * 9.0) * 0.18 * uStars * smoothstep(0.05, 0.4, y);
  }

  // 月亮
  if (uMoon > 0.0) {
    float md = dot(d, normalize(uMoonDir));
    float disk = smoothstep(0.99955, 0.99975, md);
    float crater = fbm(d.xy * 900.0) * 0.25;
    col = mix(col, vec3(1.0, 0.97, 0.86) * (1.6 - crater), disk * uMoon);
    col += vec3(0.55, 0.65, 0.9) * pow(max(md, 0.0), 300.0) * 0.5 * uMoon;
    col += vec3(0.3, 0.38, 0.6) * pow(max(md, 0.0), 20.0) * 0.12 * uMoon;
  }

  // 太阳
  float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, sd);
  col = mix(col, uSunColor * 4.0, disk * smoothstep(-0.03, 0.01, y) * uGlow);

  // 云：投影到天穹平面上
  if (y > 0.0) {
    vec2 base = d.xz / (y + 0.09);
    vec2 wind = vec2(uTime * 0.006, uTime * 0.002);
    float fade = smoothstep(0.0, 0.16, y);
    // 高处一层秋天的鳞云（うろこ雲）：一粒粒的小云排成片
    vec2 uv2 = base * vec2(6.0, 8.5) + wind * 3.0;
    float w = worley(uv2 + (fbm(uv2 * 0.7) - 0.5) * 0.8);
    float mask = smoothstep(0.44, 0.62, fbm(base * 0.3 + vec2(3.0, 7.0) + wind * 0.4));
    float grow = mix(0.12, 0.3, mask);
    float puffs = 1.0 - smoothstep(grow - 0.06, grow, w);
    float sc = puffs * smoothstep(0.2, 0.5, mask) * uScales * fade;
    vec3 scCol = mix(uCloudShade, uCloudLit, 0.45 + 0.55 * smoothstep(grow, 0.02, w));
    scCol += uSunColor * pow(sd, 4.0) * 0.5 * uGlow;
    col = mix(col, scCol, sc * 0.85 * uCloudAlpha);
    // 低处的积云：边缘清楚，亮面暗面分得开
    vec2 uv = base * 0.32 + wind;
    float n = (fbm(uv) - 0.30) / 0.38;
    float n2 = (fbm(uv + uSunDir.xz * 0.05) - 0.30) / 0.38;
    float edge = 1.0 - uCover;
    float c = smoothstep(edge, edge + 0.07, n) * smoothstep(0.02, 0.2, y + 0.04) * (1.0 - smoothstep(0.55, 0.95, y));
    float lit = smoothstep(0.2, 0.8, clamp(0.62 + (n - n2) * 3.5, 0.0, 1.0));
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc = mix(cc, uCloudShade * 0.92, smoothstep(edge + 0.25, edge + 0.6, n) * 0.35 * (1.0 - lit));
    // 太阳附近的云边发亮（银边）
    cc += uSunColor * pow(sd, 6.0) * (1.0 - smoothstep(edge, edge + 0.25, n)) * 1.8 * uGlow;
    col = mix(col, cc, c * uCloudAlpha);
    // 天边一层淡淡的远云
    float band = smoothstep(0.0, 0.03, y) * (1.0 - smoothstep(0.03, 0.13, y));
    float bn = fbm(vec2(atan(d.x, d.z) * 7.0, y * 30.0) + uTime * 0.002);
    col = mix(col, mix(uCloudShade, uCloudLit, 0.65), band * smoothstep(0.42, 0.7, bn) * 0.6 * uCloudAlpha);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color('#3d7fd6') },
    uHorizon: { value: new THREE.Color('#cfe4f5') },
    uBottom: { value: new THREE.Color('#bcd2e2') },
    uSunDir: { value: new THREE.Vector3(0, 0.5, 1).normalize() },
    uSunColor: { value: new THREE.Color('#fff1dc') },
    uMoonDir: { value: new THREE.Vector3(0.3, 0.6, 0.6).normalize() },
    uCloudLit: { value: new THREE.Color('#ffffff') },
    uCloudShade: { value: new THREE.Color('#b4c3da') },
    uTime: { value: 0 },
    uSunSize: { value: 0.0009 },
    uGlow: { value: 1 },
    uStars: { value: 0 },
    uMoon: { value: 0 },
    uCover: { value: 0.45 },
    uCloudAlpha: { value: 1 },
    uScales: { value: 0.8 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  return { mesh: sky, uniforms };
}
