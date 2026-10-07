import * as THREE from 'three';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, group, onUpdate, timeVariant } from '../core/build.js';
import * as P from '../world/props.js';
import { mulberry32 } from '../core/util.js';

// 物件库：每个模型一个函数，在原点搭出来（底面 y = 0，正面朝 +z），
// 挂件的原点是挂点（挂钩 / 晾衣竿），东西往下垂、贴墙的背面在 z = 0。
// 函数签名：(g, state, ctx)，ctx = { rec, mount, text, rand }

const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
  return matCache.get(k);
}
const lines = (text, fallback, max = 3) => String(text ?? fallback).split(/\\n|\n/).slice(0, max).map((s) => s.slice(0, 12));

// 动起来的部分放进单独的组，免得合并静态网格时被并掉
function live(g) { const d = group(g); d.userData.dynamic = true; return d; }

function flatPaper(g, w, d, tex, x = 0, y = 0.002, z = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tex ? texMat(tex) : M.paper);
  m.rotation.set(-Math.PI / 2, 0, rz); m.position.set(x, y, z); m.receiveShadow = true; m.userData.static = true;
  g.add(m);
  return m;
}

function newsprint() {
  return T.cached('newsprint', () => T.canvasTex(256, 360, (c, w, h) => {
    c.fillStyle = '#e6e1d4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2a2a'; c.font = 'bold 30px serif'; c.fillText('穂織新聞', 18, 40);
    c.fillStyle = 'rgba(40,40,40,0.55)';
    for (let col = 0; col < 3; col++) for (let y = 62; y < h - 10; y += 9) c.fillRect(14 + col * 80, y, 70 - ((y * 7 + col) % 23), 3);
    c.fillStyle = 'rgba(60,60,60,0.35)'; c.fillRect(100, 70, 140, 90);
  }, { repeat: false }));
}

function flowerStems(g, y0, n, len, colors, seed, { spread = 0.06, head = 0.014, flat = true } = {}) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), tilt = 0.15 + r() * 0.3, l = len * (0.75 + r() * 0.35);
    const tx = Math.sin(a) * Math.sin(tilt) * l, tz = Math.cos(a) * Math.sin(tilt) * l, ty = Math.cos(tilt) * l;
    const stem = cyl(g, 0.0022, 0.0028, l, mat('#5f7a3a'), tx / 2, y0 + ty / 2, tz / 2, { cast: false });
    stem.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
    const c = colors[i % colors.length];
    sphere(g, head * (0.8 + r() * 0.5), mat(c, { roughness: 0.9 }), tx, y0 + ty, tz, { sy: flat ? 0.45 : 1, seg: 10, segV: 6, cast: false });
    if (flat) sphere(g, head * 0.35, mat('#c98a1a'), tx, y0 + ty + 0.004, tz, { seg: 6, segV: 4, cast: false });
  }
}

function mapleCard(g, size, x, y, z, rot = [0.2, 0.6, 0.3]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), T.cached('mapleCardMat', () => new THREE.MeshStandardMaterial({ map: T.leafCluster({ kind: 'maple', palette: ['#c9301f', '#e0552a', '#a8231a', '#ef7a2a'], seed: 9, count: 26, size: 256 }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 })));
  m.position.set(x, y, z); m.rotation.set(...rot); m.castShadow = true; m.userData.static = true; g.add(m);
}

function susukiPlumes(g, y0, n, len, seed) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI - Math.PI / 2 + (r() - 0.5) * 0.3;
    cyl(g, 0.003, 0.0025, len, M.straw, Math.sin(a) * 0.08, y0 + len / 2, Math.cos(a) * 0.04, { rz: a * 0.35, cast: false });
    sphere(g, 0.03, mat('#e7dcc0', { roughness: 1 }), Math.sin(a) * (0.08 + len * 0.17), y0 + len * 0.96, Math.cos(a) * 0.04, { sy: 3, sx: 0.6, sz: 0.6, cast: false });
  }
}

function bookColor(rand) { return ['#7a2e2a', '#2f4a6b', '#3d5c3a', '#6b5a3a', '#4a3a5a', '#8a6a3a'][Math.floor(rand() * 6)]; }

function stackBooks(g, n, rand, { messy = false, w = 0.16, d = 0.22 } = {}) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.025 + rand() * 0.02;
    P.book(g, (rand() - 0.5) * (messy ? 0.05 : 0.012), y, (rand() - 0.5) * (messy ? 0.04 : 0.01), (rand() - 0.5) * (messy ? 0.6 : 0.08), { w: w * (0.9 + rand() * 0.2), d: d * (0.9 + rand() * 0.15), t, color: bookColor(rand) });
    y += t;
  }
  return y;
}

function ropeCross(g, w, h, d) {
  box(g, w + 0.012, 0.012, 0.014, M.rope, 0, h + 0.004, 0);
  box(g, 0.014, 0.012, d + 0.012, M.rope, 0, h + 0.004, 0);
  box(g, w + 0.012, h, 0.014, M.rope, 0, h / 2, 0, { cast: false });
  box(g, 0.014, h, d + 0.012, M.rope, 0, h / 2, 0, { cast: false });
}

function tagCard(g, text, x, y, z, { w = 0.09, h = 0.06, color = '#2a2420', ry = 0, rx = 0 } = {}) {
  const tex = T.textTex(text, { w: 192, h: 128, bg: '#f4ead2', color, size: text.length > 3 ? 0.26 : 0.4, border: 'rgba(120,90,60,0.6)' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texMat(tex, { side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.userData.static = true; g.add(m);
  return m;
}

function plate(g, r, m = M.ceramic, x = 0, y = 0, z = 0) {
  cyl(g, r, r * 0.8, 0.018, m, x, y + 0.009, z, { seg: 24 });
}

function setting(g, x, z, eaten) {
  const s = group(g, x, 0, z);
  P.bowl(s, -0.08, 0, 0, 0.062, M.ceramic, eaten ? null : M.sugar);
  P.bowl(s, 0.09, 0, 0, 0.056, M.lacquerRed, eaten ? null : M.soup);
  if (!eaten) {
    box(s, 0.21, 0.008, 0.008, M.lacquerBlack, 0, 0.012, 0.12); box(s, 0.21, 0.008, 0.008, M.lacquerBlack, 0, 0.012, 0.133);
    box(s, 0.05, 0.012, 0.02, M.ceramicBlue, -0.08, 0.006, 0.125);
  } else {
    box(s, 0.22, 0.008, 0.008, M.lacquerBlack, -0.08, 0.06, 0.0, { ry: 0.15 }); box(s, 0.22, 0.008, 0.008, M.lacquerBlack, -0.08, 0.06, 0.014, { ry: 0.15 });
    box(s, 0.05, 0.012, 0.02, M.ceramicBlue, -0.08, 0.006, 0.125);
  }
}

function cupAt(g, x, z, full = true, m = M.ceramicGreen) {
  cyl(g, 0.035, 0.028, 0.065, m, x, 0.033, z);
  if (full) cyl(g, 0.031, 0.031, 0.003, M.tea, x, 0.055, z, { cast: false });
}

function fabricTex(kind) { return T.cached('fabMat' + kind, () => new THREE.MeshStandardMaterial({ map: T.fabric(kind), side: THREE.DoubleSide, roughness: 1 })); }

function hangCloth(g, w, h, m, x, z = 0, phase = 0) {
  const d = live(g);
  d.position.set(x, 0, z);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  pl.position.y = -h / 2; pl.castShadow = true; d.add(pl);
  onUpdate((dt, t) => { d.rotation.x = Math.sin(t * 1.7 + phase) * 0.08; });
  return pl;
}

function silhouette(key, draw) {
  return T.cached('sil' + key, () => new THREE.MeshStandardMaterial({ map: T.canvasTex(256, 256, draw, { repeat: false }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
}

// ———————————————— 物件 ————————————————
export const BUILD = {
  vase(g, state) {
    const pts = [[0.03, 0], [0.04, 0.03], [0.038, 0.06], [0.016, 0.1], [0.011, 0.12], [0.016, 0.135]].map(([r, y]) => new THREE.Vector2(r, y));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat('#eeeae0', { roughness: 0.25, side: THREE.DoubleSide }));
    m.castShadow = true; m.userData.static = true; g.add(m);
    if (state === '黄色野菊') flowerStems(g, 0.12, 7, 0.17, ['#f2c12e', '#e9b21e', '#f5d04a'], 31);
    else if (state === '野花') flowerStems(g, 0.12, 6, 0.16, ['#f4f1ea', '#b9a3d6', '#f4f1ea', '#e8a0b4'], 32);
    else if (state === '红叶') { cyl(g, 0.003, 0.003, 0.22, M.woodDark, 0, 0.22, 0, { rz: 0.15 }); mapleCard(g, 0.26, 0.03, 0.3, 0); }
  },
  ikebana(g, state) {
    cyl(g, 0.08, 0.1, 0.3, M.ceramicBrown, 0, 0.15, 0, { seg: 16 });
    if (state === '空') return;
    susukiPlumes(g, 0.28, 6, 0.85, 41);
    if (state === '红叶芒草') mapleCard(g, 0.45, 0.08, 0.92, 0.02, [0.2, 0.7, -0.3]);
  },

  book(g, state, { rand }) { P.book(g, 0, 0, 0, 0, { open: state === '摊开', color: bookColor(rand) }); },
  'book-thick'(g, state) { P.book(g, 0, 0, 0, 0, { w: 0.19, d: 0.26, t: 0.075, color: '#6a2a24', open: state === '摊开' }); },
  'book-stack'(g, state, { rand }) { stackBooks(g, 5, rand, { messy: state === '歪着' }); },
  'library-books'(g, state, { rand }) {
    ['#2f4a6b', '#7a2e2a', '#3d5c3a'].forEach((c, i) => P.book(g, 0, i * 0.03, 0, 0.1 * i, { w: 0.15, d: 0.21, t: 0.03, color: c }));
    box(g, 0.03, 0.002, 0.06, M.paper, 0.06, 0.09, 0.08);
  },
  'books-bundled'(g) {
    const w = 0.36, d = 0.27;
    let y = 0;
    const r = mulberry32(5);
    for (let i = 0; i < 9; i++) { const t = 0.022 + r() * 0.012; box(g, w - r() * 0.03, t, d - r() * 0.02, i % 3 ? mat('#ddd6c6') : mat('#b9a98c'), (r() - 0.5) * 0.01, y + t / 2, 0); y += t; }
    ropeCross(g, w, y, d);
  },
  newspaper(g, state) {
    const tex = newsprint();
    if (state === '摊开') flatPaper(g, 0.54, 0.38, tex, 0, 0.003, 0, 0.1);
    else { for (let i = 0; i < 4; i++) box(g, 0.27, 0.003, 0.38, M.paper, 0, 0.0015 + i * 0.003, 0, { ry: (i - 2) * 0.04 }); flatPaper(g, 0.27, 0.38, tex, 0, 0.0135, 0, 0.04); }
  },
  note(g, state, { mount, text }) {
    const tex = T.noteTex(lines(text, '……'), { w: 192, h: 132 });
    if (mount === 'wall') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.075), texMat(tex));
      m.position.set(0, -0.05, 0.004); m.userData.static = true; g.add(m);
      box(g, 0.012, 0.012, 0.006, M.red, 0, -0.016, 0.006);   // 图钉
      return;
    }
    if (state === '折起来') {
      box(g, 0.08, 0.002, 0.05, M.paperDouble, 0, 0.012, -0.012, { rx: 0.5 });
      box(g, 0.08, 0.002, 0.05, M.paperDouble, 0, 0.012, 0.012, { rx: -0.5 });
    } else flatPaper(g, 0.11, 0.075, tex, 0, 0.002, 0, 0.12);
  },
  'recipe-page'(g, state, { text }) {
    const t = String(text ?? '点心方子');
    const tex = T.noteTex([t.slice(0, 10), '栗子 一袋 · 砂糖', '寒天 · 小豆馅'], { w: 192, h: 256 });
    flatPaper(g, 0.15, 0.2, tex, 0, 0.002, 0, 0.08);
    if (state === '被厚书压着') P.book(g, 0.05, 0.003, -0.04, 0.35, { w: 0.19, d: 0.26, t: 0.075, color: '#6a2a24' });
  },
  letter(g, state, { text }) {
    box(g, 0.17, 0.004, 0.1, mat('#f6f2e8'), 0, 0.002, 0, { ry: 0.1 });
    tagCard(g, String(text ?? '').slice(0, 8) || '　', 0, 0.0045, 0, { w: 0.12, h: 0.05, rx: -Math.PI / 2 });
    if (state === '拆开了') flatPaper(g, 0.15, 0.2, T.noteTex(['……', '……'], { w: 192, h: 256 }), 0.14, 0.003, 0.03, -0.25);
  },
  'journal-old'(g) {
    box(g, 0.17, 0.05, 0.23, mat('#7a5a3a', { roughness: 0.85 }), 0, 0.025, 0);
    box(g, 0.16, 0.045, 0.225, M.paper, 0.006, 0.025, 0);
    for (let i = 0; i < 4; i++) box(g, 0.02, 0.003, 0.03, [M.red, M.ceramicBlue, M.pumpkin, M.ceramicGreen][i], 0.082, 0.03 + i * 0.006, -0.08 + i * 0.05);
  },
  'journal-new'(g, state, { text }) {
    const cover = mat('#8fc4e6');
    if (state === '合着') { box(g, 0.15, 0.018, 0.21, cover, 0, 0.009, 0); box(g, 0.145, 0.014, 0.205, M.paper, 0.004, 0.009, 0); return; }
    box(g, 0.3, 0.006, 0.21, cover, 0, 0.003, 0);
    const ls = lines(text, '10月5日  晴，早上有雾\n主人今天回来。', 4);
    const tex = T.canvasTex(256, 192, (c, w, h) => {
      c.fillStyle = '#fdfbf4'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120,160,200,0.4)'; for (let yy = 30; yy < h; yy += 20) { c.beginPath(); c.moveTo(8, yy); c.lineTo(w - 8, yy); c.stroke(); }
      c.fillStyle = '#3a3a5a'; c.font = '15px "Kaiti SC","STKaiti",cursive';
      ls.forEach((l, i) => c.fillText(l, 14, 26 + i * 20));
      c.fillStyle = '#c33'; c.fillRect(w / 2 - 1, 0, 2, h);
    }, { repeat: false });
    flatPaper(g, 0.28, 0.2, tex, 0, 0.0075);
    cyl(g, 0.004, 0.004, 0.13, M.ceramicBlue, 0.07, 0.014, 0.03, { rz: Math.PI / 2, ry: 0.5 });
  },

  'cardboard-box'(g, state, { text }) {
    const w = 0.46, h = 0.32, d = 0.36, cb = mat('#b58a5a', { roughness: 0.95 });
    if (state === '封着') {
      box(g, w, h, d, cb, 0, h / 2, 0);
      box(g, 0.07, 0.002, d + 0.002, mat('#c9b48a', { roughness: 0.5 }), 0, h + 0.001, 0);
    } else {
      boxMM(g, -w / 2, 0, -d / 2, w / 2, 0.01, d / 2, cb);
      boxMM(g, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.006, cb); boxMM(g, -w / 2, 0, d / 2 - 0.006, w / 2, h, d / 2, cb);
      boxMM(g, -w / 2, 0, -d / 2, -w / 2 + 0.006, h, d / 2, cb); boxMM(g, w / 2 - 0.006, 0, -d / 2, w / 2, h, d / 2, cb);
      box(g, w, 0.005, d / 2, cb, 0, h + 0.06, -d / 2 - 0.08, { rx: 0.9 });
      box(g, w, 0.005, d / 2, cb, 0, h + 0.06, d / 2 + 0.08, { rx: -0.9 });
      if (state === '打开') { const r = mulberry32(3); stackBooks(group(g, -0.08, 0.01, 0), 4, r); box(g, 0.14, 0.18, 0.2, mat('#d8cdb6'), 0.13, 0.1, 0.0, { ry: 0.2 }); }
    }
    if (text) tagCard(g, String(text).slice(0, 6), 0, h * 0.55, d / 2 + 0.004, { w: 0.2, h: 0.1 });
  },
  furoshiki(g, state) {
    const cloth = mat('#3c6b5a', { roughness: 0.95 });
    if (state === '系着') {
      P.soft(g, 0.3, 0.18, 0.28, cloth, 0, 0.09, 0, { r: 0.07 });
      sphere(g, 0.035, cloth, 0, 0.19, 0, { sy: 0.7 });
      for (const s of [-1, 1]) box(g, 0.05, 0.012, 0.03, cloth, s * 0.05, 0.21, 0, { rz: s * 0.6 });
    } else {
      box(g, 0.6, 0.006, 0.6, cloth, 0, 0.003, 0, { ry: 0.785 });
      box(g, 0.22, 0.12, 0.18, mat('#d8cdb6'), 0, 0.066, 0);
    }
  },
  'parcel-tagged'(g, state, { text }) {
    const w = 0.5, h = 0.28, d = 0.38;
    P.soft(g, w, h, d, M.linen, 0, h / 2, 0, { r: 0.05 });
    ropeCross(g, w * 0.98, h, d * 0.98);
    tagCard(g, String(text ?? '旧物').slice(0, 6), 0.12, h * 0.55, d / 2 + 0.012, { w: 0.13, h: 0.08 });
  },
  'paper-bag'(g, state) {
    const k = mat('#b48a5e', { roughness: 0.95 });
    if (state === '空') { box(g, 0.24, 0.01, 0.34, k, 0, 0.005, 0); return; }
    box(g, 0.22, 0.28, 0.13, k, 0, 0.14, 0);
    box(g, 0.22, 0.03, 0.01, k, 0, 0.29, 0.06, { rx: -0.3 });
    for (let i = 0; i < 3; i++) cyl(g, 0.012, 0.012, 0.2, i ? mat('#5f8a3e') : mat('#f2efe2'), -0.05 + i * 0.03, 0.34, 0, { rz: (i - 1) * 0.15 });
  },
  'sorting-pile'(g, state, { rand }) {
    if (state === '留着') {
      stackBooks(group(g, -0.1, 0, 0), 4, rand);
      box(g, 0.2, 0.08, 0.16, mat('#8a6a4a'), 0.14, 0.04, 0.02, { ry: 0.3 });
      box(g, 0.18, 0.004, 0.13, mat('#f2e8d2'), 0.14, 0.082, 0.02, { ry: 0.3 });
    } else if (state === '要晒') {
      P.soft(g, 0.5, 0.12, 0.36, M.futonBlue, 0, 0.06, 0, { r: 0.04 });
      P.soft(g, 0.42, 0.07, 0.3, M.linen, 0.02, 0.155, 0, { r: 0.03, ry: 0.1 });
      stackBooks(group(g, -0.05, 0.19, 0), 2, rand);
    } else {
      box(g, 0.3, 0.2, 0.24, mat('#9a8268', { roughness: 0.95 }), -0.08, 0.1, 0, { ry: -0.15 });
      box(g, 0.16, 0.06, 0.12, mat('#6b6158'), 0.18, 0.03, 0.06, { ry: 0.6 });
      cyl(g, 0.05, 0.04, 0.09, M.ceramicBrown, 0.14, 0.045, -0.12);
      box(g, 0.14, 0.004, 0.1, M.paper, 0.0, 0.205, 0.0, { ry: 0.4 });
    }
    // 插在前面的纸牌
    cyl(g, 0.004, 0.004, 0.38, M.bamboo, 0, 0.19, 0.2);
    tagCard(g, state, 0, 0.34, 0.204, { w: 0.12, h: 0.08, color: state === '要扔' ? '#b3261e' : '#2a2420' });
  },
  'old-books-airing'(g, state, { rand }) {
    if (state === '收起来') { stackBooks(g, 6, rand, { w: 0.15, d: 0.21 }); return; }
    for (let i = 0; i < 6; i++) {
      const x = -0.34 + (i % 3) * 0.34, z = -0.13 + Math.floor(i / 3) * 0.27;
      P.book(g, x, 0, z, (rand() - 0.5) * 0.3, { open: true, w: 0.14, d: 0.2, color: bookColor(rand) });
    }
  },
  'old-quilt-airing'(g, state) {
    const m = M.futonBlue;
    if (state === '叠起来') { for (let i = 0; i < 3; i++) P.soft(g, 0.62, 0.09, 0.5, m, 0, 0.045 + i * 0.09, 0, { r: 0.035 }); return; }
    P.soft(g, 1.5, 0.06, 0.95, m, 0, 0.03, 0, { r: 0.03 });
    P.soft(g, 1.52, 0.07, 0.22, m, 0, 0.06, -0.36, { r: 0.03, rx: 0.06 });
  },

  'bowls-chopsticks'(g, state) { setting(g, 0, 0, state === '吃完了'); },
  'tea-set'(g, state) {
    box(g, 0.42, 0.02, 0.28, M.lacquerBlack, 0, 0.01, 0);
    const tray = group(g, 0, 0.02, 0);
    P.teapot(tray, -0.08, 0, 0, M.ceramicBrown);
    const n = state === '三只杯子' ? 3 : state === '两只杯子' ? 2 : 0;
    [[0.1, -0.07], [0.1, 0.07], [0.17, 0]].slice(0, n).forEach(([x, z]) => cupAt(tray, x, z));
  },
  teacup(g, state) { cupAt(g, 0, 0, state === '有茶'); },
  'dish-stack'(g, state) {
    for (let i = 0; i < 4; i++) plate(g, 0.11 - i * 0.004, M.ceramic, 0, i * 0.018);
    P.bowl(g, 0, 0.072, 0, 0.06, M.ceramicBlue);
    P.bowl(g, 0, 0.09, 0, 0.055, M.ceramic);
    if (state === '没洗') { box(g, 0.21, 0.008, 0.008, M.lacquerBlack, 0.02, 0.14, 0.01, { ry: 0.5 }); cyl(g, 0.04, 0.04, 0.002, mat('#8a6a3a', { transparent: true, opacity: 0.6 }), 0, 0.105, 0, { cast: false }); }
  },
  'covered-plate'(g, state) {
    plate(g, 0.15, M.ceramicBlue);
    if (state === '空盘') return;
    if (state === '盖着布') {
      P.soft(g, 0.24, 0.06, 0.24, M.linen, 0, 0.045, 0, { r: 0.03 });
      box(g, 0.32, 0.006, 0.32, M.linen, 0, 0.022, 0, { ry: 0.6 });
    } else {
      for (let i = 0; i < 5; i++) { const a = i * 1.25; sphere(g, 0.025, i % 2 ? M.dango : M.pumpkin, Math.cos(a) * 0.06, 0.035, Math.sin(a) * 0.06, { sy: 0.7 }); }
      cyl(g, 0.028, 0.03, 0.02, M.chestnut, 0, 0.03, 0, { seg: 14 });
      P.soft(g, 0.2, 0.02, 0.14, M.linen, 0.24, 0.01, 0.05, { r: 0.009, ry: 0.3 });
    }
  },
  'fruit-plate'(g, state) {
    cyl(g, 0.14, 0.11, 0.03, M.woodLight, 0, 0.015, 0, { seg: 20 });
    if (state === '空盘') return;
    const m = state === '橘子' ? mat('#f09226', { roughness: 0.45 }) : M.persimmon;
    for (let i = 0; i < 4; i++) sphere(g, 0.046, m, Math.cos(i * 1.6) * 0.065, 0.06 + (i === 3 ? 0.045 : 0), Math.sin(i * 1.6) * 0.065, { sy: 0.82, seg: 12 });
  },
  basket(g, state) {
    cyl(g, 0.18, 0.14, 0.12, M.straw, 0, 0.06, 0, { seg: 18 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.01, 4, 20), M.bamboo); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; ring.userData.static = true; g.add(ring);
    const r = mulberry32(state.length * 7);
    if (state === '柿子' || state === '橘子') {
      const m = state === '橘子' ? mat('#f09226', { roughness: 0.45 }) : M.persimmon;
      for (let i = 0; i < 6; i++) sphere(g, 0.045, m, Math.cos(i) * 0.08, 0.12 + (i > 3 ? 0.04 : 0), Math.sin(i) * 0.08, { sy: 0.85, seg: 10 });
    } else if (state === '栗子') {
      for (let i = 0; i < 18; i++) sphere(g, 0.022, M.chestnut, (r() - 0.5) * 0.22, 0.11 + r() * 0.03, (r() - 0.5) * 0.22, { sy: 0.8, seg: 8, cast: false });
    } else if (state === '蔬菜') {
      for (let i = 0; i < 2; i++) sphere(g, 0.085, M.pumpkin, -0.06 + i * 0.1, 0.15, (i % 2) * 0.05 - 0.02, { sy: 0.72, seg: 12 });
      for (let i = 0; i < 2; i++) sphere(g, 0.04, mat('#8a3a4a', { roughness: 0.7 }), 0.1, 0.16, -0.08 + i * 0.1, { sx: 2, seg: 10 });
    }
  },
  'chestnut-bag'(g, state) {
    box(g, 0.12, state === '满的' ? 0.14 : 0.08, 0.08, mat('#b48a5e', { roughness: 0.95 }), 0, state === '满的' ? 0.07 : 0.04, 0);
    const r = mulberry32(12);
    const n = state === '满的' ? 6 : 3;
    for (let i = 0; i < n; i++) sphere(g, 0.022, M.chestnut, 0.1 + r() * 0.08, 0.016, (r() - 0.5) * 0.12, { sy: 0.8, seg: 8, cast: false });
  },
  yokan(g, state) {
    box(g, 0.26, 0.05, 0.1, M.woodLight, 0, 0.025, 0);
    if (state === '吃完了') { box(g, 0.2, 0.002, 0.07, M.paper, 0, 0.051, 0); return; }
    const len = state === '整块' ? 0.22 : state === '切开了' ? 0.18 : 0.05;
    box(g, len, 0.045, 0.065, M.yokan, -0.11 + len / 2 + 0.01, 0.065, 0);
    for (let i = 0; i < Math.round(len / 0.05); i++) sphere(g, 0.012, M.chestnut, -0.09 + i * 0.05, 0.06, 0.033, { sy: 0.7 });
    if (state === '切开了') {
      cyl(g, 0.055, 0.045, 0.012, M.ceramicGreen, 0.2, 0.006, 0.13, { seg: 20 });
      box(g, 0.03, 0.045, 0.065, M.yokan, 0.2, 0.035, 0.13);
      sphere(g, 0.011, M.chestnut, 0.215, 0.035, 0.13, { sy: 0.7 });
      flatPaper(g, 0.1, 0.07, T.noteTex(['主人的份'], { w: 160, h: 110 }), 0.2, 0.014, 0.22, 0.2);
      box(g, 0.006, 0.004, 0.09, M.woodLight, 0.23, 0.07, 0.13, { ry: 0.4 });
    }
  },
  steamer(g, state) {
    cyl(g, 0.17, 0.17, 0.09, M.bamboo, 0, 0.045, 0, { seg: 24 });
    if (state === '空着') { cyl(g, 0.18, 0.18, 0.03, M.straw, 0, 0.1, 0, { seg: 24 }); return; }
    cyl(g, 0.17, 0.17, 0.09, M.bamboo, 0, 0.14, 0, { seg: 24 });
    cyl(g, 0.18, 0.18, 0.03, M.straw, 0, 0.2, 0, { seg: 24 });
    for (let i = 0; i < 5; i++) { const a = i * 1.25; sphere(g, 0.03, i % 2 ? M.pumpkin : M.dango, Math.cos(a) * 0.085, 0.21, Math.sin(a) * 0.085, { sy: 0.7 }); }
    if (state === '掀开了') cyl(g, 0.175, 0.175, 0.04, M.bamboo, 0.26, 0.02, 0.08, { seg: 24 });
    else { cyl(g, 0.175, 0.175, 0.04, M.bamboo, 0.06, 0.26, 0, { rz: 0.25, seg: 24 }); P.steam(g, 0, 0.34, 0, { rate: 2, size: 0.2, rise: 0.25, opacity: 0.18 }); }
  },
  dough(g, state) {
    box(g, 0.7, 0.025, 0.46, M.hinoki, 0, 0.012, 0);
    if (state === '擀开了') box(g, 0.4, 0.006, 0.3, M.dough, -0.05, 0.028, 0, { ry: 0.1 });
    else { sphere(g, 0.11, M.dough, -0.05, 0.065, 0, { sy: 0.55 }); box(g, 0.32, 0.004, 0.26, mat('#e9e1d0', { roughness: 1 }), -0.05, 0.11, 0.02, { rz: 0.15 }); }
    cyl(g, 0.024, 0.024, 0.46, M.woodLight, 0.18, 0.05, 0.05, { rx: Math.PI / 2, ry: 0.3 });
    for (let i = 0; i < 18; i++) { const r = mulberry32(i); box(g, 0.03 + r() * 0.03, 0.002, 0.02 + r() * 0.03, M.flour, -0.3 + r() * 0.5, 0.026, -0.18 + r() * 0.36, { cast: false }); }
    cyl(g, 0.09, 0.07, 0.13, M.ceramic, 0.27, 0.07, -0.13);
  },
  'sugar-salt-jars'(g) {
    P.jar(g, -0.09, 0, 0, '砂糖');
    P.jar(g, 0.09, 0, 0, '塩', { ry: 0.12 });
  },
  'dish-rack'(g, state) {
    for (const x of [-0.22, 0.22]) for (const z of [-0.13, 0.13]) box(g, 0.012, 0.26, 0.012, M.steel, x, 0.13, z);
    for (let yy = 0.04; yy < 0.26; yy += 0.1) { box(g, 0.46, 0.008, 0.008, M.steel, 0, yy, -0.13); box(g, 0.46, 0.008, 0.008, M.steel, 0, yy, 0.13); }
    box(g, 0.48, 0.01, 0.32, M.steel, 0, 0.01, 0);
    if (state === '空') return;
    [[-0.13, 0.075], [0.02, 0.065], [0.15, 0.05]].forEach(([x, r], i) => {
      const b = P.bowl(g, x, 0.2, 0, r, i === 2 ? M.ceramicBlue : M.ceramic);
      b.rotation.x = Math.PI * 0.5; b.position.y = 0.09 + r * 0.7;
    });
  },
  kettle(g, state) {
    sphere(g, 0.11, M.iron, 0, 0.085, 0, { sy: 0.75 });
    cyl(g, 0.012, 0.02, 0.13, M.iron, 0.11, 0.1, 0, { rz: -1.0 });
    const kh = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 16, Math.PI), M.iron); kh.position.y = 0.16; kh.userData.static = true; g.add(kh);
    if (state === '冒着热气') P.steam(g, 0.16, 0.16, 0, { rate: 2, size: 0.14, rise: 0.22, opacity: 0.16 });
  },

  zabuton(g, state, { rand }) {
    const m = rand() < 0.5 ? M.zabuton : M.zabutonBlue;
    P.zabuton(g, 0, 0, 0, 0, m);
    if (state === '两个叠着') P.zabuton(g, 0.02, 0.085, 0.01, 0.12, m === M.zabuton ? M.zabutonBlue : M.zabuton);
  },
  'towels-folded'(g, state) {
    const n = { 三条: 3, 两条: 2, 一条: 1 }[state] || 3;
    for (let i = 0; i < n; i++) P.soft(g, 0.32, 0.07, 0.24, M.towel, 0, 0.035 + i * 0.075, 0, { r: 0.03, ry: i * 0.05 });
  },
  'leg-wraps'(g, state) {
    if (state === '摊开') { for (const s of [0, 1]) box(g, 0.07, 0.004, 0.5, M.white, -0.05 + s * 0.1, 0.002 + s * 0.002, 0, { ry: 0.05 * s }); box(g, 0.2, 0.006, 0.01, M.red, 0, 0.008, 0.2); return; }
    for (const s of [0, 1]) cyl(g, 0.035, 0.035, 0.12, M.white, -0.045 + s * 0.09, 0.035, 0, { rx: Math.PI / 2, seg: 14 });
    box(g, 0.2, 0.006, 0.01, M.red, 0, 0.072, 0.0);
  },
  'hooks-row'(g, state) {
    // 原点在挂钩那条木条的上沿，背面贴墙
    box(g, 0.62, 0.05, 0.02, M.woodLight, 0, -0.025, 0.01);
    for (let i = 0; i < 5; i++) {
      const x = -0.24 + i * 0.12;
      cyl(g, 0.006, 0.006, 0.05, M.brass, x, -0.03, 0.04, { rx: Math.PI / 2 });
      sphere(g, 0.008, M.brass, x, -0.024, 0.064, { seg: 8, segV: 6 });
    }
    if (state === '挂着毛巾') { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.5), fabricTex('towel')); pl.position.set(-0.12, -0.3, 0.07); pl.castShadow = true; pl.userData.static = true; g.add(pl); }
    if (state === '挂着布包') { P.soft(g, 0.22, 0.26, 0.08, mat('#3c6b5a', { roughness: 0.95 }), 0.12, -0.2, 0.08, { r: 0.04 }); cyl(g, 0.004, 0.004, 0.14, M.rope, 0.12, -0.06, 0.07); }
  },
  'laundry-towel'(g, state) {
    hangCloth(g, 0.38, 0.72, fabricTex('towel'), -0.25, 0, 0);
    hangCloth(g, 0.38, 0.72, fabricTex('towel'), 0.25, 0, 1.3);
    if (state === '自动') timeVariant(g, ['dawn', 'day', 'dusk']);
  },
  'laundry-clothes'(g, state) {
    const kind = state === '自动' ? '衬衫' : state;
    if (kind === '衬衫') {
      const m = silhouette('shirt', (c, w, h) => {
        c.fillStyle = '#f4f2ec';
        c.beginPath(); c.moveTo(70, 10); c.lineTo(110, 22); c.lineTo(146, 22); c.lineTo(186, 10); c.lineTo(250, 60); c.lineTo(222, 100); c.lineTo(196, 84); c.lineTo(196, 250); c.lineTo(60, 250); c.lineTo(60, 84); c.lineTo(34, 100); c.lineTo(6, 60); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(120,130,150,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(128, 24); c.lineTo(128, 250); c.stroke();
        c.fillStyle = 'rgba(150,170,200,0.6)'; for (let y = 50; y < 240; y += 40) { c.beginPath(); c.arc(136, y, 4, 0, 7); c.fill(); }
      });
      hangCloth(g, 0.6, 0.6, m, 0, 0, 0.4);
    } else if (kind === '浴衣') {
      const m = silhouette('yukata', (c, w, h) => {
        c.fillStyle = '#2d4a7a'; c.fillRect(0, 0, w, 120); c.fillRect(56, 0, 144, 256);
        c.fillStyle = 'rgba(240,240,250,0.85)'; for (let i = 0; i < 26; i++) { const x = (i * 53) % w, y = (i * 37) % h; if (y < 120 || (x > 56 && x < 200)) { c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); } }
      });
      hangCloth(g, 0.9, 0.85, m, 0, 0, 0.9);
    } else {
      hangCloth(g, 0.24, 0.24, mat('#f2e8f0', { side: THREE.DoubleSide, roughness: 1 }), -0.2, 0, 0.2);
      hangCloth(g, 0.08, 0.26, mat('#3a3a44', { side: THREE.DoubleSide, roughness: 1 }), 0.05, 0, 1.1);
      hangCloth(g, 0.08, 0.26, mat('#3a3a44', { side: THREE.DoubleSide, roughness: 1 }), 0.16, 0, 2.0);
    }
    if (state === '自动') timeVariant(g, ['dawn', 'day', 'dusk']);
  },
  'laundry-quilt'(g, state) {
    const m = M.futonPink;
    P.soft(g, 1.4, 0.75, 0.05, m, 0, -0.38, 0.045, { r: 0.02 });
    P.soft(g, 1.4, 0.55, 0.05, m, 0, -0.28, -0.045, { r: 0.02 });
    cyl(g, 0.05, 0.05, 1.4, m, 0, 0.0, 0, { rz: Math.PI / 2, seg: 12 });
    if (state === '自动') timeVariant(g, ['dawn', 'day', 'dusk']);
  },

  'shoes-loafer'(g, state) { shoePair(g, 'loafer', state); },
  zori(g, state) { shoePair(g, 'zori', state); },
  slippers(g, state) { shoePair(g, 'slipper', state); },
  geta(g, state) { shoePair(g, 'geta', state); },
  umbrella(g, state) {
    if (state === '撑开晾着') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.28, 16, 1, true), mat('#c53a2a', { side: THREE.DoubleSide, roughness: 0.9 }));
      c.position.set(0, 0.54, 0); c.rotation.x = -1.2; c.castShadow = true; c.userData.static = true; g.add(c);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M.bamboo); tip.position.set(0, 0.54 + 0.14 * Math.cos(1.2), -0.14 * Math.sin(1.2)); tip.userData.static = true; g.add(tip);
      cyl(g, 0.008, 0.008, 0.8, M.bamboo, 0, 0.45, 0.24, { rx: -1.2 });
      return;
    }
    cyl(g, 0.055, 0.012, 0.8, mat('#c53a2a', { roughness: 0.9 }), 0, 0.55, 0);
    cyl(g, 0.006, 0.006, 1.0, M.bamboo, 0, 0.5, 0);
  },

  'toy-windup'(g, state) {
    const tin = mat('#e0b23a', { roughness: 0.35, metalness: 0.6 }), red = mat('#c4302b', { roughness: 0.35, metalness: 0.5 });
    const d = live(g);
    const body = group(d, 0, 0.03, 0);
    sphere(body, 0.035, tin, 0, 0.02, 0, { sx: 0.8, sz: 1.2 });
    sphere(body, 0.022, red, 0, 0.05, 0.03);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 8), mat('#d07a2a')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.05, 0.058); body.add(beak);
    for (const s of [-1, 1]) { sphere(body, 0.004, M.black, s * 0.014, 0.058, 0.044, { seg: 6, segV: 4 }); box(body, 0.004, 0.03, 0.004, M.iron, s * 0.012, -0.018, 0); box(body, 0.03, 0.004, 0.025, red, s * 0.03, 0.025, -0.005, { rz: s * 0.4 }); }
    box(body, 0.03, 0.006, 0.03, tin, 0, 0.03, -0.045, { rx: 0.5 });
    const key = group(body, 0, 0.02, -0.04);
    cyl(key, 0.002, 0.002, 0.02, M.steel, 0, 0, -0.01, { rx: Math.PI / 2 });
    const kr = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 4, 12), M.steel); kr.position.z = -0.024; key.add(kr);
    box(d, 0.05, 0.01, 0.07, M.iron, 0, 0.005, 0);
    if (state === '上了发条') {
      onUpdate((dt, t) => {
        body.position.y = 0.03 + Math.abs(Math.sin(t * 9)) * 0.012;
        body.rotation.z = Math.sin(t * 9) * 0.06;
        key.rotation.z = t * 4;
      });
    }
  },
  daruma(g, state) {
    sphere(g, 0.06, M.red, 0, 0.068, 0, { sy: 1.15 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), mat('#f4ecd8'));
    face.position.set(0, 0.085, 0.052); face.rotation.x = -0.15; face.userData.static = true; g.add(face);
    const n = state === '两只眼都画了' ? 2 : state === '画了一只眼' ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), i < n ? M.black : mat('#f9f4e8'));
      e.position.set(i ? -0.012 : 0.012, 0.092, 0.054); e.rotation.x = -0.15; e.userData.static = true; g.add(e);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.0095, 14), M.black); ring.position.copy(e.position); ring.position.z += 0.0005; ring.rotation.x = -0.15; ring.userData.static = true; g.add(ring);
    }
  },
  'paper-crane'(g, state) {
    const cols = ['#c9302c', '#2d4a7a', '#e9b23a'];
    const crane = (x, z, ry, c) => {
      const k = group(g, x, 0, z, ry);
      const m = mat(c, { side: THREE.DoubleSide, roughness: 1 });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), m); body.rotation.set(Math.PI / 2, 0, Math.PI / 4); body.scale.set(1, 1, 0.5); body.position.y = 0.015; k.add(body);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, -0.02), new THREE.Vector3(0, 0.02, 0.02), new THREE.Vector3(s * 0.06, 0.045, 0)]), m);
        wing.geometry.computeVertexNormals(); k.add(wing);
      }
      box(k, 0.004, 0.004, 0.05, m, 0, 0.03, 0.035, { rx: -0.7 });
      box(k, 0.004, 0.004, 0.045, m, 0, 0.028, -0.032, { rx: 0.6 });
      k.traverse((o) => { if (o.isMesh) { o.userData.static = true; o.castShadow = true; } });
    };
    if (state === '三只') { crane(-0.07, 0, 0.3, cols[0]); crane(0.06, -0.03, -0.4, cols[1]); crane(0.0, 0.07, 1.2, cols[2]); }
    else crane(0, 0, 0.3, cols[0]);
  },
  koma(g, state) {
    const pts = [[0.001, 0], [0.02, 0.012], [0.04, 0.03], [0.042, 0.04], [0.03, 0.05], [0.008, 0.055], [0.006, 0.08], [0.001, 0.08]].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 20);
    const top = new THREE.Mesh(geo, mat('#b8834e', { roughness: 0.5 }));
    top.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.006, 20), M.red); band.position.y = 0.036;
    const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.005, 20), M.ceramicBlue); band2.position.y = 0.046;
    const d = live(g);
    const spin = group(d);
    spin.add(top, band, band2);
    if (state === '转着') onUpdate((dt, t) => { spin.rotation.y = t * 30; d.rotation.x = Math.sin(t * 3) * 0.05; d.rotation.z = Math.cos(t * 3) * 0.05; });
    else { d.rotation.z = Math.PI / 2 - 0.35; d.position.y = 0.04; }
  },
  uchiwa(g) {
    const tex = T.cached('uchiwaTex', () => T.canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#f6f1e4'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
      c.fillStyle = '#d8402a'; c.beginPath(); c.ellipse(56, 70, 18, 10, 0.4, 0, 7); c.fill(); c.beginPath(); c.moveTo(40, 60); c.lineTo(24, 48); c.lineTo(28, 76); c.fill();
      c.strokeStyle = 'rgba(120,140,190,0.6)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(84 + i * 6, 40 - i * 7, 4 + i, 0, 7); c.stroke(); }
    }, { repeat: false }));
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.006, -0.04); m.userData.static = true; g.add(m);
    box(g, 0.016, 0.008, 0.16, M.bamboo, 0, 0.004, 0.13);
  },
  'photo-frame'(g) { P.photoFrame(g, 0, 0, 0, 0).scale.setScalar(0.82); },
  'half-frame'(g, state) {
    const w = 0.17, h = 0.21, t = 0.018, wd = M.woodOld;
    box(g, w, t, t, wd, 0, t / 2, -h / 2 + t / 2);
    box(g, t, t, h, wd, -w / 2 + t / 2, t / 2, 0);
    box(g, t, t, h, wd, w / 2 - t / 2, t / 2, 0);
    if (state === '做好了') box(g, w, t, t, wd, 0, t / 2, h / 2 - t / 2);
    else {
      box(g, w, t, t, wd, 0.03, t / 2, h / 2 + 0.05, { ry: 0.3 });
      for (let i = 0; i < 3; i++) cyl(g, 0.0015, 0.0015, 0.02, M.steel, 0.12 + i * 0.012, 0.002, 0.08, { rz: Math.PI / 2, cast: false });
      for (let i = 0; i < 10; i++) { const r = mulberry32(i + 7); box(g, 0.006, 0.001, 0.004, mat('#d9c39a'), (r() - 0.5) * 0.2, 0.001, (r() - 0.5) * 0.24, { cast: false }); }
      box(g, 0.07, 0.002, 0.05, mat('#b4553a'), -0.12, 0.001, -0.06, { ry: 0.5 });
    }
  },
  'pocket-watch'(g, state) {
    if (state === '打开') { P.pocketWatch(g, 0, 0, 0, 0.6); return; }
    cyl(g, 0.026, 0.026, 0.014, M.brass, 0, 0.007, 0, { seg: 24 });
    cyl(g, 0.005, 0.005, 0.008, M.brass, 0, 0.007, 0.03, { rx: Math.PI / 2 });
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.0018, 4, 30, Math.PI * 1.3), M.brass);
    chain.rotation.x = -Math.PI / 2; chain.position.set(0.02, 0.002, 0.065); chain.userData.static = true; g.add(chain);
  },
  'watch-parts'(g, state) {
    if (state === '收进小盒') { cyl(g, 0.05, 0.05, 0.025, mat('#7a8a8a', { metalness: 0.6, roughness: 0.4 }), 0, 0.0125, 0, { seg: 20 }); return; }
    P.watchParts(g, 0, 0, 0, 0);
  },

  toolbag(g, state) {
    if (state === '摊开') {
      box(g, 0.5, 0.006, 0.28, M.canvasBag, 0, 0.003, 0);
      cyl(g, 0.008, 0.008, 0.18, M.steel, -0.15, 0.012, 0, { rx: Math.PI / 2 });
      box(g, 0.03, 0.02, 0.12, M.red, -0.08, 0.016, 0);
      box(g, 0.14, 0.012, 0.03, M.steel, 0.05, 0.012, -0.05, { ry: 0.2 });
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), M.copper); coil.rotation.x = -Math.PI / 2; coil.position.set(0.17, 0.01, 0.05); coil.userData.static = true; g.add(coil);
      return;
    }
    P.soft(g, 0.44, 0.24, 0.22, M.canvasBag, 0, 0.12, 0, { r: 0.05 });
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16, Math.PI), M.woodDark); hd.position.y = 0.24; hd.userData.static = true; g.add(hd);
    cyl(g, 0.008, 0.008, 0.18, M.steel, 0.1, 0.29, 0.03, { rz: 0.4 });
    box(g, 0.03, 0.12, 0.015, M.red, -0.08, 0.28, 0.04, { rz: -0.3 });
    cyl(g, 0.025, 0.025, 0.02, M.copper, 0.0, 0.25, -0.05, { rx: Math.PI / 2 });
  },
  'tool-box'(g, state) {
    const w = 0.42, d = 0.2, h = 0.14;
    boxMM(g, -w / 2, 0, -d / 2, w / 2, 0.012, d / 2, M.woodLight);
    boxMM(g, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.012, M.woodLight); boxMM(g, -w / 2, 0, d / 2 - 0.012, w / 2, h, d / 2, M.woodLight);
    boxMM(g, -w / 2, 0, -d / 2, -w / 2 + 0.012, h + 0.1, d / 2, M.woodLight); boxMM(g, w / 2 - 0.012, 0, -d / 2, w / 2, h + 0.1, d / 2, M.woodLight);
    cyl(g, 0.012, 0.012, w, M.woodMid, 0, h + 0.08, 0, { rz: Math.PI / 2 });
    if (state === '打开') { box(g, 0.3, 0.02, 0.05, M.steel, 0, h - 0.02, -0.04); box(g, 0.06, 0.03, 0.12, M.woodDark, 0.1, h - 0.01, 0.03); }
    else { box(g, w - 0.03, 0.01, d / 2 - 0.01, M.woodMid, 0, h, -d / 4); box(g, w - 0.03, 0.01, d / 2 - 0.01, M.woodMid, 0, h, d / 4); }
  },
  'tools-carpentry'(g, state) {
    if (state === '收好') { cyl(g, 0.06, 0.06, 0.45, M.canvasBag, 0, 0.06, 0, { rz: Math.PI / 2 }); box(g, 0.02, 0.122, 0.12, M.rope, 0.1, 0.06, 0); return; }
    box(g, 0.32, 0.002, 0.09, M.steel, -0.05, 0.003, -0.12);
    box(g, 0.1, 0.03, 0.04, M.woodMid, -0.26, 0.015, -0.12);
    box(g, 0.2, 0.05, 0.06, M.woodLight, 0.1, 0.025, 0.04);
    box(g, 0.04, 0.005, 0.03, M.steel, 0.1, 0.052, 0.04, { rz: 0.4 });
    for (let i = 0; i < 2; i++) { box(g, 0.012, 0.012, 0.12, M.steel, -0.14 + i * 0.05, 0.006, 0.08); box(g, 0.022, 0.022, 0.08, M.woodDark, -0.14 + i * 0.05, 0.011, 0.17); }
    box(g, 0.08, 0.025, 0.025, M.iron, 0.16, 0.0125, -0.04); box(g, 0.016, 0.016, 0.18, M.woodLight, 0.16, 0.008, 0.06);
  },
  stationery(g, state) {
    if (state === '收好') boxMM(g, -0.12, 0, -0.07, 0.12, 0.025, 0.07, M.woodLight);
    const y = state === '收好' ? 0.02 : 0;
    box(g, 0.04, 0.012, 0.02, M.white, -0.06, y + 0.006, -0.02, { ry: 0.3 });
    box(g, 0.2, 0.003, 0.025, mat('#e8e2d0'), 0.0, y + 0.002, 0.04, { ry: -0.1 });
    for (let i = 0; i < 3; i++) cyl(g, 0.0035, 0.0035, 0.15, [M.red, M.black, mat('#3d6a3a')][i], 0.06, y + 0.005, -0.04 + i * 0.012, { rz: Math.PI / 2, ry: 0.2 * i });
    const tape = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 8, 16), mat('#e9e2c8', { roughness: 0.4 })); tape.rotation.x = -Math.PI / 2; tape.position.set(-0.08, y + 0.009, 0.04); tape.userData.static = true; g.add(tape);
  },
  'pen-holder'(g, state) {
    cyl(g, 0.04, 0.04, 0.12, M.bamboo, 0, 0.06, 0);
    if (state === '空') return;
    for (let i = 0; i < 5; i++) cyl(g, 0.004, 0.004, 0.16, [M.red, M.black, M.ceramicBlue, M.woodLight, M.black][i], Math.cos(i * 1.3) * 0.02, 0.13, Math.sin(i * 1.3) * 0.02, { rz: (i - 2) * 0.08, rx: (i % 2) * 0.1 });
  },
  sandpaper(g, state) {
    if (state === '没拆') { box(g, 0.14, 0.012, 0.1, mat('#c9a77a'), 0, 0.006, 0); tagCard(g, '砂紙', 0, 0.013, 0, { w: 0.07, h: 0.04, rx: -Math.PI / 2 }); return; }
    for (let i = 0; i < 3; i++) box(g, 0.12, 0.002, 0.09, mat('#b4553a'), (i - 1) * 0.03, 0.002 + i * 0.002, (i - 1) * 0.02, { ry: i * 0.3, rz: (i - 1) * 0.06 });
    for (let i = 0; i < 12; i++) { const r = mulberry32(i + 30); box(g, 0.005, 0.001, 0.004, mat('#d9c39a'), (r() - 0.5) * 0.24, 0.001, (r() - 0.5) * 0.2, { cast: false }); }
  },
  'sewing-box'(g, state) {
    box(g, 0.22, 0.07, 0.15, M.woodMid, 0, 0.035, 0);
    if (state === '打开') {
      box(g, 0.22, 0.01, 0.15, M.woodMid, 0, 0.13, -0.11, { rx: -1.2 });
      for (let i = 0; i < 3; i++) P.spool(g, -0.06 + i * 0.05, 0.07, 0.02, ['#c9302c', '#2d4a7a', '#f2efe2'][i]);
      sphere(g, 0.025, M.red, 0.07, 0.085, -0.03);
    } else box(g, 0.225, 0.012, 0.155, M.woodDark, 0, 0.076, 0);
  },
  phone(g, state) {
    box(g, 0.07, 0.008, 0.14, M.plasticBlack, 0, 0.004, 0);
    box(g, 0.064, 0.002, 0.13, state === '亮着' ? mat('#cfe4f8', { emissive: new THREE.Color('#7fb2e5'), emissiveIntensity: 0.9, roughness: 0.15 }) : M.screen, 0, 0.009, 0);
  },
  projector(g, state) {
    const body = mat('#3e4a52', { roughness: 0.4, metalness: 0.5 });
    box(g, 0.22, 0.18, 0.3, body, 0, 0.09, 0);
    cyl(g, 0.045, 0.05, 0.14, M.black, 0, 0.1, 0.22, { rx: Math.PI / 2 });
    cyl(g, 0.04, 0.04, 0.005, mat('#a8c8d8', { roughness: 0.05, metalness: 0.6 }), 0, 0.1, 0.292, { rx: Math.PI / 2 });
    if (state === '修到一半') {
      box(g, 0.22, 0.012, 0.3, body, 0.05, 0.25, -0.05, { rz: 0.9 });
      cyl(g, 0.04, 0.04, 0.1, M.black, 0.25, 0.04, 0.05, { rx: Math.PI / 2 });
    } else box(g, 0.22, 0.012, 0.3, body, 0, 0.186, 0);
    box(g, 0.12, 0.05, 0.1, M.woodLight, -0.25, 0.025, 0.05);
    for (let i = 0; i < 5; i++) box(g, 0.05, 0.004, 0.05, M.glass, -0.25, 0.052 + i * 0.006, 0.05);
  },
  kite(g, state) { P.kite(g, 0, 0.012, 0, { rx: -Math.PI / 2, size: 0.55, paper: state === '糊好纸' }); },
  'kite-materials'(g) {
    P.paperStack(g, 0.25, 0, -0.1, 0.2, ['#c9302c', '#e9b23a', '#2d4a7a', '#f3ead6', '#4f8a4a']);
    for (let i = 0; i < 6; i++) box(g, 0.006, 0.006, 0.6, M.bamboo, -0.3 + i * 0.02, 0.004, 0.0, { ry: 0.05 * i });
    P.spool(g, 0.3, 0, 0.15, '#e8dcc0');
    P.spool(g, 0.38, 0, 0.05, '#c9302c');
    cyl(g, 0.035, 0.03, 0.06, M.ceramic, -0.05, 0.03, -0.18);
    box(g, 0.12, 0.006, 0.04, M.steel, 0.05, 0.004, 0.18, { ry: 0.6 });
  },
  spools(g, state) {
    P.spool(g, -0.04, 0, 0, '#e8dcc0');
    if (state === '两个') P.spool(g, 0.04, 0, 0.03, '#2d4a7a');
  },
  'shoji-kit'(g, state) {
    const r = state === '用剩下的' ? 0.03 : 0.065;
    cyl(g, r, r, 0.95, M.paper, 0, r, 0, { rz: Math.PI / 2 });
    cyl(g, 0.07, 0.07, 0.02, M.woodLight, -0.45, 0.07, 0, { rz: Math.PI / 2 });
    P.bowl(g, -0.25, 0, 0.2, 0.08, M.ceramic, state === '用剩下的' ? null : M.flour);
    const brush = group(g, 0.25, 0.0, 0.2, 0.6);
    box(brush, 0.14, 0.03, 0.05, M.woodLight, 0, 0.015, 0);
    box(brush, 0.14, 0.015, 0.06, M.straw, 0, 0.0075, 0.05);
  },
  whetstone(g, state) {
    box(g, 0.22, 0.012, 0.12, M.linen, -0.04, 0.006, 0, { uv: 'box' });
    box(g, 0.2, 0.05, 0.065, mat(state === '湿的' ? '#6f665e' : '#9a8f86', { roughness: state === '湿的' ? 0.25 : 0.6 }), -0.04, 0.037, 0);
    box(g, 0.18, 0.025, 0.06, mat('#c9b9a0', { roughness: 0.4 }), 0.18, 0.0125, 0.06, { ry: 0.3 });
    if (state === '湿的') box(g, 0.2, 0.02, 0.14, M.linen, 0.2, 0.01, -0.03, { ry: 0.4, uv: 'box' });
  },
  'katana-rack'(g, state) {
    for (const x of [-0.3, 0.3]) { box(g, 0.06, 0.42, 0.14, M.lacquerBlack, x, 0.21, 0); box(g, 0.08, 0.04, 0.26, M.lacquerBlack, x, 0.02, 0); }
    if (state === '刀在架上') P.katana(g, 0.05, 0.36, 0.0, 0);
  },
  bucket(g, state) {
    cyl(g, 0.14, 0.12, 0.19, M.hinoki, 0, 0.095, 0, { seg: 20 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.008, 4, 20), M.copper); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; ring.userData.static = true; g.add(ring);
    if (state === '盛着水') cyl(g, 0.13, 0.13, 0.004, M.water, 0, 0.165, 0, { cast: false, batch: false });
  },
  broom(g) {
    cyl(g, 0.012, 0.012, 1.1, M.bamboo, 0, 0.75, 0);
    const br = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 12, 1, true), mat('#a8955a', { side: THREE.DoubleSide, roughness: 1 }));
    br.position.y = 0.16; br.rotation.x = Math.PI; br.scale.z = 0.35; br.castShadow = true; br.userData.static = true; g.add(br);
    box(g, 0.2, 0.03, 0.05, M.rope, 0, 0.3, 0);
  },
  'low-table-small'(g) { P.lowTable(g, -0.35, -0.25, 0.35, 0.25, 0, 0.3); },
};

function shoePair(g, kind, state) {
  const p = P.shoes(g, 0, 0, 0, 0, kind);
  if (state === '随便放') {
    const [a, b] = p.children;
    a.rotation.y = 0.5; a.position.x -= 0.03;
    b.rotation.y = -0.9; b.position.set(b.position.x + 0.08, 0, b.position.z + 0.06);
    if (kind === 'geta' || kind === 'zori') { b.rotation.z = 0; }
  }
}
