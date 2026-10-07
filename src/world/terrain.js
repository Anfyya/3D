import * as THREE from 'three';
import { M } from '../core/materials.js';
import * as T from '../core/textures.js';
import { fbm, noise2, smooth, clamp, mulberry32 } from '../core/util.js';
import { boxMM, box, cyl, group, addCollider, area } from '../core/build.js';

// 地形是解析函数：玩家走路时直接算高度，不用对地面做射线
// 北边（-z）是山，往上通温泉街和神社；南边（+z）往下是镇口和山谷
import { PLOT, STAIR, COMPOUND } from './layout.js';
export { PLOT, STAIR };

function inRect(x, z, r, m = 0) { return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; }

export function stairProfile(z) {
  if (z < STAIR.landing0) return (STAIR.landing0 - z) * 0.55;
  if (z > STAIR.landing1) return -(z - STAIR.landing1) * 0.5;
  return 0;
}

function hill(x, z) {
  let h = 0;
  const n = PLOT.z0 - 0.5 - z;
  if (n > 0) { const nn = Math.min(n, 70); h += 1.9 + nn * 0.62 + nn * nn * 0.004 + Math.max(0, n - 70) * 0.45; }
  else if (n > -0.5) h += 1.9 * smooth(-0.5, 0, n);
  const s = z - PLOT.z1 - 0.3;
  if (s > 0) h -= 2.6 + 52 * (1 - Math.exp(-s / 55)) + Math.max(0, z - 300) * 0.15;
  else if (s > -0.3) h -= 2.6 * smooth(-0.3, 0, s);
  const e = x - PLOT.x1 - 0.5;
  if (e > 0) h += 0.8 + e * 0.32 * (z < 0 ? 1.4 : 0.8);
  const w = STAIR.x0 - 8 - x;
  if (w > 0) h += 0.6 + w * 0.38;
  // 远离宿舍的地方加起伏
  const d = Math.hypot(Math.max(0, Math.abs(x - 7) - 30), Math.max(0, Math.abs(z + 2) - 22));
  h += fbm(x * 0.018, z * 0.018, 5) * Math.min(1, d / 30) * 14;
  // 东北方向是神社所在的山，更高一些
  h += Math.min(70, Math.max(0, -z - 20) * Math.max(0, x - 5) * 0.004);
  // 远处的山坡平滑封顶，不然地图边缘会长出几百米高的陡墙
  if (h > 0) h = 150 * Math.tanh(h / 150);
  return h;
}

export function terrainHeight(x, z) {
  if (inRect(x, z, PLOT)) return 0;
  const sp = stairProfile(z);
  if (x >= STAIR.x0 && x <= STAIR.x1) return sp;
  // 石阶两边几米内向石阶高度过渡
  const dx = x < STAIR.x0 ? STAIR.x0 - x : x - STAIR.x1;
  const hh = hill(x, z);
  if (dx < 6 && !inRect(x, z, PLOT, 0.01)) {
    const t = smooth(0, 6, dx);
    return sp * (1 - t) + hh * t;
  }
  return hh;
}

// 地面颜色：草、落叶、泥土、苔藓
function groundColor(x, z, h, out) {
  const nn = fbm(x * 0.08, z * 0.08, 3);
  const big = fbm(x * 0.012 + 3, z * 0.012, 3);
  // 秋天的草：黄绿 → 枯黄
  const grass = new THREE.Color().setHSL(0.23 + big * 0.05, 0.36, 0.33 + nn * 0.08);
  const dry = new THREE.Color().setHSL(0.12, 0.45, 0.44 + nn * 0.06);
  out.copy(grass).lerp(dry, clamp(0.12 + big * 0.9, 0, 0.75));
  // 远处山坡是林地：深一点，掺红叶色
  const far = Math.hypot(x - 7, z + 2);
  if (far > 30) {
    const forest = new THREE.Color().setHSL(0.08 + big * 0.12, 0.45, 0.25 + nn * 0.06);
    out.lerp(forest, smooth(30, 60, far));
  }
  // 后院：练刀踩实的泥地
  if (x > -14 && x < 26 && z > -21.6 && z < -10.6) {
    const t = smooth(0, 1.2, Math.min(x + 14, 26 - x, z + 21.6, -10.6 - z));
    out.lerp(new THREE.Color('#a08566').multiplyScalar(0.92 + nn * 0.2), t * 0.85);
  }
  // 门前的小路
  if (x > -31.6 && x < -15 && z > -0.4 && z < 2.4) out.lerp(new THREE.Color('#8f846f'), 0.6);
  // 院子里的苔藓
  if (x > 17 && x < 32 && z > -10 && z < 16) out.lerp(new THREE.Color('#5d7040').multiplyScalar(0.9 + nn * 0.3), 0.55 * smooth(-0.1, 0.25, nn + 0.1));
  // 房子底下压暗
  if (x > -15.5 && x < 15.5 && z > -10.5 && z < 10.5) out.multiplyScalar(0.55);
  return out;
}

function buildTerrainMesh(x0, x1, z0, z1, step, sink = null) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = terrainHeight(x, z);
    if (sink && x > sink.x0 && x < sink.x1 && z > sink.z0 && z < sink.z1) h -= 2;
    pos.setY(i, h);
    groundColor(x, z, h, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    uv.setXY(i, x / 4, z / 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildTerrain(root) {
  const G = group(root);
  const detail = T.groundDetail();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1 });
  const near = new THREE.Mesh(buildTerrainMesh(-80, 80, -80, 80, 0.6), mat);
  near.receiveShadow = true;
  G.add(near);
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const far = new THREE.Mesh(buildTerrainMesh(-500, 500, -500, 500, 5, { x0: -78, x1: 78, z0: -78, z1: 78 }), farMat);
  far.receiveShadow = false;
  G.add(far);

  buildStairs(G);
  buildWalls(G);
  return G;
}

// ———— 长石阶 ————
function buildStairs(G) {
  const r = mulberry32(77);
  const { x0, x1 } = STAIR;
  // 往上（北）
  const flights = [
    { from: STAIR.landing0, to: -76, dir: -1 },
    { from: STAIR.landing1, to: 70, dir: 1 },
  ];
  for (const f of flights) {
    const run = 0.32;
    let z = f.from;
    while ((f.dir < 0 && z > f.to) || (f.dir > 0 && z < f.to)) {
      const zn = z + f.dir * run;
      const yTop = (stairProfile(z) + stairProfile(zn)) / 2 + 0.06;
      const yBot = Math.min(stairProfile(z), stairProfile(zn)) - 0.6;
      const jitter = (r() - 0.5) * 0.06;
      const za = Math.min(z, zn), zb = Math.max(z, zn);
      // 每一级是两三块石板拼成
      let x = x0 + 0.05;
      while (x < x1 - 0.1) {
        const w = Math.min(x1 - 0.05 - x, 0.6 + r() * 0.7);
        const f2 = 0.85 + r() * 0.3;
        boxMM(G, x + 0.01, yBot, za + 0.01, x + w - 0.01, yTop + jitter * 0.3, zb - 0.01, r() < 0.5 ? M.granite : M.stoneWarm, { cast: false });
        x += w;
      }
      z = zn;
    }
  }
  // 平台（宿舍门口）石板
  boxMM(G, x0, -0.4, STAIR.landing0, x1, 0.02, STAIR.landing1, M.granite, { cast: false });
  // 两边的路缘石
  for (const xs of [x0 - 0.12, x1 + 0.12]) {
    for (let z = -76; z < 70; z += 1.4) {
      if (z > STAIR.landing0 - 0.2 && z < STAIR.landing1 + 0.2) continue;
      const y = stairProfile(z + 0.7);
      boxMM(G, xs - 0.1, y - 0.5, z, xs + 0.1, y + 0.14, z + 1.38, M.stoneDark, { cast: false });
    }
  }
}

// ———— 石垣 ————
function wall(G, axis, c, a0, a1, yTopFn, yBotFn, thick = 0.6, collide = true) {
  // 分段做，跟着地形高度走
  const seg = 1.0;
  for (let a = a0; a < a1 - 1e-3; a += seg) {
    const b = Math.min(a1, a + seg);
    const m = (a + b) / 2;
    const yt = Math.max(yTopFn(m, a, b), yBotFn(m) + 0.05), yb = yBotFn(m) - 0.8;
    if (yt - yb < 0.1) continue;
    if (axis === 'x') boxMM(G, a, yb, c - thick / 2, b, yt, c + thick / 2, M.stoneWall, { cast: true });
    else boxMM(G, c - thick / 2, yb, a, c + thick / 2, yt, b, M.stoneWall, { cast: true });
    if (collide) {
      if (axis === 'x') addCollider(a, yb, c - thick / 2, b, yt, c + thick / 2);
      else addCollider(c - thick / 2, yb, a, c + thick / 2, yt, b);
    }
  }
}

function buildWalls(G) {
  const P = PLOT;
  // 后院北面：挡土墙（上面是山）
  wall(G, 'x', P.z0 - 0.3, P.x0 - 0.3, 28.6, (m) => Math.max(terrainHeight(m, P.z0 - 1.2), 0) + 0.15, () => 0);
  wall(G, 'x', P.z0 - 0.3, 31.0, P.x1 + 0.3, (m) => Math.max(terrainHeight(m, P.z0 - 1.2), 0) + 0.15, () => 0);
  // 南面：平台边缘往下的石垣
  wall(G, 'x', P.z1 + 0.3, P.x0 - 0.3, P.x1 + 0.3, () => 0.25, (m) => Math.min(terrainHeight(m, P.z1 + 1.2), 0));
  // 东面
  wall(G, 'z', P.x1 + 0.3, P.z0, P.z1, (m) => Math.max(terrainHeight(P.x1 + 1.2, m), 0) + 0.15, (m) => Math.min(terrainHeight(P.x1 + 1.2, m), 0));
  // 西面（挨着石阶）：北段石阶比平台高，南段比平台低
  wall(G, 'z', STAIR.x1 + 0.12, P.z0 - 0.6, STAIR.landing0 - 0.15, (m) => stairProfile(m) + 0.12, () => 0, 0.36);
  wall(G, 'z', STAIR.x1 + 0.12, STAIR.landing1 + 0.15, P.z1 + 0.6, () => 0.3, (m) => stairProfile(m), 0.36);
  // 石阶外侧的护栏碰撞（防止从石阶边上走进山坡太远）
}

// 可行走范围：只在围墙里面（围墙本身也有碰撞，这里是保险）
export function worldLimit(x, z) {
  const C = COMPOUND, m = 0.5;
  if (x < C.x0 + m || x > C.x1 - m || z < C.z0 + m || z > C.z1 - m) return '围墙外面今天就不去了。';
  return null;
}

export function terrainAreas() {
  area('前庭', COMPOUND.x0, COMPOUND.z0, -16.5, COMPOUND.z1, -2, 8, 1);
  area('大门', COMPOUND.x0, -3.5, -28.5, 5.5, -2, 8, 2);
  area('院子', 16.5, -10, COMPOUND.x1, COMPOUND.z1, -2, 5, 1);
  area('后院', -16.5, COMPOUND.z0, COMPOUND.x1, -10.3, -2, 5, 1);
  area('南庭', -16.5, 11.5, 16.5, COMPOUND.z1, -2, 5, 0);
}
