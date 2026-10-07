import * as THREE from 'three';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, group, interactive, timeVariant, onUpdate, addCollider, addCircle, slot, fixture } from '../core/build.js';
import { F1, C1, F2, C2, DOMA_Y, BATH_Y } from './layout.js';
import { tatamiFloor } from './house.js';
import * as P from './props.js';
import { mulberry32 } from '../core/util.js';

// 屋里不常变的东西：家具、灯、固定设施。
// 生活痕迹（每天会变的小东西）都不在这里，它们写在 data/items.json 里，按名字摆进这里登记的位置点（slot）。

// 家具的说明文字
const TXT = {
  stairShelf: '楼梯厅的书架。一大半是主人的漫画和参考书，最下面一格是亚托莉摆的：几本旧杂志，还有一本讲钟表修理的旧书，书脊都翻软了。',
  cupboard: '橱柜。上层玻璃门里是盘子和茶杯，下层收着锅和米。',
  island: '厨房中间的大案台，桧木台面，擦得发白。',
  irori: '大厅那头的地炉。自在钩从头顶的大梁一直垂下来，吊着铁锅，汤在小火上慢慢煮着，锅盖留了一条缝往外冒热气。炭是亚托莉傍晚添的。',
  clock: '墙上的挂钟，钟摆一下一下地走。原来是停的，亚托莉打开后盖上了油，它就又走了起来。',
  kamidana: '大厅高处的神棚，供着建实神社的护符和一小枝杨桐。每天早上亚托莉换一次水，丛雨会在旁边看着，偶尔纠正她摆的角度。',
  gramophone: '手摇唱机。亚托莉修过它：换了唱针，给发条上了油。她们俩一起听过几张唱片——丛雨听到慢的曲子会跟着飘来飘去。（按 E 放一段）',
  records: '一排唱片封套。有一张抽出来放在唱机旁边，大概是上次听到一半的。',
  calendar: '日历翻到十月。秋祭那天被红笔圈了起来，旁边写着小小的「太鼓！」——已经过去好几天了。',
  tokonoma: '座敷的床之间，挂轴上画的是一轮秋月。是秋祭之前换上的。',
  zashikiTable: '座敷的大漆桌，平时没人用，擦得能照出人影。来客人的时候才在这里摆茶。',
  hiroen: '广缘的两把藤椅。天气好的下午，亚托莉会坐在这里写日志，丛雨就浮在玻璃门边，看山谷里的雾一点点散开。',
  bath: '浴室里引了一池温泉。竹筒把山上下来的温泉水一直往池子里送，满了就从池沿溢出去。东边那条池沿宽一点，泡久了就坐上去歇一会儿。',
  bathEdge: '温泉池东边宽一点的池沿，石头被水汽焐得温温的，坐上去正好。',
  bucket: '桧木小凳和木桶。木桶底下用毛笔写着「宿舍」两个字。',
  myBed: '主人的床。床单铺得平平整整，枕头拍松了——是亚托莉知道主人要回来，特地整理过的。',
  andon: '亚托莉写日志时点的行灯。她其实有夜视，用不着灯，但她说「在灯底下写，字会比较像日记」。',
  study: '书房的架子上满满都是书。有从学校图书馆借回来的，也有这户老宅子原来就有的旧书。',
  roomShelf: '房间里的矮书架。上面放着课本和几本小说，还有一个小小的达摩。',
  workbench: '亚托莉的工作台。墙上的洞洞板挂满了工具，抽屉一格一格贴着标签：齿轮、弹簧、螺丝、铜线。',
  storage: '储物间。客用的被褥、过冬的火盆、一只旧长持，靠墙的木架上是一箱箱旧物。',
  atriDesk: '亚托莉的文机。她每天晚上在这里写日志。',
  murasameChest: '丛雨的小抽屉柜。',
};

const L = (keys) => keys; // 灯的时间表 {dawn, day, dusk, night}
const NIGHT = { dawn: 0.2, day: 0, dusk: 0.9, night: 0.85 };

export function buildInterior(root) {
  const R = group(root);
  genkan(R);
  stairHall(R);
  corridor1F(R);
  kitchen(R);
  hall(R);
  eastCorridor(R);
  living(R);
  zashiki(R);
  chanoma(R);
  hiroen(R);
  bath(R);
  corridor2F(R);
  myRoom(R);
  atriRoom(R);
  murasameRoom(R);
  storageRoom(R);
  workshop(R);
  study(R);
  balcony(R);
  return R;
}

function rug(R, x0, z0, x1, z1, y, mat = M.rug) {
  return boxMM(R, x0, y, z0, x1, y + 0.012, z1, mat, { uv: 'box', cast: false });
}

// 能拉开的抽屉：里面是一个位置点，关着的时候里面的东西藏起来（也点不到）
// front：抽屉面板所在的 x，dir：往哪边拉（-1 / +1），抽屉沿 z 占 z0..z1，高 y0..y1
function drawerX(R, { front, dir, z0, z1, y0, y1, depth, pull, slotName, name, text }) {
  const tray = group(R);
  tray.userData.dynamic = true;
  const back = front - dir * depth;
  const fx0 = Math.min(front, front + dir * 0.016), fx1 = Math.max(front, front + dir * 0.016);
  boxMM(tray, fx0, y0, z0, fx1, y1, z1, M.woodLight);                                              // 面板
  cyl(tray, 0.012, 0.012, 0.02, M.brass, front + dir * 0.026, (y0 + y1) / 2, (z0 + z1) / 2, { rz: Math.PI / 2 });
  const bx0 = Math.min(front, back), bx1 = Math.max(front, back);
  boxMM(tray, bx0, y0 + 0.01, z0 + 0.01, bx1, y0 + 0.02, z1 - 0.01, M.woodLight);                  // 底
  boxMM(tray, bx0, y0 + 0.02, z0 + 0.01, bx1, y1 - 0.02, z0 + 0.02, M.woodLight);
  boxMM(tray, bx0, y0 + 0.02, z1 - 0.02, bx1, y1 - 0.02, z1 - 0.01, M.woodLight);
  const contents = group(tray);
  contents.userData.dynamic = true;
  contents.visible = false;
  const inner = dir < 0 ? [front + 0.02, z0 + 0.03, front + pull - 0.03, z1 - 0.03] : [front - pull + 0.03, z0 + 0.03, front - 0.02, z1 - 0.03];
  slot(slotName, { rect: inner, y: y0 + 0.02, face: dir < 0 ? 'x-' : 'x+', parent: contents });
  const d = { t: 0, target: 0 };
  interactive(tray, {
    kind: 'door', name, text, trace: false,
    get verb() { return d.target > 0.5 ? '关上' : '拉开'; },
    use() { d.target = d.target > 0.5 ? 0 : 1; world.sound?.('slide'); return null; },
  });
  onUpdate((dt) => {
    if (d.t === d.target) return;
    d.t = d.target > d.t ? Math.min(1, d.t + dt / 0.35) : Math.max(0, d.t - dt / 0.35);
    const e = d.t * d.t * (3 - 2 * d.t);
    tray.position.x = dir * pull * e;
    contents.visible = d.t > 0.15;
    world.shadowDirty = true;
  });
  return tray;
}

// 每人一套被褥：铺开 / 叠好（自己房间墙角）/ 收进西侧壁橱。「自动」= 晚上和清晨铺开，白天和黄昏收进壁橱
const closetPile = [];
function bedding(R, { slotName, model, x, z, y, fold, cover, over, layers, label, note }) {
  const info = { name: label, text: note };
  const spread = group(R);
  P.futon(spread, x, y, z, 0, { cover, over, len: 2.0, w: 1.0 });
  const pile = (g) => {
    const st = P.futonStack(g, 0, 0, 0, 0, layers);
    P.soft(g, 0.48, 0.11, 0.28, M.white, 0, st.h + 0.055, -0.1, { r: 0.045 });
    return st.h + 0.11;
  };
  const folded = group(R, fold[0], y, fold[1]);
  pile(folded);
  const cb = world.closetBedding;
  const inCloset = group(R, cb.x, cb.y, cb.z);
  const h = pile(inCloset);
  for (const g of [spread, folded, inCloset]) { g.userData.dynamic = true; interactive(g, info); }
  closetPile.push({ g: inCloset, h });
  const restack = () => { let yy = cb.y; for (const p of closetPile) { p.g.position.y = yy; if (p.g.visible) yy += p.h; } };
  if (closetPile.length === 1) world.onTime.push(restack);
  fixture(slotName, {
    model, def: '自动', info, label, note,
    apply(state) {
      if (state === '自动') { timeVariant(spread, ['dawn', 'night']); timeVariant(inCloset, ['day', 'dusk']); folded.visible = false; }
      else { spread.visible = state === '铺开'; folded.visible = state === '叠好'; inCloset.visible = state === '收进壁橱'; }
      restack();
    },
  });
  return spread;
}

// ———— 玄关 ————
function genkan(R) {
  const y = DOMA_Y;
  // 下駄箱（土间北墙）
  const gb = group(R);
  boxMM(gb, -14.9, y, -2.45, -13.1, y + 1.0, -2.0, M.woodMid, { collide: true });
  for (let i = 0; i < 4; i++) boxMM(gb, -14.86 + i * 0.44, y + 0.06, -2.0, -14.46 + i * 0.44, y + 0.94, -1.985, M.woodLight);
  boxMM(gb, -14.95, y + 1.0, -2.47, -13.05, y + 1.04, -1.96, M.woodDark);
  slot('玄关·鞋柜上', { rect: [-14.85, -2.42, -13.15, -2.0], y: y + 1.04, face: 'z+' });
  // 在室牌：挂在下駄箱上方（朝南），一人一块，「在」是黑字，「外出」翻到红字那面
  const nb = group(R, -14.25, 1.85, -2.43);
  box(nb, 0.5, 0.46, 0.02, M.woodDark, 0, 0, 0);
  const tags = [
    ['Ginka', '在室牌上主人的那一块。'],
    ['亚托莉', '在室牌上亚托莉的那一块，字是她自己写的，一笔一画很端正。'],
    ['丛雨', '在室牌上丛雨的那一块。是亚托莉削了木片新做的，字是丛雨自己写的，笔画很用力。'],
  ];
  tags.forEach(([n, note], i) => {
    const tex = (out) => T.textTex(n, { w: 64, h: 192, bg: '#f2e8d2', color: out ? '#b3261e' : '#1d1a18', vertical: true, size: n === 'Ginka' ? 0.3 : 0.42 });
    const mats = { 在: texMat(tex(false)), 外出: texMat(tex(true)) };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32), mats.在);
    m.position.set(-0.144 + i * 0.144, 0, 0.012); nb.add(m);
    const info = { name: `在室牌 · ${n}`, text: note };
    interactive(m, info);
    fixture(`玄关·在室牌·${n}`, { model: 'name-tag', def: '在', info, label: info.name, note, apply(state) { m.material = mats[state]; } });
  });
  // 伞立
  cyl(R, 0.1, 0.09, 0.48, M.ceramicBrown, -14.55, y + 0.24, 3.05, { collide: true });
  slot('玄关·伞立', { rect: [-14.7, 2.95, -14.4, 3.15], y: y + 0.2, face: 'x+', neat: true });
  // 穿鞋用的长凳
  boxMM(R, -14.5, y + 0.38, 3.0, -13.2, y + 0.43, 3.42, M.woodMid);
  for (const x of [-14.4, -13.3]) boxMM(R, x - 0.04, y, 3.02, x + 0.04, y + 0.38, 3.4, M.woodMid);
  addCollider(-14.5, y, 3.0, -13.2, y + 0.45, 3.45);
  // 脱鞋的踏石（沓脱石）上摆鞋，鞋尖朝外；板间上摆拖鞋，鞋尖朝屋里
  slot('玄关·沓脱石', { rect: [-12.9, 0.05, -12.56, 1.95], y: 0.32, face: 'x-', neat: true });
  slot('玄关·板间', { rect: [-12.45, 0.1, -11.4, 1.9], y: F1, face: 'x+', neat: true });
  slot('玄关·土间', { rect: [-14.85, -1.85, -13.05, -0.65], y, face: 'z+' });
  // 板间东南角的花台
  const ik = group(R, -9.55, F1, 3.0);
  boxMM(ik, -0.3, 0, -0.3, 0.3, 0.55, 0.3, M.woodDark, { collide: true });
  slot('玄关·花台', { rect: [-9.84, 2.71, -9.26, 3.29], y: F1 + 0.55, face: 'x-' });
  P.pendantLamp(R, -13.7, C1, 0.5, { drop: 0.55, r: 0.22, levels: NIGHT, lightLamp: 5, fill: 1 });
  P.pendantLamp(R, -10.8, C1, 0.5, { drop: 0.55, r: 0.22, levels: NIGHT, light: false });
}

// ———— 楼梯厅（两层通高）————
function stairHall(R) {
  P.pendantLamp(R, -11.0, C2, -6.0, { drop: 2.6, r: 0.38, levels: NIGHT, lightLamp: 7, fill: 1.3 });
  const bs = P.bookshelf(R, -9.22, F1, -6.0, 3.2, 2.3, 0.34, { face: 'x-', shelves: 6, seed: 21 });
  interactive(bs, { name: '楼梯厅的书架', text: TXT.stairShelf });
  addCollider(-9.4, F1, -7.6, -9.05, F1 + 2.3, -4.4);
  plant(R, -9.6, F1, -9.5, 1.1);
  plant(R, -14.4, F1, -9.5, 0.8);
}

let plantMat = null;
function plant(R, x, y, z, s = 1) {
  const g = group(R, x, y, z);
  cyl(g, 0.2 * s, 0.15 * s, 0.32 * s, M.ceramicBrown, 0, 0.16 * s, 0, { seg: 14, collide: true });
  plantMat = plantMat || new THREE.MeshStandardMaterial({ map: T.leafCluster({ kind: 'oval', palette: ['#4f7a34', '#5f8a3e', '#3f6a2c'], seed: 61, count: 90, size: 256 }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75 * s, 0.75 * s), plantMat);
    m.position.set(0, 0.62 * s, 0); m.rotation.y = (k / 3) * Math.PI; m.castShadow = true; m.userData.static = true; g.add(m);
  }
  return g;
}

// ———— 一楼廊下 ————
function corridor1F(R) {
  P.pendantLamp(R, -5, C1, -1, { drop: 0.4, r: 0.17, shade: 'enamel', levels: NIGHT, lightLamp: 4, fill: 1 });
  P.pendantLamp(R, 1, C1, -1, { drop: 0.4, r: 0.17, shade: 'enamel', levels: NIGHT, light: false });
  P.pendantLamp(R, 7, C1, -1, { drop: 0.4, r: 0.17, shade: 'enamel', levels: NIGHT, lightLamp: 4, fill: 1 });
  // 长条地毯在座敷门和茶之间门之间断开，空出来的那段地板是「廊下·地上」
  rug(R, -8.6, -1.55, 5.0, -0.45, F1, M.runner);
  rug(R, 8.7, -1.55, 11.6, -0.45, F1, M.runner);
  slot('廊下·地上', { rect: [5.3, -1.7, 8.4, 0.38], y: F1, face: 'z-' });
  // 黑电话
  const ph = group(R, -8.4, F1, 0.25);
  boxMM(ph, -0.3, 0, -0.14, 0.3, 0.75, 0.2, M.woodMid, { collide: true });
  box(ph, 0.18, 0.07, 0.2, M.lacquerBlack, 0.15, 0.785, 0);
  cyl(ph, 0.05, 0.05, 0.012, M.ceramic, 0.15, 0.825, 0.02);
  box(ph, 0.22, 0.04, 0.055, M.lacquerBlack, 0.15, 0.86, -0.035);
  slot('一楼廊下·电话台', { rect: [-8.69, 0.12, -8.37, 0.44], y: F1 + 0.75, face: 'z-' });
}

// ———— 厨房 ————
function kitchen(R) {
  const z0 = -9.92, z1 = -9.3, top = F1 + 0.86;
  boxMM(R, -8.9, F1, z0, -2.0, top - 0.04, z1, M.woodLight, { collide: true });
  boxMM(R, -8.92, top - 0.04, z0, -1.98, top, z1 + 0.02, M.woodMid);
  for (let x = -8.85; x < -2.1; x += 0.6) boxMM(R, x, F1 + 0.1, z1, x + 0.56, top - 0.1, z1 + 0.012, M.woodMid);
  // 水槽
  boxMM(R, -6.2, top - 0.005, -9.85, -4.8, top + 0.002, -9.4, M.steel);
  boxMM(R, -6.15, top - 0.002, -9.8, -4.85, top + 0.004, -9.45, new THREE.MeshStandardMaterial({ color: '#7d8590', roughness: 0.3, metalness: 0.8 }));
  cyl(R, 0.014, 0.014, 0.28, M.steel, -5.5, top + 0.14, -9.86);
  cyl(R, 0.011, 0.011, 0.17, M.steel, -5.5, top + 0.27, -9.79, { rx: Math.PI / 2 });
  slot('厨房·操作台', { rect: [-8.88, -9.9, -6.28, -9.32], y: top, face: 'z+' });
  slot('厨房·水槽边', { rect: [-4.74, -9.9, -3.66, -9.32], y: top, face: 'z+' });
  // 炉台
  boxMM(R, -3.6, top, -9.88, -2.2, top + 0.05, -9.35, M.iron);
  for (const x of [-3.25, -2.55]) cyl(R, 0.11, 0.11, 0.02, M.ironRust, x, top + 0.06, -9.62, { seg: 12 });
  slot('厨房·炉台', { rect: [-3.58, -9.87, -2.22, -9.36], y: top + 0.07, face: 'z+' });
  // 墙上搁板（东头是酱油罐和味噌罐）
  boxMM(R, -8.85, F1 + 1.65, -9.92, -7.3, F1 + 1.68, -9.66, M.woodMid);
  P.jar(R, -7.62, F1 + 1.68, -9.8, '醤油', { r: 0.045, h: 0.18, mat: M.ceramicBrown });
  P.jar(R, -7.42, F1 + 1.68, -9.8, '味噌', { r: 0.07, h: 0.12, mat: M.ceramicBrown });
  slot('厨房·墙上搁板', { rect: [-8.83, -9.91, -7.76, -9.67], y: F1 + 1.68, face: 'z+' });
  // 食器棚（西墙）
  const cb = group(R);
  const cx0 = -8.95, cx1 = -8.45, cz0 = -7.6, cz1 = -5.1;
  boxMM(cb, cx0, F1, cz0, cx1, F1 + 0.9, cz1, M.woodMid);
  boxMM(cb, cx0, F1 + 0.9, cz0, cx0 + 0.03, F1 + 2.1, cz1, M.woodMid);
  boxMM(cb, cx0, F1 + 0.9, cz0, cx1 - 0.12, F1 + 2.1, cz0 + 0.04, M.woodMid);
  boxMM(cb, cx0, F1 + 0.9, cz1 - 0.04, cx1 - 0.12, F1 + 2.1, cz1, M.woodMid);
  boxMM(cb, cx0, F1 + 2.07, cz0, cx1 - 0.1, F1 + 2.12, cz1, M.woodMid);
  boxMM(cb, cx1 - 0.13, F1 + 0.9, cz0, cx1 - 0.11, F1 + 2.1, cz1, M.glass);
  boxMM(cb, cx1 - 0.14, F1 + 0.9, (cz0 + cz1) / 2 - 0.02, cx1 - 0.1, F1 + 2.1, (cz0 + cz1) / 2 + 0.02, M.woodMid);
  for (let k = 0; k < 3; k++) {
    const yy = F1 + 0.98 + k * 0.36;
    boxMM(cb, cx0, yy, cz0, cx1 - 0.14, yy + 0.015, cz1, M.woodLight);
    for (let i = 0; i < 7; i++) {
      const z = cz0 + 0.3 + i * 0.32;
      if (k === 0) cyl(cb, 0.09, 0.09, 0.015, i % 2 ? M.ceramic : M.ceramicBlue, -8.75, yy + 0.02 + (i % 3) * 0.016, z);
      else if (k === 1) P.cup(cb, -8.75, yy + 0.015, z, i % 2 ? M.ceramicGreen : M.ceramicBrown);
      else P.bowl(cb, -8.73, yy + 0.015, z, 0.06, i % 3 ? M.ceramic : M.ceramicBlue);
    }
  }
  interactive(cb, { name: '橱柜', text: TXT.cupboard });
  addCollider(cx0, F1, cz0, cx1, F1 + 2.1, cz1);
  slot('厨房·橱柜侧面', { rect: [cx1 + 0.001, -7.45, cx1 + 0.001, -5.25], y: F1 + 0.84, face: 'x+', mount: 'wall' });
  // 中间的大案台
  const is = group(R, -5.0, F1, -6.2);
  boxMM(is, -1.4, 0.82, -0.5, 1.4, 0.88, 0.5, M.hinoki, { collide: true });
  boxMM(is, -1.3, 0.1, -0.42, 1.3, 0.82, 0.42, M.woodMid);
  boxMM(is, -1.3, 0, -0.42, 1.3, 0.1, 0.42, M.woodDark);
  interactive(is, { name: '厨房的大案台', text: TXT.island });
  slot('厨房·大案台', { rect: [-6.36, -6.66, -3.64, -5.74], y: F1 + 0.88, face: 'z+' });
  // 旧冰箱
  const fr = group(R, -1.6, F1, -9.55);
  P.soft(fr, 0.7, 1.6, 0.62, new THREE.MeshStandardMaterial({ color: '#dfe6df', roughness: 0.35 }), 0, 0.8, 0, { r: 0.06 });
  box(fr, 0.03, 0.4, 0.04, M.steel, 0.28, 1.2, 0.33);
  addCollider(-1.95, F1, -9.9, -1.25, F1 + 1.6, -9.2);
  slot('厨房·地上', { rect: [-2.2, -9.0, -1.15, -7.75], y: F1, face: 'x-' });
  // 暖帘
  const nr = group(R);
  for (const s of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.8, 1, 6), M.noren);
    pl.position.set(-5.8 + s * 0.4, F1 + 1.88, -2.5);
    const uv = pl.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (s > 0 ? 0.5 : 0));
    pl.castShadow = true;
    nr.add(pl);
    onUpdate((dt, t) => { pl.rotation.x = Math.sin(t * 1.3 + s) * 0.04; });
  }
  boxMM(R, -6.62, F1 + 2.27, -2.53, -4.98, F1 + 2.3, -2.47, M.bamboo);
  nr.userData.dynamic = true;
  const crate = group(R, -2.6, F1, -7.2);
  boxMM(crate, -0.3, 0, -0.2, 0.3, 0.26, 0.2, M.woodOld, { collide: true });
  for (let i = 0; i < 3; i++) sphere(crate, 0.11, M.pumpkin, -0.15 + i * 0.15, 0.31, 0, { sy: 0.72, seg: 12 });
  P.pendantLamp(R, -5.0, C1, -6.2, { drop: 0.7, r: 0.2, shade: 'enamel', levels: L({ dawn: 1, day: 0, dusk: 1, night: 0.25 }), lightLamp: 6, fill: 1.1 });
  P.pendantLamp(R, -5.4, C1, -8.9, { drop: 0.5, r: 0.17, shade: 'enamel', levels: L({ dawn: 1, day: 0, dusk: 1, night: 0.25 }), light: false });
}

// ———— 地炉大厅（两层通高，也是饭厅）————
function hall(R) {
  const y = F1;
  // 吃饭的长矮桌
  P.lowTable(R, 1.0, -6.9, 3.4, -5.7, y, 0.34);
  slot('饭厅·饭桌', { rect: [1.06, -6.86, 3.34, -5.74], y: y + 0.34, face: 'z+' });
  for (const [x, z, r, m] of [[2.2, -7.25, 0, M.zabuton], [2.2, -5.35, 0, M.zabuton], [0.55, -6.3, Math.PI / 2, M.zabutonBlue], [3.85, -6.3, Math.PI / 2, M.zabuton]]) P.zabuton(R, x, y, z, r, m);
  // 地炉：自在钩从牛梁垂下来
  const ix = 7.5, iz = -6.3;
  const ir = group(R, ix, y, iz);
  boxMM(ir, -0.8, 0, -0.8, 0.8, 0.06, -0.66, M.woodDark);
  boxMM(ir, -0.8, 0, 0.66, 0.8, 0.06, 0.8, M.woodDark);
  boxMM(ir, -0.8, 0, -0.66, -0.66, 0.06, 0.66, M.woodDark);
  boxMM(ir, 0.66, 0, -0.66, 0.8, 0.06, 0.66, M.woodDark);
  boxMM(ir, -0.66, 0, -0.66, 0.66, 0.02, 0.66, new THREE.MeshStandardMaterial({ color: '#8d8880', roughness: 1 }));
  const ember = M.ember.clone();
  ember.userData.noDedupe = true;
  const coals = group(ir);
  coals.userData.dynamic = true;
  for (let i = 0; i < 7; i++) { const r = mulberry32(i + 50); box(coals, 0.13, 0.05, 0.05, ember, -0.15 + r() * 0.25, 0.04, -0.15 + r() * 0.25, { ry: r() * 3, cast: false }); }
  cyl(ir, 0.016, 0.016, 6.82 - y - 0.7, M.bamboo, 0, (6.82 - y + 0.7) / 2, 0);
  box(ir, 0.24, 0.08, 0.04, M.woodDark, 0, 1.5, 0);
  const pot = group(ir, 0, 0.5, 0);
  pot.userData.dynamic = true;
  sphere(pot, 0.26, M.iron, 0, 0, 0, { sy: 0.7, seg: 20 });
  cyl(pot, 0.22, 0.22, 0.02, M.woodDark, 0.03, 0.18, 0, { rz: 0.08 });
  cyl(pot, 0.02, 0.02, 0.05, M.woodDark, 0.03, 0.21, 0);
  const ph = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.009, 6, 24, Math.PI), M.iron); ph.position.y = 0.05; pot.add(ph);
  cyl(ir, 0.005, 0.005, 0.5, M.iron, 0, 0.95, 0);
  const st = P.steam(R, ix - 0.1, y + 0.75, iz, { rate: 3, size: 0.35, rise: 0.35, opacity: 0.2 });
  const fire = new THREE.PointLight('#ff8a3a', 0, 6, 1.7);
  fire.position.set(ix, y + 0.3, iz);
  R.add(fire);
  const fireLamp = { light: fire, intensity: 2.2, levels: { dawn: 0.6, day: 0.35, dusk: 1, night: 1 }, cur: 0, from: 0, to: 0, flicker: true, phase: 1 };
  world.lamps.push(fireLamp);
  const info = { name: '地炉', text: TXT.irori };
  interactive(ir, info);
  fixture('地炉大厅·地炉', {
    model: 'irori', def: '煮着汤', info, label: '地炉', note: TXT.irori,
    apply(state) {
      const lit = state !== '熄了';
      pot.visible = state !== '生着火';
      st.pts.visible = state === '煮着汤';
      ember.emissiveIntensity = lit ? 1.6 : 0;
      ember.color.set(lit ? '#3a1a10' : '#5a5650');
      fireLamp.override = lit ? null : 0;
      world.iroriLit = lit;
    },
  });
  for (const [x, z, r] of [[ix, iz - 1.2, 0], [ix + 1.2, iz, Math.PI / 2], [ix, iz + 1.2, 0], [ix - 1.2, iz, Math.PI / 2]]) P.zabuton(R, x, y, z, r, M.zabutonBlue);
  addCollider(ix - 0.8, y, iz - 0.8, ix + 0.8, y + 0.4, iz + 0.8);
  // 茶箪笥 + 挂钟（北墙，两扇窗中间）
  boxMM(R, 5.0, y, -9.95, 6.95, y + 1.05, -9.45, M.woodDark, { collide: true });
  for (let x = 5.05; x < 6.9; x += 0.47) boxMM(R, x, y + 0.08, -9.45, x + 0.44, y + 0.48, -9.44, M.woodMid);
  boxMM(R, 5.3, y + 1.05, -9.88, 5.75, y + 1.28, -9.6, M.woodMid);
  slot('地炉大厅·茶箪笥上', { rect: [5.85, -9.9, 6.9, -9.5], y: y + 1.05, face: 'z+' });
  const ck = group(R, 6.0, F1 + 2.35, -9.92);
  box(ck, 0.36, 0.66, 0.12, M.woodDark, 0, 0, 0.06);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.5 }));
  dial.position.set(0, 0.16, 0.125); ck.add(dial);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(ck, 0.006, 0.02, 0.002, M.black, Math.sin(a) * 0.105, 0.16 + Math.cos(a) * 0.105, 0.127); }
  box(ck, 0.006, 0.08, 0.003, M.black, 0.02, 0.18, 0.129, { rz: -0.5 });
  box(ck, 0.005, 0.1, 0.003, M.black, -0.02, 0.2, 0.13, { rz: 0.4 });
  const pend = group(ck, 0, -0.02, 0.11);
  pend.userData.dynamic = true;
  cyl(pend, 0.003, 0.003, 0.24, M.brass, 0, -0.12, 0);
  cyl(pend, 0.032, 0.032, 0.006, M.brass, 0, -0.25, 0, { rx: Math.PI / 2 });
  onUpdate((dt, t) => { pend.rotation.z = Math.sin(t * Math.PI) * 0.18; });
  box(ck, 0.32, 0.32, 0.004, M.glass, 0, -0.16, 0.122);
  interactive(ck, { name: '挂钟', text: TXT.clock });
  // 神棚（西墙高处，朝东）
  const km = group(R, -0.92, 3.25, -3.3);
  boxMM(km, 0, -0.04, -0.6, 0.38, 0, 0.6, M.hinoki);
  boxMM(km, 0.04, 0, -0.22, 0.3, 0.32, 0.22, M.hinoki);
  const kr = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.1, 4), M.hinoki); kr.rotation.y = Math.PI / 4; kr.position.set(0.17, 0.37, 0); km.add(kr);
  for (const s of [-1, 1]) {
    cyl(km, 0.03, 0.025, 0.1, M.ceramic, 0.2, 0.05, s * 0.4);
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.24), new THREE.MeshStandardMaterial({ map: T.leafCluster({ kind: 'oval', palette: ['#2f5a2c', '#3f6a34'], seed: 66, count: 30, size: 128 }), alphaTest: 0.45, side: THREE.DoubleSide }));
    lf.position.set(0.2, 0.2, s * 0.4); km.add(lf);
  }
  box(km, 0.01, 0.1, 0.04, M.paper, 0.31, 0.15, 0);
  cyl(km, 0.006, 0.006, 1.2, M.straw, 0.39, -0.08, 0, { rx: Math.PI / 2 });
  interactive(km, { name: '神棚', text: TXT.kamidana });
  // 灯：两盏长长垂下来的纸灯笼
  P.pendantLamp(R, 2.2, 6.82, -6.3, { drop: 3.3, r: 0.42, levels: L({ dawn: 0.3, day: 0, dusk: 1, night: 0.9 }), lightLamp: 9, fill: 1.4 });
  P.pendantLamp(R, 10.0, 6.6, -4.4, { drop: 2.9, r: 0.36, levels: L({ dawn: 0.2, day: 0, dusk: 0.9, night: 0.8 }), lightLamp: 6, fill: 1.2 });
  P.roomLight(R, 5.5, 5.2, -6.3, { lamp: 0, fill: 1.4 });
  plant(R, 11.4, y, -9.4, 1.2);
  plant(R, -0.4, y, -9.4, 1.0);
  slot('地炉大厅·地上', { rect: [10.4, -8.6, 11.6, -6.6], y, face: 'x-' });
}

// ———— 东侧廊下 ————
function eastCorridor(R) {
  // 四扇障子前面那块地板：喝茶的角落
  slot('东侧廊下·障子前', { rect: [13.25, -6.5, 14.75, -1.9], y: F1, face: 'x-' });
  for (const z of [-6, 0, 6]) P.pendantLamp(R, 13.5, C1, z, { drop: 0.4, r: 0.16, levels: NIGHT, light: z === 0, lightLamp: 3, fill: 1 });
  P.roomLight(R, 13.5, 2.8, -6, { lamp: 2, levels: NIGHT, fill: 0.8 });
  P.roomLight(R, 13.5, 2.8, 6, { lamp: 2, levels: NIGHT, fill: 0.8 });
  plant(R, 12.4, F1, 9.5, 0.9);
}

// ———— 居间 ————
function living(R) {
  const y = F1;
  P.roundTable(R, -5, y, 4.2, 0.62);
  slot('居间·圆桌', { rect: [-5.42, 3.78, -4.58, 4.62], y: y + 0.33, face: 'z+' });
  for (const [x, z, r] of [[-5, 3.3, 0], [-5, 5.1, 0], [-5.95, 4.2, Math.PI / 2], [-4.05, 4.2, Math.PI / 2]]) P.zabuton(R, x, y, z, r);
  rug(R, -6.6, 2.8, -3.4, 5.6, y);
  slot('居间·地上', { rect: [-3.4, 1.4, -1.4, 2.6], y, face: 'z+' });
  // 唱机（西墙）+ 唱片架
  const gr = group(R, -8.55, y, 4.9, Math.PI / 2);
  boxMM(gr, -0.55, 0, -0.27, 0.55, 0.58, 0.22, M.woodDark, { collide: true });
  for (const x of [-0.27, 0.27]) boxMM(gr, x - 0.25, 0.06, 0.22, x + 0.25, 0.52, 0.232, M.woodMid);
  box(gr, 0.44, 0.14, 0.44, M.woodMid, -0.05, 0.65, -0.02);
  const disc = cyl(gr, 0.165, 0.165, 0.01, M.lacquerBlack, -0.05, 0.725, -0.02, { seg: 32, batch: false });
  cyl(disc, 0.04, 0.04, 0.012, M.red, 0, 0.006, 0, { batch: false });
  box(disc, 0.05, 0.004, 0.012, M.paper, 0.1, 0.006, 0, { batch: false });
  cyl(gr, 0.012, 0.012, 0.05, M.brass, 0.12, 0.74, -0.16);
  cyl(gr, 0.006, 0.006, 0.22, M.brass, 0.05, 0.76, -0.1, { rz: Math.PI / 2, ry: -0.6 });
  const hornPts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; hornPts.push(new THREE.Vector2(0.015 + Math.pow(t, 2.6) * 0.25, t * 0.55)); }
  const horn = new THREE.Mesh(new THREE.LatheGeometry(hornPts, 28), new THREE.MeshStandardMaterial({ color: '#b98a3c', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  horn.position.set(0.12, 0.78, -0.12); horn.rotation.set(-0.5, 0, 0.7); horn.castShadow = true; gr.add(horn);
  cyl(gr, 0.006, 0.006, 0.12, M.steel, 0.22, 0.65, 0.0, { rz: Math.PI / 2 });
  interactive(gr, { name: '手摇唱机', text: TXT.gramophone, use() { world.sound?.('music'); return null; } });
  let spin = 0;
  onUpdate((dt) => { if (world.musicPlaying) spin += dt * 3.6; disc.rotation.y = spin; });
  const rec = group(R, -8.6, y, 6.4, Math.PI / 2);
  boxMM(rec, -0.32, 0, -0.2, 0.32, 0.52, 0.18, M.woodMid, { collide: true });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.31, 0.31), [M.paper, M.paper, M.paper, M.paper, texMat(T.recordSleeve(i)), texMat(T.recordSleeve(i))]);
    m.position.set(-0.27 + i * 0.055, 0.52 + 0.155, -0.02); m.rotation.z = (i - 4) * 0.025; m.castShadow = true; rec.add(m);
  }
  const outRec = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.31), texMat(T.recordSleeve(2)));
  outRec.rotation.x = -Math.PI / 2; outRec.position.set(-0.6, 0.585, -0.04); outRec.rotation.z = 0.3; rec.add(outRec);
  interactive(rec, { name: '唱片', text: TXT.records });
  // 衣柜（箪笥），北墙东头
  const ts = group(R, -2.05, y, 0.85);
  boxMM(ts, -0.85, 0, -0.3, 0.85, 1.25, 0.25, M.woodMid, { collide: true });
  for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
    boxMM(ts, -0.8 + j * 0.81, 0.08 + k * 0.29, 0.25, -0.02 + j * 0.81, 0.33 + k * 0.29, 0.262, M.woodLight);
    cyl(ts, 0.02, 0.02, 0.02, M.iron, -0.41 + j * 0.81, 0.2 + k * 0.29, 0.272, { rx: Math.PI / 2 });
  }
  // 日历（北墙西头，朝南）
  const calTex = T.canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, 150); grd.addColorStop(0, '#f2b26b'); grd.addColorStop(1, '#c9522f');
    g.fillStyle = grd; g.fillRect(14, 14, w - 28, 140);
    g.fillStyle = 'rgba(120,40,20,0.8)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(40 + i * 22, 120 - (i % 3) * 14, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2a2420'; g.font = 'bold 34px serif'; g.fillText('10', 18, 196); g.font = '16px serif'; g.fillText('十月 · 神無月', 70, 192);
    g.font = '13px sans-serif';
    for (let d = 1; d <= 31; d++) { const c = (d + 3) % 7, r = Math.floor((d + 3) / 7); g.fillStyle = c === 0 ? '#c33' : '#333'; g.fillText(String(d), 22 + c * 32, 222 + r * 26); }
    g.strokeStyle = '#d22'; g.lineWidth = 2.5; g.beginPath(); g.arc(22 + 6 * 32 + 6, 222 - 5, 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d22'; g.font = '12px serif'; g.fillText('太鼓！', 22 + 5 * 32 - 6, 205);
  }, { repeat: false });
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48), texMat(calTex));
  cal.position.set(-8.0, y + 1.6, 0.56);
  R.add(cal);
  interactive(cal, { name: '日历', text: TXT.calendar });
  P.andon(R, -8.5, y, 7.0, { levels: L({ dawn: 0.2, day: 0, dusk: 0.8, night: 1 }) });
  P.pendantLamp(R, -5, C1, 4.2, { drop: 0.7, r: 0.3, levels: L({ dawn: 0.2, day: 0, dusk: 0.9, night: 1 }), lightLamp: 8, fill: 1.3 });
}

// ———— 座敷 ————
function zashiki(R) {
  const y = F1;
  // 床之间（东墙）
  boxMM(R, 6.05, y - 0.05, 0.6, 6.95, y + 0.14, 3.4, M.woodDark, { collide: true });
  boxMM(R, 6.07, y + 0.14, 0.62, 6.93, y + 0.145, 3.38, M.woodLight);
  boxMM(R, 5.98, y - 0.05, 3.33, 6.12, C1, 3.47, M.trunk, { collide: true });   // 床柱
  boxMM(R, 6.05, y + 2.25, 0.6, 6.95, y + 2.37, 3.4, M.post);
  const scrollTex = T.canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#6a5a48'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#efe6d2'; g.fillRect(12, 70, w - 24, h - 140);
    g.fillStyle = 'rgba(230,200,120,0.85)'; g.beginPath(); g.arc(w / 2, 170, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,30,20,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(20, 380); g.quadraticCurveTo(60, 300, 110, 260); g.stroke();
    for (let i = 0; i < 10; i++) { g.beginPath(); const x = 30 + i * 8, yy = 360 - i * 10; g.moveTo(x, yy); g.lineTo(x + 6 + (i % 3) * 4, yy - 34); g.stroke(); }
    g.fillStyle = '#c33'; g.fillRect(w - 30, h - 110, 10, 10);
  }, { repeat: false });
  const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.8), texMat(scrollTex));
  scroll.position.set(6.93, y + 1.3, 2.0); scroll.rotation.y = -Math.PI / 2; R.add(scroll);
  cyl(R, 0.014, 0.014, 0.58, M.woodDark, 6.92, y + 0.4, 2.0, { rx: Math.PI / 2 });
  interactive(scroll, { name: '床之间的挂轴', text: TXT.tokonoma });
  slot('座敷·床之间', { rect: [6.15, 0.72, 6.85, 1.72], y: y + 0.145, face: 'x-' });
  // 违い棚
  boxMM(R, 6.15, y - 0.05, 3.48, 6.95, y + 0.42, 5.6, M.woodDark, { collide: true });
  boxMM(R, 6.4, y + 1.15, 3.48, 6.95, y + 1.18, 4.6, M.woodMid);
  boxMM(R, 6.4, y + 1.38, 4.5, 6.95, y + 1.41, 5.6, M.woodMid);
  boxMM(R, 6.15, y + 1.9, 3.48, 6.95, y + 2.3, 5.6, M.woodDark);
  P.teapot(R, 6.7, y + 1.18, 4.0, M.ceramicBlue);
  slot('座敷·违い棚', { rect: [6.2, 3.55, 6.9, 5.52], y: y + 0.42, face: 'x-' });
  // 大漆桌 + 坐垫
  const tb = group(R);
  P.lowTable(tb, 2.0, 3.5, 4.2, 4.7, y, 0.35, M.lacquerRed);
  P.teapot(tb, 3.0, y + 0.35, 4.1, M.ceramicGreen);
  P.cup(tb, 2.5, y + 0.35, 4.3); P.cup(tb, 3.6, y + 0.35, 3.9);
  for (const [x, z] of [[2.6, 3.0], [3.6, 3.0], [2.6, 5.2], [3.6, 5.2]]) P.zabuton(tb, x, y, z, 0, M.zabuton);
  interactive(tb, { name: '座敷的大漆桌', text: TXT.zashikiTable });
  // 屏风（西南角）
  const byTex = T.canvasTex(512, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#e9d49a'); grd.addColorStop(1, '#d4b46a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,90,50,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = (i / 40) * w; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + 10, h * 0.6, x + 25, h * (0.25 + (i % 5) * 0.06)); g.stroke(); }
    g.fillStyle = 'rgba(170,40,30,0.8)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc((i * 47) % w, h * (0.5 + ((i * 13) % 30) / 100), 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(w * 0.8, h * 0.22, 26, 0, Math.PI * 2); g.fill();
  }, { repeat: false });
  const bym = new THREE.MeshStandardMaterial({ map: byTex, roughness: 0.7, side: THREE.DoubleSide });
  const bg = group(R, -0.4, y, 6.4);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.5), bym);
    const uv = p.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 6);
    p.position.set(0.25 + i * 0.47, 0.75, (i % 2) * 0.16); p.rotation.y = (i % 2 ? -0.35 : 0.35); p.castShadow = true; bg.add(p);
  }
  bg.rotation.y = -0.3;
  bg.userData.dynamic = true;
  addCollider(-0.5, y, 6.2, 2.4, y + 1.5, 7.0);
  P.pendantLamp(R, 3.0, C1, 4.0, { drop: 0.6, r: 0.3, levels: L({ dawn: 0.1, day: 0, dusk: 0.8, night: 0.9 }), lightLamp: 8, fill: 1.3 });
}

// ———— 茶之间 ————
function chanoma(R) {
  const y = F1;
  P.lowTable(R, 9.0, 3.4, 10.2, 4.6, y, 0.36);
  for (const [x, z, r] of [[9.6, 2.85, 0], [9.6, 5.15, 0], [8.45, 4.0, Math.PI / 2], [10.75, 4.0, Math.PI / 2]]) P.zabuton(R, x, y, z, r, M.zabutonBlue);
  slot('茶之间·小矮桌', { rect: [9.05, 3.45, 10.15, 4.55], y: y + 0.36, face: 'z+' });
  rug(R, 8.2, 2.5, 11.0, 5.5, y);
  boxMM(R, 7.1, y, 0.55, 8.4, y + 1.1, 1.0, M.woodDark, { collide: true });
  slot('茶之间·柜子上', { rect: [7.15, 0.58, 8.35, 0.97], y: y + 1.1, face: 'z+' });
  plant(R, 11.5, y, 7.0, 0.9);
  P.pendantLamp(R, 9.6, C1, 4.0, { drop: 0.6, r: 0.24, levels: L({ dawn: 0.1, day: 0, dusk: 0.8, night: 0.9 }), lightLamp: 6, fill: 1.2 });
}

// ———— 广缘 ————
function hiroen(R) {
  const y = F1;
  const g = group(R);
  const chair = (x, z, ry) => {
    const c = group(g, x, y, z, ry);
    P.soft(c, 0.62, 0.12, 0.58, M.straw, 0, 0.36, 0, { r: 0.04 });
    P.soft(c, 0.62, 0.62, 0.1, M.straw, 0, 0.72, -0.28, { r: 0.04, rx: -0.12 });
    for (const s of [-1, 1]) P.soft(c, 0.08, 0.32, 0.56, M.straw, s * 0.3, 0.55, 0, { r: 0.03 });
    for (const [a, b] of [[-0.26, -0.24], [0.26, -0.24], [0.26, 0.24], [-0.26, 0.24]]) box(c, 0.04, 0.32, 0.04, M.bamboo, a, 0.16, b);
    P.soft(c, 0.5, 0.08, 0.48, M.linen, 0, 0.45, 0.02, { r: 0.035 });
  };
  // 藤椅往里靠，玻璃门前留出一米多宽的走道
  chair(2.2, 8.3, 0.25);
  chair(3.9, 8.3, -0.25);
  P.roundTable(g, 3.05, y, 8.4, 0.32, 0.55);
  interactive(g, { name: '广缘的藤椅', text: TXT.hiroen });
  slot('广缘·小圆桌', { rect: [2.83, 8.18, 3.27, 8.62], y: y + 0.55, face: 'z+' });
  addCollider(1.8, y, 7.9, 4.3, y + 0.8, 8.8);
  plant(R, -8.5, y, 7.95, 1.0);
  plant(R, 10.6, y, 7.95, 1.0);
  slot('广缘·地上', { rect: [-7.9, 7.65, -5.6, 8.45], y, face: 'z-' });
  slot('缘侧·南边', { rect: [-8.6, 10.2, -5.8, 11.3], y: 0.47, face: 'z-' });
  for (const x of [-5, 1.5, 8]) P.pendantLamp(R, x, C1, 8.75, { drop: 0.35, r: 0.15, levels: NIGHT, light: x === 1.5, lightLamp: 4, fill: 1 });
}

// ———— 浴室（屋里引了一池温泉）+ 脱衣所 ————
function bath(R) {
  const y = BATH_Y;
  // 桧木墙裙。西墙的在窗户那里断开（窗台下面一截矮的）
  boxMM(R, -14.92, y, 5.56, -14.9, 2.0, 6.26, M.hinoki);
  boxMM(R, -14.92, y, 6.26, -14.9, 1.15, 9.24, M.hinoki);
  boxMM(R, -14.92, y, 9.24, -14.9, 2.0, 9.92, M.hinoki);
  boxMM(R, -9.1, y, 5.56, -9.08, 2.0, 9.92, M.hinoki);
  boxMM(R, -14.92, y, 9.9, -9.08, 1.25, 9.92, M.hinoki);
  // 温泉池：池底比地面低，池沿高到能坐（一步就能跨上去），池里东边有一级坐的台阶，进出都踩它
  const px0 = -14.9, px1 = -11.3, pz0 = 6.0, pz1 = 9.9;
  const bottom = 0.1, rim = y + 0.38, water = rim - 0.08, w = 0.25, east = 0.42;
  const ix0 = px0 + w, ix1 = px1 - east, iz0 = pz0 + w, iz1 = pz1 - w;
  const pool = group(R);
  const stone = M.stoneWarm;
  boxMM(R, -15, 0, pz0, px1, bottom, 10, M.tile, { walk: true });                          // 池底
  boxMM(pool, px0, bottom, pz0, px1, rim, iz0, stone, { walk: true });                     // 北沿
  boxMM(pool, px0, bottom, iz1, px1, rim, pz1, stone, { walk: true });                     // 南沿
  boxMM(pool, px0, bottom, iz0, ix0, rim, iz1, stone, { walk: true });                     // 西沿
  boxMM(pool, ix1, bottom, iz0, px1, rim, iz1, stone, { walk: true });                     // 东沿（宽，能坐）
  boxMM(pool, ix1 - 0.4, bottom, iz0, ix1, y + 0.04, iz1, stone, { walk: true });          // 池里的台阶
  // 池沿只拦住泡在池里的人（站在地上、池沿上、台阶上的人照样能跨上跨下）
  for (const [a, b, c, d] of [[px0, pz0, px1, iz0], [px0, iz1, px1, pz1], [px0, iz0, ix0, iz1], [ix1, iz0, px1, iz1]]) addCollider(a, bottom, b, c, rim, d);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(ix1 - ix0, iz1 - iz0), M.bathWater);
  surf.rotation.x = -Math.PI / 2; surf.position.set((ix0 + ix1) / 2, water, (iz0 + iz1) / 2);
  R.add(surf);
  // 竹筒从西墙伸出来，温泉水一直往池里流
  cyl(R, 0.04, 0.04, 0.7, M.bambooGreen, -14.55, rim + 0.5, 9.3, { rz: Math.PI / 2 - 0.12 });
  const stream = cyl(R, 0.011, 0.016, rim + 0.46 - water, new THREE.MeshStandardMaterial({ color: '#d8f0f0', transparent: true, opacity: 0.55, roughness: 0.05 }), -14.2, (rim + 0.46 + water) / 2, 9.3, { cast: false, batch: false });
  const steam = P.steam(R, -13.2, water, 8.0, { rate: 6, spread: 0.9, size: 0.75, rise: 0.25, life: 3.5, opacity: 0.16 });
  const info = { name: '温泉池', text: TXT.bath };
  interactive(pool, info);
  fixture('浴室·温泉池', {
    model: 'bath-pool', def: '放满了水', info, label: '温泉池', note: TXT.bath,
    apply(state) {
      const full = state === '放满了水';
      surf.visible = stream.visible = steam.pts.visible = full;
      world.soakZone = full ? { x0: ix0, x1: ix1, z0: iz0, z1: iz1, yMax: 0.5 } : null;
    },
  });
  // 东边的宽池沿：能坐（按 E 坐下，面朝池子）；靠南那截是放东西的「池边」
  const seat = boxMM(R, ix1 + 0.02, rim, 6.5, px1 - 0.02, rim + 0.4, 8.5, new THREE.MeshBasicMaterial({ visible: false }), { batch: false, cast: false });
  interactive(seat, { name: '池边', text: TXT.bathEdge, verb: '坐下', kind: 'door', trace: false, use() { world.sit?.(new THREE.Vector3((ix1 + px1) / 2, rim, 7.5), Math.PI / 2); return null; } });
  slot('浴室·池边', { rect: [ix1 + 0.03, 8.75, px1 - 0.03, 9.6], y: rim, face: 'x+' });
  // 洗身子的地方：小凳和木桶
  const bk = group(R, -10.6, y, 7.6);
  box(bk, 0.34, 0.04, 0.24, M.hinoki, 0, 0.23, 0);
  box(bk, 0.04, 0.21, 0.22, M.hinoki, -0.13, 0.105, 0); box(bk, 0.04, 0.21, 0.22, M.hinoki, 0.13, 0.105, 0);
  cyl(bk, 0.14, 0.12, 0.19, M.hinoki, 0.5, 0.095, 0.16, { seg: 20 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.008, 4, 20), M.copper); ring.rotation.x = Math.PI / 2; ring.position.set(0.5, 0.14, 0.16); bk.add(ring);
  interactive(bk, { name: '小凳和木桶', text: TXT.bucket });
  for (const z of [7.0, 8.4]) {
    cyl(R, 0.016, 0.016, 0.2, M.steel, -9.15, y + 0.8, z, { rz: Math.PI / 2 });
    boxMM(R, -9.114, y + 1.05, z - 0.3, -9.1, y + 1.75, z + 0.3, new THREE.MeshStandardMaterial({ color: '#cfdde3', metalness: 0.9, roughness: 0.05 }));   // 镜子贴在墙裙外面
  }
  P.roomLight(R, -12, 2.9, 7.8, { lamp: 3.5, levels: { dawn: 0.3, day: 0, dusk: 0.7, night: 0.8 }, fill: 0.9 });
  // 脱衣所：西墙的开放木架
  const sx0 = -14.92, sx1 = -14.5, sz0 = 3.6, sz1 = 5.4;
  boxMM(R, sx0, F1, sz0, sx0 + 0.02, F1 + 1.7, sz1, M.woodLight);
  for (const z of [sz0, sz1 - 0.025]) boxMM(R, sx0, F1, z, sx1, F1 + 1.7, z + 0.025, M.woodLight);
  for (let k = 0; k < 4; k++) boxMM(R, sx0 + 0.02, F1 + 0.05 + k * 0.5, sz0 + 0.025, sx1, F1 + 0.075 + k * 0.5, sz1 - 0.025, M.woodMid);
  addCollider(sx0, F1, sz0, sx1, F1 + 1.7, sz1);
  cyl(R, 0.2, 0.17, 0.16, M.bamboo, -14.72, F1 + 0.155, 4.0, { open: true, seg: 14 });
  slot('脱衣所·架子', { rect: [sx0 + 0.03, sz0 + 0.05, sx1 - 0.01, sz1 - 0.05], y: F1 + 1.075, face: 'x+' });
  boxMM(R, -9.6, F1, 4.0, -9.06, F1 + 0.82, 5.1, M.woodMid, { collide: true });
  P.bowl(R, -9.33, F1 + 0.82, 4.55, 0.16, M.ceramic);
  boxMM(R, -9.08, F1 + 1.1, 4.05, -9.06, F1 + 1.75, 5.05, new THREE.MeshStandardMaterial({ color: '#cfdde3', metalness: 0.9, roughness: 0.05 }));
  P.pendantLamp(R, -12, C1, 4.5, { drop: 0.35, r: 0.14, shade: 'enamel', levels: NIGHT, light: false });
}

// ———— 二楼走廊 ————
function corridor2F(R) {
  for (const x of [-10, -4, 2, 8, 13]) P.pendantLamp(R, x, C2, -1, { drop: 0.45, r: 0.17, levels: NIGHT, light: x === -4 || x === 8, lightLamp: 4, fill: 1 });
  rug(R, -14.6, -1.55, 14.6, -0.45, F2, M.runner);
  // 门边的名牌
  P.sign(R, 'Ginka', 9.1, F2 + 1.45, 0.44, Math.PI, { w: 0.07, h: 0.22, vertical: false, size: 0.28 });
  P.sign(R, '亚托莉', -6.05, F2 + 1.45, -2.44, 0, { w: 0.07, h: 0.24 });
  P.sign(R, '丛雨', -2.05, F2 + 1.45, -2.44, 0, { w: 0.07, h: 0.2 });
  slot('二楼走廊·地上', { rect: [10.7, -0.32, 12.6, 0.4], y: F2, face: 'z-' });
}

// ———— 我的房间 ————
function myRoom(R) {
  const y = F2;
  // 床（床头朝东，靠北墙）
  const bed = group(R);
  const bx0 = 12.7, bx1 = 14.92, bz0 = 0.62, bz1 = 1.68;
  boxMM(bed, bx0, y, bz0, bx1, y + 0.32, bz1, M.woodMid, { collide: true });
  const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
  P.soft(bed, bx1 - bx0 - 0.14, 0.16, bz1 - bz0 - 0.06, M.sheet, bcx - 0.03, y + 0.4, bcz, { r: 0.05 });
  P.soft(bed, bx1 - bx0 - 0.6, 0.07, bz1 - bz0 + 0.06, M.bedcover, bcx - 0.25, y + 0.5, bcz, { r: 0.035 });
  P.soft(bed, 0.18, 0.06, bz1 - bz0 + 0.04, M.bedcover, bx1 - 0.66, y + 0.53, bcz, { r: 0.03, rz: 0.15 });
  P.soft(bed, 0.34, 0.12, 0.6, M.white, bx1 - 0.32, y + 0.53, bcz, { r: 0.05 });
  boxMM(bed, bx1 - 0.06, y, bz0, bx1, y + 0.95, bz1, M.woodDark);
  boxMM(bed, bx1 - 0.22, y + 0.82, bz0, bx1 - 0.06, y + 0.85, bz1, M.woodDark);
  interactive(bed, { name: '主人的床', text: TXT.myBed });
  slot('我房间·床头', { rect: [bx1 - 0.21, bz0 + 0.04, bx1 - 0.07, bz1 - 0.04], y: y + 0.85, face: 'x-' });
  slot('我房间·床边', { rect: [12.9, 1.85, 14.6, 2.75], y, face: 'z+' });

  // 书桌（东窗下）
  const dx0 = 14.25, dx1 = 14.92, dz0 = 3.5, dz1 = 5.3, dt = y + 0.72;
  boxMM(R, dx0, dt - 0.04, dz0, dx1, dt, dz1, M.woodMid, { collide: true });
  boxMM(R, dx0 + 0.02, y, dz1 - 0.06, dx0 + 0.06, dt - 0.04, dz1 - 0.02, M.woodMid);
  boxMM(R, dx1 - 0.06, y, dz1 - 0.06, dx1 - 0.02, dt - 0.04, dz1 - 0.02, M.woodMid);
  boxMM(R, dx0, y, dz0, dx1, dt - 0.04, dz0 + 0.45, M.woodMid, { collide: true });
  // 抽屉：最上面那个能拉开（里面是「我房间·书桌抽屉」），下面两个是摆样子的
  for (let i = 1; i < 3; i++) {
    boxMM(R, dx0 - 0.015, dt - 0.24 - i * 0.22, dz0 + 0.02, dx0, dt - 0.07 - i * 0.22, dz0 + 0.43, M.woodLight);
    cyl(R, 0.012, 0.012, 0.02, M.brass, dx0 - 0.025, dt - 0.155 - i * 0.22, dz0 + 0.225, { rz: Math.PI / 2 });
  }
  drawerX(R, { front: dx0, dir: -1, z0: dz0 + 0.02, z1: dz0 + 0.43, y0: dt - 0.24, y1: dt - 0.07, depth: 0.6, pull: 0.42, slotName: '我房间·书桌抽屉', name: '书桌的抽屉' });
  // 桌面上的格子架：靠窗那一格放相框
  boxMM(R, dx1 - 0.2, dt, dz0, dx1 - 0.02, dt + 0.24, dz0 + 0.02, M.woodMid);
  boxMM(R, dx1 - 0.2, dt + 0.24, dz0, dx1 - 0.02, dt + 0.26, dz1, M.woodMid);
  for (const z of [dz0 + 0.6, dz0 + 1.2, dz1 - 0.02]) boxMM(R, dx1 - 0.2, dt, z, dx1 - 0.02, dt + 0.24, z + 0.02, M.woodMid);
  slot('我房间·书桌靠窗那格', { rect: [dx1 - 0.2, dz0 + 0.03, dx1 - 0.03, dz0 + 0.59], y: dt, face: 'x-' });
  // 格子架另外两格立着几本书
  ['#6b5a3a', '#2f4a6b', '#7a2e2a', '#4a3a5a', '#3d5c3a', '#8a6a3a'].forEach((c, i) => box(R, 0.15, 0.2 - (i % 3) * 0.015, 0.032, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), dx1 - 0.11, dt + 0.1 - (i % 3) * 0.0075, dz0 + 1.25 + i * 0.04 + (i > 2 ? 0.08 : 0)));
  slot('我房间·书桌', { rect: [dx0 + 0.02, dz0 + 0.05, dx1 - 0.22, dz1 - 0.38], y: dt, face: 'x-' });
  P.deskLamp(R, 14.55, dt, 5.15, Math.PI + 0.3, { levels: { dawn: 0.6, day: 0, dusk: 0.7, night: 0.9 } });
  const ch = group(R, 13.75, y, 4.4, -Math.PI / 2);
  box(ch, 0.44, 0.04, 0.42, M.woodMid, 0, 0.45, 0);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [0.19, 0.18], [-0.19, 0.18]]) box(ch, 0.035, 0.45, 0.035, M.woodMid, x, 0.225, z);
  box(ch, 0.44, 0.42, 0.03, M.woodMid, 0, 0.68, 0.2);
  addCollider(13.5, y, 4.17, 14.0, y + 0.9, 4.63);

  // 榻（榻榻米小榻），房间西半边
  const px0 = 6.1, px1 = 9.9, pz0 = 2.6, pz1 = 8.2, ph2 = 0.3;
  boxMM(R, px0, y, pz0, px1, y + ph2 - 0.05, pz1, M.woodDark, { walk: true });
  boxMM(R, px1 - 0.06, y + ph2 - 0.08, pz0, px1, y + ph2, pz1, M.woodMid);
  boxMM(R, px0, y + ph2 - 0.08, pz0, px1, y + ph2, pz0 + 0.06, M.woodMid);
  boxMM(R, px0, y + ph2 - 0.08, pz1 - 0.06, px1, y + ph2, pz1, M.woodMid);
  tatamiFloor(R, px0, pz0 + 0.06, px1 - 0.06, pz1 - 0.06, y + ph2, { along: 'z', seed: 4 });
  const platTop = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0, pz1 - pz0), new THREE.MeshBasicMaterial());
  platTop.rotation.x = -Math.PI / 2; platTop.position.set((px0 + px1) / 2, y + ph2, (pz0 + pz1) / 2); platTop.visible = false; platTop.userData.walk = true; R.add(platTop);
  slot('我房间·榻上', { rect: [px0 + 0.2, pz0 + 0.2, px1 - 0.25, pz1 - 0.2], y: y + ph2, face: 'x+' });

  // 房间中间：地毯 + 小圆桌 + 三个坐垫
  rug(R, 10.6, 5.6, 13.6, 8.6, y);
  P.roundTable(R, 12.1, y, 7.1, 0.5);
  for (const [x, z, r] of [[12.1, 6.35, 0], [11.35, 7.5, 1.0], [12.85, 7.5, -1.0]]) P.zabuton(R, x, y, z, r);
  slot('我房间·圆桌', { rect: [11.78, 6.78, 12.42, 7.42], y: y + 0.33, face: 'z+' });
  // 衣柜（北墙）
  const ws = group(R, 10.6, y, 0.85);
  boxMM(ws, -0.9, 0, -0.3, 0.9, 1.7, 0.26, M.woodMid, { collide: true });
  for (let k = 0; k < 5; k++) boxMM(ws, -0.85, 0.08 + k * 0.32, 0.26, 0.85, 0.36 + k * 0.32, 0.272, M.woodLight);
  // 矮书架（西墙北头）+ 达摩
  const bs = P.bookshelf(R, 6.25, y, 1.5, 1.5, 0.9, 0.3, { shelves: 2, seed: 4, face: 'x+' });
  sphere(R, 0.06, M.red, 6.25, y + 0.97, 1.0, { sy: 1.15 });
  interactive(bs, { name: '矮书架', text: TXT.roomShelf });
  addCollider(6.05, y, 0.75, 6.45, y + 0.9, 2.25);
  slot('我房间·地上', { rect: [10.9, 8.8, 13.6, 9.75], y, face: 'z-' });
  P.pendantLamp(R, 10.5, C2, 4.5, { drop: 0.6, r: 0.3, levels: L({ dawn: 0, day: 0, dusk: 0.8, night: 0.35 }), lightLamp: 7, fill: 1.4 });
  P.pendantLamp(R, 8.0, C2, 5.2, { drop: 0.6, r: 0.24, levels: L({ dawn: 0, day: 0, dusk: 0.6, night: 0.2 }), light: false });
}

// ———— 亚托莉的房间（二楼北边西头那间）————
function atriRoom(R) {
  const ty = F2 + 0.03;
  tatamiFloor(R, -9, -10, -5, -2.5, ty, { along: 'z', seed: 5 });
  bedding(R, {
    slotName: '亚托莉的房间·被褥', model: 'futon-atri', x: -6.55, z: -8.35, y: ty, fold: [-5.55, -9.5],
    cover: M.quilt, layers: [[M.sheet, 0.14, 0.95, 0.62], [M.quilt, 0.2, 0.95, 0.62]],
    label: '旧木屋带来的厚被',
    note: '一床很厚的被子，从温泉街最里头那间旧木屋带过来的。亚托莉把旧木屋的钥匙还给老板娘那天，就只带了它和工具包。',
  });
  slot('亚托莉的房间·枕边', { rect: [-7.95, -9.8, -7.2, -8.9], y: ty, face: 'z+' });
  // 文机（西墙边，面朝墙坐）+ 坐垫 + 行灯
  const dk = group(R);
  boxMM(dk, -8.95, ty + 0.3, -6.3, -8.45, ty + 0.325, -5.0, M.woodMid);
  for (const z of [-6.25, -5.05]) boxMM(dk, -8.93, ty, z - 0.02, -8.47, ty + 0.3, z + 0.02, M.woodMid);
  interactive(dk, { name: '亚托莉的文机', text: TXT.atriDesk });
  addCollider(-8.95, ty, -6.3, -8.45, ty + 0.35, -5.0);
  slot('亚托莉的房间·文机', { rect: [-8.93, -6.25, -8.47, -5.05], y: ty + 0.325, face: 'x+' });
  P.zabuton(R, -8.0, ty, -5.65, Math.PI / 2, M.zabutonBlue);
  const ad = P.andon(R, -8.7, ty, -4.55, { levels: { dawn: 0.5, day: 0, dusk: 0.6, night: 1 } });
  interactive(ad, { name: '行灯', text: TXT.andon });
  // 东墙的矮架
  boxMM(R, -5.4, ty, -6.4, -5.08, ty + 0.7, -4.6, M.woodMid, { collide: true });
  for (const yy of [0.25, 0.48]) boxMM(R, -5.41, ty + yy, -6.36, -5.39, ty + yy + 0.02, -4.64, M.woodDark);
  slot('亚托莉的房间·架子', { rect: [-5.38, -6.35, -5.1, -4.65], y: ty + 0.7, face: 'x-' });
  slot('亚托莉的房间·地上', { rect: [-8.65, -4.1, -7.75, -2.75], y: ty, face: 'z-' });
  P.pendantLamp(R, -7.0, C2, -6.2, { drop: 0.6, r: 0.24, levels: L({ dawn: 0.3, day: 0, dusk: 0.7, night: 0.5 }), lightLamp: 5, fill: 1.2 });
}

// ———— 丛雨的房间（二楼北边，亚托莉隔壁）————
function murasameRoom(R) {
  const ty = F2 + 0.03;
  tatamiFloor(R, -5, -10, -1, -2.5, ty, { along: 'z', seed: 6 });
  bedding(R, {
    slotName: '丛雨的房间·被褥', model: 'futon-murasame', x: -2.9, z: -8.35, y: ty, fold: [-1.62, -7.2],
    cover: M.futonPink, over: M.blanket, layers: [[M.sheet, 0.14, 0.95, 0.62], [M.futonPink, 0.1, 0.9, 0.6], [M.blanket, 0.06, 0.85, 0.55]],
    label: '丛雨的被褥', note: '樱色的被子，上面搭着一条毛毯，是丛雨的。',
  });
  // 夜里枕边那团静息的微光
  world.spiritSeat = new THREE.Vector3(-2.9, ty + 0.5, -9.0);
  slot('丛雨的房间·枕边', { rect: [-2.25, -9.8, -1.5, -8.9], y: ty, face: 'z+' });
  slot('丛雨的房间·刀架位', { rect: [-4.88, -9.88, -3.55, -9.3], y: ty, face: 'z+', neat: true });
  // 西墙的小抽屉柜：最上面那个抽屉能拉开
  const cx0 = -4.95, cx1 = -4.45, cz0 = -6.3, cz1 = -5.5, ch = 0.75;
  const chest = group(R);
  boxMM(chest, cx0, ty, cz0, cx1, ty + ch - 0.2, cz1, M.woodMid);
  boxMM(chest, cx0, ty + ch - 0.03, cz0, cx1, ty + ch, cz1, M.woodMid);
  boxMM(chest, cx0, ty + ch - 0.2, cz0, cx1, ty + ch - 0.03, cz0 + 0.02, M.woodMid);
  boxMM(chest, cx0, ty + ch - 0.2, cz1 - 0.02, cx1, ty + ch - 0.03, cz1, M.woodMid);
  boxMM(chest, cx0, ty + ch - 0.2, cz0, cx0 + 0.02, ty + ch - 0.03, cz1, M.woodMid);
  for (let i = 0; i < 3; i++) {
    const y0 = ty + 0.04 + i * 0.17;
    boxMM(chest, cx1, y0, cz0 + 0.02, cx1 + 0.015, y0 + 0.15, cz1 - 0.02, M.woodLight);
    cyl(chest, 0.01, 0.01, 0.02, M.brass, cx1 + 0.025, y0 + 0.075, (cz0 + cz1) / 2, { rz: Math.PI / 2 });
  }
  interactive(chest, { name: '丛雨的小抽屉柜', text: TXT.murasameChest });
  addCollider(cx0, ty, cz0, cx1, ty + ch, cz1);
  drawerX(R, { front: cx1, dir: 1, z0: cz0 + 0.02, z1: cz1 - 0.02, y0: ty + ch - 0.19, y1: ty + ch - 0.04, depth: 0.46, pull: 0.4, slotName: '丛雨的房间·小抽屉', name: '小抽屉柜的抽屉' });
  slot('丛雨的房间·小柜上', { rect: [cx0 + 0.02, cz0 + 0.03, cx1 - 0.02, cz1 - 0.03], y: ty + ch, face: 'x+' });
  P.zabuton(R, -3.9, ty, -5.9, 0.2, M.zabuton);
  slot('丛雨的房间·地上', { rect: [-4.65, -4.1, -3.75, -2.75], y: ty, face: 'z-' });
  P.pendantLamp(R, -3.0, C2, -6.2, { drop: 0.6, r: 0.24, levels: L({ dawn: 0.2, day: 0, dusk: 0.7, night: 0.4 }), lightLamp: 5, fill: 1.2 });
}

// ———— 储物间（二楼最西头，和西侧壁橱连着）————
function storageRoom(R) {
  const y = F2;
  // 西墙的开放木架
  const x0 = -14.92, x1 = -14.45, z0 = 4.3, z1 = 9.2;
  boxMM(R, x0, y, z0, x0 + 0.02, y + 2.1, z1, M.woodOld);
  for (const z of [z0, z1 - 0.03]) boxMM(R, x0, y, z, x1, y + 2.1, z + 0.03, M.woodOld);
  for (let k = 0; k < 4; k++) boxMM(R, x0 + 0.02, y + 0.06 + k * 0.68, z0 + 0.03, x1, y + 0.09 + k * 0.68, z1 - 0.03, M.woodOld);
  addCollider(x0, y, z0, x1, y + 2.1, z1);
  slot('储物间·架子', { rect: [x0 + 0.03, z0 + 0.08, x1 - 0.01, z1 - 0.08], y: y + 0.77, face: 'x+' });
  // 架子上层堆的旧箱子（不动的）
  const r = mulberry32(81);
  for (let i = 0; i < 6; i++) box(R, 0.38, 0.22 + r() * 0.1, 0.5, new THREE.MeshStandardMaterial({ color: i % 2 ? '#b58a5a' : '#9a7a52', roughness: 0.95 }), -14.68, y + 1.45 + 0.13, z0 + 0.4 + i * 0.75, { ry: (r() - 0.5) * 0.1 });
  // 客用被褥、火盆、长持
  P.futonStack(R, -12.0, y, 8.9, 0.05, [[M.sheet, 0.14, 0.95, 0.62], [M.futonBlue, 0.18, 0.95, 0.62], [M.sheet, 0.14, 0.95, 0.62], [M.futonBlue, 0.18, 0.95, 0.62]]);
  addCollider(-12.5, y, 8.55, -11.5, y + 0.7, 9.25);
  const hb = group(R, -11.8, y, 7.4);
  cyl(hb, 0.26, 0.22, 0.3, M.ceramicBrown, 0, 0.15, 0, { seg: 20 });
  cyl(hb, 0.235, 0.235, 0.01, new THREE.MeshStandardMaterial({ color: '#8d8880', roughness: 1 }), 0, 0.27, 0, { seg: 20 });
  addCircle(-11.8, 7.4, 0.28);
  const nm = group(R, -13.6, y, 2.3);
  boxMM(nm, -0.75, 0.08, -0.3, 0.75, 0.62, 0.3, M.woodDark, { collide: true });
  for (const x of [-0.6, 0.6]) boxMM(nm, x - 0.05, 0, -0.32, x + 0.05, 0.08, 0.32, M.woodDark);
  for (const x of [-0.7, 0.7]) cyl(nm, 0.03, 0.03, 0.62, M.iron, x, 0.4, 0, { rx: Math.PI / 2 });
  interactive(nm, { name: '储物间', text: TXT.storage, trace: false });
  slot('储物间·地上', { rect: [-14.1, 3.7, -12.4, 6.6], y, face: 'z-' });
  P.pendantLamp(R, -13.0, C2, 5.5, { drop: 0.5, r: 0.17, shade: 'enamel', levels: L({ dawn: 0.2, day: 0, dusk: 0.6, night: 0.4 }), lightLamp: 4, fill: 1.1 });
}

// ———— 作业间 ————
function workshop(R) {
  const y = F2;
  const wb = group(R);
  boxMM(wb, 5.2, y + 0.84, 2.0, 5.95, y + 0.89, 8.0, M.woodMid, { collide: true });
  for (const z of [2.05, 5.0, 7.95]) boxMM(wb, 5.25, y, z - 0.04, 5.9, y + 0.84, z + 0.04, M.woodDark);
  boxMM(wb, 5.93, y + 1.05, 2.2, 5.95, y + 2.1, 6.0, new THREE.MeshStandardMaterial({ color: '#c9b08a', roughness: 0.9 }));
  const r = mulberry32(5);
  for (let i = 0; i < 22; i++) {
    const z = 2.4 + i * 0.16, yy = y + 1.25 + (i % 4) * 0.2;
    if (i % 2) cyl(wb, 0.008, 0.008, 0.2 + r() * 0.1, M.steel, 5.91, yy, z);
    else box(wb, 0.02, 0.14 + r() * 0.1, 0.05, i % 4 ? M.red : M.woodDark, 5.91, yy, z);
  }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) boxMM(wb, 5.75, y + 0.92 + j * 0.1, 6.3 + i * 0.3, 5.93, y + 1.0 + j * 0.1, 6.55 + i * 0.3, M.woodLight);
  interactive(wb, { name: '亚托莉的工作台', text: TXT.workbench });
  slot('作业间·工作台', { rect: [5.22, 2.15, 5.72, 6.15], y: y + 0.89, face: 'x-' });
  P.lowTable(R, 0.4, 4.6, 2.6, 5.9, y, 0.34);
  slot('作业间·矮桌', { rect: [0.46, 4.66, 2.54, 5.84], y: y + 0.34, face: 'z+' });
  for (const [x, z] of [[1.5, 4.05], [1.5, 6.45]]) P.zabuton(R, x, y, z, 0);
  rug(R, -0.2, 3.6, 3.2, 6.9, y);
  P.bookshelf(R, -2.785, y, 5.0, 5.6, 1.9, 0.34, { shelves: 5, seed: 8, face: 'x+' });
  addCollider(-2.98, y, 2.2, -2.62, y + 1.9, 7.8);
  slot('作业间·地上', { rect: [3.3, 1.0, 4.9, 2.9], y, face: 'z+' });
  plant(R, 4.9, y, 9.4, 1.0);
  P.pendantLamp(R, 1.5, C2, 5.2, { drop: 0.5, r: 0.2, shade: 'enamel', levels: L({ dawn: 0, day: 0, dusk: 0.6, night: 0.4 }), lightLamp: 6, fill: 1.4 });
}

// ———— 书房 ————
function study(R) {
  const y = F2;
  tatamiFloor(R, -11, 0.5, -3, 10, y + 0.03, { along: 'z', seed: 7 });
  // 书房铺了榻榻米（高 3 厘米），书架放在榻榻米上面
  P.bookshelf(R, -10.82, y + 0.03, 5.3, 8.4, 2.3, 0.34, { shelves: 7, seed: 12, face: 'x+' });
  P.bookshelf(R, -3.18, y + 0.03, 5.6, 7.6, 2.3, 0.34, { shelves: 7, seed: 31, face: 'x-' });
  addCollider(-11, y, 1.1, -10.64, y + 2.3, 9.5);
  addCollider(-3.36, y, 1.8, -3.0, y + 2.3, 9.4);
  const st = group(R, -7.0, y, 5.6);
  P.lowTable(st, -0.8, -0.45, 0.8, 0.45, 0.03, 0.34);
  P.zabuton(st, 0, 0.03, 0.75, 0);
  interactive(st, { name: '书房', text: TXT.study });
  slot('书房·书桌', { rect: [-7.76, 5.2, -6.62, 6.0], y: y + 0.37, face: 'z+' });
  slot('书房·地上', { rect: [-9.4, 8.6, -5.2, 9.6], y: y + 0.03, face: 'z-' });
  P.deskLamp(R, -6.4, y + 0.37, 5.3, 0.4, { levels: { dawn: 0, day: 0, dusk: 0.4, night: 0.5 } });
  // 地球仪
  const gl = group(R, -4.2, y, 8.6);
  cyl(gl, 0.12, 0.15, 0.04, M.woodDark, 0, 0.02, 0);
  cyl(gl, 0.015, 0.015, 0.5, M.brass, 0, 0.27, 0);
  sphere(gl, 0.2, new THREE.MeshStandardMaterial({ color: '#7fa3b8', roughness: 0.4 }), 0, 0.62, 0, { seg: 20 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 30), M.brass); ring.position.y = 0.62; ring.rotation.y = 0.4; gl.add(ring);
  P.pendantLamp(R, -7.0, C2, 5.2, { drop: 0.6, r: 0.26, levels: L({ dawn: 0, day: 0, dusk: 0.4, night: 0.3 }), lightLamp: 6, fill: 1.3 });
}

// ———— 阳台 ————
function balcony(R) {
  const y = F2 - 0.05;
  // 小木桌
  const t = group(R, 0.8, y, 11.0);
  boxMM(t, -0.5, 0.4, -0.45, 0.5, 0.43, 0.45, M.woodLight, { collide: true });
  for (const [a, b] of [[-0.45, -0.4], [0.45, -0.4], [0.45, 0.4], [-0.45, 0.4]]) box(t, 0.04, 0.4, 0.04, M.woodLight, a, 0.2, b);
  slot('阳台·小桌', { rect: [0.32, 10.57, 1.28, 11.43], y: y + 0.43, face: 'z-' });
  // 晾衣竿（竿在 house.js 里）
  slot('阳台·晾衣竿', { rect: [-1.05, 11.78, 4.45, 11.78], y: y + 1.78, face: 'z-', mount: 'line' });
  slot('阳台·地上', { rect: [10.9, 10.3, 14.4, 11.4], y, face: 'z-' });
  for (const x of [6.5, 12.0, 14.6]) plant(R, x, y, 11.7, 0.8);
}
