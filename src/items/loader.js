import * as THREE from 'three';
import { world, group, interactive } from '../core/build.js';
import { MODEL, kindsOf } from './catalog.js';
import { SLOT } from './slots.js';
import { BUILD } from './models.js';
import { mulberry32 } from '../core/util.js';

// 读物件清单（data/items.json）。路径是相对页面的，带一个防缓存参数，换了文件刷新页面就生效
export async function fetchItems(url = './data/items.json') {
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { error: `读不到物件清单（${res.status}）` };
    const text = await res.text();
    try { return { data: JSON.parse(text) }; } catch (e) { return { error: '物件清单不是合法的 JSON：' + e.message }; }
  } catch (e) {
    return { error: '读不到物件清单：' + e.message };
  }
}

const YAW = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };
const GAP = 0.05;

function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function fail(rec, reason, i) {
  const e = { id: rec?.id ?? `第 ${i + 1} 条`, label: rec?.label || rec?.model || '', slot: rec?.slot || '', reason };
  world.itemErrors.push(e);
  console.warn(`[物件清单] 跳过 ${e.id}${e.label ? '（' + e.label + '）' : ''}：${reason}`);
}

// 按清单把东西摆进房子。必须在房子、家具（位置点）都搭好之后、合并静态网格之前调用
export function placeItems(root, result) {
  world.itemErrors.length = 0;
  const itemsRoot = group(root);
  itemsRoot.name = 'items';
  const data = result?.data;
  if (result?.error) { world.itemErrors.push({ id: 'items.json', label: '', slot: '', reason: result.error }); console.warn('[物件清单]', result.error); }
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  if (data && !list.length && !result?.error) fail(null, '清单里没有 items 数组', 0);

  // 1. 逐条检查
  const seen = new Set();
  const bySlot = new Map();
  const fixtureRecs = new Map();
  list.forEach((rec, i) => {
    if (!rec || typeof rec !== 'object') return fail(rec, '这一条不是一个对象', i);
    if (typeof rec.id !== 'string' || !rec.id.trim()) return fail(rec, '缺少 id', i);
    if (seen.has(rec.id)) return fail(rec, 'id 和前面的重复了', i);
    seen.add(rec.id);
    const m = MODEL[rec.model];
    if (!m) return fail(rec, `不认识的模型「${rec.model}」`, i);
    const s = SLOT[rec.slot];
    if (!s || (!world.slotGeom[rec.slot] && !world.fixtures[rec.slot])) return fail(rec, `不认识的位置点「${rec.slot}」`, i);
    if (s.only && !s.only.includes(rec.model)) return fail(rec, `「${rec.slot}」只能放 ${s.only.map((x) => MODEL[x]?.name || x).join('、')}`, i);
    if (!s.only && !kindsOf(m).some((k) => s.accepts.includes(k))) return fail(rec, `${m.name}（${kindsOf(m).join('/')}）不能放在「${rec.slot}」，这里只收${s.accepts.join('、')}`, i);
    const state = rec.state ?? m.states[0];
    if (!m.states.includes(state)) return fail(rec, `${m.name}没有「${rec.state}」这个状态（可以用：${m.states.join('、')}）`, i);
    const r = { ...rec, state, _i: i };
    if (world.fixtures[rec.slot]) {
      if (fixtureRecs.has(rec.slot)) return fail(rec, `「${rec.slot}」已经有一条了`, i);
      fixtureRecs.set(rec.slot, r);
      return;
    }
    if (!bySlot.has(rec.slot)) bySlot.set(rec.slot, []);
    bySlot.get(rec.slot).push(r);
  });

  // 2. 固定设施：只改状态（清单里没写的用默认状态）
  for (const [name, fx] of Object.entries(world.fixtures)) {
    const rec = fixtureRecs.get(name);
    try { fx.apply(rec ? rec.state : fx.def, rec); } catch (e) { console.error(e); fail(rec, '设置状态时出错：' + e.message, rec?._i ?? 0); }
    if (fx.info) {
      fx.info.name = rec?.label || fx.label;
      fx.info.text = rec?.note ?? fx.note;
      fx.info.id = rec?.id || 'fixture:' + name;
    }
  }

  // 3. 普通物件：按位置点排开
  for (const [name, recs] of bySlot) {
    const s = SLOT[name], geom = world.slotGeom[name];
    const ok = recs.slice(0, s.cap);
    recs.slice(s.cap).forEach((r) => fail(r, `「${name}」最多放 ${s.cap} 件，已经满了`, r._i));
    layoutSlot(itemsRoot, name, geom, ok);
  }
  return { placed: list.length - world.itemErrors.length, errors: world.itemErrors.length };
}

function buildOne(rec, mount) {
  const m = MODEL[rec.model];
  const inner = new THREE.Group();
  BUILD[rec.model](inner, rec.state, { rec, mount, text: rec.text, rand: mulberry32(hash(rec.id)) });
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  inner.traverse((o) => { if (o.isMesh && o.visible !== false && o.geometry) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  if (bb.isEmpty()) bb.set(new THREE.Vector3(-0.05, 0, -0.05), new THREE.Vector3(0.05, 0.1, 0.05));
  const owner = new THREE.Group();
  owner.add(inner);
  inner.position.set(-(bb.min.x + bb.max.x) / 2, 0, mount === 'surface' ? -(bb.min.z + bb.max.z) / 2 : 0);
  return { owner, w: bb.max.x - bb.min.x, d: bb.max.z - bb.min.z, m };
}

function layoutSlot(itemsRoot, name, geom, recs) {
  const [x0, z0, x1, z1] = geom.rect;
  const alongX = geom.face === 'z+' || geom.face === 'z-';
  const W = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const D = alongX ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  const sg = new THREE.Group();
  sg.position.set((x0 + x1) / 2, geom.y, (z0 + z1) / 2);
  sg.rotation.y = YAW[geom.face];
  (geom.parent || itemsRoot).add(sg);
  const flat = geom.mount !== 'surface';

  const built = [];
  for (const rec of recs) {
    let b;
    try { b = buildOne(rec, geom.mount); } catch (e) { console.error(e); fail(rec, '搭模型时出错：' + e.message, rec._i); continue; }
    if (b.w > W + 0.02 || (!flat && b.d > D + 0.02)) { fail(rec, `放不下（${MODEL[rec.model].name}约 ${b.w.toFixed(2)}×${b.d.toFixed(2)} 米，「${name}」只有 ${W.toFixed(2)}×${D.toFixed(2)} 米）`, rec._i); continue; }
    built.push({ rec, ...b });
  }
  // 一行一行排：放不下就换下一行；整体居中
  const rows = [];
  let row = null;
  for (const b of built) {
    if (!row || row.w + GAP + b.w > W + 0.02) { if (flat && row) { fail(b.rec, `「${name}」挂不下了`, b.rec._i); continue; } row = { items: [], w: -GAP, d: 0 }; rows.push(row); }
    row.items.push(b); row.w += GAP + b.w; row.d = Math.max(row.d, b.d);
  }
  let total = -GAP;
  const fit = [];
  for (const r of rows) {
    if (!flat && total + GAP + r.d > D + 0.02) { r.items.forEach((b) => fail(b.rec, `「${name}」地方不够了`, b.rec._i)); continue; }
    total += GAP + r.d; fit.push(r);
  }
  let z = flat ? 0 : -total / 2;
  for (const r of fit) {
    let x = -r.w / 2;
    for (const b of r.items) {
      const rand = mulberry32(hash(b.rec.id) + 1);
      b.owner.position.set(x + b.w / 2, 0, flat ? 0 : z + r.d / 2);
      if (!flat && !geom.neat) b.owner.rotation.y = (rand() - 0.5) * (kindsOf(b.m).includes('大件') ? 0.08 : 0.2);
      sg.add(b.owner);
      interactive(b.owner, { id: b.rec.id, name: b.rec.label || b.m.name, text: b.rec.note ?? b.m.desc, model: b.rec.model });
      after(b);
      x += b.w + GAP;
    }
    z += r.d + GAP;
  }
}

// 个别物件摆好以后还要登记点东西
function after(b) {
  if (b.rec.model === 'pocket-watch') {
    b.owner.updateWorldMatrix(true, false);
    world.watchPos = b.owner.getWorldPosition(new THREE.Vector3());
  }
}
