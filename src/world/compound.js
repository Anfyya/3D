import * as THREE from 'three';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, group, interactive, addCollider, addCircle, onUpdate, lampFixture } from '../core/build.js';
import { COMPOUND, WALL_T, GATE_Z, GATE_HALF, BACK_GATE_X, SUMMON } from './layout.js';
import { pineTree, heroTree, PALETTES } from './vegetation.js';
import * as P from './props.js';
import { mulberry32 } from '../core/util.js';

const TXT = {
  gate: '宿舍的大门。两扇厚木门从里面插着门闩——外面就是长石阶，往上是温泉街，往下是镇口。今天哪儿也不去，就在宿舍里待着。',
  plate: '门柱上挂着一块木牌，写着「宿舍」。',
  backGate: '后门。推开就是往建实神社去的山道——丛雨以前每天夜里就是顺着这条路回神社的。门闩插着，今天先不出去。',
  circle: '阵碑上只刻着「藏經閣」三个字。前庭地上那一圈石刻的阵纹，平时就是一块旧石板；只有主人召唤的时候，藏经阁才会从阵纹里升起来。（按 G 或右下角的「召唤」：召唤 / 送走）',
};

// 一段围墙（筑地塀）：石基 + 白灰墙身 + 瓦顶。h 是墙身高度，碰撞体做得很高，翻不过去
function wallRun(G, x0, z0, x1, z1, { h = 2.6 } = {}) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const t = WALL_T;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const W = t / 2 + 0.34, a = 0.42, yb = h + 0.1, yr = yb + W * Math.tan(a);
  if (alongX) {
    boxMM(G, x0, -0.3, cz - t / 2 - 0.06, x1, 0.45, cz + t / 2 + 0.06, M.stoneWarm);
    boxMM(G, x0, 0.45, cz - t / 2, x1, h, cz + t / 2, M.plasterOut);
    boxMM(G, x0, h, cz - t / 2 - 0.05, x1, yb, cz + t / 2 + 0.05, M.beam);
    for (const s of [-1, 1]) {
      box(G, len + 0.3, 0.06, W / Math.cos(a), M.roof, cx, yr - (W / 2) * Math.tan(a), cz + s * W / 2, { rx: s * a });
      box(G, len + 0.3, 0.05, W / Math.cos(a), M.ceiling, cx, yr - (W / 2) * Math.tan(a) - 0.07, cz + s * W / 2, { rx: s * a, cast: false });
    }
    box(G, len + 0.36, 0.14, 0.18, M.roofRidge, cx, yr + 0.04, cz);
    addCollider(x0, -1, cz - t / 2 - 0.1, x1, 8, cz + t / 2 + 0.1);
  } else {
    boxMM(G, cx - t / 2 - 0.06, -0.3, z0, cx + t / 2 + 0.06, 0.45, z1, M.stoneWarm);
    boxMM(G, cx - t / 2, 0.45, z0, cx + t / 2, h, z1, M.plasterOut);
    boxMM(G, cx - t / 2 - 0.05, h, z0, cx + t / 2 + 0.05, yb, z1, M.beam);
    for (const s of [-1, 1]) {
      box(G, W / Math.cos(a), 0.06, len + 0.3, M.roof, cx + s * W / 2, yr - (W / 2) * Math.tan(a), cz, { rz: -s * a, swap: true });
      box(G, W / Math.cos(a), 0.05, len + 0.3, M.ceiling, cx + s * W / 2, yr - (W / 2) * Math.tan(a) - 0.07, cz, { rz: -s * a, cast: false });
    }
    box(G, 0.18, 0.14, len + 0.36, M.roofRidge, cx, yr + 0.04, cz);
    addCollider(cx - t / 2 - 0.1, -1, z0, cx + t / 2 + 0.1, 8, z1);
  }
}

// 两坡小屋顶（门楼用）：ridge 沿着 axis 方向
function gableRoof(G, cx, cz, along, len, depth, yEave, yRidge) {
  const half = depth / 2, a = Math.atan2(yRidge - yEave, half), w = Math.hypot(half, yRidge - yEave);
  for (const s of [-1, 1]) {
    if (along === 'z') {
      box(G, w, 0.08, len, M.roof, cx + s * half / 2, (yEave + yRidge) / 2, cz, { rz: -s * a, swap: true });
      box(G, w, 0.06, len, M.ceiling, cx + s * half / 2, (yEave + yRidge) / 2 - 0.09, cz, { rz: -s * a, cast: false });
    } else {
      box(G, len, 0.08, w, M.roof, cx, (yEave + yRidge) / 2, cz + s * half / 2, { rx: s * a });
      box(G, len, 0.06, w, M.ceiling, cx, (yEave + yRidge) / 2 - 0.09, cz + s * half / 2, { rx: s * a, cast: false });
    }
  }
  if (along === 'z') box(G, 0.26, 0.24, len + 0.1, M.roofRidge, cx, yRidge + 0.08, cz);
  else box(G, len + 0.1, 0.24, 0.26, M.roofRidge, cx, yRidge + 0.08, cz);
}

// 大门（药医门）：两根粗柱 + 两根控柱、冠木、两坡瓦顶、两扇关死的厚木门
function mainGate(G) {
  const x = COMPOUND.x0, z0 = GATE_Z - GATE_HALF, z1 = GATE_Z + GATE_HALF, zc = GATE_Z;
  const g = group(G);
  for (const z of [z0, z1]) {
    boxMM(g, x - 0.17, 0, z - 0.17, x + 0.17, 3.45, z + 0.17, M.trunk, { collide: true });
    boxMM(g, x + 1.3, 0, z - 0.11, x + 1.52, 2.75, z + 0.11, M.trunk, { collide: true });
    boxMM(g, x - 0.17, 2.6, z - 0.08, x + 1.52, 2.76, z + 0.08, M.beam);
    cyl(g, 0.28, 0.32, 0.12, M.granite, x, 0.06, z, { seg: 10 });
  }
  boxMM(g, x - 0.2, 3.05, z0 - 0.45, x + 0.2, 3.45, z1 + 0.45, M.beam);      // 冠木
  boxMM(g, x - 0.12, 0, z0 + 0.15, x + 0.12, 0.1, z1 - 0.15, M.granite);     // 门槛石
  gableRoof(g, x + 0.65, zc, 'z', z1 - z0 + 1.6, 3.4, 3.55, 4.6);
  // 两扇门：竖板 + 横带 + 铁钉，关着
  const doors = group(G);
  for (const [a0, a1] of [[z0 + 0.17, zc], [zc, z1 - 0.17]]) {
    boxMM(doors, x - 0.06, 0.1, a0 + 0.01, x + 0.06, 2.98, a1 - 0.01, M.woodOld);
    for (const y of [0.55, 1.55, 2.55]) {
      boxMM(doors, x - 0.09, y - 0.07, a0 + 0.05, x + 0.09, y + 0.07, a1 - 0.05, M.woodDark);
      for (let z = a0 + 0.2; z < a1 - 0.1; z += 0.32) for (const s of [-1, 1]) sphere(doors, 0.02, M.iron, x + s * 0.095, y, z, { seg: 6, segV: 4, cast: false });
    }
    // 内侧的门环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16), M.iron);
    ring.position.set(x + 0.1, 1.2, a0 + (a1 - a0) * (a0 < zc ? 0.85 : 0.15)); ring.rotation.y = Math.PI / 2; ring.userData.static = true; doors.add(ring);
  }
  // 里侧横插的大门闩
  boxMM(doors, x + 0.1, 1.3, z0 + 0.25, x + 0.22, 1.46, z1 - 0.25, M.woodMid);
  for (const z of [z0 + 0.4, z1 - 0.4]) boxMM(doors, x + 0.06, 1.24, z - 0.08, x + 0.26, 1.52, z + 0.08, M.woodDark);
  interactive(doors, { name: '大门', text: TXT.gate });
  addCollider(x - 0.2, -1, z0, x + 0.3, 8, z1);
  // 门柱内侧的木牌
  const plate = P.sign(G, '宿舍', x + 0.18, 1.75, z0, Math.PI / 2, { w: 0.15, h: 0.5, bg: '#e9dcc0', size: 0.4 });
  interactive(plate, { name: '门柱上的木牌', text: TXT.plate });
  // 门楼下挂的两盏提灯
  const gateLamps = [];
  for (const z of [z0 + 0.7, z1 - 0.7]) {
    const lg = P.glowMat(M.lanternRed, 2.2);
    cyl(G, 0.004, 0.004, 1.15, M.black, x + 0.75, 2.97, z, { cast: false });
    cyl(G, 0.15, 0.15, 0.36, lg.mat, x + 0.75, 2.2, z, { batch: false, seg: 14 });
    cyl(G, 0.1, 0.1, 0.04, M.black, x + 0.75, 2.4, z); cyl(G, 0.1, 0.1, 0.04, M.black, x + 0.75, 2.0, z);
    gateLamps.push({ mats: [lg], levels: { dawn: 0, day: 0, dusk: 0.8, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: z });
  }
  const gl = new THREE.PointLight('#ff9a5a', 0, 8, 1.7); gl.position.set(x + 0.9, 2.2, zc); G.add(gl);
  gateLamps.push({ light: gl, intensity: 2.5, levels: { dawn: 0, day: 0, dusk: 0.8, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: 2 });
  world.lamps.push(...gateLamps);
  lampFixture('大门·红提灯', gateLamps, { label: '大门的红提灯', note: '大门门楼下挂的两盏红提灯。' });
}

// 后门（北墙，通往神社的山道）：一扇小木门，关着
function backGate(G) {
  const z = COMPOUND.z0, x0 = BACK_GATE_X - 0.8, x1 = BACK_GATE_X + 0.8;
  for (const x of [x0, x1]) boxMM(G, x - 0.13, 0, z - 0.13, x + 0.13, 2.7, z + 0.13, M.trunk, { collide: true });
  boxMM(G, x0 - 0.3, 2.45, z - 0.15, x1 + 0.3, 2.7, z + 0.15, M.beam);
  gableRoof(G, BACK_GATE_X, z, 'x', x1 - x0 + 1.0, 1.5, 2.75, 3.3);
  const d = group(G);
  boxMM(d, x0 + 0.13, 0.05, z - 0.04, x1 - 0.13, 2.3, z + 0.04, M.woodOld);
  for (const y of [0.4, 1.2, 2.0]) boxMM(d, x0 + 0.16, y - 0.05, z + 0.04, x1 - 0.16, y + 0.05, z + 0.07, M.woodDark);
  boxMM(d, x0 + 0.3, 1.1, z + 0.07, x1 - 0.3, 1.2, z + 0.13, M.woodMid);
  interactive(d, { name: '后门', text: TXT.backGate });
  addCollider(x0, -1, z - 0.2, x1, 8, z + 0.2);
}

// 前庭地上的召唤阵纹（石刻），召唤时会亮起来
function summonCircle(G) {
  const [cx, cz] = SUMMON;
  const R = 6.6;
  const runeTex = (glow) => T.canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (!glow) {
      // 一圈一圈扇形的石板，每块颜色略有深浅，缝里发暗，再撒一层细麻点
      const c = w / 2, rnd = mulberry32(7);
      g.fillStyle = '#8f8a80'; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
      for (const [r0, r1, n] of [[0, c * 0.3, 1], [c * 0.3, c * 0.62, 9], [c * 0.62, c - 44, 18], [c - 44, c - 2, 36]]) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + 0.1, a1 = ((i + 1) / n) * Math.PI * 2 + 0.1, v = 146 + Math.round((rnd() - 0.5) * 26);
          g.fillStyle = `rgb(${v + 3},${v},${v - 7})`;
          g.beginPath(); g.arc(c, c, r1 - 1.5, a0, a1); if (r0 > 0) g.arc(c, c, r0 + 1.5, a1, a0, true); else g.lineTo(c, c); g.closePath(); g.fill();
          if (n > 1) {
            g.strokeStyle = 'rgba(70,64,56,0.6)'; g.lineWidth = 2.5;
            g.beginPath(); g.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0); g.lineTo(c + Math.cos(a0) * r1, c + Math.sin(a0) * r1); g.stroke();
          }
        }
      }
      for (let k = 0; k < 14000; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (c - 4), s = 1 + rnd() * 2.5;
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,250,240,0.07)' : 'rgba(30,26,20,0.08)';
        g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, s, s);
      }
    }
    g.strokeStyle = glow ? 'rgba(170,255,240,1)' : 'rgba(60,58,52,0.75)';
    g.fillStyle = g.strokeStyle;
    const c = w / 2;
    const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    ring(c - 14, 8); ring(c - 44, 4); ring(c * 0.62, 5); ring(c * 0.3, 4);
    // 六角星
    g.lineWidth = 5;
    for (const off of [0, Math.PI / 3]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2; const px = c + Math.cos(a) * c * 0.62, py = c + Math.sin(a) * c * 0.62; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    // 外圈一圈符纹
    g.font = 'bold 44px "Hiragino Mincho ProN","Songti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const glyphs = '乾坤震巽坎離艮兌引氣凝實藏經閣';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(a) * (c - 29 - 0), c + Math.sin(a) * (c - 29)); g.rotate(a + Math.PI / 2);
      g.font = 'bold 22px serif'; g.fillText(glyphs[i % glyphs.length], 0, 0); g.restore();
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8, 18, 0, Math.PI * 2); g.lineWidth = 4; g.stroke(); }
  }, { repeat: false, srgb: !glow });
  const base = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshStandardMaterial({ map: runeTex(false), roughness: 0.95, alphaTest: 0.5 }));
  base.rotation.x = -Math.PI / 2; base.position.set(cx, 0.012, cz); base.receiveShadow = true;
  base.userData.static = true;
  G.add(base);
  const glowMat = new THREE.MeshBasicMaterial({ map: runeTex(true), color: '#7ff0e0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(R, 64), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.set(cx, 0.03, cz); glow.renderOrder = 7;
  glow.userData.dynamic = true;
  G.add(glow);
  world.summonGlow = glowMat;
  // 阵纹北边的一块阵碑（说明写在这里，免得点地面走路时总弹出来）
  const st = group(G, cx, 0, cz - R - 0.9);
  st.userData.dynamic = true;
  boxMM(st, -0.5, 0, -0.22, 0.5, 0.22, 0.22, M.granite);
  boxMM(st, -0.36, 0.22, -0.11, 0.36, 1.62, 0.11, M.stoneWall, { tile: 1.2 });
  const face = P.sign(st, '藏經閣', 0, 1.0, 0.116, 0, { w: 0.34, h: 1.0, bg: '#5b5a55', color: '#d9d2c0', size: 0.3 });
  face.material.roughness = 0.9;
  interactive(st, { name: '阵碑', text: TXT.circle, trace: false });
  addCircle(cx, cz - R - 0.9, 0.5);
}

export function buildCompound(root) {
  const G = group(root);
  const C = COMPOUND;
  // 西墙（留出大门）、北墙（留出后门）、东墙、南墙（矮一点，留着看山谷）
  wallRun(G, C.x0, C.z0, C.x0, GATE_Z - GATE_HALF - 0.17);
  wallRun(G, C.x0, GATE_Z + GATE_HALF + 0.17, C.x0, C.z1);
  wallRun(G, C.x0, C.z0, BACK_GATE_X - 0.93, C.z0);
  wallRun(G, BACK_GATE_X + 0.93, C.z0, C.x1, C.z0);
  wallRun(G, C.x1, C.z0, C.x1, C.z1);
  wallRun(G, C.x0, C.z1, C.x1, C.z1, { h: 1.25 });
  mainGate(G);
  backGate(G);
  summonCircle(G);

  // ———— 前庭：从大门到玄关的石板路、两侧碎石、松、石灯笼 ————
  // （阵纹本身就是一块大石板，石板路和碎石在它两边断开）
  const [sx] = SUMMON, R = 6.6;
  for (let x = C.x0 + 0.7; x < -16.3; x += 0.66) {
    const w = 0.58;
    if (x + w > sx - R - 0.05 && x < sx + R + 0.05) continue;
    boxMM(G, x, -0.05, GATE_Z - 0.82, x + w, 0.035, GATE_Z + 0.82, M.granite, { cast: false });
  }
  for (const [a, b] of [[C.x0 + 0.5, sx - R - 0.05], [sx + R + 0.05, -16.3]]) {
    boxMM(G, a, -0.05, GATE_Z - 1.6, b, 0.02, GATE_Z - 0.85, M.gravel, { cast: false });
    boxMM(G, a, -0.05, GATE_Z + 0.85, b, 0.02, GATE_Z + 1.6, M.gravel, { cast: false });
  }
  pineTree(G, -29.6, -8.5, 0, { seed: 15, height: 3.6 });
  pineTree(G, -29.2, 10.5, 0, { seed: 19, height: 3.2 });
  heroTree(G, -20.5, -17.5, 0, { height: 7.5, crown: 3.0, trunkR: 0.2, palette: PALETTES.maple, seed: 41, clusters: 40, cardSize: 1.4 });
  heroTree(G, -21.0, 13.5, 0, { height: 6.5, crown: 2.6, trunkR: 0.18, palette: PALETTES.mapleEarly, seed: 43, clusters: 34, cardSize: 1.3 });
  const yardLamps = [];
  for (const [x, z] of [[-17.6, -2.4], [-17.6, 4.4]]) {
    const sl = group(G, x, 0, z);
    cyl(sl, 0.26, 0.3, 0.16, M.granite, 0, 0.08, 0, { seg: 6 });
    cyl(sl, 0.08, 0.1, 0.65, M.granite, 0, 0.48, 0, { seg: 8 });
    cyl(sl, 0.24, 0.18, 0.11, M.granite, 0, 0.86, 0, { seg: 6 });
    const glm = P.glowMat(M.lampPaper, 2.0);
    box(sl, 0.24, 0.24, 0.24, M.granite, 0, 1.04, 0);
    box(sl, 0.18, 0.14, 0.25, glm.mat, 0, 1.04, 0, { batch: false });
    box(sl, 0.25, 0.14, 0.18, glm.mat, 0, 1.04, 0, { batch: false });
    const rf = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.26, 6), M.granite); rf.position.y = 1.28; rf.castShadow = true; rf.userData.static = true; sl.add(rf);
    yardLamps.push({ mats: [glm], levels: { dawn: 0, day: 0, dusk: 0.8, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: x + z });
    addCircle(x, z, 0.32);
  }
  world.lamps.push(...yardLamps);
  lampFixture('前庭·石灯笼', yardLamps, { label: '前庭的石灯笼', note: '前庭石板路两边的两座石灯笼。' });
  return G;
}
