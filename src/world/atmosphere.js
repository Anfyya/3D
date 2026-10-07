import * as THREE from 'three';
import { world, onUpdate } from '../core/build.js';
import * as T from '../core/textures.js';
import { mulberry32 } from '../core/util.js';
import { F1, F2, C1 } from './layout.js';

// ———— 灵气：屋里特别稠的那种发光的微粒 ————
function spiritMotes(root) {
  const r = mulberry32(5);
  const pts = [];
  const add = (n, fn) => { for (let i = 0; i < n; i++) pts.push(fn()); };
  // 屋内（一楼、二楼）
  add(600, () => [-14.8 + r() * 29.6, F1 + 0.1 + r() * 3.2, -9.8 + r() * 19.6, 1]);
  add(450, () => [-14.8 + r() * 29.6, F2 + 0.1 + r() * 2.8, -9.8 + r() * 19.6, 1]);
  add(200, () => [-0.8 + r() * 12.6, C1 + r() * 3.2, -9.8 + r() * 7.2, 1]);
  // 屋外稀一点（只在围墙里面，屋子里另算）
  add(420, () => {
    for (;;) {
      const x = -31.5 + r() * 64, z = -21.2 + r() * 37.6;
      if (x > -15.3 && x < 15.3 && z > -10.3 && z < 12.2) continue;
      return [x, 0.3 + r() * 6, z, 0.45];
    }
  });
  const n = pts.length;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n), kind = new Float32Array(n);
  pts.forEach(([x, y, z, k], i) => { pos.set([x, y, z], i * 3); seed[i] = r(); kind[i] = k; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: T.softDot() }, uI: { value: 1 }, uPR: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSeed; attribute float aKind; uniform float uTime, uI, uPR; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position;
        float s = aSeed * 50.0;
        if (aKind > 1.5) {
          p.y = mod(p.y + uTime * 0.06 + aSeed * 20.0, 21.0) + 0.8;
          p.x += sin(uTime * 0.05 + s) * 0.6; p.z += cos(uTime * 0.04 + s) * 0.6;
        } else {
          p += vec3(sin(uTime * 0.23 + s), sin(uTime * 0.17 + s * 1.3) * 0.5, cos(uTime * 0.19 + s * 0.7)) * 0.35;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 1.7) + s);
        vA = tw * uI * (aKind > 1.5 ? 1.2 : aKind);
        vC = mix(vec3(0.62, 1.0, 0.9), vec3(1.0, 0.9, 0.62), step(0.62, aSeed));
        gl_PointSize = (aKind > 1.5 ? 0.16 : 0.07) * (0.6 + aSeed) * 700.0 * uPR / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.55; gl_FragColor = vec4(vC * a, a); }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.userData.dynamic = true;
  root.add(p);
  onUpdate((dt, t) => { mat.uniforms.uTime.value = t; mat.uniforms.uI.value = world.tod.spirit ?? 1; });
  return mat;
}

// 丛雨在床边静息时的一团微光（夜里和清晨）
function murasameGlow(root) {
  const pos = world.spiritSeat;
  if (!pos) return;
  const g = new THREE.Group();
  g.position.copy(pos);
  root.add(g);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.softDot(), color: '#a8e8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.2, 1.6, 1);
  g.add(halo);
  const N = 36, r = mulberry32(17);
  const motes = [];
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.softDot(), color: i % 3 ? '#c8f4ff' : '#fff0c8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(0.04 + r() * 0.05);
    g.add(s);
    motes.push({ s, a: r() * 6.28, rad: 0.15 + r() * 0.35, h: r(), sp: 0.2 + r() * 0.4 });
  }
  g.userData.dynamic = true;
  onUpdate((dt, t) => {
    const k = world.tod.key;
    const target = k === 'night' ? 1 : k === 'dawn' ? 0.55 : 0;
    g.userData.v = (g.userData.v ?? target) + (target - (g.userData.v ?? target)) * Math.min(1, dt * 1.5);
    const v = g.userData.v;
    g.visible = v > 0.01;
    halo.material.opacity = 0.16 * v * (0.85 + Math.sin(t * 0.8) * 0.15);
    for (const m of motes) {
      const a = m.a + t * m.sp;
      m.s.position.set(Math.cos(a) * m.rad, -0.4 + ((m.h + t * 0.05 * m.sp) % 1) * 1.3, Math.sin(a) * m.rad);
      m.s.material.opacity = v * 0.7 * Math.sin(((m.h + t * 0.05 * m.sp) % 1) * Math.PI);
    }
  });
}

// ———— 飘落的红叶 ————
function fallingLeaves(root) {
  const c = world.mapleCrown;
  if (!c) return;
  const N = 46;
  const tex = T.leafCluster({ kind: 'maple', palette: ['#c42a1c', '#dd4a22', '#e8702a'], seed: 101, count: 1, size: 64 });
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), mat, N);
  im.userData.dynamic = true;
  im.frustumCulled = false;
  root.add(im);
  const r = mulberry32(8);
  const L = [];
  const spawn = (l, fresh) => {
    const src = r() < 0.75 ? c : new THREE.Vector3(27, 4.2, -4);
    l.p = new THREE.Vector3(src.x + (r() - 0.5) * 5, src.y + (r() - 0.5) * 2, src.z + (r() - 0.5) * 5);
    if (fresh) l.p.y = 0.2 + r() * src.y;
    l.v = 0.35 + r() * 0.35; l.ph = r() * 6; l.spin = 1 + r() * 3; l.drift = (r() - 0.5) * 0.4; l.rest = 0;
  };
  for (let i = 0; i < N; i++) { const l = {}; spawn(l, true); L.push(l); }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  onUpdate((dt, t) => {
    L.forEach((l, i) => {
      if (l.p.y > 0.03) {
        l.p.y -= l.v * dt;
        l.p.x += (Math.sin(t * 1.3 + l.ph) * 0.35 + l.drift + 0.15) * dt;
        l.p.z += Math.cos(t * 1.1 + l.ph) * 0.3 * dt;
        e.set(t * l.spin + l.ph, t * 0.7 + l.ph, Math.sin(t * 2 + l.ph));
      } else {
        l.rest += dt;
        e.set(-Math.PI / 2, 0, l.ph);
        if (l.rest > 8) spawn(l, false);
      }
      q.setFromEuler(e);
      m.compose(l.p, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// ———— 雾：几层缓慢流动的雾带 ————
const mistVert = /* glsl */`
  varying vec3 vW; varying vec2 vUv;
  void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const mistFrag = /* glsl */`
  uniform float uTime, uOpacity, uScale; uniform vec3 uColor; uniform vec2 uWind; uniform sampler2D uNoise; varying vec3 vW; varying vec2 vUv;
  void main(){
    vec2 p = vW.xz * uScale + uWind * uTime;
    float n = texture2D(uNoise, p).r * 0.7 + texture2D(uNoise, p * 0.37 - uWind * uTime * 0.6 + 0.31).r * 0.6;
    float a = smoothstep(0.8, 1.3, n);
    vec2 e = abs(vUv - 0.5) * 2.0;
    a *= 1.0 - smoothstep(0.55, 1.0, max(e.x, e.y));
    float d = distance(cameraPosition, vW);
    a *= smoothstep(1.5, 9.0, d);
    if (vW.y < 2.0 && vW.x > -15.3 && vW.x < 15.3 && vW.z > -10.3 && vW.z < 12.2) discard;   // 贴地雾不进屋
    gl_FragColor = vec4(uColor, a * uOpacity);
  }`;

function mistSheets(root) {
  const sheets = [];
  const mk = (w, d, x, y, z, op, scale, wind, kind = 'valley') => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: scale * 0.3 }, uColor: { value: new THREE.Color('#ffffff') }, uWind: { value: new THREE.Vector2(...wind) }, uNoise: { value: T.cloudNoise() } },
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.renderOrder = 5;
    m.userData.dynamic = true;
    root.add(m);
    sheets.push({ mat, op, kind, m });
  };
  // 山谷里：只铺在地形远低于雾层的地方，免得雾片插进山坡、远看拉出竖条纹
  mk(220, 420, 0, -14, 260, 0.85, 0.012, [0.01, 0.004]);
  mk(200, 360, 0, -30, 300, 0.9, 0.008, [0.008, 0.003]);
  mk(240, 300, 0, -48, 420, 0.8, 0.006, [0.006, 0.002]);
  // 贴地的晨雾（围墙里的前庭、院子、后院；屋子里面挖掉）
  mk(66, 40, 0.4, 0.6, -2.4, 0.25, 0.08, [0.05, 0.02], 'ground');
  onUpdate((dt, t) => {
    const mist = world.tod.mist ?? 0.3;
    for (const s of sheets) {
      s.mat.uniforms.uTime.value = t;
      const k = s.kind === 'ground' ? Math.max(0, mist - 0.4) / 0.6 : 0.25 + mist * 0.75;
      s.mat.uniforms.uOpacity.value = s.op * k;
      s.m.visible = s.op * k > 0.01;   // 看不见的雾层不画
      // 雾的颜色：跟着雾色走，但再亮一点
      s.mat.uniforms.uColor.value.copy(world.tod.fogColor || new THREE.Color('#ddd')).lerp(new THREE.Color('#ffffff'), world.tod.key === 'night' ? 0.05 : 0.35);
    }
  });
}

// ———— 光柱：太阳从窗/门照进屋里的那一束（在光柱体积里做一小段光线步进，边缘是软的）————
const shaftVert = /* glsl */`
  varying vec3 vW;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const shaftFrag = /* glsl */`
  uniform vec3 uC, uN, uU, uL, uColor; uniform float uW, uH, uLen, uK, uTime;
  varying vec3 vW;
  float dens(vec3 p){
    float t = dot(p - uC, uN) / dot(uL, uN);           // 沿光线方向离窗多远
    vec3 q = p - uL * t;                                 // 投回窗面
    float u = dot(q - uC, uU) / (uW * 0.5), v = (q.y - uC.y) / (uH * 0.5);
    float edge = smoothstep(1.0, 0.55, abs(u)) * smoothstep(1.0, 0.55, abs(v));
    float along = smoothstep(0.0, 0.35, t) * (1.0 - smoothstep(uLen * 0.35, uLen, t));
    float dust = 0.8 + 0.2 * sin(p.x * 7.0 + uTime * 0.7) * sin(p.z * 6.0 - uTime * 0.5) * sin(p.y * 5.0 + uTime * 0.3);
    return edge * along * dust * step(0.0, t);
  }
  void main(){
    vec3 ro = cameraPosition;
    vec3 rd = vW - ro;
    float total = length(rd);
    rd /= total;
    float seg = min(total, uLen * 1.6 + 2.0);
    vec3 start = vW - rd * seg;
    float acc = 0.0;
    const int N = 9;
    for (int i = 0; i < N; i++) {
      vec3 p = start + rd * seg * (float(i) + 0.5) / float(N);
      acc += dens(p);
    }
    float a = acc / float(N) * seg * uK * 0.9;
    gl_FragColor = vec4(uColor * a, a);
  }`;

function lightShafts(root) {
  const openings = [
    // 我的房间东窗（清晨）
    { c: [15.0, 5.95, 4.4], n: [1, 0, 0], w: 2.4, h: 1.4, k: 1.3 },
    // 东侧廊下的障子（清晨），按拉开的程度
    ...[0, 1].map((i) => ({ c: [15.0, 1.8, -5.4 + i * 2.4], n: [1, 0, 0], w: 2.4, h: 2.6, k: 0.8, bay: i })),
    // 东侧廊下的窗
    ...[-8.6, 1.4, 5.4, 8.6].map((z) => ({ c: [15.0, 2.1, z], n: [1, 0, 0], w: z === -8.6 || z === 8.6 ? 1.6 : 2.4, h: 1.2, k: 0.6 })),
    // 南面：广缘玻璃门、作业间、我的房间、书房（午后）
    { c: [-4.5, 1.75, 10.0], n: [0, 0, 1], w: 8.6, h: 2.5, k: 0.5 },
    { c: [6.5, 1.75, 10.0], n: [0, 0, 1], w: 10.6, h: 2.5, k: 0.5 },
    { c: [1.5, 5.45, 10.0], n: [0, 0, 1], w: 8.2, h: 2.4, k: 0.6 },
    { c: [10.5, 5.45, 10.0], n: [0, 0, 1], w: 7.8, h: 2.4, k: 0.6 },
    { c: [-7.0, 5.7, 10.0], n: [0, 0, 1], w: 5.0, h: 1.4, k: 0.6 },
    // 西面（黄昏）：楼梯厅高窗、浴室窗、玄关门
    { c: [-15.0, 5.8, -6.0], n: [-1, 0, 0], w: 4.0, h: 1.6, k: 1.1 },
    { c: [-15.0, 1.9, 7.75], n: [-1, 0, 0], w: 2.9, h: 1.4, k: 0.9 },
  ];
  const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const idx = [];
  for (const f of faces) idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);
  const flipped = [];
  for (let i = 0; i < idx.length; i += 3) flipped.push(idx[i], idx[i + 2], idx[i + 1]);
  const beams = openings.map((o) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    const n = new THREE.Vector3(...o.n);
    const u = Math.abs(n.x) > 0.5 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    // 保证三角形朝外，这样 BackSide 才是光柱内壁
    geo.setIndex(new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 1, 0)).dot(n) < 0 ? flipped : idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: shaftVert, fragmentShader: shaftFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      uniforms: {
        uC: { value: new THREE.Vector3(...o.c) }, uN: { value: n }, uU: { value: u }, uL: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Color() }, uW: { value: o.w }, uH: { value: o.h }, uLen: { value: 4 }, uK: { value: 0 }, uTime: { value: 0 },
      },
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.renderOrder = 6; m.userData.dynamic = true;
    root.add(m);
    return { o, geo, mat, n, u, m };
  });
  const last = new THREE.Vector3(9, 9, 9);
  const L = new THREE.Vector3();
  onUpdate((dt, t) => {
    const sd = world.tod.sunDir;
    if (!sd) return;
    const changed = last.distanceToSquared(sd) > 1e-7;
    if (changed) last.copy(sd);
    L.copy(sd).negate();
    for (const b of beams) {
      const { o, n, u, mat, geo } = b;
      const facing = Math.max(0, sd.dot(n));
      let k = facing * o.k * Math.min(1, Math.max(0, sd.y) * 10) * (world.tod.key === 'night' ? 0 : 1) * Math.min(1, (world.tod.day ?? 1) * 1.6);
      if (o.bay !== undefined && world.eastBays) k *= world.eastBays[o.bay]();
      mat.uniforms.uK.value = k;
      b.m.visible = k > 0.003;   // 没有阳光照进来的窗不画光柱
      mat.uniforms.uTime.value = t;
      mat.uniforms.uColor.value.copy(world.tod.sunColor).multiplyScalar(0.5);
      if (!changed) continue;
      mat.uniforms.uL.value.copy(L);
      const floorY = o.c[1] > F2 ? F2 : F1;
      const len = Math.min(7, (o.c[1] + o.h / 2 - floorY) / Math.max(0.1, -L.y) + 0.5);
      mat.uniforms.uLen.value = len;
      const c = new THREE.Vector3(...o.c);
      const pos = geo.attributes.position;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b2], k2) => {
        const p = c.clone().addScaledVector(u, a * o.w / 2 * 1.05).add(new THREE.Vector3(0, b2 * o.h / 2 * 1.05, 0));
        pos.setXYZ(k2, p.x, p.y, p.z);
        const q = p.clone().addScaledVector(L, len);
        pos.setXYZ(k2 + 4, q.x, q.y, q.z);
      });
      pos.needsUpdate = true;
      geo.computeBoundingSphere();
    }
  });
}

export function buildAtmosphere(root, camera) {
  const G = new THREE.Group();
  root.add(G);
  const motes = spiritMotes(G);
  murasameGlow(G);
  fallingLeaves(G);
  mistSheets(G);
  lightShafts(G);
  addEventListener('resize', () => { motes.uniforms.uPR.value = Math.min(devicePixelRatio, 1.75); });
  motes.uniforms.uPR.value = Math.min(devicePixelRatio, 1.75);
  return G;
}
