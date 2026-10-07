import * as THREE from 'three';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, mesh, group, registerLamp, interactive, onUpdate } from '../core/build.js';
import { mulberry32 } from '../core/util.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 软的东西（被褥、坐垫、枕头）用圆角方块
const softCache = new Map();
export function soft(parent, w, h, d, mat, x, y, z, { r, seg = 3, rx = 0, ry = 0, rz = 0, cast = true } = {}) {
  const rad = r ?? Math.min(w, h, d) * 0.45;
  const key = [w, h, d, rad, seg].map((v) => v.toFixed(3)).join('|') + (mat.userData?.tile ?? '');
  let geo = softCache.get(key);
  if (!geo) {
    geo = new RoundedBoxGeometry(w, h, d, seg, rad);
    const t = mat.userData?.tile;
    if (t) { const uv = geo.attributes.uv; const k = Math.max(w, d) / t; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); }
    softCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = true;
  m.userData.static = true;
  parent.add(m);
  return m;
}

// ———— 灯 ————
// 每个房间一盏点光源：白天当作天光反射的补光，晚上当灯用
export function roomLight(parent, x, y, z, { fill = 1, lamp = 6, levels, color = '#ffcf94', distance = 12 } = {}) {
  const l = new THREE.PointLight(color, 0, distance, 1.6);
  l.position.set(x, y, z);
  parent.add(l);
  const warm = new THREE.Color(color);
  const entry = { light: null, intensity: lamp, levels, cur: 0, from: 0, to: 0 };
  world.lamps.push(entry);
  world.fills = world.fills || [];
  // 由 timeofday 更新 intensity；这里自己混合颜色
  const tmp = new THREE.Color(), tmp2 = new THREE.Color();
  onUpdate(() => {
    const lv = entry.cur ?? 0;
    const fi = (world.tod.fillInt ?? 0.5) * fill;
    const li = lv * lamp;
    l.intensity = fi + li;
    tmp.copy(world.tod.fill || warm).multiplyScalar(fi).add(tmp2.copy(warm).multiplyScalar(li));
    const s = Math.max(1e-3, fi + li);
    l.color.copy(tmp.multiplyScalar(1 / s));
  });
  return entry;
}

// 发光的灯罩材质（每盏灯一份，好单独控制亮度）
export function glowMat(base = M.lampPaper, intensity = 1.6) {
  const m = base.clone();
  return { mat: m, base: intensity };
}

// 和纸吊灯
export function pendantLamp(parent, x, yCeil, z, { drop = 0.7, r = 0.22, levels, lightLamp = 6, fill = 1, shade = 'paper', light = true, distance = 12 } = {}) {
  const g = group(parent, x, 0, z);
  cyl(g, 0.004, 0.004, drop, M.black, 0, yCeil - drop / 2, 0, { cast: false, batch: false });
  const gm = glowMat(shade === 'enamel' ? M.bulb : M.lampPaper, 1.4);
  if (shade === 'paper') {
    const s = sphere(g, r, gm.mat, 0, yCeil - drop - r * 0.6, 0, { sy: 0.78, seg: 20, batch: false, cast: false });
    // 竹骨
    for (let i = -2; i <= 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * Math.sqrt(1 - (i / 3) ** 2) * 1.005, 0.003, 4, 24), M.woodMid);
      ring.rotation.x = Math.PI / 2; ring.position.y = yCeil - drop - r * 0.6 + (i / 3) * r * 0.78; g.add(ring);
    }
  } else {
    // 搪瓷灯罩 + 灯泡
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.12, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#e9e4d6', side: THREE.DoubleSide, roughness: 0.4 }));
    cone.position.y = yCeil - drop - 0.02; g.add(cone);
    sphere(g, 0.045, gm.mat, 0, yCeil - drop - 0.07, 0, { batch: false, cast: false });
  }
  g.userData.dynamic = true;
  world.lamps.push({ mats: [gm], levels, cur: 0, from: 0, to: 0 });
  if (!light) return null;
  return roomLight(parent, x, yCeil - drop - 0.75, z, { lamp: lightLamp, levels, fill, distance });
}

// 行灯（落地纸灯）
export function andon(parent, x, y, z, { levels } = {}) {
  const g = group(parent, x, y, z);
  const h = 0.62, w = 0.24;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, 0.025, h, 0.025, M.woodDark, sx * w / 2, h / 2, sz * w / 2);
  box(g, w + 0.04, 0.025, w + 0.04, M.woodDark, 0, h, 0);
  box(g, w + 0.04, 0.025, w + 0.04, M.woodDark, 0, 0.05, 0);
  const gm = glowMat(M.lampPaper, 1.8);
  const paper = box(g, w - 0.01, h * 0.7, w - 0.01, gm.mat, 0, h * 0.55, 0, { batch: false, cast: false });
  g.userData.dynamic = true;
  world.lamps.push({ mats: [gm], levels, cur: 0, from: 0, to: 0, flicker: true, phase: x * 3 });
  const l = new THREE.PointLight('#ffb978', 0, 4.5, 1.8);
  l.position.set(x, y + h * 0.6, z);
  parent.add(l);
  world.lamps.push({ light: l, intensity: 2.2, levels, cur: 0, from: 0, to: 0, flicker: true, phase: x * 3 });
  return g;
}

// 台灯
export function deskLamp(parent, x, y, z, ry = 0, { levels } = {}) {
  const g = group(parent, x, y, z, ry);
  cyl(g, 0.07, 0.08, 0.025, M.iron, 0, 0.012, 0);
  const a1 = cyl(g, 0.008, 0.008, 0.3, M.iron, 0, 0.16, 0.04, { rx: -0.25 });
  const a2 = cyl(g, 0.008, 0.008, 0.26, M.iron, 0, 0.36, 0.13, { rx: 0.9 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.1, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#3d5a46', side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }));
  shade.position.set(0, 0.42, 0.25); shade.rotation.x = 0.5; shade.castShadow = true; g.add(shade);
  const gm = glowMat(M.bulb, 3);
  sphere(g, 0.025, gm.mat, 0, 0.4, 0.27, { batch: false, cast: false });
  g.userData.dynamic = true;
  world.lamps.push({ mats: [gm], levels, cur: 0, from: 0, to: 0 });
  const l = new THREE.SpotLight('#ffd9a8', 0, 3, 1.0, 0.6, 1.5);
  const wp = new THREE.Vector3(0, 0.38, 0.27).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, y, z));
  l.position.copy(wp);
  l.target.position.copy(new THREE.Vector3(0, -0.2, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, y, z)));
  parent.add(l, l.target);
  world.lamps.push({ light: l, intensity: 4, levels, cur: 0, from: 0, to: 0 });
  return g;
}

// ———— 布艺 ————
export function zabuton(parent, x, y, z, ry = 0, mat = M.zabuton) {
  const g = group(parent, x, y, z, ry);
  soft(g, 0.56, 0.08, 0.6, mat, 0, 0.04, 0, { r: 0.035 });
  // 中间的线结
  box(g, 0.02, 0.012, 0.02, M.rope, 0, 0.082, 0);
  return g;
}

// 一套铺开的被褥：垫被 + 盖被 + 枕头（局部 -z 是头，+z 是脚）
export function futon(parent, x, y, z, ry, { cover = M.futonBlue, over = null, pillow = M.white, len = 2.0, w = 1.0 } = {}) {
  const g = group(parent, x, y, z, ry);
  soft(g, w, 0.08, len, M.sheet, 0, 0.04, 0, { r: 0.035 });
  // 盖被：从脚盖到胸口，靠头的一截掀开折回来
  const cl = len * 0.74;
  soft(g, w + 0.08, 0.11, cl, cover, 0, 0.125, len / 2 - cl / 2 + 0.03, { r: 0.05 });
  soft(g, w + 0.06, 0.07, 0.34, cover, 0, 0.2, len / 2 - cl + 0.2, { r: 0.03, rx: -0.1 });
  if (over) soft(g, w * 0.82, 0.08, 0.42, over, 0.02, 0.22, len / 2 - 0.3, { r: 0.03 });
  // 枕头（荞麦壳枕）
  soft(g, 0.5, 0.12, 0.3, pillow, 0, 0.13, -len / 2 + 0.26, { r: 0.05 });
  return g;
}

// 叠好的被褥一摞
export function futonStack(parent, x, y, z, ry, layers) {
  const g = group(parent, x, y, z, ry);
  let h = 0;
  for (const [mat, th, w, d] of layers) {
    soft(g, w, th, d, mat, 0, h + th / 2, 0, { r: Math.min(th * 0.45, 0.05) });
    h += th;
  }
  return { g, h };
}

// ———— 小物 ————
export function book(parent, x, y, z, ry, { w = 0.15, d = 0.21, t = 0.025, color = '#7a2e2a', open = false } = {}) {
  const g = group(parent, x, y, z, ry);
  const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  if (!open) {
    box(g, w, t, d, cm, 0, t / 2, 0);
    box(g, w - 0.01, t - 0.006, d - 0.006, M.paper, 0.005, t / 2, 0);
  } else {
    box(g, w * 2, 0.006, d, cm, 0, 0.003, 0);
    box(g, w * 0.98, t * 0.6, d * 0.97, M.paper, -w / 2, 0.006 + t * 0.3, 0, { rz: 0.03 });
    box(g, w * 0.98, t * 0.6, d * 0.97, M.paper, w / 2, 0.006 + t * 0.3, 0, { rz: -0.03 });
  }
  return g;
}

export function bowl(parent, x, y, z, r = 0.065, mat = M.ceramic, fill = null) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r * (0.45 + 0.55 * Math.sin(t * Math.PI / 2)), t * r * 0.85)); }
  const geo = new THREE.LatheGeometry(pts, 20);
  const m = mesh(parent, geo, new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness, side: THREE.DoubleSide }), x, y, z);
  if (fill) cyl(parent, r * 0.9, r * 0.6, 0.004, fill, x, y + r * 0.62, z, { cast: false });
  return m;
}

export function cup(parent, x, y, z, mat = M.ceramicGreen) {
  cyl(parent, 0.035, 0.028, 0.065, mat, x, y + 0.033, z);
  cyl(parent, 0.031, 0.031, 0.003, M.tea, x, y + 0.055, z, { cast: false });
}

export function teapot(parent, x, y, z, mat = M.ceramicBrown) {
  const g = group(parent, x, y, z);
  sphere(g, 0.08, mat, 0, 0.07, 0, { sy: 0.8 });
  cyl(g, 0.012, 0.018, 0.09, mat, 0.09, 0.08, 0, { rz: -0.9 });
  cyl(g, 0.03, 0.03, 0.02, mat, 0, 0.135, 0);
  cyl(g, 0.012, 0.012, 0.012, mat, 0, 0.15, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14, Math.PI), M.bamboo);
  handle.position.set(0, 0.12, 0); handle.rotation.y = Math.PI / 2; g.add(handle);
  return g;
}

// 带文字标签的罐子
export function jar(parent, x, y, z, label, { r = 0.06, h = 0.14, mat = M.ceramic, ry = 0 } = {}) {
  const g = group(parent, x, y, z, ry);
  cyl(g, r, r * 0.95, h, mat, 0, h / 2, 0, { seg: 20 });
  cyl(g, r * 0.75, r * 0.75, 0.02, M.woodLight, 0, h + 0.01, 0, { seg: 20 });
  cyl(g, 0.012, 0.012, 0.02, M.woodLight, 0, h + 0.03, 0);
  if (label) {
    const lt = T.textTex(label, { w: 128, h: 192, bg: '#efe2c2', vertical: true, size: 0.36 });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.95, h * 0.6), texMat(lt));
    lab.position.set(0, h * 0.5, r + 0.002); g.add(lab);
  }
  return g;
}

// 鞋
export function shoes(parent, x, y, z, ry, kind = 'loafer') {
  const g = group(parent, x, y, z, ry);
  for (const s of [-1, 1]) {
    const sg = group(g, s * 0.07, 0, 0, s * 0.04);
    if (kind === 'loafer') {
      const mat = new THREE.MeshStandardMaterial({ color: '#5b3624', roughness: 0.35 });
      box(sg, 0.085, 0.015, 0.24, M.black, 0, 0.008, 0);
      sphere(sg, 0.045, mat, 0, 0.035, 0.07, { sx: 0.95, sy: 0.6, sz: 1.3 });
      box(sg, 0.08, 0.05, 0.13, mat, 0, 0.04, -0.04);
    } else if (kind === 'zori') {
      box(sg, 0.075, 0.02, 0.2, M.straw, 0, 0.01, 0);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), M.red);
      strap.position.set(0, 0.02, 0.03); strap.rotation.x = -Math.PI / 2; strap.rotation.z = Math.PI; sg.add(strap);
    } else if (kind === 'slipper') {
      const mat = new THREE.MeshStandardMaterial({ color: '#7d6a8c', roughness: 0.9 });
      box(sg, 0.09, 0.018, 0.25, M.linen, 0, 0.009, 0);
      sphere(sg, 0.05, mat, 0, 0.02, 0.06, { sx: 0.9, sy: 0.45, sz: 1.1 });
    } else if (kind === 'geta') {
      box(sg, 0.09, 0.025, 0.22, M.woodLight, 0, 0.055, 0);
      box(sg, 0.085, 0.04, 0.025, M.woodLight, 0, 0.02, 0.06);
      box(sg, 0.085, 0.04, 0.025, M.woodLight, 0, 0.02, -0.06);
    }
  }
  return g;
}

// 日本刀（带鞘）
export function katana(parent, x, y, z, ry = 0, rz = 0) {
  const g = group(parent, x, y, z, ry);
  g.rotation.z = rz;
  const saya = new THREE.MeshStandardMaterial({ color: '#1f1a26', roughness: 0.2, metalness: 0.2 });
  box(g, 0.74, 0.032, 0.025, saya, 0.12, 0, 0);                      // 鞘
  box(g, 0.025, 0.036, 0.029, M.brass, -0.25, 0, 0);                  // 鞘口
  cyl(g, 0.045, 0.045, 0.008, M.iron, -0.265, 0, 0, { rz: Math.PI / 2 }); // 镡
  box(g, 0.26, 0.03, 0.026, new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.9 }), -0.4, 0, 0); // 柄
  for (let i = 0; i < 7; i++) box(g, 0.012, 0.034, 0.03, M.lacquerBlack, -0.29 - i * 0.034, 0, 0, { rz: 0.5 }); // 柄卷
  box(g, 0.02, 0.032, 0.028, M.brass, -0.535, 0, 0);
  // 下绪
  box(g, 0.25, 0.008, 0.01, new THREE.MeshStandardMaterial({ color: '#6a2a7a', roughness: 0.8 }), -0.05, -0.03, 0.02, { rz: -0.2 });
  return g;
}

// 怀表（打开的表盖 + 表链）
export function pocketWatch(parent, x, y, z, ry = 0) {
  const g = group(parent, x, y, z, ry);
  cyl(g, 0.026, 0.026, 0.01, M.brass, 0, 0.005, 0, { seg: 24 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshStandardMaterial({ color: '#f6f0e0', roughness: 0.4 }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.0105; g.add(face);
  // 指针
  const hand = (len, w, a) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.001, len), M.black);
    m.position.set(Math.sin(a) * len / 2, 0.0115, -Math.cos(a) * len / 2); m.rotation.y = -a; g.add(m); return m;
  };
  hand(0.012, 0.0025, 0.4);
  const minute = hand(0.018, 0.0018, 2.1);
  const second = hand(0.016, 0.0008, 0);
  // 秒针会走
  let t = 0;
  onUpdate((dt) => {
    t += dt;
    const a = Math.floor(t) * (Math.PI / 30);
    second.position.set(Math.sin(a) * 0.008, 0.0118, -Math.cos(a) * 0.008); second.rotation.y = -a;
  });
  // 表盖（立起来）
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24), M.brass);
  lid.position.set(0, 0.026, -0.027); lid.rotation.x = Math.PI / 2 + 0.25; g.add(lid);
  // 表冠 + 链子
  cyl(g, 0.005, 0.005, 0.008, M.brass, 0, 0.005, 0.03, { rx: Math.PI / 2 });
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.0018, 4, 30, Math.PI * 1.3), M.brass);
  chain.rotation.x = -Math.PI / 2; chain.position.set(0.02, 0.002, 0.065); g.add(chain);
  g.userData.dynamic = true;
  return g;
}

// 修表的小零件：按大小排成一排
export function watchParts(parent, x, y, z, ry = 0) {
  const g = group(parent, x, y, z, ry);
  box(g, 0.32, 0.004, 0.2, M.linen, 0, 0.002, 0, { uv: 'box' });
  const sizes = [0.022, 0.018, 0.015, 0.012, 0.01, 0.008, 0.006, 0.005];
  sizes.forEach((r, i) => {
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.002, 12), i % 3 === 0 ? M.copper : M.brass);
    gear.position.set(-0.13 + i * 0.035, 0.006, -0.05); g.add(gear);
  });
  // 螺丝
  for (let i = 0; i < 6; i++) cyl(g, 0.002, 0.002, 0.006, M.steel, -0.12 + i * 0.02, 0.007, 0.0, { rz: Math.PI / 2, cast: false });
  // 发条
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0015, 4, 20), M.steel);
  spring.rotation.x = -Math.PI / 2; spring.position.set(0.1, 0.005, 0.05); g.add(spring);
  // 镊子、放大镜、螺丝刀
  box(g, 0.1, 0.003, 0.006, M.steel, -0.06, 0.006, 0.06, { ry: 0.2 });
  cyl(g, 0.016, 0.018, 0.022, M.black, 0.02, 0.012, 0.06);
  cyl(g, 0.003, 0.003, 0.08, M.steel, 0.12, 0.006, -0.03, { rz: Math.PI / 2, ry: 0.4 });
  return g;
}

// 相框（旧木框，砂纸磨过，铜挂钩，素色布衬）
export function photoFrame(parent, x, y, z, ry = 0) {
  const g = group(parent, x, y, z, ry);
  const w = 0.2, h = 0.25;
  const fr = M.woodOld;
  box(g, w, 0.025, 0.02, fr, 0, h - 0.0125, 0);
  box(g, w, 0.025, 0.02, fr, 0, 0.0125, 0);
  box(g, 0.025, h, 0.02, fr, -w / 2 + 0.0125, h / 2, 0);
  box(g, 0.025, h, 0.02, fr, w / 2 - 0.0125, h / 2, 0);
  box(g, w - 0.04, h - 0.04, 0.004, M.linen, 0, h / 2, -0.004);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.5 }));
  glass.position.set(0, h / 2, 0.006); g.add(glass);
  // 背后支架和铜挂钩
  box(g, 0.03, h * 0.8, 0.01, fr, 0, h * 0.42, -0.06, { rx: -0.35 });
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 12), M.copper);
  hook.position.set(0, h - 0.03, -0.012); g.add(hook);
  g.rotation.x = -0.12;
  return g;
}

// 风筝（方形，竹骨 + 彩纸）
export function kite(parent, x, y, z, { ry = 0, rx = 0, paper = true, size = 0.7 } = {}) {
  const g = group(parent, x, y, z, ry);
  g.rotation.x = rx;
  const s = size;
  // 骨架：两根对角 + 四边
  box(g, s * 1.4, 0.008, 0.008, M.bamboo, 0, 0, 0, { rz: Math.PI / 4 });
  box(g, s * 1.4, 0.008, 0.008, M.bamboo, 0, 0, 0, { rz: -Math.PI / 4 });
  box(g, 0.008, s * 1.4, 0.008, M.bamboo, 0, 0, 0);
  if (paper) {
    const tex = T.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#f3ead6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c7352c'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2d4a7a'; c.lineWidth = 14; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#e9b23a'; c.font = 'bold 60px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    }, { repeat: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    p.rotation.z = Math.PI / 4; p.position.z = -0.006; p.castShadow = true; g.add(p);
  } else {
    // 只有骨架：四边绑着线
    const L = s * 0.7;
    for (const [a, b] of [[[0, L], [L, 0]], [[L, 0], [0, -L]], [[0, -L], [-L, 0]], [[-L, 0], [0, L]]]) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = box(g, len, 0.003, 0.003, M.rope, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, { rz: Math.atan2(b[1] - a[1], b[0] - a[0]) });
    }
  }
  return g;
}

// 线轴
export function spool(parent, x, y, z, color = '#e8dcc0', ry = 0) {
  const g = group(parent, x, y, z, ry);
  cyl(g, 0.03, 0.03, 0.008, M.woodLight, 0, 0.004, 0);
  cyl(g, 0.03, 0.03, 0.008, M.woodLight, 0, 0.066, 0);
  cyl(g, 0.024, 0.024, 0.055, new THREE.MeshStandardMaterial({ color, roughness: 1 }), 0, 0.035, 0);
  return g;
}

// 彩纸一叠
export function paperStack(parent, x, y, z, ry, colors) {
  const g = group(parent, x, y, z, ry);
  colors.forEach((c, i) => box(g, 0.3, 0.003, 0.22, new THREE.MeshStandardMaterial({ color: c, roughness: 1 }), (i % 2) * 0.012 - 0.006, 0.0015 + i * 0.003, (i % 3) * 0.01, { ry: (i - colors.length / 2) * 0.04 }));
  return g;
}

// 书架（带一排排书）。(cx, cz) 是占地中心，face 是书脊朝向
export function bookshelf(parent, cx, y0, cz, width, height, depth, { shelves = 4, face = 'z+', seed = 1 } = {}) {
  const ry = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 }[face];
  const g = group(parent, cx, y0, cz, ry);
  const t = 0.025, W = width, H = height, D = depth;
  box(g, W, H, t, M.woodMid, 0, H / 2, -D / 2 + t / 2);
  box(g, t, H, D, M.woodMid, -W / 2 + t / 2, H / 2, 0);
  box(g, t, H, D, M.woodMid, W / 2 - t / 2, H / 2, 0);
  for (let i = 0; i <= shelves; i++) {
    const y = (H - t) * (i / shelves);
    box(g, W, t, D, M.woodMid, 0, y + t / 2, 0);
    if (i < shelves) {
      const tex = T.bookSpines(seed + i);
      const bh = (H / shelves) * 0.78;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      box(g, W - 2 * t - 0.02, bh, D - 0.06, [M.paper, M.paper, M.paper, M.paper, mat, M.paper], 0, y + t + bh / 2, 0.005, { uv: 'box' });
    }
  }
  return g;
}

// 矮桌（座卓）
export function lowTable(parent, x0, z0, x1, z1, y, h = 0.33, mat = M.woodMid) {
  const g = group(parent);
  boxMM(g, x0, y + h - 0.035, z0, x1, y + h, z1, mat, { collide: true });
  const inset = 0.06;
  for (const [x, z] of [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset]]) {
    boxMM(g, x - 0.035, y, z - 0.035, x + 0.035, y + h - 0.035, z + 0.035, mat);
  }
  boxMM(g, x0 + 0.04, y + h - 0.08, z0 + 0.04, x1 - 0.04, y + h - 0.035, z1 - 0.04, mat);
  return g;
}

export function roundTable(parent, x, y, z, r = 0.5, h = 0.33) {
  const g = group(parent, x, y, z);
  cyl(g, r, r, 0.03, M.woodMid, 0, h - 0.015, 0, { seg: 32, collide: true });
  cyl(g, r - 0.04, r - 0.04, 0.04, M.woodDark, 0, h - 0.05, 0, { seg: 32 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; box(g, 0.05, h - 0.06, 0.05, M.woodDark, Math.cos(a) * (r - 0.12), (h - 0.06) / 2, Math.sin(a) * (r - 0.12)); }
  return g;
}

// 蒸汽：几团慢慢上升、变淡的白色粒子
export function steam(parent, x, y, z, { rate = 3, spread = 0.08, rise = 0.35, size = 0.25, life = 2.6, opacity = 0.22 } = {}) {
  const N = Math.ceil(rate * life) + 2;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), age = new Float32Array(N), seed = new Float32Array(N);
  const r = mulberry32(Math.floor(x * 100 + z * 7));
  for (let i = 0; i < N; i++) { age[i] = (i / N) * life; seed[i] = r(); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: T.softDot() }, uLife: { value: life }, uSize: { value: size }, uOpacity: { value: opacity }, uColor: { value: new THREE.Color('#ffffff') } },
    vertexShader: `attribute float aAge; attribute float aSeed; uniform float uLife, uSize; varying float vA;
      void main(){ float t = aAge / uLife; vA = t; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (0.4 + t * 1.2) * 600.0 / -mv.z; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uColor; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * uOpacity * smoothstep(0.0, 0.15, vA) * (1.0 - vA); gl_FragColor = vec4(uColor, a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.dynamic = true;
  parent.add(pts);
  onUpdate((dt, t) => {
    for (let i = 0; i < N; i++) {
      age[i] += dt;
      if (age[i] > life) age[i] -= life;
      const k = age[i] / life, s = seed[i];
      pos[i * 3] = x + Math.sin(s * 30 + k * 4 + t * 0.7) * spread * (0.3 + k) + (s - 0.5) * spread;
      pos[i * 3 + 1] = y + k * rise * life;
      pos[i * 3 + 2] = z + Math.cos(s * 17 + k * 3 + t * 0.5) * spread * (0.3 + k);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAge.needsUpdate = true;
  });
  return { pts, mat };
}

// 文字牌子（平面）
export function sign(parent, text, x, y, z, ry, { w = 0.12, h = 0.36, vertical = true, bg = '#efe2c2', color = '#2a2420', size = 0.36, border } = {}) {
  const tex = T.textTex(text, { w: Math.round(256 * w / h), h: 256, bg, color, vertical, size, border });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texMat(tex));
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = false; m.receiveShadow = true;
  parent.add(m);
  return m;
}
