import * as THREE from 'three';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, mesh, group, interactive, addCollider, addCircle, onUpdate, registerLamp, slot, lampFixture } from '../core/build.js';
import { mulberry32, fbm } from '../core/util.js';
import { heroTree, pineTree, bambooGrove, forest, susuki, cosmos, grassTufts, PALETTES } from './vegetation.js';
import { terrainHeight, PLOT, STAIR, stairProfile } from './terrain.js';
import { COMPOUND } from './layout.js';
import { buildCompound } from './compound.js';
import * as P from './props.js';

const TXT = {
  maple: '窗外这棵树是枫树。十月初，叶子从树梢开始红，靠近窗的那几枝已经红透了。清早起雾的时候，红叶就浮在雾上；丛雨从神社飘过来，总是先停在这棵树和窗子之间。',
  persimmon: '院子里的柿子树结满了果子。亚托莉摘了一些削皮挂在檐下做柿饼，剩下的留在树上——她说要给鸟留一点。',
  hoshigaki: '檐下挂着一串串削了皮的柿子，正在风干。再过几个星期就是柿饼了。',
  makiwara: '练刀用的卷藁。丛雨在后院挥丛雨丸，一练就是一个早上。卷藁上的切口很整齐。',
  well: '一口老井，上面盖着木盖子。现在用水都是山上引下来的温泉水，这口井基本只用来冰西瓜——不过现在已经是秋天了。',
  lantern: '石灯笼。傍晚亚托莉会把里面的蜡烛点上。',
  pond: '小池子里养着几条锦鲤。落进水里的红叶在水面上转圈。',
  shrinePath: '往东北顺着山道上去就是建实神社。丛雨以前每天夜里回神社，贴着御神体静息；现在她把静息的地方挪到了宿舍。',
  firewood: '劈好的柴码在北面屋檐下。冬天地炉要烧的。',
};

export function buildGarden(root) {
  const G = group(root);

  // ———— 窗外的枫树（我的房间东窗正对着）————
  const maple = heroTree(G, 20.0, 4.4, 0, { height: 10, crown: 3.6, crownY: 0.62, trunkR: 0.27, palette: PALETTES.maple, seed: 11, clusters: 64, cardSize: 1.7, lean: -0.3, minX: 17.6 });
  // 交互用一个看不见的体积包住树冠
  // 拾取体积往东挪，免得在房间里点桌上东西时先点中树
  const pick = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(20.8, maple.crownCenter.y, 4.4); G.add(pick);
  interactive(pick, { name: '窗外的枫树', text: TXT.maple });
  world.mapleCrown = maple.crownCenter;

  // ———— 院子 ————
  // 柿子树 + 檐下的柿饼
  const kaki = heroTree(G, 27, -4, 0, { height: 6.5, crown: 2.7, crownY: 0.6, trunkR: 0.2, kind: 'oval', palette: PALETTES.persimmon, seed: 21, clusters: 40, cardSize: 1.3, fruit: 46 });
  const kp = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  kp.position.copy(kaki.crownCenter); G.add(kp);
  interactive(kp, { name: '柿子树', text: TXT.persimmon });
  slot('院子·柿子树下', { rect: [25.2, -5.0, 26.5, -3.0], y: terrainHeight(25.85, -4.0), face: 'x-' });
  const hg = group(G);
  for (let k = 0; k < 4; k++) {
    const z = -8.0 + k * 0.6;
    cyl(hg, 0.004, 0.004, 1.2, M.rope, 16.55, 3.35, z, { cast: false });
    for (let i = 0; i < 7; i++) sphere(hg, 0.045, M.persimmonDried, 16.55, 2.85 + i * 0.13, z, { sy: 1.2, seg: 8, segV: 6 });
  }
  boxMM(hg, 16.51, 3.92, -8.4, 16.59, 3.96, -5.6, M.bamboo);
  interactive(hg, { name: '檐下的柿饼', text: TXT.hoshigaki });

  // 庭园的松
  pineTree(G, 23.5, 13.2, 0, { seed: 5, height: 3.2 });

  // 池子
  const pond = group(G, 25, 0, 8.5);
  const shape = new THREE.Shape();
  const r = mulberry32(31);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2, rad = 1.9 + Math.sin(a * 2 + 1) * 0.5 + r() * 0.2;
    const px = Math.cos(a) * rad * 1.25, pz = Math.sin(a) * rad * 0.85;
    i ? shape.lineTo(px, pz) : shape.moveTo(px, pz);
  }
  const wgeo = new THREE.ShapeGeometry(shape, 24);
  wgeo.rotateX(Math.PI / 2);
  const water = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: '#2f5a5e', roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.88 }));
  water.position.y = 0.03; water.receiveShadow = true; pond.add(water);
  const bed = new THREE.Mesh(wgeo.clone(), new THREE.MeshStandardMaterial({ color: '#2a3a30', roughness: 1 }));
  bed.position.y = 0.012; pond.add(bed);
  // 池边石
  const pts = shape.getPoints(24);
  pts.forEach((pp, i) => {
    if (i % 1) return;
    const s = 0.25 + r() * 0.3;
    const st = sphere(pond, s, r() < 0.5 ? M.granite : M.stoneDark, pp.x * 1.06, s * 0.25, pp.y * 1.06, { sy: 0.5, seg: 8, segV: 6 });
    st.rotation.y = r() * 6;
  });
  addCircle(25, 8.5, 2.0, -1, 2);
  // 锦鲤
  const koi = [];
  for (let i = 0; i < 4; i++) {
    const f = group(pond);
    sphere(f, 0.06, new THREE.MeshStandardMaterial({ color: i % 2 ? '#f07a2a' : '#f4efe6', roughness: 0.4 }), 0, 0, 0, { sx: 0.45, sy: 0.3, sz: 1.6, batch: false });
    sphere(f, 0.03, new THREE.MeshStandardMaterial({ color: '#d33', roughness: 0.4 }), 0, 0.012, 0.02, { sx: 0.6, sy: 0.3, sz: 1.2, batch: false });
    box(f, 0.002, 0.05, 0.06, new THREE.MeshStandardMaterial({ color: '#f5a050', transparent: true, opacity: 0.8 }), 0, 0, -0.11, { batch: false });
    koi.push(f);
  }
  onUpdate((dt, t) => koi.forEach((f, i) => {
    const a = t * (0.18 + i * 0.05) + i * 1.7;
    const rx = 1.1 + (i % 2) * 0.4, rz = 0.6 + (i % 3) * 0.15;
    f.position.set(Math.cos(a) * rx, 0.0, Math.sin(a) * rz);
    f.rotation.y = Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz);
  }));
  pond.userData.dynamic = true;
  interactive(water, { name: '小池子', text: TXT.pond });
  // 浮在水面的红叶
  for (let i = 0; i < 9; i++) {
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({ map: T.leafCluster({ kind: 'maple', palette: ['#c42a1c'], seed: 77, count: 1, size: 64 }), alphaTest: 0.4, side: THREE.DoubleSide }));
    lf.rotation.x = -Math.PI / 2; lf.position.set((r() - 0.5) * 2.4, 0.04, (r() - 0.5) * 1.2); pond.add(lf);
    const ph = r() * 6;
    onUpdate((dt, t) => { lf.rotation.z = t * 0.1 + ph; });
  }

  // 石灯笼
  const sl = group(G, 21.6, 0, 11.6);
  cyl(sl, 0.28, 0.32, 0.18, M.granite, 0, 0.09, 0, { seg: 6 });
  cyl(sl, 0.09, 0.11, 0.7, M.granite, 0, 0.53, 0, { seg: 8 });
  cyl(sl, 0.26, 0.2, 0.12, M.granite, 0, 0.94, 0, { seg: 6 });
  const glm = P.glowMat(M.lampPaper, 2.2);
  box(sl, 0.26, 0.26, 0.26, M.granite, 0, 1.13, 0);
  box(sl, 0.2, 0.16, 0.27, glm.mat, 0, 1.13, 0, { batch: false });
  box(sl, 0.27, 0.16, 0.2, glm.mat, 0, 1.13, 0, { batch: false });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 6), M.granite);
  roof.position.y = 1.4; roof.castShadow = true; sl.add(roof);
  sphere(sl, 0.07, M.granite, 0, 1.58, 0, { sy: 1.3 });
  const sll = new THREE.PointLight('#ffb070', 0, 5, 1.8); sll.position.set(21.6, 1.13, 11.6); G.add(sll);
  const slLamps = [
    { mats: [glm], levels: { dawn: 0, day: 0, dusk: 0.8, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: 4 },
    { light: sll, intensity: 1.5, levels: { dawn: 0, day: 0, dusk: 0.8, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: 4 },
  ];
  world.lamps.push(...slLamps);
  const slInfo = { name: '石灯笼', text: TXT.lantern };
  interactive(sl, slInfo);
  lampFixture('院子·石灯笼', slLamps, { label: '石灯笼', note: TXT.lantern, info: slInfo });
  addCircle(21.6, 11.6, 0.35);

  // 飞石：从缘侧到池边，再到柿子树
  const steps = [[17.6, -0.4], [18.4, 0.3], [19.2, 1.1], [20.0, 2.0], [21.0, 2.6], [22.0, 3.6], [23.0, 4.8], [21.2, -0.8], [22.4, -1.6], [23.6, -2.4], [24.8, -2.9], [17.6, 6.6], [18.5, 7.4], [19.4, 8.4], [20.3, 9.6]];
  steps.forEach(([x, z], i) => {
    const s = cyl(G, 0.32 + (i % 3) * 0.04, 0.34, 0.12, M.stoneWarm, x, 0.03, z, { seg: 9 });
    s.scale.z = 0.8; s.rotation.y = i;
  });
  // 苔藓小丘、庭石
  for (const [x, z, s] of [[20.4, 6.0, 0.7], [28.5, 11.5, 0.9], [30.5, 3.0, 0.6], [18.4, 13.5, 0.8], [29.5, -9, 0.7]]) {
    sphere(G, s, M.moss, x, -s * 0.55, z, { sy: 0.7, seg: 12 });
    sphere(G, s * 0.45, M.stoneDark, x + s * 0.3, s * 0.05, z - s * 0.2, { sy: 0.8, seg: 8 });
  }
  // 芒草和秋英
  for (const [x, z, s] of [[31.6, 9.5, 1.1], [31.8, 5.0, 1], [31.4, -6.5, 1.2], [17.4, 15.8, 0.9], [-17.2, 15.6, 1.0], [-17.6, 12.5, 0.9], [-10, 15.8, 1.0]]) susuki(G, x, 0, z, Math.floor(x * 10 + z), s);
  cosmos(G, 26, 15.6, 4, 0.8, 220, 0, 3);
  cosmos(G, -4, 15.6, 5, 0.8, 220, 0, 4);
  cosmos(G, 8, 15.8, 4, 0.6, 160, 0, 5);
  // 一棵小一点的枫树在院子东南角
  heroTree(G, 30.5, 14.5, 0, { height: 5.5, crown: 2.0, trunkR: 0.14, palette: PALETTES.mapleEarly, seed: 31, clusters: 26, cardSize: 1.2 });

  // ———— 围墙、大门、后门、前庭（都在 compound.js）————
  buildCompound(root);

  // ———— 后院 ————
  // 卷藁
  const mk = group(G);
  for (const [x, z, h] of [[2.0, -15.2, 1.5], [4.0, -16.0, 1.3], [6.0, -15.4, 1.4]]) {
    cyl(mk, 0.04, 0.04, 0.9, M.woodDark, x, 0.45, z);
    cyl(mk, 0.11, 0.11, h - 0.6, M.straw, x, 0.6 + (h - 0.6) / 2, z, { seg: 12 });
    for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.008, 4, 14), M.rope); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.75 + k * 0.25, z); mk.add(ring); }
    // 斜着的切口
    box(mk, 0.24, 0.01, 0.24, M.straw, x, 0.6 + h - 0.6 + 0.05, z, { rz: 0.5 });
    addCircle(x, z, 0.14);
  }
  interactive(mk, { name: '卷藁', text: TXT.makiwara });
  // 磨刀用的小凳（磨刀石、木桶是物件清单里的东西，摆在「后院·磨刀凳」「后院·地上」）
  const ws = group(G, 16.4, 0, -11.6);
  box(ws, 0.7, 0.05, 0.32, M.woodOld, 0, 0.32, 0);
  box(ws, 0.05, 0.3, 0.28, M.woodOld, -0.3, 0.15, 0); box(ws, 0.05, 0.3, 0.28, M.woodOld, 0.3, 0.15, 0);
  addCollider(16.0, 0, -11.8, 16.8, 0.4, -11.4);
  slot('后院·磨刀凳', { rect: [16.08, -11.74, 16.72, -11.46], y: 0.345, face: 'z+' });
  slot('后院·地上', { rect: [16.95, -12.3, 18.3, -10.9], y: 0, face: 'x-' });
  // 井
  const well = group(G, -12, 0, -17);
  cyl(well, 0.55, 0.6, 0.7, M.stoneWarm, 0, 0.35, 0, { seg: 16, collide: true });
  cyl(well, 0.5, 0.5, 0.05, M.woodOld, 0, 0.73, 0, { seg: 16 });
  for (const x of [-0.55, 0.55]) box(well, 0.08, 1.6, 0.08, M.woodDark, x, 0.8, 0);
  box(well, 1.25, 0.08, 0.1, M.woodDark, 0, 1.6, 0);
  cyl(well, 0.08, 0.08, 0.06, M.woodLight, 0, 1.5, 0, { rx: Math.PI / 2 });
  cyl(well, 0.004, 0.004, 0.75, M.rope, 0.07, 1.12, 0);
  cyl(well, 0.1, 0.09, 0.14, M.hinoki, 0.07, 0.83, 0.25);
  interactive(well, { name: '老井', text: TXT.well });
  addCircle(-12, -17, 0.62);
  // 柴堆（北墙檐下）
  const fw = group(G);
  for (let i = 0; i < 70; i++) {
    const row = Math.floor(i / 14), col = i % 14;
    const log = cyl(fw, 0.07, 0.07, 0.45, i % 3 ? M.woodOld : M.woodMid, -8.0 + col * 0.15 + (row % 2) * 0.07, 0.08 + row * 0.13, -10.45, { rx: Math.PI / 2, seg: 7 });
  }
  addCollider(-8.2, 0, -10.75, -5.8, 0.75, -10.15);
  interactive(fw, { name: '柴堆', text: TXT.firewood });

  // ———— 去神社的山道（东北角，平台北墙上开个口）————
  const sp = group(G);
  for (let i = 0; i < 9; i++) {
    const z = PLOT.z0 - i * 0.35, yy = Math.max(0, terrainHeight(29.8, z - 0.2));
    boxMM(sp, 29.1, -0.3, z - 0.35, 30.5, yy + 0.08, z, M.stoneWarm, { cast: false });
  }
  const sign = group(G, 28.2, 0, COMPOUND.z0 + 0.45);
  box(sign, 0.08, 1.4, 0.08, M.woodOld, 0, 0.7, 0);
  box(sign, 0.62, 0.16, 0.03, M.woodOld, 0.25, 1.25, 0, { rz: 0.08 });
  P.sign(sign, '建実神社 →', 0.25, 1.25, 0.018, 0, { w: 0.6, h: 0.15, vertical: false, size: 0.55, bg: '#c9b48a' });
  interactive(sign, { name: '去神社的山道', text: TXT.shrinePath });

  // ———— 竹林（后院西北的山坡上）————
  bambooGrove(G, 4, -28.5, 10, 3.5, 110, (x, z) => terrainHeight(x, z), 9);

  // ———— 草丛 ————
  const tufts = [];
  const rg2 = mulberry32(99);
  for (let i = 0; i < 1800; i++) {
    const x = COMPOUND.x0 + 0.5 + rg2() * (COMPOUND.x1 - COMPOUND.x0 - 1), z = COMPOUND.z0 + 0.5 + rg2() * (COMPOUND.z1 - COMPOUND.z0 - 1);
    if (x > -15.6 && x < 16.6 && z > -10.6 && z < 12.2) continue;
    if (x > -31.6 && x < -15 && z > -0.8 && z < 2.8) continue;
    if (Math.hypot(x + 24, z - 1) < 6.8) continue;   // 前庭的阵纹上不长草
    if (Math.hypot(x - 25, (z - 8.5) * 1.4) < 2.6) continue;
    if (x > -14 && x < 26 && z > -21.5 && z < -10.6) { if (rg2() < 0.85) continue; }
    tufts.push({ x, y: 0, z, a: rg2() * 6, s: 0.6 + rg2() * 0.8 });
  }
  // 石阶两旁
  for (let i = 0; i < 500; i++) {
    const side = rg2() < 0.5 ? -1 : 1;
    const z = -60 + rg2() * 115;
    if (z > PLOT.z0 - 1 && z < PLOT.z1 + 1) continue;
    const x = side < 0 ? STAIR.x0 - 0.4 - rg2() * 4 : STAIR.x1 + 0.4 + rg2() * 4;
    tufts.push({ x, y: terrainHeight(x, z), z, a: rg2() * 6, s: 0.7 + rg2() });
  }
  grassTufts(G, tufts);

  // ———— 远近山林 ————
  const trees = [];
  const rf = mulberry32(2026);
  const cols = { cedar: ['#2a4030', '#304a36', '#25392c'], maple: ['#b8321f', '#c94a24', '#d9682a', '#a82a1c'], ginkgo: ['#e0b030', '#d9a028', '#e8c040'], green: ['#4f6b34', '#5a7a3a', '#46602e'], brown: ['#9a6a2e', '#8a5a2a', '#a8782e'] };
  for (let i = 0; i < 4200; i++) {
    const x = -260 + rf() * 520, z = -300 + rf() * 520;
    if (x > PLOT.x0 - 3 && x < PLOT.x1 + 3 && z > PLOT.z0 - 4 && z < PLOT.z1 + 3) continue;
    if (x > STAIR.x0 - 2.5 && x < STAIR.x1 + 2.5 && z > -90 && z < 90) continue;
    if (z > 68 && Math.abs(x) < 120) continue; // 山谷和镇子
    if (Math.hypot(x - 7, z + 2) < 34) { if (rf() < 0.6) continue; }
    if (x > 27 && x < 33 && z < -21 && z > -32) continue;
    const y = terrainHeight(x, z);
    const n = fbm(x * 0.02 + 5, z * 0.02, 3);
    let type = n > 0.12 ? 'cedar' : n < -0.15 ? 'maple' : rf() < 0.35 ? 'ginkgo' : rf() < 0.5 ? 'brown' : 'green';
    if (z > 12 && rf() < 0.3) type = 'maple';
    const c = cols[type];
    const h = type === 'cedar' ? 9 + rf() * 9 : 6 + rf() * 6;
    trees.push({ x, y, z, h, s: type === 'cedar' ? 0.9 + rf() * 0.5 : 1.3 + rf() * 1.2, type, color: c[Math.floor(rf() * c.length)], far: Math.hypot(x, z) > 90 });
  }
  forest(G, trees);
  // 近处树的碰撞
  for (const t of trees) if (Math.abs(t.x) < 55 && Math.abs(t.z) < 55) addCircle(t.x, t.z, 0.35, t.y - 2, t.y + 6);

  return G;
}
