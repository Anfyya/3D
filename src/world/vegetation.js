import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M } from '../core/materials.js';
import * as T from '../core/textures.js';
import { mulberry32, fbm } from '../core/util.js';
import { addCircle, onUpdate } from '../core/build.js';

const UP = new THREE.Vector3(0, 1, 0);

// 两点之间的锥形圆柱（树枝）
function limb(p1, p2, r1, r2, seg = 7) {
  const d = new THREE.Vector3().subVectors(p2, p1);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  g.applyQuaternion(q);
  g.translate(p1.x, p1.y, p1.z);
  // 统一 UV 比例，免得树皮被拉伸
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 1.5);
  return g;
}

// 一簇叶子 = 三张交叉的透明卡片；法线指向树冠中心外侧，看起来是圆鼓鼓的一团
function leafCards(center, crownCenter, size, r, out) {
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(size, size);
    const e = new THREE.Euler(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    g.translate(center.x, center.y, center.z);
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const n = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(crownCenter);
      n.y *= 0.7; n.y += 0.35 * n.length();
      n.normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    out.push(g);
  }
}

const leafMats = {};
function leafMat(kind, palette, seed) {
  const key = kind + palette.join() + seed;
  if (!leafMats[key]) {
    const map = T.leafCluster({ kind, palette, seed, count: kind === 'bamboo' ? 70 : kind === 'needle' ? 120 : 150 });
    leafMats[key] = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, emissive: new THREE.Color(palette[0]), emissiveIntensity: 0.08 });
    leafMats[key].emissiveMap = map;
  }
  return leafMats[key];
}

export const PALETTES = {
  maple: ['#c42a1c', '#dd4a22', '#e8702a', '#b0221a', '#f09a35', '#cf3b20'],
  mapleEarly: ['#d9471f', '#e8822e', '#c8a338', '#9aa042', '#e05a26'],
  persimmon: ['#c9a33a', '#8f9a3e', '#d9822a', '#a8ad48', '#e09a3a'],
  ginkgo: ['#f2c93a', '#e8b52a', '#f6d860', '#d9a428'],
  green: ['#5f7d3a', '#4f6b32', '#76904a', '#3f5a2c'],
  pine: ['#2f4a2c', '#3d5a34', '#24392a', '#4a6a3a'],
  bamboo: ['#7a9a4a', '#6a8a3e', '#94b05a', '#5a7a36'],
};

// 生成一棵树的几何（局部坐标）：树皮 + 叶卡片
export function treeGeometry({ height = 8, crown = 3.2, crownY = 0.62, trunkR = 0.22, seed = 1, clusters = 46, cardSize = 1.5, lean = 0, mains = null, minX = -Infinity } = {}) {
  // minX：叶子不能伸到这个 x 以西（免得穿进屋里）
  const clampX = (p) => { if (p.x < minX) p.x = minX + Math.random() * 0.5; return p; };
  const r = mulberry32(seed);
  const cc = new THREE.Vector3(Math.sin(lean) * 0.6, height * crownY, Math.cos(lean) * 0.2);
  const barks = [];
  const top = new THREE.Vector3(lean * 0.5, height * 0.38, 0);
  barks.push(limb(new THREE.Vector3(0, -0.3, 0), top, trunkR * 1.15, trunkR * 0.8, 9));
  const cards = [];
  const tips = [];
  const nMain = mains ?? 5 + Math.floor(r() * 2);
  for (let i = 0; i < nMain; i++) {
    const a = (i / nMain) * Math.PI * 2 + r() * 0.6;
    const out = new THREE.Vector3(Math.cos(a) * crown * (0.55 + r() * 0.3), height * (0.5 + r() * 0.25), Math.sin(a) * crown * (0.55 + r() * 0.3));
    out.add(new THREE.Vector3(cc.x, 0, cc.z));
    clampX(out);
    barks.push(limb(top, out, trunkR * 0.6, trunkR * 0.25, 6));
    for (let j = 0; j < 3; j++) {
      const b = clampX(out.clone().add(new THREE.Vector3((r() - 0.5) * crown * 0.7, r() * height * 0.18, (r() - 0.5) * crown * 0.7)));
      barks.push(limb(out, b, trunkR * 0.22, trunkR * 0.08, 5));
      tips.push(b);
    }
  }
  for (let i = 0; i < clusters; i++) {
    // 叶簇大多在树冠外壳上
    const u = r() * Math.PI * 2, v = Math.acos(1 - 2 * Math.pow(r(), 0.8));
    const rad = 0.65 + 0.35 * Math.sqrt(r());
    const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * crown * rad, Math.cos(v) * crown * 0.72 * rad, Math.sin(v) * Math.sin(u) * crown * rad).add(cc);
    if (p.y < height * 0.38) p.y = height * 0.38 + r();
    // 靠屋子那一侧的叶子稀一点：既不穿墙，早上的阳光也能透过叶缝照进窗
    if (p.x < minX) { if (r() < 0.6) continue; clampX(p); }
    leafCards(p, cc, cardSize * (0.8 + r() * 0.5), r, cards);
  }
  for (const t of tips) leafCards(t, cc, cardSize * 0.9, r, cards);
  return { bark: mergeGeometries(barks), leaves: mergeGeometries(cards), cc, r };
}

// 主角树：有枝干、有叶簇
export function heroTree(parent, x, z, y0, { height = 8, crown = 3.2, crownY = 0.62, trunkR = 0.22, kind = 'maple', palette = PALETTES.maple, seed = 1, clusters = 46, cardSize = 1.5, lean = 0, fruit = null, minX = -Infinity } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  parent.add(g);
  const tg = treeGeometry({ height, crown, crownY, trunkR, seed, clusters, cardSize, lean, minX: minX - x });
  const { cc, r } = tg;
  const bark = new THREE.Mesh(tg.bark, kind === 'ginkgo' ? M.trunkPale : M.trunk);
  bark.castShadow = true; bark.receiveShadow = true;
  g.add(bark);
  const leaves = new THREE.Mesh(tg.leaves, leafMat(kind === 'ginkgo' ? 'ginkgo' : kind === 'maple' ? 'maple' : 'oval', palette, seed));
  leaves.castShadow = true; leaves.receiveShadow = true;
  g.add(leaves);
  // 果子（柿子）
  if (fruit) {
    const fg = [];
    for (let i = 0; i < fruit; i++) {
      const u = r() * Math.PI * 2, v = Math.acos(1 - 2 * r());
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * crown * 0.92, Math.cos(v) * crown * 0.6, Math.sin(v) * Math.sin(u) * crown * 0.92).add(cc);
      const s = new THREE.SphereGeometry(0.075, 10, 8); s.scale(1, 0.85, 1); s.translate(p.x, p.y, p.z);
      fg.push(s);
    }
    const fm = new THREE.Mesh(mergeGeometries(fg), M.persimmon);
    fm.castShadow = true; g.add(fm);
  }
  // 微风里叶子轻轻晃
  const ph = r() * 10;
  onUpdate((dt, t) => { leaves.rotation.z = Math.sin(t * 0.9 + ph) * 0.012; leaves.rotation.x = Math.sin(t * 0.7 + ph) * 0.01; });
  addCircle(x, z, trunkR + 0.05, y0 - 1, y0 + 3);
  g.userData.dynamic = true;
  return { group: g, crownCenter: cc.clone().add(g.position) };
}

// 日式庭园的松：弯曲的树干 + 一层层平展的叶团
export function pineTree(parent, x, z, y0, { seed = 3, height = 4 } = {}) {
  const r = mulberry32(seed);
  const g = new THREE.Group(); g.position.set(x, y0, z); parent.add(g);
  const barks = [];
  let p = new THREE.Vector3(0, -0.2, 0);
  const pts = [p.clone()];
  for (let i = 0; i < 5; i++) {
    const n = p.clone().add(new THREE.Vector3((r() - 0.3) * 0.8, height / 5, (r() - 0.5) * 0.6));
    barks.push(limb(p, n, 0.2 - i * 0.03, 0.17 - i * 0.03, 7));
    p = n; pts.push(p.clone());
  }
  const pads = [];
  const padMat = new THREE.MeshStandardMaterial({ color: '#2f4a2c', roughness: 0.9, flatShading: false });
  for (let i = 1; i < pts.length; i++) {
    const base = pts[i];
    const n = i === pts.length - 1 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const end = base.clone().add(new THREE.Vector3(Math.cos(a) * (0.45 + r() * 0.6), (r() - 0.3) * 0.25, Math.sin(a) * (0.45 + r() * 0.6)));
      barks.push(limb(base, end, 0.07, 0.035, 5));
      const s = new THREE.IcosahedronGeometry(0.5, 2);
      const pos = s.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
        const f = 1 + fbm(vx * 2 + seed, vz * 2 + vy, 2) * 0.5;
        pos.setXYZ(v, vx * f, vy * f, vz * f);
      }
      s.scale(0.9 + r() * 0.4, 0.42, 0.8 + r() * 0.3);
      s.translate(end.x, end.y + 0.1, end.z);
      s.computeVertexNormals();
      pads.push(s);
    }
  }
  const bark = new THREE.Mesh(mergeGeometries(barks), M.trunk); bark.castShadow = true; g.add(bark);
  const padGeo = mergeGeometries(pads.map((q) => (q.index ? q.toNonIndexed() : q)));
  // 顶点色：上面亮下面暗
  const pos = padGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color('#6a8c48'), c2 = new THREE.Color('#2c4a2c');
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0 * 0) / height, 0, 1);
    const c = c2.clone().lerp(c1, 0.4 + t * 0.6 + (Math.random() - 0.5) * 0.15);
    col.set([c.r, c.g, c.b], i * 3);
  }
  padGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  padMat.vertexColors = true; padMat.color.set('#ffffff');
  const padMesh = new THREE.Mesh(padGeo, padMat); padMesh.castShadow = true; padMesh.receiveShadow = true; g.add(padMesh);
  addCircle(x, z, 0.25, y0 - 1, y0 + 3);
  g.userData.dynamic = true;
  return g;
}

// 竹林：实例化的竹竿 + 顶上的竹叶卡片
export function bambooGrove(parent, cx, cz, rx, rz, count, heightFn, seed = 9) {
  const r = mulberry32(seed);
  const stalkGeo = new THREE.CylinderGeometry(0.045, 0.055, 1, 7, 1);
  stalkGeo.translate(0, 0.5, 0);
  const stalks = new THREE.InstancedMesh(stalkGeo, M.bambooGreen, count);
  const cardGeo = new THREE.PlaneGeometry(2.2, 2.2);
  const cards = new THREE.InstancedMesh(cardGeo, leafMat('bamboo', PALETTES.bamboo, seed), count * 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let ci = 0;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d;
    const y = heightFn(x, z);
    const h = 6 + r() * 5;
    const tilt = new THREE.Euler((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
    q.setFromEuler(tilt);
    m.compose(p.set(x, y, z), q, s.set(1, h, 1));
    stalks.setMatrixAt(i, m);
    const topP = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
    for (let k = 0; k < 4; k++) {
      const e = new THREE.Euler(r() * 0.8 - 0.4, r() * Math.PI, r() * 0.8 - 0.4);
      q.setFromEuler(e);
      m.compose(p.set(topP.x + (r() - 0.5) * 0.8, topP.y - k * 1.1 - r() * 0.5, topP.z + (r() - 0.5) * 0.8), q, s.set(1, 1, 1));
      cards.setMatrixAt(ci++, m);
    }
  }
  stalks.castShadow = true; cards.castShadow = true; cards.receiveShadow = true;
  parent.add(stalks, cards);
  stalks.userData.dynamic = true; cards.userData.dynamic = true;
  return { stalks, cards };
}

// 山上的树林：近处用几种“叶卡片树”做实例化，远处用圆团子
// 杉：一层层向外下垂的针叶卡片，围成细长的塔形
function cedarGeometry(seed) {
  const r = mulberry32(seed);
  const tr = new THREE.CylinderGeometry(0.012, 0.03, 1, 6); tr.translate(0, 0.5, 0);
  const cards = [];
  const tiers = 11;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const y = 0.22 + t * 0.74;
    const rad = 0.2 * (1 - t) + 0.025;
    const n = Math.max(3, Math.round(7 * (1 - t) + 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8 + k;
      const size = 0.2 * (1 - t * 0.6) * (0.8 + r() * 0.4);
      const g = new THREE.PlaneGeometry(size * 1.4, size);
      g.rotateX(-0.5 - r() * 0.3);          // 往外往下垂
      g.rotateY(-a + Math.PI / 2);
      g.translate(Math.cos(a) * rad, y, Math.sin(a) * rad);
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let v = 0; v < pos.count; v++) {
        const nx = pos.getX(v), nz = pos.getZ(v);
        const n3 = new THREE.Vector3(nx, 0.6, nz).normalize();
        nor.setXYZ(v, n3.x, n3.y, n3.z);
      }
      cards.push(g);
    }
  }
  return { bark: tr, leaves: mergeGeometries(cards) };
}

export function forest(parent, points) {
  const variants = {
    maple: [{ seed: 201, palette: PALETTES.maple, kind: 'maple' }, { seed: 202, palette: PALETTES.mapleEarly, kind: 'maple' }],
    ginkgo: [{ seed: 211, palette: PALETTES.ginkgo, kind: 'ginkgo' }],
    green: [{ seed: 221, palette: PALETTES.green, kind: 'oval' }, { seed: 222, palette: ['#6d8a3a', '#8a9a42', '#a8a040', '#5d7a34'], kind: 'oval' }],
    brown: [{ seed: 231, palette: ['#b07030', '#c98a3a', '#9a5a28', '#d8a040'], kind: 'oval' }],
  };
  const near = points.filter((p) => !p.far), far = points.filter((p) => p.far);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const r = mulberry32(123);
  // —— 近处：卡片树 ——
  for (const [type, list] of Object.entries(variants)) {
    list.forEach((v, vi) => {
      const pts = near.filter((t, i) => t.type === type && (i % list.length) === vi);
      if (!pts.length) return;
      const tg = treeGeometry({ height: 1, crown: 0.42, crownY: 0.62, trunkR: 0.03, seed: v.seed, clusters: 16, cardSize: 0.3, mains: 4 });
      const bark = new THREE.InstancedMesh(tg.bark, v.kind === 'ginkgo' ? M.trunkPale : M.trunk, pts.length);
      const lm = leafMat(v.kind === 'oval' ? 'oval' : v.kind, v.palette, v.seed).clone();
      const leaves = new THREE.InstancedMesh(tg.leaves, lm, pts.length);
      pts.forEach((t, i) => {
        q.setFromAxisAngle(UP, r() * 6.28);
        m.compose(p.set(t.x, t.y - 0.2, t.z), q, s.set(t.h * 0.9, t.h, t.h * 0.9));
        bark.setMatrixAt(i, m); leaves.setMatrixAt(i, m);
        c.setScalar(0.85 + r() * 0.3); leaves.setColorAt(i, c);
      });
      for (const im of [bark, leaves]) { im.receiveShadow = true; im.userData.dynamic = true; parent.add(im); }
    });
  }
  // 杉
  const cedarPts = near.filter((t) => t.type === 'cedar');
  const cg = cedarGeometry(7);
  const cedarMat = leafMat('needle', ['#2c4a32', '#365a3a', '#22392a', '#3f6440'], 7).clone();
  const cBark = new THREE.InstancedMesh(cg.bark, M.trunk, cedarPts.length);
  const cedars = new THREE.InstancedMesh(cg.leaves, cedarMat, cedarPts.length);
  cedarPts.forEach((t, i) => {
    q.setFromAxisAngle(UP, r() * 6.28);
    m.compose(p.set(t.x, t.y - 0.2, t.z), q, s.set(t.h * 0.9, t.h * 1.05, t.h * 0.9));
    cedars.setMatrixAt(i, m); cBark.setMatrixAt(i, m);
    c.setScalar(0.8 + r() * 0.35); cedars.setColorAt(i, c);
  });
  for (const im of [cBark, cedars]) { im.receiveShadow = true; im.userData.dynamic = true; parent.add(im); }
  // —— 远处：一律用圆团子（细高的锥子远看会连成一道道竖条纹）——
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const puffs = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ roughness: 0.95 }), far.length * 2);
  let pi = 0;
  for (const t of far) {
    const cedar = t.type === 'cedar';
    for (let k = 0; k < 2; k++) {
      const w = (cedar ? 2.6 : t.s * 2.3) * (1 - k * 0.28);
      const hgt = cedar ? w * 1.5 : w * 0.85;
      m.compose(p.set(t.x + (r() - 0.5) * 1.5, t.y + (cedar ? 3.5 + k * 3 : t.h * (0.55 + k * 0.22)), t.z + (r() - 0.5) * 1.5), q.identity(), s.set(w, hgt, w));
      puffs.setMatrixAt(pi, m);
      c.set(t.color).multiplyScalar(0.9 + k * 0.12); puffs.setColorAt(pi++, c);
    }
  }
  puffs.count = pi;
  puffs.userData.dynamic = true;
  parent.add(puffs);
}

// 芒草一丛
export function susuki(parent, x, y, z, seed = 1, scale = 1) {
  const r = mulberry32(seed);
  const blades = [], plumes = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, tilt = 0.15 + r() * 0.35;
    const h = (0.8 + r() * 0.6) * scale;
    const g = new THREE.PlaneGeometry(0.03, h, 1, 3);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) { const yy = pos.getY(v); pos.setX(v, pos.getX(v) + Math.pow(yy / h, 2) * tilt * h * 0.6); }
    g.rotateY(a); g.translate(x, y, z);
    blades.push(g);
    if (i % 2 === 0) {
      const pl = new THREE.SphereGeometry(0.05, 6, 6); pl.scale(0.5, 3.2, 0.5);
      const tip = new THREE.Vector3(tilt * h * 0.6, h + 0.12, 0).applyAxisAngle(UP, a);
      pl.rotateZ(-tilt); pl.rotateY(a);
      pl.translate(x + tip.x, y + tip.y, z + tip.z);
      plumes.push(pl);
    }
  }
  const bm = new THREE.Mesh(mergeGeometries(blades), new THREE.MeshStandardMaterial({ color: '#9aa060', side: THREE.DoubleSide, roughness: 0.9 }));
  const pm = new THREE.Mesh(mergeGeometries(plumes), new THREE.MeshStandardMaterial({ color: '#efe4c6', roughness: 1, emissive: '#3a3020', emissiveIntensity: 0.2 }));
  bm.castShadow = true; pm.castShadow = true;
  parent.add(bm, pm);
  const ph = seed;
  onUpdate((dt, t) => { const w = Math.sin(t * 1.2 + ph) * 0.03; bm.rotation.z = w; pm.rotation.z = w; });
  bm.userData.dynamic = pm.userData.dynamic = true;
}

// 秋英（波斯菊）一片
export function cosmos(parent, cx, cz, rx, rz, n, y = 0, seed = 2) {
  const r = mulberry32(seed);
  const stems = [], heads = [], centers = [];
  const cols = ['#f2a0c0', '#e86fa0', '#fbe1ea', '#d9508a', '#ffffff'];
  const headGeos = {};
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * rx * 2, z = cz + (r() - 0.5) * rz * 2;
    const h = 0.5 + r() * 0.5;
    const st = new THREE.CylinderGeometry(0.005, 0.006, h, 3); st.translate(x, y + h / 2, z); stems.push(st);
    const hd = new THREE.CircleGeometry(0.045 + r() * 0.02, 8);
    hd.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.8); hd.rotateY(r() * 6);
    hd.translate(x, y + h, z);
    const col = cols[Math.floor(r() * cols.length)];
    (headGeos[col] = headGeos[col] || []).push(hd);
    const cc = new THREE.SphereGeometry(0.012, 5, 4); cc.translate(x, y + h + 0.01, z); centers.push(cc);
  }
  const stemM = new THREE.Mesh(mergeGeometries(stems), new THREE.MeshStandardMaterial({ color: '#5d7a3a' }));
  stemM.userData.static = true; stemM.castShadow = false; parent.add(stemM);
  for (const [col, gs] of Object.entries(headGeos)) {
    const m = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }));
    m.castShadow = false; m.userData.static = true; parent.add(m);
  }
  const cm = new THREE.Mesh(mergeGeometries(centers), new THREE.MeshStandardMaterial({ color: '#e8b830' }));
  cm.userData.static = true; parent.add(cm);
}

// 草丛（实例化的小草片）
export function grassTufts(parent, pts) {
  const g = new THREE.PlaneGeometry(0.35, 0.3);
  g.translate(0, 0.15, 0);
  const tex = T.canvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const rr = mulberry32(4);
    for (let i = 0; i < 40; i++) {
      const x = w * (0.1 + rr() * 0.8);
      c.strokeStyle = `hsl(${60 + rr() * 30},${35 + rr() * 20}%,${30 + rr() * 25}%)`;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + (rr() - 0.5) * 20, h * 0.5, x + (rr() - 0.5) * 30, h * (0.05 + rr() * 0.4)); c.stroke();
    }
  }, { repeat: false });
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  const im = new THREE.InstancedMesh(g, mat, pts.length * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let i = 0;
  for (const t of pts) {
    for (let k = 0; k < 2; k++) {
      q.setFromAxisAngle(UP, t.a + k * Math.PI / 2);
      m.compose(p.set(t.x, t.y, t.z), q, s.set(t.s, t.s, t.s));
      im.setMatrixAt(i++, m);
    }
  }
  im.receiveShadow = true;
  im.userData.dynamic = true;
  parent.add(im);
  return im;
}
