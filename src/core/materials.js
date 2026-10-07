import * as THREE from 'three';
import * as T from './textures.js';

// 统一管理材质。userData.tile = 贴图一个循环对应多少米（box() 会按世界尺寸铺 UV）
const M = {};

function std(opts, tile) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  if (tile) m.userData.tile = tile;
  return m;
}
function lam(opts, tile) {
  const m = new THREE.MeshLambertMaterial(opts);
  if (tile) m.userData.tile = tile;
  return m;
}

export function initMaterials() {
  // 木头
  M.floor = std({ map: T.woodPlanks({ base: '#b88956', rows: 8, seed: 1 }), roughness: 0.55 }, 1.6);
  M.floorDark = std({ map: T.woodPlanks({ base: '#8d5f3a', rows: 7, seed: 2 }), roughness: 0.42 }, 1.5);
  M.floorPale = std({ map: T.woodPlanks({ base: '#c9a273', rows: 9, seed: 3 }), roughness: 0.6 }, 1.6);
  M.engawa = std({ map: T.woodPlanks({ base: '#9a7552', rows: 6, seed: 4, contrast: 1.4 }), roughness: 0.7 }, 1.4);
  M.post = std({ map: T.woodGrain({ base: '#6e4a2e', seed: 5, vertical: true }), roughness: 0.6 }, 1.2);
  M.beam = std({ map: T.woodGrain({ base: '#5e3e27', seed: 6 }), roughness: 0.65 }, 1.5);
  M.woodLight = std({ map: T.woodGrain({ base: '#c9a57a', seed: 7 }), roughness: 0.6 }, 0.8);
  M.woodMid = std({ map: T.woodGrain({ base: '#9b6b43', seed: 8 }), roughness: 0.55 }, 0.8);
  M.woodDark = std({ map: T.woodGrain({ base: '#5a3a24', seed: 9 }), roughness: 0.5 }, 0.8);
  M.woodOld = std({ map: T.woodGrain({ base: '#7d6248', seed: 10 }), roughness: 0.8 }, 0.6);
  M.hinoki = std({ map: T.woodGrain({ base: '#dcc39a', seed: 12, lines: 40 }), roughness: 0.65 }, 0.9);
  M.ceiling = std({ map: T.woodPlanks({ base: '#a98663', rows: 5, seed: 13, seams: true, contrast: 0.7 }), roughness: 0.8 }, 2.2);
  M.yakisugi = std({ map: T.charredBoards(), roughness: 0.9 }, 1.4);
  M.bamboo = std({ color: '#b6a76a', roughness: 0.5 });
  M.bambooGreen = std({ color: '#6f8a3e', roughness: 0.45 });

  // 墙
  M.plasterIn = std({ map: T.plaster({ base: '#e9dcc0', seed: 5 }), roughness: 0.95 }, 1.2);
  M.plasterOut = std({ map: T.plaster({ base: '#efe8d8', seed: 6, fibers: false }), roughness: 0.95 }, 1.5);
  M.plasterEarth = std({ map: T.plaster({ base: '#c7a77c', seed: 7 }), roughness: 0.95 }, 1.2);
  M.plasterGreen = std({ map: T.plaster({ base: '#b9b48e', seed: 8 }), roughness: 0.95 }, 1.2);

  // 地面与石
  M.tataki = std({ map: T.tataki(), roughness: 0.95 }, 1.2);
  M.granite = std({ map: T.stone({ base: '#9a978f', seed: 13 }), roughness: 0.9 }, 1.2);
  M.stoneDark = std({ map: T.stone({ base: '#6d6c68', seed: 14 }), roughness: 0.9 }, 1.2);
  M.stoneWarm = std({ map: T.stone({ base: '#a39a88', seed: 15 }), roughness: 0.92 }, 1.0);
  M.stoneWall = std({ map: T.stoneWall({}), roughness: 0.95 }, 3.0);
  M.gravel = std({ map: T.gravel(), roughness: 1 }, 2.0);
  M.tile = std({ map: T.stone({ base: '#8a918a', seed: 16 }), roughness: 0.35 }, 0.6);

  // 屋顶
  M.roof = std({ map: T.roofTiles(), roughness: 0.6, metalness: 0.1 }, 1.2);
  M.roofRidge = std({ color: '#3d434f', roughness: 0.55, metalness: 0.15 });
  M.fascia = std({ map: T.woodGrain({ base: '#6a4b33', seed: 18 }), roughness: 0.7 }, 1.5);

  // 纸与门
  M.shojiPaper = new THREE.MeshStandardMaterial({ map: T.shojiPaper({}), side: THREE.DoubleSide, roughness: 1, emissive: new THREE.Color('#fff3dc'), emissiveIntensity: 0.15 });
  // 东侧四扇障子：旧纸右上角破了洞 / 新糊的纸白亮
  M.shojiPaperTorn = new THREE.MeshStandardMaterial({ map: T.shojiPaper({ torn: 'corner', seed: 11 }), side: THREE.DoubleSide, roughness: 1, alphaTest: 0.5, emissive: new THREE.Color('#fff0d4'), emissiveIntensity: 0.15 });
  M.shojiPaperNew = new THREE.MeshStandardMaterial({ map: T.shojiPaper({ fresh: true, seed: 12 }), side: THREE.DoubleSide, roughness: 1, emissive: new THREE.Color('#fffaf0'), emissiveIntensity: 0.18 });
  for (const k of ['shojiPaperTorn', 'shojiPaperNew']) M[k].userData.noDedupe = true;
  M.shojiLattice = new THREE.MeshStandardMaterial({ map: T.shojiLattice({}), side: THREE.DoubleSide, roughness: 0.7, alphaTest: 0.5 });
  M.windowLattice = new THREE.MeshStandardMaterial({ map: T.shojiLattice({ cols: 4, rows: 4, frame: 18, bar: 9, wood: '#6e4a2e' }), side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.5 });
  M.glassLattice = new THREE.MeshStandardMaterial({ map: T.shojiLattice({ cols: 2, rows: 3, frame: 16, bar: 8, wood: '#7a5638' }), side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.5 });
  M.ranma = new THREE.MeshStandardMaterial({ map: T.ranmaLattice(), side: THREE.DoubleSide, roughness: 0.7, alphaTest: 0.5 });
  M.fusuma = std({ map: T.fusuma({}) });
  M.fusumaBlue = std({ map: T.fusuma({ base: '#dfe3e2', pattern: '#8fa3b5', seed: 8 }) });
  M.fusumaGreen = std({ map: T.fusuma({ base: '#e2e2cf', pattern: '#9aa77c', seed: 12 }) });
  M.glass = new THREE.MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });

  // 布
  M.futonBlue = std({ map: T.fabric('futonBlue'), roughness: 1 }, 0.6);
  M.futonPink = std({ map: T.fabric('futonPink'), roughness: 1 }, 0.6);
  M.quilt = std({ map: T.fabric('quilt'), roughness: 1 }, 0.9);
  M.blanket = std({ map: T.fabric('blanket'), roughness: 1 }, 0.6);
  M.sheet = std({ map: T.fabric('sheet'), roughness: 1 }, 0.8);
  M.bedcover = std({ map: T.fabric('bedcover'), roughness: 1 }, 0.8);
  M.zabuton = std({ map: T.fabric('zabuton'), roughness: 1 }, 0.5);
  M.zabutonBlue = std({ map: T.fabric('zabutonBlue'), roughness: 1 }, 0.5);
  M.linen = std({ map: T.fabric('linen'), roughness: 1 }, 0.5);
  M.canvasBag = std({ map: T.fabric('canvasBag'), roughness: 1 }, 0.3);
  M.towel = std({ map: T.fabric('towel'), roughness: 1 });
  M.rug = std({ map: T.fabric('rug'), roughness: 1 });
  M.runner = std({ map: T.fabric('runner'), roughness: 1 });
  M.noren = new THREE.MeshStandardMaterial({ map: T.fabric('noren'), roughness: 1, side: THREE.DoubleSide });
  M.white = std({ color: '#f2efe8' });
  M.paper = std({ color: '#f3ecdc', roughness: 1 });
  M.paperDouble = new THREE.MeshStandardMaterial({ color: '#f3ecdc', roughness: 1, side: THREE.DoubleSide });

  // 金属陶瓷
  M.iron = std({ color: '#2c2b2a', roughness: 0.55, metalness: 0.6 });
  M.ironRust = std({ color: '#4a3a30', roughness: 0.8, metalness: 0.4 });
  M.brass = std({ color: '#c49a4a', roughness: 0.3, metalness: 0.9 });
  M.copper = std({ color: '#b46a3f', roughness: 0.35, metalness: 0.85 });
  M.steel = std({ color: '#b8bcc2', roughness: 0.25, metalness: 0.9 });
  M.ceramic = std({ color: '#f1ede4', roughness: 0.25 });
  M.ceramicBlue = std({ color: '#3f5f8a', roughness: 0.3 });
  M.ceramicBrown = std({ color: '#7a5235', roughness: 0.35 });
  M.ceramicGreen = std({ color: '#7d8f5e', roughness: 0.3 });
  M.lacquerRed = std({ color: '#8e2a22', roughness: 0.25 });
  M.lacquerBlack = std({ color: '#1d1a18', roughness: 0.25 });
  M.red = std({ color: '#c4302b', roughness: 0.4 });
  M.redBell = std({ color: '#d0352b', roughness: 0.25, metalness: 0.3 });
  M.rope = std({ color: '#d8c79a', roughness: 1 });
  M.black = std({ color: '#151515', roughness: 0.5 });
  M.plasticBlack = std({ color: '#202124', roughness: 0.3 });
  M.screen = std({ color: '#10141a', roughness: 0.15, emissive: new THREE.Color('#7fb2e5'), emissiveIntensity: 0.0 });

  // 食物
  M.yokan = std({ color: '#3d1f1a', roughness: 0.25 });
  M.chestnut = std({ color: '#e6b84a', roughness: 0.4 });
  M.dough = std({ color: '#f1e6cf', roughness: 0.9 });
  M.flour = std({ color: '#faf6ee', roughness: 1 });
  M.pumpkin = std({ color: '#e59a2f', roughness: 0.6 });
  M.redbean = std({ color: '#5a2a26', roughness: 0.6 });
  M.dango = std({ color: '#f4e7c8', roughness: 0.5 });
  M.soup = std({ color: '#c99a58', roughness: 0.1 });
  M.noodle = std({ color: '#f0e2b8', roughness: 0.6 });
  M.persimmon = std({ color: '#e8742a', roughness: 0.35 });
  M.persimmonDried = std({ color: '#9a4a22', roughness: 0.7 });
  M.tea = std({ color: '#8a9a3a', roughness: 0.1 });
  M.sugar = std({ color: '#fbfaf6', roughness: 0.9 });

  // 自然
  M.water = new THREE.MeshStandardMaterial({ color: '#4d7f8a', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.82 });
  M.bathWater = new THREE.MeshStandardMaterial({ color: '#8fc6c4', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 });
  M.trunk = std({ map: T.woodGrain({ base: '#4c3a2e', seed: 30, vertical: true }), roughness: 0.95 }, 0.8);
  M.trunkPale = std({ map: T.woodGrain({ base: '#7a6a5a', seed: 31, vertical: true }), roughness: 0.95 }, 0.8);
  M.moss = std({ color: '#5f7140', roughness: 1 });
  M.straw = std({ color: '#c8ad6a', roughness: 1 });

  // 发光
  M.lampPaper = new THREE.MeshStandardMaterial({ color: '#a89e8c', emissive: new THREE.Color('#ffc77a'), emissiveIntensity: 0.0, roughness: 1, side: THREE.DoubleSide });
  M.lanternRed = new THREE.MeshStandardMaterial({ color: '#c53a2a', emissive: new THREE.Color('#ff7a3a'), emissiveIntensity: 0.0, roughness: 0.9, side: THREE.DoubleSide });
  M.ember = new THREE.MeshStandardMaterial({ color: '#3a1a10', emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 1.6, roughness: 1 });
  M.spiritStone = new THREE.MeshStandardMaterial({ color: '#9fe8e0', emissive: new THREE.Color('#5fe0d0'), emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 });
  M.bulb = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffd7a0'), emissiveIntensity: 0.0 });

  return M;
}

export { M };

// 一次性小材质（带文字贴图等）
export function texMat(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, ...opts });
}
