import * as THREE from 'three';
import { M } from '../core/materials.js';
import { world, box, boxMM, group, addCollider, interactive, onUpdate } from '../core/build.js';

// 推拉门窗。axis='x' 表示门扇沿 x 方向排布（墙在 z=c 上），axis='z' 同理。
// a0..a1 是门扇关着时占的范围；slide 是打开时沿轴移动的距离（有正负）。
const panels = [];
world.panels = panels;   // 调试用

function panelMesh(kind, w, h) {
  const g = new THREE.Group();
  const T = 0.03;
  if (kind === 'shoji' || kind === 'shojiTorn') {
    // 木格子（会投下格子影子）+ 和纸（不投影、略微自发光，像背光的纸）
    const lat = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.shojiLattice);
    lat.position.z = 0.012; lat.castShadow = true; g.add(lat);
    const lat2 = lat.clone(); lat2.position.z = -0.012; g.add(lat2);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.97, h * 0.97), kind === 'shojiTorn' ? M.shojiPaperTorn : M.shojiPaper);
    paper.castShadow = kind === 'shojiTorn'; paper.receiveShadow = true;
    paper.userData.paper = true;
    g.add(paper);
    // 一点厚度
    box(g, w, 0.035, T, M.woodLight, 0, h / 2 - 0.017, 0);
    box(g, w, 0.05, T, M.woodLight, 0, -h / 2 + 0.025, 0);
    box(g, 0.03, h, T, M.woodLight, -w / 2 + 0.015, 0, 0);
    box(g, 0.03, h, T, M.woodLight, w / 2 - 0.015, 0, 0);
  } else if (kind.startsWith('fusuma')) {
    const face = { fusuma: M.fusuma, fusumaBlue: M.fusumaBlue, fusumaGreen: M.fusumaGreen }[kind] || M.fusuma;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), [M.lacquerBlack, M.lacquerBlack, M.lacquerBlack, M.lacquerBlack, face, face]);
    m.castShadow = m.receiveShadow = true; g.add(m);
  } else if (kind === 'glass' || kind === 'window') {
    const fw = kind === 'glass' ? 0.045 : 0.04;
    const fm = M.woodMid;
    box(g, w, fw, T + 0.01, fm, 0, h / 2 - fw / 2, 0);
    box(g, w, fw * 1.6, T + 0.01, fm, 0, -h / 2 + fw * 0.8, 0);
    box(g, fw, h, T + 0.01, fm, -w / 2 + fw / 2, 0, 0);
    box(g, fw, h, T + 0.01, fm, w / 2 - fw / 2, 0, 0);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w - fw, h - fw), M.glass);
    gl.renderOrder = 2; g.add(gl);
    const lat = new THREE.Mesh(new THREE.PlaneGeometry(w - fw * 2, h - fw * 2.6), kind === 'glass' ? M.glassLattice : M.windowLattice);
    lat.position.z = 0.008; lat.castShadow = true; g.add(lat);
  } else if (kind === 'wood') {
    box(g, w, h, 0.04, M.woodOld, 0, 0, 0);
    for (let y = -h / 2 + 0.25; y < h / 2; y += 0.42) box(g, w * 0.96, 0.05, 0.06, M.woodDark, 0, y, 0);
  } else if (kind === 'genkan') {
    // 玄关的格子木门：下半木板，上半竖格子 + 毛玻璃
    box(g, w, h * 0.42, 0.045, M.woodMid, 0, -h * 0.29, 0);
    const frame = M.woodDark;
    box(g, w, 0.06, 0.05, frame, 0, h / 2 - 0.03, 0);
    box(g, 0.06, h, 0.05, frame, -w / 2 + 0.03, 0, 0);
    box(g, 0.06, h, 0.05, frame, w / 2 - 0.03, 0, 0);
    for (let i = 1; i < 9; i++) box(g, 0.022, h * 0.56, 0.04, frame, -w / 2 + (w * i) / 9, h * 0.2, 0);
    const frosted = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h * 0.56), new THREE.MeshStandardMaterial({ color: '#e8efe9', transparent: true, opacity: 0.55, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    frosted.position.y = h * 0.2; g.add(frosted);
  }
  return g;
}

// 生成一扇推拉门扇，并登记交互与动态碰撞
export function slidingPanel(parent, { axis, c, a0, a1, y0, y1, kind = 'shoji', track = 0, slide = 0, open = false, t0, name, text, locked, sound, onToggle }) {
  const w = a1 - a0, h = y1 - y0;
  const g = panelMesh(kind, w, h);
  g.userData.dynamic = true;
  const holder = group(parent);
  holder.add(g);
  const ca = (a0 + a1) / 2, cy = (y0 + y1) / 2;
  const place = (off) => {
    if (axis === 'x') { g.position.set(ca + off, cy, c + track); g.rotation.y = 0; }
    else { g.position.set(c + track, cy, ca + off); g.rotation.y = Math.PI / 2; }
  };
  const col = addCollider(0, 0, 0, 0, 0, 0);
  const tInit = t0 ?? (open ? 1 : 0);
  const p = { g, place, t: tInit, target: tInit, slide, col, axis, c: c + track, ca, w, y0, y1, locked, sound };
  const sync = () => {
    const off = slide * easeInOut(p.t);
    place(off);
    const half = w / 2, th = 0.05;
    if (axis === 'x') { col.minX = ca + off - half; col.maxX = ca + off + half; col.minZ = p.c - th; col.maxZ = p.c + th; }
    else { col.minZ = ca + off - half; col.maxZ = ca + off + half; col.minX = p.c - th; col.maxX = p.c + th; }
    col.minY = y0; col.maxY = y1;
  };
  p.sync = sync;
  sync();
  panels.push(p);
  interactive(g, {
    kind: 'door',
    name: name || '门',
    text,
    get verb() { return locked ? '看看' : (p.target > 0.5 ? '关上' : '拉开'); },
    use() {
      if (locked) return locked;
      if (p.pair) {
        // 成对的两扇：同一时间只让一扇滑开（点的那扇），免得两扇交叉把门洞整个堵上
        const other = p.pair.a === p ? p.pair.b : p.pair.a;
        if (p.target > 0.5) p.target = 0;
        else { other.target = 0; p.target = 1; }
      } else p.target = p.target > 0.5 ? 0 : 1;
      world.sound?.(sound || (kind === 'shoji' || kind === 'shojiTorn' ? 'shoji' : kind === 'genkan' ? 'genkan' : 'slide'));
      onToggle?.(p.target);
      return null;
    },
  });
  return p;
}

// 把两扇门配成一对，mover 是打开时滑动的那一扇（另一扇一直关着）
export function pairPanels(a, b, mover) {
  a.pair = b.pair = { a, b, mover };
  const other = mover === a ? b : a;
  other.t = other.target = 0;
  other.sync();
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

onUpdate((dt) => {
  for (const p of panels) {
    if (p.t !== p.target) {
      const s = dt / 0.55;
      p.t = p.target > p.t ? Math.min(p.target, p.t + s) : Math.max(p.target, p.t - s);
      p.sync();
      world.shadowDirty = true;
    }
  }
});

// 固定窗（格子 + 玻璃），带窗框
export function fixedWindow(parent, { axis, c, a0, a1, y0, y1, kind = 'window', sill = true }) {
  const w = a1 - a0, h = y1 - y0;
  const g = panelMesh(kind, w, h);
  const ca = (a0 + a1) / 2, cy = (y0 + y1) / 2;
  if (axis === 'x') g.position.set(ca, cy, c); else { g.position.set(c, cy, ca); g.rotation.y = Math.PI / 2; }
  g.traverse((o) => { if (o.isMesh && !Array.isArray(o.material)) o.userData.static = true; });
  parent.add(g);
  if (sill) {
    // 窗台面比墙洞下沿高 8 毫米，免得和墙顶面重在一起闪
    if (axis === 'x') boxMM(parent, a0 - 0.04, y0 - 0.05, c - 0.1, a1 + 0.04, y0 + 0.008, c + 0.1, M.woodMid);
    else boxMM(parent, c - 0.1, y0 - 0.05, a0 - 0.04, c + 0.1, y0 + 0.008, a1 + 0.04, M.woodMid);
  }
  return g;
}
