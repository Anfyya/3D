import * as THREE from 'three';
import { M } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, group, addCollider, area, interactive, slot, fixture } from '../core/build.js';
import { slidingPanel, fixedWindow, pairPanels } from './doors.js';
import { F1, C1, F2, C2, TOP, HX0, HX1, HZ0, HZ1, DOMA_Y, BATH_Y, STAIRS } from './layout.js';

export { F1, C1, F2, C2, TOP, HX0, HX1, HZ0, HZ1 };
const WT_OUT = 0.16, WT_IN = 0.1, POST = 0.14;

// 墙面减去洞口后剩下的矩形
function spans(a0, a1, y0, y1, openings) {
  const cuts = new Set([a0, a1]);
  for (const o of openings) { if (o.a1 > a0 && o.a0 < a1) { cuts.add(Math.max(a0, o.a0)); cuts.add(Math.min(a1, o.a1)); } }
  const xs = [...cuts].sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const s0 = xs[i], s1 = xs[i + 1];
    if (s1 - s0 < 1e-4) continue;
    const mid = (s0 + s1) / 2;
    const hits = openings.filter((o) => o.a0 <= mid && mid <= o.a1 && o.y1 > y0 && o.y0 < y1);
    if (!hits.length) { out.push([s0, s1, y0, y1]); continue; }
    hits.sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const o of hits) {
      if (o.y0 > y + 1e-4) out.push([s0, s1, y, Math.min(o.y0, y1)]);
      y = Math.max(y, o.y1);
    }
    if (y < y1 - 1e-4) out.push([s0, s1, y, y1]);
  }
  return out;
}

function slab(parent, axis, c, s, t, mat, o = {}) {
  const [a0, a1, y0, y1] = s;
  if (axis === 'x') return boxMM(parent, a0, y0, c - t / 2, a1, y1, c + t / 2, mat, o);
  return boxMM(parent, c - t / 2, y0, a0, c + t / 2, y1, a1, mat, o);
}

function post(parent, axis, c, a, y0, y1, mat = M.post, size = POST) {
  if (axis === 'x') return boxMM(parent, a - size / 2, y0, c - size / 2, a + size / 2, y1, c + size / 2, mat, { collide: true });
  return boxMM(parent, c - size / 2, y0, a - size / 2, c + size / 2, y1, a + size / 2, mat, { collide: true });
}

// 欄間：墙上门楣以上的镂空木格
function ranmaFill(parent, axis, c, o) {
  const w = o.a1 - o.a0, h = o.y1 - o.y0;
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.max(1, Math.round(w / 0.9)));
  const m = new THREE.Mesh(geo, M.ranma);
  if (axis === 'x') m.position.set((o.a0 + o.a1) / 2, (o.y0 + o.y1) / 2, c);
  else { m.position.set(c, (o.y0 + o.y1) / 2, (o.a0 + o.a1) / 2); m.rotation.y = Math.PI / 2; }
  m.castShadow = true; m.receiveShadow = true;
  m.userData.static = true;
  parent.add(m);
  slab(parent, axis, c, [o.a0, o.a1, o.y0 - 0.05, o.y0], WT_IN + 0.04, M.post);
}

// 室内隔墙：抹灰墙面 + 柱 + 门楣（鸭居）+ 门槛（敷居）+ 欄間
function innerWall(parent, axis, c, a0, a1, y0, y1, openings = [], { mat = M.plasterIn, nageshi = false } = {}) {
  const ops = openings.map((o) => ({ y0, ...o }));
  // 柱子贴着墙端的地方，墙端面和柱面正好在同一个平面上（门框两侧一走近就闪）。
  // 墙板在有柱子的那一端缩进 1 厘米，让墙端面藏进柱子里
  const postAt = new Set([a0, a1]);
  for (const o of ops) {
    if (o.ranma || o.noPosts) continue;
    if (o.a0 - POST / 2 > a0 + POST) postAt.add(o.a0);
    if (o.a1 + POST / 2 < a1 - POST) postAt.add(o.a1);
  }
  const near = (v) => [...postAt].some((p) => Math.abs(p - v) < 1e-4);
  for (const s of spans(a0, a1, y0, y1, ops)) {
    const t = s.slice(), mid = (t[0] + t[1]) / 2;
    const side = !ops.some((o) => o.a0 <= mid && mid <= o.a1);   // 只缩洞口两侧的整段墙，洞口上下那截不动
    if (side && near(t[0])) t[0] += 0.01;
    if (side && near(t[1])) t[1] -= 0.01;
    if (t[1] - t[0] > 0.005) slab(parent, axis, c, t, WT_IN, mat, { collide: true });
  }
  post(parent, axis, c, a0 + POST / 2, y0, y1);
  post(parent, axis, c, a1 - POST / 2, y0, y1);
  for (const o of ops) {
    if (o.ranma) { ranmaFill(parent, axis, c, o); continue; }
    if (!o.noPosts) {
      if (o.a0 - POST / 2 > a0 + POST) post(parent, axis, c, o.a0 - POST / 2, y0, y1);
      if (o.a1 + POST / 2 < a1 - POST) post(parent, axis, c, o.a1 + POST / 2, y0, y1);
    }
    const hy = o.y1;
    // 鸭居比墙洞上沿低 2 厘米，把上面那段墙的底面包住（同一个面上两种材质会闪）
    if (hy < y1 - 0.05) slab(parent, axis, c, [o.a0, o.a1, hy - 0.02, hy + 0.07], WT_IN + 0.05, M.post);
    if (o.y0 <= y0 + 0.01) slab(parent, axis, c, [o.a0, o.a1, y0, y0 + 0.015], WT_IN + 0.05, M.post, { recv: true });
  }
  if (nageshi) for (const s of spans(a0, a1, nageshi, nageshi + 0.09, ops)) slab(parent, axis, c, s, WT_IN + 0.06, M.post);
}

// 外墙：内侧抹灰，外侧下半截焼杉板、上半截白灰，楼层之间一道深色腰带，外侧露柱
function outerWall(parent, axis, c, a0, a1, outSign, openings, extraPosts = []) {
  const inC = c - outSign * WT_OUT / 4, outC = c + outSign * WT_OUT / 4, t = WT_OUT / 2;
  // 落地门窗下面那截墙：墙顶面会和地板面重在同一高度上闪，压低 1 厘米藏进地板里
  const floors = [DOMA_Y, BATH_Y, F1, F2];
  for (const s of spans(a0, a1, 0, TOP, openings)) {
    if (floors.some((f) => Math.abs(s[3] - f) < 1e-4)) s[3] -= 0.01;
    slab(parent, axis, inC, s, t, M.plasterIn, { collide: true });
  }
  for (const s of spans(a0, a1, 0, 1.5, openings)) slab(parent, axis, outC, s, t, M.yakisugi);
  for (const s of spans(a0, a1, 1.5, TOP, openings)) slab(parent, axis, outC, s, t, M.plasterOut);
  const faceC = c + outSign * (WT_OUT / 2 + 0.02);
  for (const s of spans(a0, a1, 1.46, 1.54, openings)) slab(parent, axis, faceC, s, 0.04, M.beam);
  for (const s of spans(a0, a1, C1, F2 + 0.05, openings)) slab(parent, axis, faceC, s, 0.06, M.beam);
  slab(parent, axis, faceC, [a0 - 0.06, a1 + 0.06, TOP - 0.3, TOP], 0.06, M.beam);
  for (const a of [a0 + 0.06, a1 - 0.06, ...extraPosts]) {
    if (axis === 'x') boxMM(parent, a - 0.08, 0, faceC - 0.04, a + 0.08, TOP, faceC + 0.04, M.post);
    else boxMM(parent, faceC - 0.04, 0, a - 0.08, faceC + 0.04, TOP, a + 0.08, M.post);
  }
  for (const o of openings) {
    const fr = 0.07;
    if (axis === 'x') {
      boxMM(parent, o.a0 - fr, o.y1, faceC - 0.03, o.a1 + fr, o.y1 + fr, faceC + 0.03, M.post);
      boxMM(parent, o.a0 - fr, o.y0, faceC - 0.03, o.a0, o.y1, faceC + 0.03, M.post);
      boxMM(parent, o.a1, o.y0, faceC - 0.03, o.a1 + fr, o.y1, faceC + 0.03, M.post);
    } else {
      boxMM(parent, faceC - 0.03, o.y1, o.a0 - fr, faceC + 0.03, o.y1 + fr, o.a1 + fr, M.post);
      boxMM(parent, faceC - 0.03, o.y0, o.a0 - fr, faceC + 0.03, o.y1, o.a0, M.post);
      boxMM(parent, faceC - 0.03, o.y0, o.a1, faceC + 0.03, o.y1, o.a1 + fr, M.post);
    }
  }
}

const tatamiMats = {};
function tatamiMat(seed, age) {
  const k = seed + '|' + age;
  if (!tatamiMats[k]) tatamiMats[k] = new THREE.MeshStandardMaterial({ map: T.tatami({ seed, age }), roughness: 0.9 });
  return tatamiMats[k];
}

// 榻榻米铺法：一行整张、一行错半张
export function tatamiFloor(parent, x0, z0, x1, z1, y, { along = 'x', seed = 1 } = {}) {
  const W = along === 'x' ? x1 - x0 : z1 - z0, D = along === 'x' ? z1 - z0 : x1 - x0;
  const nx = Math.max(1, Math.round(W / 1.8)), nz = Math.max(1, Math.round(D / 0.9));
  const L = W / nx, S = D / nz;
  let k = seed;
  for (let j = 0; j < nz; j++) {
    const segs = [];
    if (j % 2 === 0 || nx < 2) for (let i = 0; i < nx; i++) segs.push([i * L, (i + 1) * L]);
    else { segs.push([0, L / 2]); for (let i = 0; i < nx - 1; i++) segs.push([L / 2 + i * L, L / 2 + (i + 1) * L]); segs.push([W - L / 2, W]); }
    for (const [u0, u1] of segs) {
      const mat = tatamiMat((k++ % 3) + 1, 0.35 + (k % 3) * 0.15);
      const len = u1 - u0, gap = 0.004;
      const m = along === 'x'
        ? boxMM(parent, x0 + u0 + gap, y - 0.05, z0 + j * S + gap, x0 + u1 - gap, y, z0 + (j + 1) * S - gap, mat, { uv: 'box' })
        : boxMM(parent, x0 + j * S + gap, y - 0.05, z0 + u0 + gap, x0 + (j + 1) * S - gap, y, z0 + u1 - gap, mat, { uv: 'box' });
      const uv = m.geometry.attributes.uv;
      // 顶面（第 3 个面）旋转 UV，让畳縁落在长边上
      if (along === 'x') for (let i = 8; i < 12; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
      if (len < L * 0.75) for (let i = 8; i < 12; i++) uv.setY(i, uv.getY(i) * 0.5);
    }
  }
}

// 地板块（可行走）。上面是地板，下面是楼下的天花
function floorSlab(parent, x0, z0, x1, z1, y0, y1, top, bottom = M.ceiling) {
  const side = M.beam;
  return boxMM(parent, x0, y0, z0, x1, y1, z1, [side, side, top, bottom, side, side], { walk: true, tile: top.userData.tile ?? 1.5 });
}

// 天花板下的细木条（竿缘）
function battens(parent, x0, z0, x1, z1, y) {
  for (let x = x0 + 0.45; x < x1 - 0.1; x += 0.45) boxMM(parent, x - 0.016, y - 0.035, z0, x + 0.016, y, z1, M.beam, { cast: false });
}

// 两点之间放一根方木
export function beam(parent, p1, p2, w, h, mat) {
  const d = new THREE.Vector3().subVectors(p2, p1);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
  m.position.copy(p1).addScaledVector(d, 0.5);
  m.lookAt(p2);
  m.castShadow = true; m.receiveShadow = true; m.userData.static = true;
  parent.add(m);
  return m;
}

// 寄栋屋顶（四坡），带出檐、封檐板、椽子和屋脊
export function hipRoof(parent, x0, x1, z0, z1, yWall, { over = 1.1, pitch = 0.5, rafters = true } = {}) {
  const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
  const ye = yWall - over * pitch;
  const along = X1 - X0 >= Z1 - Z0;
  const hs = (along ? Z1 - Z0 : X1 - X0) / 2;
  const yr = ye + hs * pitch;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const R0 = along ? new THREE.Vector3(X0 + hs, yr, cz) : new THREE.Vector3(cx, yr, Z0 + hs);
  const R1 = along ? new THREE.Vector3(X1 - hs, yr, cz) : new THREE.Vector3(cx, yr, Z1 - hs);
  const c00 = new THREE.Vector3(X0, ye, Z0), c10 = new THREE.Vector3(X1, ye, Z0), c11 = new THREE.Vector3(X1, ye, Z1), c01 = new THREE.Vector3(X0, ye, Z1);
  const slope = Math.sqrt(1 + pitch * pitch);
  const tile = 1.2;
  const pos = [], uv = [], idx = [];
  const face = (pts, eaveDir) => {
    const base = pos.length / 3;
    const e0 = pts[0];
    for (const p of pts) {
      pos.push(p.x, p.y, p.z);
      const al = (p.x - e0.x) * eaveDir.x + (p.z - e0.z) * eaveDir.z;
      uv.push(al / tile, ((p.y - ye) / pitch) * slope / tile);
    }
    if (pts.length === 4) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 1, base + 2);
  };
  const ex = new THREE.Vector3(1, 0, 0), ez = new THREE.Vector3(0, 0, 1);
  if (along) {
    face([c01, c11, R1, R0], ex);
    face([c10, c00, R0, R1], ex.clone().negate());
    face([c11, c10, R1], ez.clone().negate());
    face([c00, c01, R0], ez);
  } else {
    face([c11, c10, R0, R1], ez.clone().negate());
    face([c00, c01, R1, R0], ez);
    face([c01, c11, R1], ex);
    face([c10, c00, R0], ex.clone().negate());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const top = new THREE.Mesh(geo, M.roof);
  top.castShadow = true; top.receiveShadow = true; top.userData.static = true;
  parent.add(top);
  const under = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({ map: M.ceiling.map, roughness: 0.9, side: THREE.BackSide }));
  under.position.y = -0.16; under.receiveShadow = true;
  parent.add(under);
  const fh = 0.2;
  boxMM(parent, X0 - 0.03, ye - fh, Z0 - 0.03, X1 + 0.03, ye + 0.02, Z0 + 0.03, M.fascia);
  boxMM(parent, X0 - 0.03, ye - fh, Z1 - 0.03, X1 + 0.03, ye + 0.02, Z1 + 0.03, M.fascia);
  boxMM(parent, X0 - 0.03, ye - fh, Z0, X0 + 0.03, ye + 0.02, Z1, M.fascia);
  boxMM(parent, X1 - 0.03, ye - fh, Z0, X1 + 0.03, ye + 0.02, Z1, M.fascia);
  const tileEnds = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10);
  tileEnds.rotateX(Math.PI / 2);
  const addEnds = (a0, a1, fixed, isX, sign) => {
    for (let a = a0 + 0.15; a < a1 - 0.1; a += 0.32) {
      const m = new THREE.Mesh(tileEnds, M.roofRidge);
      if (isX) m.position.set(a, ye + 0.07, fixed + sign * 0.02);
      else { m.position.set(fixed + sign * 0.02, ye + 0.07, a); m.rotation.y = Math.PI / 2; }
      m.castShadow = true; m.userData.static = true; parent.add(m);
    }
  };
  addEnds(X0, X1, Z0, true, -1); addEnds(X0, X1, Z1, true, 1); addEnds(Z0, Z1, X0, false, -1); addEnds(Z0, Z1, X1, false, 1);
  beam(parent, R0.clone().setY(yr + 0.15), R1.clone().setY(yr + 0.15), 0.4, 0.38, M.roofRidge);
  for (const [c, r] of [[c00, R0], [c01, R0], [c10, R1], [c11, R1]]) beam(parent, c.clone().setY(ye + 0.12), r.clone().setY(yr + 0.12), 0.24, 0.22, M.roofRidge);
  for (const r of [R0, R1]) boxMM(parent, r.x - 0.28, yr + 0.05, r.z - 0.28, r.x + 0.28, yr + 0.7, r.z + 0.28, M.roofRidge);
  if (rafters) {
    const rg = new THREE.BoxGeometry(0.07, 0.08, 1);
    const addR = (x, z, dx, dz) => {
      const len = over;
      const m = new THREE.Mesh(rg, M.fascia);
      m.scale.z = len;
      m.position.set(x + dx * len / 2, yWall - (len / 2) * pitch - 0.22, z + dz * len / 2);
      m.rotation.y = Math.atan2(dx, dz);
      m.rotateX(Math.atan(pitch));
      m.receiveShadow = true; m.userData.static = true;
      parent.add(m);
    };
    for (let x = x0 + 0.2; x < x1; x += 0.5) { addR(x, z0, 0, -1); addR(x, z1, 0, 1); }
    for (let z = z0 + 0.2; z < z1; z += 0.5) { addR(x0, z, -1, 0); addR(x1, z, 1, 0); }
  }
  return { ye, yr };
}

// 单坡的小披檐（庇），沿墙外挑
export function shedRoof(parent, axis, c, outSign, a0, a1, yTop, depth = 1.0, drop = 0.45) {
  const g = group(parent);
  const ang = Math.atan2(drop, depth), len = Math.hypot(depth, drop);
  const sx = axis === 'x' ? a1 - a0 : len, sz = axis === 'x' ? len : a1 - a0;
  const top = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.07, sz), M.roof);
  const uv = top.geometry.attributes.uv;
  // 瓦的横行要和檐口平行
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (axis === 'x') uv.setXY(i, u * sx / 1.2, v * sz / 1.2);
    else uv.setXY(i, v * sz / 1.2, u * sx / 1.2);
  }
  const cxz = c + outSign * depth / 2;
  if (axis === 'x') { top.position.set((a0 + a1) / 2, yTop - drop / 2, cxz); top.rotation.x = outSign * ang; }
  else { top.position.set(cxz, yTop - drop / 2, (a0 + a1) / 2); top.rotation.z = -outSign * ang; }
  top.castShadow = true; top.receiveShadow = true; top.userData.static = true;
  g.add(top);
  const under = top.clone(); under.material = M.ceiling; under.position.y -= 0.08; under.castShadow = false; under.userData.static = true;
  g.add(under);
  const eY = yTop - drop - 0.07;
  if (axis === 'x') boxMM(g, a0, eY - 0.1, c + outSign * depth - 0.03, a1, eY + 0.04, c + outSign * depth + 0.03, M.fascia);
  else boxMM(g, c + outSign * depth - 0.03, eY - 0.1, a0, c + outSign * depth + 0.03, eY + 0.04, a1, M.fascia);
  return g;
}

// 一排推拉门：成对地交替放在两条轨道上，open 里的序号默认拉开
function panelRun(H, axis, c, a0, a1, n, { kind = 'fusuma', y0 = F1, y1 = F1 + 2.3, open = [], name, text, track = 0.03, locked } = {}) {
  const w = (a1 - a0) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = a0 + i * w, p1 = p0 + w;
    out.push(slidingPanel(H, {
      axis, c, a0: p0 - 0.012, a1: p1 + 0.012, y0, y1, kind, track: i % 2 ? track : -track,
      slide: i % 2 ? -w : w, open: open.includes(i), name, text, locked,
    }));
  }
  // 每两扇一对：开的时候只滑一扇（优先用默认开着的那扇）
  for (let i = 0; i + 1 < n; i += 2) pairPanels(out[i], out[i + 1], open.includes(i) && !open.includes(i + 1) ? out[i] : out[i + 1]);
  return out;
}

// 栏杆（二楼回廊、阳台）
function railing(H, x0, z0, x1, z1, y, h = 0.95) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? x1 - x0 : z1 - z0;
  const t = 0.07;
  if (alongX) {
    boxMM(H, x0, y + h - 0.06, z0 - t / 2, x1, y + h, z0 + t / 2, M.woodMid);
    boxMM(H, x0, y + 0.06, z0 - t / 2, x1, y + 0.12, z0 + t / 2, M.woodMid);
    for (let s = 0; s <= len + 1e-3; s += 0.15) boxMM(H, x0 + s - 0.016, y + 0.12, z0 - 0.02, x0 + s + 0.016, y + h - 0.06, z0 + 0.02, M.woodMid);
    for (let s = 0; s <= len + 1e-3; s += Math.max(1.5, len / Math.ceil(len / 2.5))) boxMM(H, x0 + s - 0.05, y, z0 - 0.05, x0 + s + 0.05, y + h + 0.04, z0 + 0.05, M.post);
    addCollider(x0, y, z0 - 0.06, x1, y + h + 0.3, z0 + 0.06);
  } else {
    boxMM(H, x0 - t / 2, y + h - 0.06, z0, x0 + t / 2, y + h, z1, M.woodMid);
    boxMM(H, x0 - t / 2, y + 0.06, z0, x0 + t / 2, y + 0.12, z1, M.woodMid);
    for (let s = 0; s <= len + 1e-3; s += 0.15) boxMM(H, x0 - 0.02, y + 0.12, z0 + s - 0.016, x0 + 0.02, y + h - 0.06, z0 + s + 0.016, M.woodMid);
    for (let s = 0; s <= len + 1e-3; s += Math.max(1.5, len / Math.ceil(len / 2.5))) boxMM(H, x0 - 0.05, y, z0 + s - 0.05, x0 + 0.05, y + h + 0.04, z0 + s + 0.05, M.post);
    addCollider(x0 - 0.06, y, z0, x0 + 0.06, y + h + 0.3, z1);
  }
}

// 楼梯：沿西墙，北端起步往南上二楼。台阶是实心的（箱阶段），东侧有侧板和扶手
function stairs(H) {
  const { x0, x1, zBot, zTop } = STAIRS;
  const n = 20, rise = (F2 - F1) / n, run = (zTop - zBot) / n;
  for (let i = 0; i < n; i++) {
    const za = zBot + i * run, zb = za + run, yt = F1 + (i + 1) * rise;
    boxMM(H, x0, F1, za, x1, yt, zb, M.woodMid, { tile: 0.8 });
    boxMM(H, x0, yt - 0.03, za - 0.03, x1 + 0.02, yt + 0.012, zb, M.woodDark);   // 踏板（比台阶面高一点，不和它抢同一个面）
    // 侧板（一级一级跟着台阶）
    boxMM(H, x1, F1, za, x1 + 0.08, yt + 0.08, zb, M.woodOld);
    if (yt > F1 + 0.6) addCollider(x1 - 0.02, F1, za, x1 + 0.1, yt, zb);       // 楼下的人钻不到楼梯底下
    addCollider(x1, yt + 0.3, za, x1 + 0.1, yt + 1.1, zb);                     // 楼梯上的人不会从东边掉下去
  }
  // 斜坡（看不见，只用来走）
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, Math.hypot(zTop - zBot, F2 - F1)), new THREE.MeshBasicMaterial());
  ramp.rotation.x = -Math.PI / 2 - Math.atan2(F2 - F1, zTop - zBot);
  ramp.position.set((x0 + x1) / 2, (F1 + F2) / 2 + 0.01, (zBot + zTop) / 2);
  ramp.visible = false; ramp.userData.walk = true;
  H.add(ramp);
  // 扶手：东侧一根斜着的木扶手 + 几根立柱；西墙上一根
  const hb = new THREE.Vector3(x1 + 0.04, F1 + 0.95, zBot), ht = new THREE.Vector3(x1 + 0.04, F2 + 0.95, zTop);
  beam(H, hb, ht, 0.07, 0.07, M.woodDark);
  for (let i = 0; i <= 4; i++) {
    const z = zBot + (zTop - zBot) * (i / 4), y = F1 + (F2 - F1) * (i / 4);
    boxMM(H, x1 + 0.0, y, z - 0.04, x1 + 0.08, y + 0.95, z + 0.04, M.woodDark);
  }
  beam(H, new THREE.Vector3(x0 + 0.05, F1 + 0.9, zBot), new THREE.Vector3(x0 + 0.05, F2 + 0.9, zTop), 0.05, 0.05, M.woodMid);
}

// 西侧壁橱：二楼走廊西头，背后就是储物间。上下两层，上层左半边放收进来的被褥
function closet(H) {
  const x0 = -14.92, x1 = -12.4, z0 = 0.57, z1 = 1.46, y = F2, wd = M.woodLight;
  boxMM(H, x0, y, z1 - 0.06, x1 + 0.06, y + 2.05, z1, wd);          // 背板
  boxMM(H, x1, y, z0, x1 + 0.06, y + 2.05, z1 - 0.06, wd);          // 侧板（另一边是储物间）
  boxMM(H, x0, y + 2.05, z0, x1 + 0.06, y + 2.09, z1, wd);          // 顶板
  boxMM(H, x0, y + 0.84, z0, x1, y + 0.88, z1 - 0.06, wd);          // 中段
  boxMM(H, x0, y, z0, x1, y + 0.05, z1 - 0.06, wd);                 // 下层的底板
  addCollider(x0, y + 0.05, z0, x1 + 0.06, y + 2.05, z1);
  slot('西侧壁橱·上层', { rect: [-13.75, 0.62, -12.5, 1.36], y: y + 0.88, face: 'z-' });
  slot('西侧壁橱·下层', { rect: [-14.82, 0.62, -12.48, 1.36], y: y + 0.05, face: 'z-' });
  slot('西侧壁橱·内侧', { rect: [-14.78, 1.4, -12.52, 1.4], y: y + 1.78, face: 'z-', mount: 'wall' });
  world.closetBedding = { x: -14.3, y: y + 0.88, z: 0.98 };
}

export function buildHouse(root) {
  const H = group(root);
  H.name = 'house';

  // ———— 一楼地板 ————
  boxMM(H, -15, 0, -2.5, -12.5, DOMA_Y, 3.5, M.tataki, { walk: true });        // 玄关土间
  floorSlab(H, -12.5, -2.5, -9, 3.5, 0.3, F1, M.floorDark);                    // 玄关板间
  floorSlab(H, -12.95, -8.4, -9, -2.5, 0.3, F1, M.floorDark);                  // 楼梯厅
  floorSlab(H, -15, -10, -9, -8.4, 0.3, F1, M.floorDark);                      // 楼梯口
  floorSlab(H, -9, -10, -1, -2.5, 0.3, F1, M.floor);                           // 厨房
  floorSlab(H, -1, -10, 12, -2.5, 0.3, F1, M.floorDark);                       // 地炉大厅
  floorSlab(H, -9, -2.5, 12, 0.5, 0.3, F1, M.floorDark);                       // 中廊下
  floorSlab(H, 12, -10, 15, 10, 0.3, F1, M.floorDark);                         // 东侧廊下
  floorSlab(H, -9, 0.5, 12, 7.5, 0.3, F1 - 0.05, M.floor);                     // 和室（上面铺榻榻米）
  floorSlab(H, -9, 7.5, 12, 10, 0.3, F1, M.engawa);                            // 广缘
  floorSlab(H, -15, 3.5, -9, 5.5, 0.3, F1, M.floorPale);                       // 脱衣所
  // 浴室：西半边是温泉池（池子在 interior.js 里），地板只铺池子外面
  floorSlab(H, -15, 5.5, -9, 6.0, 0.2, BATH_Y, M.tile);
  floorSlab(H, -11.3, 6.0, -9, 10, 0.2, BATH_Y, M.tile);
  boxMM(H, -12.58, DOMA_Y, -2.5, -12.5, F1 + 0.006, 3.5, M.woodDark);          // 上框
  tatamiFloor(H, -9, 0.5, -1, 7.5, F1, { along: 'x', seed: 1 });
  tatamiFloor(H, -1, 0.5, 7, 7.5, F1, { along: 'x', seed: 2 });
  tatamiFloor(H, 7, 0.5, 12, 7.5, F1, { along: 'z', seed: 3 });

  // ———— 二楼地板（两个通高的地方不铺）————
  floorSlab(H, -15, -3.0, -12.95, -2.5, C1, F2, M.floorDark);                  // 楼梯上来的小平台
  floorSlab(H, -15, -2.5, 15, 0.5, C1, F2, M.floorDark);                       // 二楼走廊
  floorSlab(H, -9, -10, -1, -2.5, C1, F2, M.floor);                            // 空房间
  floorSlab(H, 12, -10, 15, -2.5, C1, F2, M.floor);                            // 空房间
  floorSlab(H, -15, 0.5, 15, 10, C1, F2, M.floor);                             // 南侧几间
  battens(H, -15, -2.5, 15, 10, C1);
  battens(H, -9, -10, -1, -2.5, C1);
  battens(H, 12, -10, 15, -2.5, C1);
  // 二楼天花（通高处就是大厅的天花）
  boxMM(H, -15, C2, -10, 15, C2 + 0.12, 10, [M.beam, M.beam, M.beam, M.ceiling, M.beam, M.beam], { tile: 2.2 });
  battens(H, -15, -10, 15, 10, C2);

  // ———— 外墙 ————
  outerWall(H, 'z', HX0, HZ0, HZ1, -1, [
    { a0: -0.3, a1: 2.3, y0: DOMA_Y, y1: 2.65 },      // 玄关门
    { a0: 6.3, a1: 9.2, y0: 1.2, y1: 2.6 },           // 浴室窗
    { a0: -8.0, a1: -4.0, y0: 5.0, y1: 6.6 },         // 楼梯厅高窗
    { a0: 2.0, a1: 4.0, y0: 5.2, y1: 6.3 },           // 二楼储物间
  ], [-2.5, 5.0]);
  outerWall(H, 'x', HZ0, HX0, HX1, -1, [
    { a0: -12, a1: -10, y0: 1.6, y1: 2.8 },           // 楼梯口
    { a0: -12.4, a1: -9.6, y0: 5.0, y1: 6.6 },        // 楼梯厅高窗
    { a0: -6.6, a1: -4.4, y0: 1.8, y1: 2.9 },         // 厨房（水槽上方）
    { a0: 1.5, a1: 4.5, y0: 1.4, y1: 2.9 },           // 大厅
    { a0: 7.5, a1: 10.5, y0: 1.4, y1: 2.9 },
    { a0: 1.5, a1: 4.5, y0: 5.0, y1: 6.6 },           // 大厅高窗
    { a0: 7.5, a1: 10.5, y0: 5.0, y1: 6.6 },
    { a0: 13, a1: 14.6, y0: F1, y1: 2.8 },            // 东侧廊下北门（通后院）
    { a0: -7.8, a1: -6.2, y0: 5.2, y1: 6.3 },         // 空房间
    { a0: -3.8, a1: -2.2, y0: 5.2, y1: 6.3 },         // 空房间
    { a0: 12.8, a1: 14.2, y0: 5.2, y1: 6.3 },         // 空房间
  ], [-9, -1, 6, 12]);
  outerWall(H, 'z', HX1, HZ0, HZ1, 1, [
    { a0: -6.6, a1: -1.8, y0: F1, y1: 3.1 },          // 东侧廊下朝院子的四扇障子
    { a0: -9.4, a1: -7.8, y0: 1.5, y1: 2.7 },         // 东侧廊下的窗
    { a0: 0.2, a1: 2.6, y0: 1.5, y1: 2.7 },
    { a0: 4.2, a1: 6.6, y0: 1.5, y1: 2.7 },
    { a0: 7.8, a1: 9.4, y0: 1.5, y1: 2.7 },
    { a0: -7, a1: -5.5, y0: 5.2, y1: 6.3 },           // 空房间
    { a0: -1.6, a1: -0.4, y0: 5.2, y1: 6.3 },         // 二楼走廊尽头
    { a0: 3.2, a1: 5.6, y0: 5.25, y1: 6.65 },         // 我的房间东窗（书桌）
  ], []);
  outerWall(H, 'x', HZ1, HX0, HX1, 1, [
    { a0: -14, a1: -10, y0: 1.3, y1: 2.6 },           // 浴室
    { a0: -8.8, a1: 11.8, y0: F1, y1: 3.0 },          // 广缘玻璃门
    { a0: 13, a1: 14.6, y0: F1, y1: 2.8 },            // 东侧廊下南门
    { a0: -14, a1: -12.5, y0: 5.2, y1: 6.2 },         // 二楼储物间
    { a0: -9.5, a1: -4.5, y0: 5.0, y1: 6.4 },         // 书房
    { a0: -2.6, a1: 5.6, y0: F2, y1: 6.7 },           // 作业间 → 阳台
    { a0: 6.6, a1: 14.4, y0: F2, y1: 6.7 },           // 我的房间 → 阳台
  ], [-11]);
  // 四扇障子上面的鸭居：比墙洞上沿低一点，把墙底面包进去
  boxMM(H, HX1 - 0.12, 3.06, -6.65, HX1 + 0.12, 3.16, -1.75, M.post);

  // ———— 一楼隔墙 ————
  innerWall(H, 'x', -2.5, -15, -12.95, DOMA_Y, C1);                                    // 土间北墙
  boxMM(H, -15, DOMA_Y, -3.0, -12.95, C1, -2.56, M.woodOld, { collide: true });        // 楼梯顶下面的储物柜
  innerWall(H, 'x', -2.5, -9, -1, F1, C1, [{ a0: -6.6, a1: -5.0, y1: F1 + 2.3 }]);     // 厨房 | 廊下（暖帘）
  innerWall(H, 'x', -2.5, -1, 12, F1, C1, [                                            // 大厅 | 廊下：几乎全敞开
    { a0: -0.4, a1: 5.32, y1: F1 + 2.5 }, { a0: 5.68, a1: 11.4, y1: F1 + 2.5 },
    { a0: 0.0, a1: 5.2, y0: F1 + 2.72, y1: C1 - 0.16, ranma: true },
    { a0: 5.8, a1: 11.0, y0: F1 + 2.72, y1: C1 - 0.16, ranma: true },
  ]);
  innerWall(H, 'x', 0.5, -9, -1, F1, C1, [{ a0: -7, a1: -3, y1: F1 + 2.3 }, { a0: -8.6, a1: -1.4, y0: F1 + 2.55, y1: C1 - 0.2, ranma: true, noPosts: true }]);
  innerWall(H, 'x', 0.5, -1, 7, F1, C1, [{ a0: 1, a1: 5, y1: F1 + 2.3 }, { a0: -0.6, a1: 6.6, y0: F1 + 2.55, y1: C1 - 0.2, ranma: true, noPosts: true }]);
  innerWall(H, 'x', 0.5, 7, 12, F1, C1, [{ a0: 8.6, a1: 10.4, y1: F1 + 2.3 }, { a0: 7.4, a1: 11.6, y0: F1 + 2.55, y1: C1 - 0.2, ranma: true, noPosts: true }]);
  innerWall(H, 'x', 7.5, -9, 12, F1, C1, [                                             // 和室 | 广缘：敞开
    { a0: -8.6, a1: -1.4, y1: F1 + 2.4 }, { a0: -0.6, a1: 6.6, y1: F1 + 2.4 }, { a0: 7.4, a1: 11.6, y1: F1 + 2.4 },
    { a0: -8.6, a1: -1.4, y0: F1 + 2.6, y1: C1 - 0.2, ranma: true }, { a0: -0.6, a1: 6.6, y0: F1 + 2.6, y1: C1 - 0.2, ranma: true }, { a0: 7.4, a1: 11.6, y0: F1 + 2.6, y1: C1 - 0.2, ranma: true },
  ]);
  innerWall(H, 'z', -9, -10, -2.5, F1, C2);                                            // 楼梯厅 | 厨房（通高）
  innerWall(H, 'z', -9, 0.5, 3.5, F1, C1, [{ a0: 0.9, a1: 2.9, y1: F1 + 2.2 }]);       // 玄关 | 居间
  innerWall(H, 'z', -9, 3.5, 10, BATH_Y - 0.05, C1);                                   // 浴室 | 居间、广缘
  innerWall(H, 'z', -1, -10, -2.5, F1, C2, [{ a0: -8.6, a1: -4.0, y1: F1 + 2.6 }]);    // 厨房 | 大厅
  innerWall(H, 'z', -1, 0.5, 7.5, F1, C1, [{ a0: 0.95, a1: 7.05, y1: F1 + 2.4 }, { a0: 1.0, a1: 7.0, y0: F1 + 2.6, y1: C1 - 0.2, ranma: true }]); // 居间 | 座敷
  innerWall(H, 'z', 7, 0.5, 7.5, F1, C1, [{ a0: 5.2, a1: 7.1, y1: F1 + 2.2 }], { nageshi: F1 + 2.35 }); // 座敷 | 茶之间
  innerWall(H, 'z', 12, -10, -2.5, F1, C2, [{ a0: -9.4, a1: -3.4, y1: F1 + 2.4 }]);    // 大厅 | 东侧廊下
  innerWall(H, 'z', 12, 0.5, 7.5, F1, C1, [{ a0: 2.4, a1: 5.6, y1: F1 + 2.3 }, { a0: 1.0, a1: 7.0, y0: F1 + 2.55, y1: C1 - 0.2, ranma: true, noPosts: true }]);
  innerWall(H, 'x', 3.5, -15, -12.5, DOMA_Y, C1);                                       // 土间 | 脱衣所
  innerWall(H, 'x', 3.5, -12.5, -9, F1, C1, [{ a0: -11.7, a1: -10.5, y1: F1 + 2.1 }]);
  innerWall(H, 'x', 5.5, -15, -9, BATH_Y, C1, [{ a0: -11.7, a1: -10.5, y0: BATH_Y, y1: F1 + 2.1 }]);
  // 大黑柱：大厅和廊下之间那根粗柱子
  boxMM(H, 5.33, F1, -2.67, 5.67, C2, -2.33, M.trunk, { collide: true });

  // ———— 二楼隔墙 ————
  innerWall(H, 'x', -2.5, -9, -5, F2, C2, [{ a0: -7.6, a1: -6.4, y1: F2 + 2.1 }]);
  innerWall(H, 'x', -2.5, -5, -1, F2, C2, [{ a0: -3.6, a1: -2.4, y1: F2 + 2.1 }]);
  innerWall(H, 'x', -2.5, 12, 15, F2, C2, [{ a0: 12.9, a1: 14.1, y1: F2 + 2.1 }]);
  innerWall(H, 'z', -5, -10, -2.5, F2, C2);
  innerWall(H, 'x', 0.5, -15, -11, F2, C2, [{ a0: -14.86, a1: -12.4, y1: F2 + 2.05 }, { a0: -12.12, a1: -11.2, y1: F2 + 2.1 }]);   // 西侧壁橱 + 储物间的门
  innerWall(H, 'x', 0.5, -11, -3, F2, C2, [{ a0: -8, a1: -6, y1: F2 + 2.15 }]);
  innerWall(H, 'x', 0.5, -3, 6, F2, C2, [{ a0: 0, a1: 3, y1: F2 + 2.2 }]);
  innerWall(H, 'x', 0.5, 6, 15, F2, C2, [{ a0: 6.7, a1: 8.7, y1: F2 + 2.15 }]);
  innerWall(H, 'z', -11, 0.5, 10, F2, C2);
  innerWall(H, 'z', -3, 0.5, 10, F2, C2);
  innerWall(H, 'z', 6, 0.5, 10, F2, C2);
  // 回廊栏杆：二楼走廊北边对着两个通高的地方
  railing(H, -12.95, -2.45, -9, -2.45, F2);
  railing(H, -12.9, -3.0, -12.9, -2.5, F2);
  railing(H, -1, -2.45, 12, -2.45, F2);

  // ———— 通高处的梁 ————
  for (const x of [0.6, 3.2, 5.5, 8.2, 10.8]) boxMM(H, x - 0.13, 6.45, -10, x + 0.13, 6.82, -2.5, M.beam);
  boxMM(H, -1, 6.82, -6.48, 12, 7.2, -6.12, M.trunk);                       // 牛梁
  for (const z of [-8.6, -4.4]) boxMM(H, -1, 6.6, z - 0.1, 12, 6.8, z + 0.1, M.beam);
  for (const z of [-6.3]) boxMM(H, -15, 6.5, z - 0.13, -9, 6.85, z + 0.13, M.beam);   // 楼梯厅

  stairs(H);

  // ———— 门 ————
  // 玄关：两扇格子木门。门把手上挂着红铃铛，里面有门闩
  slidingPanel(H, { axis: 'z', c: HX0, a0: -0.3, a1: 1.02, y0: DOMA_Y, y1: 2.65, kind: 'genkan', track: -0.13, slide: -1.3, name: '玄关的门', sound: 'genkan' });
  const genkan = slidingPanel(H, { axis: 'z', c: HX0, a0: 0.98, a1: 2.3, y0: DOMA_Y, y1: 2.65, kind: 'genkan', track: -0.21, slide: 1.3, name: '玄关的门', sound: 'genkan' });
  {
    const g = genkan.g;
    const hx = 0.5, hy = 1.05 - (DOMA_Y + 2.65) / 2;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 20), M.iron);
    handle.position.set(hx, hy, -0.05); g.add(handle);
    const hin = handle.clone(); hin.position.z = 0.05; g.add(hin);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 6), M.red);
    cord.position.set(hx, hy - 0.11, -0.055); g.add(cord);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), M.redBell);
    bell.position.set(hx, hy - 0.2, -0.055); bell.castShadow = true; g.add(bell);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.006, 0.012), M.black);
    slit.position.set(hx, hy - 0.215, -0.094); g.add(slit);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 8), M.red);
    tassel.position.set(hx, hy - 0.28, -0.055); g.add(tassel);
    interactive(bell, {
      name: '门把手上的红铃铛',
      text: '亚托莉在射的屋打靶赢回来的。挂在门把手上，谁一开门它就叮铃一声——不用回头也知道是谁回来了。',
      use() { world.sound?.('bell'); return null; },
    });
  }
  // 门闩
  boxMM(H, -14.93, 1.15, 2.4, -14.825, 1.32, 2.62, M.woodDark);
  const kannuki = boxMM(H, -14.9, 1.19, 2.42, -14.84, 1.28, 3.1, M.woodMid, { batch: false });
  interactive(kannuki, { name: '门闩', text: '一根磨得发亮的木门闩。晚上最后一个进门的人把它插上——一般是亚托莉，她会顺手再摸一下门把上的铃铛。' });

  // 东侧廊下朝院子的四扇障子（纸面新旧由物件清单控制）
  const shoji = panelRun(H, 'z', HX1, -6.6, -1.8, 4, { kind: 'shoji', y0: F1, y1: 3.1, open: [1], name: '障子' });
  world.eastBays = [0, 2].map((i) => () => Math.min(1, shoji[i].t + shoji[i + 1].t) * 0.8);
  const nth = ['第一扇', '第二扇', '第三扇', '第四扇'];
  shoji.forEach((p, i) => {
    const paper = p.g.children.find((o) => o.userData.paper);
    const info = p.g.userData.info;
    fixture(`东侧廊下·障子${i + 1}`, {
      model: 'shoji-east', def: '新糊', info,
      label: `东侧廊下的障子（${nth[i]}）`,
      note: '东侧廊下朝院子的格子纸门，一共四扇。',
      apply(state) { paper.material = state === '破洞' ? M.shojiPaperTorn : M.shojiPaperNew; paper.castShadow = state === '破洞'; },
    });
  });
  // 东侧廊下两头的门
  slidingPanel(H, { axis: 'x', c: HZ0, a0: 13, a1: 14.6, y0: F1, y1: 2.8, kind: 'wood', track: 0.11, slide: -1.58, name: '后门（通后院）' });
  slidingPanel(H, { axis: 'x', c: HZ1, a0: 13, a1: 14.6, y0: F1, y1: 2.8, kind: 'glass', track: -0.11, slide: -1.58, open: true, name: '通往缘侧的玻璃门' });
  // 广缘的玻璃门
  panelRun(H, 'x', HZ1, -8.8, 11.8, 8, { kind: 'glass', y0: F1, y1: 3.0, open: [1, 2, 5, 6], name: '广缘的玻璃门' });
  // 二楼：作业间、我的房间 → 阳台
  panelRun(H, 'x', HZ1, -2.6, 5.6, 4, { kind: 'glass', y0: F2, y1: 6.7, open: [2], name: '通往阳台的玻璃门' });
  panelRun(H, 'x', HZ1, 6.6, 14.4, 4, { kind: 'glass', y0: F2, y1: 6.7, open: [1], name: '通往阳台的玻璃门' });
  // 我的房间东窗：开着一条缝
  slidingPanel(H, { axis: 'z', c: HX1, a0: 3.2, a1: 4.42, y0: 5.25, y1: 6.65, kind: 'window', track: -0.03, slide: 1.18, name: '窗' });
  slidingPanel(H, { axis: 'z', c: HX1, a0: 4.38, a1: 5.6, y0: 5.25, y1: 6.65, kind: 'window', track: 0.03, slide: -1.18, t0: 0.16, name: '窗（开着一条缝）',
    text: '窗棂上的木格子被擦得很干净。拉开一条缝就能看见天；清早往外看，满山都是雾，那棵树的红叶浮在雾上面。' });
  boxMM(H, 14.82, 5.18, 3.15, 15.12, 5.258, 5.65, M.woodMid);

  // 室内的推拉门
  panelRun(H, 'x', 0.5, -7, -3, 4, { kind: 'fusumaGreen', open: [1, 2], name: '居间的襖' });
  panelRun(H, 'x', 0.5, 1, 5, 4, { kind: 'fusuma', open: [1, 2], name: '座敷的襖' });
  panelRun(H, 'x', 0.5, 8.6, 10.4, 2, { kind: 'fusumaBlue', open: [1], name: '茶之间的襖' });
  panelRun(H, 'z', -9, 0.9, 2.9, 2, { kind: 'fusumaGreen', y1: F1 + 2.2, open: [1], name: '居间的襖' });
  panelRun(H, 'z', 7, 5.2, 7.1, 2, { kind: 'fusuma', y1: F1 + 2.2, open: [1], name: '茶之间的襖' });
  panelRun(H, 'z', 12, -9.4, -3.4, 4, { kind: 'shoji', y1: F1 + 2.4, open: [1, 2], name: '大厅的障子' });
  panelRun(H, 'z', 12, 2.4, 5.6, 2, { kind: 'shoji', open: [1], name: '茶之间的障子' });
  slidingPanel(H, { axis: 'x', c: 3.5, a0: -11.7, a1: -10.5, y0: F1, y1: F1 + 2.1, kind: 'wood', track: 0.08, slide: 1.18, open: true, name: '脱衣所的门' });
  slidingPanel(H, { axis: 'x', c: 5.5, a0: -11.7, a1: -10.5, y0: BATH_Y, y1: F1 + 2.1, kind: 'glass', track: 0.08, slide: 1.18, name: '浴室的门' });
  // 二楼
  // 北边：亚托莉的房间、丛雨的房间；东北角那间小的空着
  slidingPanel(H, { axis: 'x', c: -2.5, a0: -7.6, a1: -6.4, y0: F2, y1: F2 + 2.1, kind: 'fusumaBlue', slide: 1.18, name: '亚托莉的房间' });
  slidingPanel(H, { axis: 'x', c: -2.5, a0: -3.6, a1: -2.4, y0: F2, y1: F2 + 2.1, kind: 'fusuma', slide: -1.18, name: '丛雨的房间' });
  slidingPanel(H, { axis: 'x', c: -2.5, a0: 12.9, a1: 14.1, y0: F2, y1: F2 + 2.1, kind: 'fusumaBlue', slide: -0.88, name: '空房间的门', text: '东北角这间小的空着，地板擦得干干净净，什么也没摆。' });
  // 西侧壁橱（四扇襖）和旁边储物间的门（往东拉开，贴着书房的墙）
  panelRun(H, 'x', 0.5, -14.86, -12.4, 4, { kind: 'fusuma', y0: F2, y1: F2 + 2.05, open: [1], name: '西侧壁橱' });
  slidingPanel(H, { axis: 'x', c: 0.5, a0: -12.12, a1: -11.2, y0: F2, y1: F2 + 2.1, kind: 'wood', track: -0.1, slide: 0.94, name: '储物间的门' });
  closet(H);
  panelRun(H, 'x', 0.5, -8, -6, 2, { kind: 'fusumaGreen', y0: F2, y1: F2 + 2.15, open: [1], name: '书房的襖' });
  panelRun(H, 'x', 0.5, 0, 3, 2, { kind: 'shoji', y0: F2, y1: F2 + 2.2, open: [1], name: '作业间的障子' });
  panelRun(H, 'x', 0.5, 6.7, 8.7, 2, { kind: 'fusuma', y0: F2, y1: F2 + 2.15, open: [1], name: '我的房间' });

  // ———— 固定窗 ————
  const fw = (axis, c, a0, a1, y0, y1) => fixedWindow(H, { axis, c, a0, a1, y0, y1 });
  fw('z', HX0, 6.3, 9.2, 1.2, 2.6);
  fw('z', HX0, -8.0, -4.0, 5.0, 6.6);
  fw('z', HX0, 2.0, 4.0, 5.2, 6.3);
  fw('x', HZ0, -12, -10, 1.6, 2.8);
  fw('x', HZ0, -12.4, -9.6, 5.0, 6.6);
  fw('x', HZ0, -6.6, -4.4, 1.8, 2.9);
  fw('x', HZ0, 1.5, 4.5, 1.4, 2.9);
  fw('x', HZ0, 7.5, 10.5, 1.4, 2.9);
  fw('x', HZ0, 1.5, 4.5, 5.0, 6.6);
  fw('x', HZ0, 7.5, 10.5, 5.0, 6.6);
  fw('x', HZ0, -7.8, -6.2, 5.2, 6.3);
  fw('x', HZ0, -3.8, -2.2, 5.2, 6.3);
  fw('x', HZ0, 12.8, 14.2, 5.2, 6.3);
  for (const [a0, a1] of [[-9.4, -7.8], [0.2, 2.6], [4.2, 6.6], [7.8, 9.4]]) fw('z', HX1, a0, a1, 1.5, 2.7);   // 东侧廊下的窗
  fw('z', HX1, -7, -5.5, 5.2, 6.3);
  fw('z', HX1, -1.6, -0.4, 5.2, 6.3);
  fw('x', HZ1, -14, -10, 1.3, 2.6);
  fw('x', HZ1, -14, -12.5, 5.2, 6.2);
  fw('x', HZ1, -9.5, -4.5, 5.0, 6.4);

  // ———— 屋顶 ————
  hipRoof(H, HX0, HX1, HZ0, HZ1, TOP, { over: 1.4, pitch: 0.45 });
  const sy = F2 + 0.4;
  shedRoof(H, 'z', HX0 - 0.08, -1, -10.25, 10.25, sy, 1.6, 0.66);
  shedRoof(H, 'x', HZ0 - 0.08, -1, -15.25, 15.25, sy, 1.3, 0.55);
  shedRoof(H, 'z', HX1 + 0.08, 1, -10.25, 10.4, sy, 1.6, 0.66);
  shedRoof(H, 'x', HZ1 + 0.08, 1, -15.25, -3.0, sy, 1.5, 0.62);

  // ———— 缘侧（外廊）————
  const deck = (x0, z0, x1, z1) => {
    boxMM(H, x0, 0.4, z0, x1, 0.47, z1, M.engawa, { walk: true });
    boxMM(H, x0, 0.12, z0, x1, 0.4, z1, M.woodDark);
  };
  deck(15.08, -10.3, 16.45, 11.45);
  deck(-9, 10.08, 15.08, 11.45);
  for (const z of [-10.2, -5.1, 0, 5.1, 10.2]) boxMM(H, 16.32, 0.47, z - 0.07, 16.46, sy - 0.62, z + 0.07, M.post, { collide: true });
  // 东侧缘侧北段的木栏（四扇障子外面）：早上太阳晒得到，晾东西就摊在这里
  const rx = 16.36;
  boxMM(H, rx - 0.035, 1.03, -9.9, rx + 0.035, 1.09, -1.4, M.woodMid);
  boxMM(H, rx - 0.02, 0.65, -9.9, rx + 0.02, 0.69, -1.4, M.woodMid);
  for (let i = 0; i <= 9; i++) { const z = -9.85 + i * (8.41 / 9); boxMM(H, rx - 0.035, 0.47, z - 0.035, rx + 0.035, 1.03, z + 0.035, M.post); }
  addCollider(rx - 0.06, 0.47, -9.9, rx + 0.06, 1.5, -1.4);
  slot('东侧廊下·木栏边', { rect: [15.15, -9.7, 16.28, -1.6], y: 0.47, face: 'x-' });
  for (const [x, z] of [[16.3, -10.2], [16.3, -3], [16.3, 4], [16.3, 11.3], [-8.9, 11.3], [-3, 11.3], [4, 11.3], [10, 11.3]]) cyl(H, 0.1, 0.12, 0.14, M.granite, x, 0.07, z);

  // ———— 阳台（二楼南侧，下面是缘侧）————
  const by = F2 - 0.05;
  boxMM(H, -3, by - 0.12, 10.08, 15.3, by, 12.1, M.engawa, { walk: true });
  boxMM(H, -3, by - 0.34, 12.0, 15.3, by - 0.12, 12.12, M.beam);
  for (const x of [-2.9, 3.2, 9.2, 15.2]) boxMM(H, x - 0.08, 0, 11.94, x + 0.08, by - 0.12, 12.1, M.post, { collide: true });
  railing(H, -3, 12.06, 15.3, 12.06, by);
  railing(H, -2.96, 10.1, -2.96, 12.06, by);
  railing(H, 15.26, 10.1, 15.26, 12.06, by);
  for (const x of [-1.2, 4.6]) boxMM(H, x - 0.03, by, 11.75, x + 0.03, by + 1.85, 11.81, M.woodDark);
  cyl(H, 0.02, 0.02, 5.9, M.bamboo, 1.7, by + 1.8, 11.78, { rz: Math.PI / 2 });

  // ———— 玄关前、缘侧下的踏石 ————
  boxMM(H, -16.2, 0, -0.4, -15.05, DOMA_Y, 2.4, M.granite, { walk: true });
  boxMM(H, -12.9, DOMA_Y, 0.0, -12.56, 0.32, 2.0, M.granite, { walk: true });
  boxMM(H, 16.45, 0, -1.0, 17.1, 0.22, 0.2, M.stoneWarm, { walk: true });
  boxMM(H, 16.45, 0, 6.0, 17.1, 0.22, 7.2, M.stoneWarm, { walk: true });
  // 广缘玻璃门开着的几扇外面各放一块踏石
  for (const x of [-4.95, -2.2, 0, 5.35, 7.95]) boxMM(H, x - 0.55, 0, 11.45, x + 0.55, 0.22, 12.05, M.stoneWarm, { walk: true });
  boxMM(H, 13, 0, -10.8, 14.6, 0.25, -10.15, M.granite, { walk: true });

  // ———— 区域名（进入时显示）————
  area('玄关', -15, -2.5, -9, 3.5, -1, C1, 3);
  area('楼梯厅', -15, -10, -9, -2.5, -1, C2, 2);
  area('厨房', -9, -10, -1, -2.5, -1, C1, 2);
  area('地炉大厅', -1, -10, 12, -2.5, -1, C1, 2);
  area('一楼廊下', -9, -2.5, 12, 0.5, -1, C1, 1);
  area('东侧廊下', 12, -10, 15, 10, -1, C1, 2);
  area('居间', -9, 0.5, -1, 7.5, -1, C1, 2);
  area('座敷', -1, 0.5, 7, 7.5, -1, C1, 2);
  area('茶之间', 7, 0.5, 12, 7.5, -1, C1, 2);
  area('广缘', -9, 7.5, 12, 10, -1, C1, 2);
  area('脱衣所', -15, 3.5, -9, 5.5, -1, C1, 2);
  area('浴室', -15, 5.5, -9, 10, -1, C1, 2);
  area('楼梯', -15, -8.4, -12.95, -3.0, -1, C2, 3);
  area('二楼走廊', -15, -2.5, 15, 0.5, C1, C2, 2);
  area('二楼走廊', -15, -3.0, -12.95, -2.5, C1, C2, 2);
  area('亚托莉的房间', -9, -10, -5, -2.5, C1, C2, 2);
  area('丛雨的房间', -5, -10, -1, -2.5, C1, C2, 2);
  area('空房间', 12, -10, 15, -2.5, C1, C2, 2);
  area('储物间', -15, 1.45, -11, 10, C1, C2, 2);
  area('储物间', -12.36, 0.5, -11, 1.45, C1, C2, 2);
  area('西侧壁橱', -14.9, 0.5, -12.4, 1.45, C1, C2, 3);
  area('我的房间', 6, 0.5, 15, 10, C1, C2, 2);
  area('作业间', -3, 0.5, 6, 10, C1, C2, 2);
  area('书房', -11, 0.5, -3, 10, C1, C2, 2);
  area('阳台', -3, 10, 15.3, 12.1, C1, C2, 3);
  area('缘侧', -9, 10, 16.5, 11.5, -1, 2.5, 1);
  area('缘侧', 15, -10.5, 16.5, 11.5, -1, 2.5, 1);
  return H;
}
