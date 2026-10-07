import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 场景里所有“登记簿”：碰撞体、可走表面、可交互物、灯、随时间段变化的物体……
export const world = {
  scene: null,
  colliders: [],     // {minX,maxX,minY,maxY,minZ,maxZ,on}
  circles: [],       // {x,z,r,minY,maxY}
  walkables: [],
  pickables: [],
  interactives: [],
  updaters: [],
  lamps: [],
  timeVariants: [],
  areas: [],
  shafts: [],
  tod: { lamp: 0, day: 1, key: 'dusk' },
  slotGeom: {},      // 位置点名字 -> 实际范围（见 slot()）
  fixtures: {},      // 固定设施的位置点名字 -> { apply(state, rec), label, note }
  itemErrors: [],    // items.json 里没能摆上的条目
  onTime: [],        // 时间段切换时要调用的函数
};

export function onUpdate(fn) { world.updaters.push(fn); }

// 位置点：在搭家具的地方顺手登记它的范围，物件清单里的东西按名字摆进来。
//   rect：[x0, z0, x1, z1]（parent 的局部坐标；不给 parent 就是世界坐标），y：台面高度
//   face：人从哪边看它（'x+' 'x-' 'z+' 'z-'），物件正面朝这边，沿垂直方向排开
//   mount：'surface'（台面/地上，默认）、'wall'（贴墙挂，y 是挂钩高度）、'line'（晾衣竿）
export function slot(name, geom) { world.slotGeom[name] = { mount: 'surface', face: 'z+', ...geom }; }
// 固定设施：物件清单只能改它的状态
export function fixture(slotName, def) { world.fixtures[slotName] = def; return def; }
// 灯笼一类：「自动」跟着时间段点灭，「点着 / 熄着」写死
export function lampFixture(slotName, entries, { label, note, info } = {}) {
  return fixture(slotName, {
    model: 'lanterns', def: '自动', label, note, info,
    apply(state) { for (const e of entries) e.override = state === '点着' ? 1 : state === '熄着' ? 0 : null; },
  });
}

// ———— 基础几何 ————
const _v = new THREE.Vector3();

// 按世界坐标铺 UV，相邻的墙面/地板纹理能接上
function worldUV(geo, ox, oy, oz, tile, swap) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; if (swap) [u, v] = [v, u]; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
}

function applyOpts(m, o) {
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.order) m.rotation.order = o.order;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.recv !== false;
  if (o.collide) m.userData.collide = true;
  if (o.walk) m.userData.walk = true;
  if (o.batch !== false && !Array.isArray(m.material)) m.userData.static = true;
  if (o.name) m.name = o.name;
  if (o.visible === false) m.visible = false;
}

export function box(parent, w, h, d, mat, x, y, z, o = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mats = Array.isArray(mat) ? mat : [mat];
  const tile = o.tile ?? mats.find((m) => m.userData?.tile)?.userData.tile;
  if (tile && o.uv !== 'box') worldUV(geo, o.ry ? 0 : x, y, o.ry ? 0 : z, tile, o.swap);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  applyOpts(m, o);
  parent.add(m);
  return m;
}

// 用最小/最大角点定义一个方块，建筑部件用这个最顺手
export function boxMM(parent, x0, y0, z0, x1, y1, z1, mat, o = {}) {
  return box(parent, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat,
    (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
}

export function cyl(parent, rt, rb, h, mat, x, y, z, o = {}) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16, 1, o.open ?? false);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  applyOpts(m, o);
  parent.add(m);
  return m;
}

export function sphere(parent, r, mat, x, y, z, o = {}) {
  const geo = new THREE.SphereGeometry(r, o.seg ?? 16, o.segV ?? 12);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  applyOpts(m, o);
  parent.add(m);
  return m;
}

export function mesh(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.scale) m.scale.setScalar(o.scale);
  applyOpts(m, o);
  parent.add(m);
  return m;
}

export function group(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

// ———— 登记 ————
export function addCollider(x0, y0, z0, x1, y1, z1) {
  const c = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), on: true };
  world.colliders.push(c);
  return c;
}
export function addCircle(x, z, r, minY = -100, maxY = 100) {
  world.circles.push({ x, z, r, minY, maxY });
}

// 可交互：看向它会显示名字，点击/按 E 读出说明
// （不会动的可交互物在 finalize 里照样并进大批次渲染，原网格留作看不见的点选代理）
export function interactive(obj, info) {
  obj.userData.info = info;
  world.interactives.push(obj);
  return obj;
}

// 点选代理所在的图层：相机不画它，射线检测会测它
export const PICK_LAYER = 1;

export function registerLamp(l) { world.lamps.push(l); return l; }
export function timeVariant(obj, keys) { obj.userData.dynamic = true; world.timeVariants.push({ obj, keys }); }
export function area(name, x0, z0, x1, z1, y0 = -50, y1 = 50, prio = 0) {
  world.areas.push({ name, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, prio });
}

// ———— 收尾：算碰撞体、合并网格、收集可交互网格 ————
function sigOf(m) {
  const g = m.geometry;
  return m.material.uuid + '|' + m.castShadow + m.receiveShadow + '|' + Object.keys(g.attributes).sort().join(',') + (g.index ? 'i' : 'n');
}

function mergeInto(target, list, invMatrix) {
  const groups = new Map();
  for (const o of list) {
    const key = sigOf(o);
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    const cg = o.geometry.clone();
    const mtx = invMatrix ? new THREE.Matrix4().multiplyMatrices(invMatrix, o.matrixWorld) : o.matrixWorld;
    cg.applyMatrix4(mtx);
    groups.get(key).geos.push(cg);
    // 可交互物的原网格不删：挪到点选图层，只给射线用
    if (o.userData.proxy) o.layers.set(PICK_LAYER);
    else o.parent.remove(o);
  }
  let n = 0;
  for (const b of groups.values()) {
    for (let i = 0; i < b.geos.length; i += 400) {
      const merged = mergeGeometries(b.geos.slice(i, i + 400), false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv;
      if (!invMatrix) m.matrixAutoUpdate = false;
      target.add(m);
      n++;
    }
    b.geos.forEach((g) => g.dispose());
  }
  return n;
}

const mergeable = (o) => o.isMesh && !o.isInstancedMesh && o.userData.static && !o.userData.walk && o.visible && !Array.isArray(o.material);

// 参数完全一样的材质合成一份，合并时就能并到同一批
function matKey(m) {
  const c = (x) => (x ? x.getHexString() : '');
  return [m.type, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.map?.uuid, m.emissiveMap?.uuid, m.alphaMap?.uuid,
    m.alphaTest, m.transparent, m.opacity, m.side, m.vertexColors, m.depthWrite, m.depthTest, m.blending, m.flatShading, m.visible].join('|');
}

function dedupeMaterials(scene) {
  const keep = new Set();
  for (const l of world.lamps) for (const g of l.mats || []) keep.add(g.mat);
  const canon = new Map();
  const fix = (m) => {
    if (!m || keep.has(m) || m.userData?.noDedupe || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial)) return m;
    const k = matKey(m);
    if (!canon.has(k)) canon.set(k, m);
    return canon.get(k);
  };
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  return canon.size;
}

export function finalize(scene) {
  scene.updateMatrixWorld(true);
  const box3 = new THREE.Box3();
  const sphere = new THREE.Sphere();
  const scl = new THREE.Vector3();
  // 1. 碰撞体（合并之前，按世界包围盒）
  scene.traverse((o) => {
    if (o.isMesh && o.userData.collide) {
      box3.setFromObject(o);
      addCollider(box3.min.x, box3.min.y, box3.min.z, box3.max.x, box3.max.y, box3.max.z);
    }
  });
  const nMats = dedupeMaterials(scene);
  // 2. 收集：全局静态网格 / 各个动态组里面的静态网格。可交互物里的静态网格也进全局批次，原件留作点选代理
  const globalList = [];
  const local = new Map();
  const visit = (o, dynRoot, owner) => {
    if (o !== scene && o.userData.dynamic) { dynRoot = o; if (!local.has(o)) local.set(o, []); }
    if (o.userData.info) owner = o;
    if (mergeable(o)) {
      // 很小的东西（杯子、零件、书）不投影，影子贴图省一大截
      if (o.castShadow) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scl);
        if (o.geometry.boundingSphere.radius * Math.max(scl.x, scl.y, scl.z) < 0.16) o.castShadow = false;
      }
      // 可交互物的网格不管并进哪一批，原件都留作点选代理（不然动态组里的东西点不到）
      if (owner) o.userData.proxy = true;
      if (dynRoot) local.get(dynRoot).push(o);
      else globalList.push(o);
    }
    for (const c of o.children.slice()) visit(c, dynRoot, owner);
  };
  visit(scene, null, null);
  // 3. 合并
  let nLocal = 0;
  for (const [root, list] of local) {
    if (list.length < 2) continue;
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    nLocal += mergeInto(root, list, inv);
  }
  const nGlobal = mergeInto(scene, globalList, null);
  // 4. 可走表面、可交互网格（包括点选代理）
  const visit2 = (o, owner) => {
    if (o.userData.info) owner = o;
    if (o.isMesh) {
      if (o.userData.walk) world.walkables.push(o);
      if (owner) { o.userData.owner = owner; world.pickables.push(o); }
    }
    for (const c of o.children) visit2(c, owner);
  };
  visit2(scene, null);
  return { global: globalList.length, globalBatches: nGlobal, localBatches: nLocal, materials: nMats };
}
