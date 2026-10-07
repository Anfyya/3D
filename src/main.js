import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

import { initMaterials } from './core/materials.js';
import { setAniso } from './core/textures.js';
import { world, finalize, PICK_LAYER } from './core/build.js';
import { LightPool } from './core/lightpool.js';
import { buildSky } from './world/sky.js';
import { buildTerrain, terrainAreas } from './world/terrain.js';
import { buildHouse } from './world/house.js';
import { F1, F2, BATH_Y, COMPOUND, GATE_Z } from './world/layout.js';
import { buildInterior } from './world/interior.js';
import { buildGarden } from './world/garden.js';
import { buildSurroundings } from './world/surroundings.js';
import { buildAtmosphere } from './world/atmosphere.js';
import { fetchItems, placeItems } from './items/loader.js';
import { TimeOfDay } from './world/timeofday.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const MAX_PR = Math.min(devicePixelRatio, +(new URLSearchParams(location.search).get('pr') || 1.25));
renderer.setPixelRatio(MAX_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#cfe0ef', 0.004);
world.scene = scene;
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 4000);

const params = new URLSearchParams(location.search);
const startTime = params.get('t') || 'dusk';

const T0 = performance.now();
const itemsReq = fetchItems('./data/items.json');   // 每天会变的生活痕迹：和搭房子同时去读
const marks = [];
// 每搭完一部分让浏览器喘口气（刷新进度文字）。后台标签页里计时器会被节流，就改用 MessageChannel
function yieldNow() {
  if (document.hidden) return new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  return new Promise((r) => requestAnimationFrame(() => r()));
}
async function frame(label) { marks.push(`${label} ${(performance.now() - T0).toFixed(0)}ms`); await yieldNow(); }

async function build(ui) {
  const M = initMaterials();
  world.mats = M;
  const sky = buildSky(scene);

  const sun = new THREE.DirectionalLight('#fff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 32;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#bcd6f2', '#8c7a5c', 1);
  scene.add(hemi);

  const root = new THREE.Group();
  scene.add(root);
  ui.progress('地形 · 石阶'); await frame('start');
  buildTerrain(root);
  terrainAreas();
  ui.progress('宅子'); await frame('terrain');
  buildHouse(root);
  ui.progress('屋里的东西'); await frame('house');
  buildInterior(root);
  ui.progress('院子 · 树'); await frame('interior');
  buildGarden(root);
  ui.progress('围墙 · 藏经阁'); await frame('garden');
  buildSurroundings(root);
  ui.progress('摆东西'); await frame('surround');
  const pi = placeItems(root, await itemsReq);
  console.log('物件清单', pi, world.itemErrors);
  buildAtmosphere(root, camera);
  ui.progress('收拾一下'); await frame('surround+atmo');
  const st = finalize(scene);
  await frame('finalize');
  console.log('合并静态网格', st, marks.join(' | '));
  return { sky, sun, hemi };
}

// ———— 后期：AO、泛光、调色 ————
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1.08 }, uVignette: { value: 0.3 }, uTime: { value: 0 },
    uWarm: { value: new THREE.Color('#fff4e2') }, uCool: { value: new THREE.Color('#6c7ea8') }, uGhost: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uVignette, uTime, uGhost; uniform vec3 uWarm, uCool; varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = lum(c.rgb);
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec3 cool = mix(vec3(1.0), uCool / max(lum(uCool), 1e-3), 0.14);
      vec3 warm = mix(vec3(1.0), uWarm / max(lum(uWarm), 1e-3), 0.18);
      c.rgb *= mix(cool, warm, smoothstep(0.08, 0.8, l));
      c.rgb = c.rgb * 0.965 + 0.022;                       // 微微提亮暗部，动画背景那种柔和
      float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0, v, uVignette);
      // 灵体模式：泛一点青色的光晕
      c.rgb = mix(c.rgb, c.rgb * vec3(0.85, 1.02, 1.12) + vec3(0.02, 0.05, 0.07), uGhost);
      c.rgb += (h(vUv * 1000.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = c;
    }`,
};

// 注意：带 MSAA 的渲染目标和泛光一起用会整屏发黑，所以抗锯齿交给最后的 SMAA
// 主渲染目标带一张深度贴图，AO 直接用它算，不用再把整个场景重画一遍
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(innerWidth, innerHeight, THREE.FloatType) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (params.get('ao') !== '0') {
  gtao = new GTAOPass(scene, camera, innerWidth / 2, innerHeight / 2);
  // 用主渲染的深度（法线由深度重建），这样 AO 不再单独把整个场景画一遍
  gtao.setGBuffer(composer.renderTarget2.depthTexture);
  // AO 只在宅子和院子附近算：远山靠深度重建出来的法线不准，会冒出竖条纹，而且远处本来也看不出 AO
  gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-37, -6, -25), new THREE.Vector3(35, 26, 19)));
  // AO 用半分辨率算，省下一大半开销
  const setSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => setSize(Math.ceil(w / 2), Math.ceil(h / 2));
  gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 8 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.2, 0.4, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
const smaa = new SMAAPass();
composer.addPass(smaa);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ———— 启动 ————
const player = new Player(camera, canvas);
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const places = [
  { name: '大门里', sub: '门闩插着，今天哪儿也不去', x: COMPOUND.x0 + 1.6, y: 0, z: GATE_Z, yaw: yawTo(1, 0.02), pitch: -0.04 },
  { name: '前庭', sub: '地上的阵纹', x: -18.2, y: 0, z: 13.4, yaw: yawTo(-5.8, -12.4), pitch: -0.1 },
  { name: '宿舍门口', sub: '门把手上挂着红铃铛', x: -16.6, y: 0, z: 1.0, yaw: yawTo(1, 0.0) },
  { name: '玄关', sub: '挑高的楼梯厅', x: -11.6, y: F1, z: 1.0, yaw: yawTo(0.4, -1), pitch: 0.05 },
  { name: '一楼廊下', sub: '三米宽的长廊', x: -8.4, y: F1, z: -1.0, yaw: yawTo(1, 0) },
  { name: '地炉大厅', sub: '两层通高，也是饭厅', x: 0.2, y: F1, z: -3.3, yaw: yawTo(1, -0.75), pitch: 0.08 },
  { name: '厨房', sub: '橱柜和大案台', x: -3.0, y: F1, z: -3.8, yaw: yawTo(-0.8, -1) },
  { name: '东侧廊下', sub: '朝院子的四扇障子', x: 13.0, y: F1, z: -0.4, yaw: yawTo(2, -3.6), pitch: -0.02 },
  { name: '居间', sub: '唱机', x: -2.2, y: F1, z: 6.0, yaw: yawTo(-1, -0.5) },
  { name: '座敷', sub: '床之间', x: 0.2, y: F1, z: 2.0, yaw: yawTo(1, 0.4) },
  { name: '广缘', sub: '藤椅，看山谷', x: -7.5, y: F1, z: 8.7, yaw: yawTo(1, 0.1) },
  { name: '浴室', sub: '屋里引的一池温泉', x: -10.0, y: BATH_Y, z: 6.3, yaw: yawTo(-1, 0.75), pitch: -0.25 },
  { name: '院子', sub: '柿子树', x: 28, y: 0, z: 6, yaw: yawTo(-1, -0.15) },
  { name: '后院', sub: '丛雨练刀的地方', x: 18, y: 0, z: -15, yaw: yawTo(-1, 0.2) },
  { name: '二楼走廊', sub: '能看见楼下大厅', x: -12.0, y: F2, z: -1.0, yaw: yawTo(1, -0.3) },
  { name: '我的房间', sub: '床 · 书桌 · 窗', x: 7.8, y: F2, z: 1.4, yaw: yawTo(1, 0.45), pitch: -0.15 },
  { name: '亚托莉的房间', sub: '文机和行灯', x: -6.4, y: F2, z: -3.0, yaw: yawTo(-0.35, -1), pitch: -0.2 },
  { name: '丛雨的房间', sub: '丛雨丸的刀架', x: -2.4, y: F2, z: -3.0, yaw: yawTo(-0.4, -1), pitch: -0.2 },
  { name: '西侧壁橱', sub: '旁边就是储物间', x: -12.9, y: F2, z: -1.4, yaw: yawTo(-0.3, 1), pitch: -0.12 },
  { name: '作业间', sub: '风筝和彩纸', x: 1.5, y: F2, z: 1.4, yaw: yawTo(0.2, 1) },
  { name: '阳台', sub: '能看见山谷', x: 1.5, y: F2 - 0.05, z: 11.4, yaw: yawTo(0.3, 1) },
  { name: '书房', x: -7, y: F2, z: 1.4, yaw: yawTo(0, 1) },
];

const ui = new UI({ player, tod: null, camera, places, onEnter: enter });
let tod, sound, built = false;

function enter() {
  if (!built) return;
  ui.start();
  player.enabled = true;
  sound?.start();
  canvas.focus();
  lockPointer();
}
// 锁定指针：之后手指在触控板上滑动就能转头（不用按下）。锁不了的环境就退回两指滑动 / 按住拖动
function lockPointer() {
  if (player.noLock || !canvas.requestPointerLock) return;
  const fail = () => { if (!player.lockWorked) { player.noLock = true; ui.lockHint(false); } };
  try { const r = canvas.requestPointerLock(); r?.catch?.(fail); } catch { fail(); }
}
player.onLockChange = (locked) => ui.lockHint(locked);
player.onSens = (v) => ui.toast(`转头灵敏度 ${Math.round(v * 100)}%`);
// 轻点（单击）：锁定状态下点准星对着的东西 / 地面；没锁定时第一下先锁定
canvas.addEventListener('click', (e) => {
  if (!ui.started || player.dragMoved > 6) return;
  if (ui.dialogOpen) { ui.closeDialog(); return; }
  if (player.locked) { ui.clickAt(innerWidth / 2, innerHeight / 2); return; }
  if (!player.noLock && !ui.menuOpen) { lockPointer(); return; }
  ui.clickAt(e.clientX, e.clientY);
});
addEventListener('mousemove', (e) => { if (!player.locked && !player.dragging) ui.queueHover(e.clientX, e.clientY); });

(async () => {
  const { sky, sun, hemi } = await build(ui);
  tod = new TimeOfDay({ scene, renderer, sky, sun, hemi, bloom, grade });
  ui.tod = tod;
  tod.onChange((k) => document.querySelectorAll('.chip[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k)));
  tod.set(startTime, true);
  lightPool = new LightPool(scene, 8);
  renderer.shadowMap.needsUpdate = true;
  // 先把所有着色器编译好，免得第一次转头时卡一下
  if (!document.hidden) await Promise.race([renderer.compileAsync(scene, camera).catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
  sound = new Sound(camera);
  world.sound = (n) => sound.play(n);
  // 藏经阁升起来的时候人要是站在阵纹中间，就被轻轻推到东边台阶外
  world.onSummon = () => {
    const f = world.zang.footprint, p = player.feet;
    if (!player.ghost && p.x > f.x0 - 0.4 && p.x < f.x1 + 0.4 && p.z > f.z0 - 0.4 && p.z < f.z1 + 0.4) player.walkTo(new THREE.Vector3(f.x1 + 1.2, 0, Math.min(Math.max(p.z, f.z0 + 1), f.z1 - 1)));
  };
  world.sit = (p, yaw) => { player.sit(p, yaw); ui.toast('在池边坐下了。一走动就站起来'); };
  if (params.has('summon')) world.zang.set(true);
  player.teleport(places[0].x, places[0].y, places[0].z, places[0].yaw, places[0].pitch);
  built = true;
  ui.ready();
  if (params.get('go')) { const p = places.find((q) => q.name === params.get('go')); if (p) { enter(); player.teleport(p.x, p.y, p.z, p.yaw, p.pitch ?? -0.08); } }
  if (params.has('auto')) enter();
})();

// ———— 帧率：最高 60（高刷屏也不跑 120），没在操作时降到 30，标题画面 20 ————
// 按显示器刷新的整数倍跳帧（120Hz 每 2 帧画一次、60Hz 每帧都画），节奏均匀，转头不会一顿一顿
const FPS_CAP = Math.min(60, +(params.get('fps') || 60));
let lastInput = performance.now();
const poke = () => { lastInput = performance.now(); };
for (const ev of ['keydown', 'keyup', 'wheel', 'mousemove', 'mousedown', 'touchstart', 'touchmove', 'gesturechange']) addEventListener(ev, poke, { passive: true });
let busy = false;
function targetFps() {
  if (!ui.started) return 20;
  busy = performance.now() - lastInput < 2000 || player.vel.lengthSq() > 0.01 || !!player.autoTarget || (tod && tod.t < 1);
  return busy ? FPS_CAP : Math.min(FPS_CAP, 30);
}

// ———— 自适应分辨率：持续掉帧才降，持续流畅很久才升，避免来回切造成的周期性卡顿 ————
let prAcc = 0, prFrames = 0, curPR = MAX_PR, lowRuns = 0, highRuns = 0, lastPRChange = -100;
function adaptResolution(dt, target) {
  if (document.hidden || target < 50) { prAcc = 0; prFrames = 0; return; }
  prAcc += dt; prFrames++;
  if (prAcc < 1.5) return;
  const fps = prFrames / prAcc;
  prAcc = 0; prFrames = 0;
  if (fps < 40) { lowRuns++; highRuns = 0; } else if (fps > target - 4) { highRuns++; lowRuns = 0; } else { lowRuns = 0; highRuns = 0; }
  let next = curPR;
  if (lowRuns >= 2 && curPR > 0.75 && time - lastPRChange > 4) next = Math.max(0.75, curPR - 0.25);
  else if (highRuns >= 6 && curPR < MAX_PR && time - lastPRChange > 12) next = Math.min(MAX_PR, curPR + 0.25);
  if (next !== curPR) {
    curPR = next; lastPRChange = time; lowRuns = highRuns = 0;
    renderer.setPixelRatio(curPR);
    composer.setPixelRatio(curPR);
    composer.setSize(innerWidth, innerHeight);
  }
}

// ———— 主循环 ————
let time = 0, frameNo = 0, acc = 0, lastShadow = -10, lightPool = null;
let rafPrev = 0, rafInterval = 1 / 60, skipped = 0, wasBusy = false;
function loop(now) {
  requestAnimationFrame(loop);
  const raw = rafPrev ? Math.min(0.1, (now - rafPrev) / 1000) : 1 / 60;
  rafPrev = now;
  rafInterval += (raw - rafInterval) * 0.05;          // 显示器刷新间隔（平滑估计）
  acc += raw;
  const target = built ? targetFps() : 20;
  const every = Math.max(1, Math.round(1 / target / rafInterval));
  if (++skipped < every) return;
  skipped = 0;
  const dt = Math.min(acc, 0.1);
  acc = 0;
  time += dt;
  if (!built) return;
  player.update(dt);
  if (!player.enabled) player.syncCamera();
  tod.update(dt, time);
  for (const f of world.updaters) f(dt, time, camera);
  lightPool?.update(dt, camera);
  if ((frameNo++ % 3) === 0) ui.update();    // 准星对着什么、在哪个房间：一秒查二十次就够了
  if (frameNo % 2 === 0) ui.flushHover();
  sound?.update(dt, camera, player);
  grade.uniforms.uTime.value = time % 10;
  grade.uniforms.uGhost.value += ((player.ghost ? 1 : 0) - grade.uniforms.uGhost.value) * Math.min(1, dt * 4);
  // 影子只在需要时重画：时间段切换、门在动；正在操作时不做定时补画（免得每隔几秒顿一下），停下来再补
  if (world.shadowDirty || (!busy && (wasBusy || time - lastShadow > 6))) {
    renderer.shadowMap.needsUpdate = true; world.shadowDirty = false; lastShadow = time;
  }
  wasBusy = busy;
  adaptResolution(dt, target);
  // 让场景每帧都画进带深度贴图的那张渲染目标
  composer.readBuffer = composer.renderTarget2;
  composer.writeBuffer = composer.renderTarget1;
  composer.render(dt);
}
requestAnimationFrame(loop);

window.__dorm = { scene, camera, renderer, player, world, get tod() { return tod; }, get lightPool() { return lightPool; }, places, composer, gtao, bloom, ui };
