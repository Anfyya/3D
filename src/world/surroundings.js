import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, texMat } from '../core/materials.js';
import * as T from '../core/textures.js';
import { world, box, boxMM, cyl, sphere, group, interactive, addCollider, addCircle, onUpdate } from '../core/build.js';
import { mulberry32, fbm, noise2 } from '../core/util.js';
import { terrainHeight, stairProfile, STAIR } from './terrain.js';
import { SUMMON } from './layout.js';
import * as P from './props.js';

const TXT = {
  towerDoor: '藏经阁——修炼的地方，就像那些玄幻小说里写的一样。门里的时间被拉得很长，到处是上好的灵石；丛雨在里面练引气、操刀、凝实。它平时不在，只有主人能把它召唤出来，一出来就在宿舍门外一步。（里面暂时还进不去；按 G 送走）',
  towerStone: '嵌在台基四角的灵石，摸上去是温的，灵气一阵一阵往外渗。',
  onsenStreet: '石阶顶上就是温泉街。旅馆志那都庄在街上，亚托莉以前住的旧木屋在街的最里头——钥匙已经还给老板娘了。',
  shrine: '远处山腰上那一点朱红是建实神社的鸟居。神社里供着御神体。',
  sea: '山谷尽头能看见海。海平面涨上来以后，海边的小镇有一半泡在水里——亚托莉就是在那片海底被捞上来的。',
  stairLantern: '石阶边的石灯笼。傍晚以后会点亮，从温泉街一路亮到镇口。',
};

// 带起翘的攒尖屋顶（四角往上翘）
function upturnedRoof(a, b, h, lift, flare = 0.15) {
  const nu = 16, nv = 8;
  const geos = [];
  for (let side = 0; side < 4; side++) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const s = a + (b - a) * Math.pow(v, 0.75);
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) * 2 - 1;
        let x = u * s, z = s;
        let y = h * Math.pow(v, 1.25) + lift * Math.pow(Math.abs(u), 4) * Math.pow(1 - v, 2.2);
        z += flare * Math.pow(1 - v, 3);
        x *= 1 + flare * 0.3 * Math.pow(1 - v, 3) / Math.max(s, 0.01);
        const ang = side * Math.PI / 2;
        const rx = x * Math.cos(ang) + z * Math.sin(ang), rz = -x * Math.sin(ang) + z * Math.cos(ang);
        pos.push(rx, y, rz);
        uv.push(u * s / 1.0, v * 2.5);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const p0 = j * (nu + 1) + i, p1 = p0 + 1, p2 = p0 + nu + 1, p3 = p2 + 1;
      idx.push(p0, p1, p2, p1, p3, p2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    geos.push(g);
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  return g;
}

// ———— 藏经阁：修炼的地方。平时不在，只有主人能召唤出来（按 G），从前庭的阵纹里升起 ————
function buildZangjingge(root) {
  const [cx, cz] = SUMMON;
  const T0 = group(root, cx, 0, cz);
  T0.userData.dynamic = true;
  T0.visible = false;
  const G = group(T0);            // 楼身：召唤时从地面往上长出来（缩放 y）
  G.userData.dynamic = true;
  const red = new THREE.MeshStandardMaterial({ color: '#9b2e22', roughness: 0.45 });
  const wall = M.plasterOut;
  const glow = new THREE.MeshStandardMaterial({ color: '#cfeee8', emissive: new THREE.Color('#5fd8c8'), emissiveIntensity: 0.8, roughness: 0.6 });
  const glowLamp = { mats: [{ mat: glow, base: 1.1 }], levels: { dawn: 0.55, day: 0.35, dusk: 0.8, night: 1.2 }, cur: 0, from: 0, to: 0, factor: 0 };
  world.lamps.push(glowLamp);
  const roofMat = new THREE.MeshStandardMaterial({ map: M.roof.map, color: '#8fa0a0', roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
  // 台基 + 东面的台阶（台阶可以走上去，站在门口）
  boxMM(G, -4.4, 0, -4.4, 4.4, 0.7, 4.4, M.stoneWall, { tile: 2 });
  boxMM(G, -4.5, 0.7, -4.5, 4.5, 0.8, 4.5, M.granite);
  for (let i = 0; i < 4; i++) boxMM(G, 4.4 + i * 0.3, 0, -1.4, 4.7 + i * 0.3, 0.8 - (i + 1) * 0.18, 1.4, M.granite, { walk: true });
  // 四角的灵石
  const st = group(G);
  st.userData.dynamic = true;
  for (const [x, z] of [[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]]) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), M.spiritStone);
    s.position.set(x, 1.15, z); s.scale.y = 1.6; st.add(s);
    onUpdate((dt, t) => { s.rotation.y = t * 0.12 + x; s.position.y = 1.15 + Math.sin(t * 0.5 + z) * 0.05; });
  }
  interactive(st, { name: '藏经阁台基上的灵石', text: TXT.towerStone, trace: false });
  // 五层
  const floors = [[3.6, 3.4], [3.1, 3.0], [2.7, 2.9], [2.3, 2.8], [1.9, 2.7]];
  let y = 0.8;
  floors.forEach(([hw, fh], i) => {
    const n = i < 2 ? 4 : 3, done = new Set();
    for (let k = 0; k <= n; k++) {
      const a = -hw + (2 * hw * k) / n;
      for (const [x, z] of [[a, -hw], [a, hw], [-hw, a], [hw, a]]) {
        const key = x.toFixed(2) + ',' + z.toFixed(2);
        if (done.has(key)) continue;
        done.add(key);
        cyl(G, 0.13, 0.15, fh, red, x, y + fh / 2, z, { seg: 10 });
      }
    }
    const w = hw - 0.12;
    boxMM(G, -w, y, -w, w, y + fh, w, wall);
    for (const side of [0, 1, 2, 3]) {
      const ang = side * Math.PI / 2;
      const winW = hw * 0.55, winH = fh * 0.45;
      if (i === 0 && side === 1) continue; // 东面是大门
      const m = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glow);
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), M.windowLattice);
      const ox = Math.sin(ang) * (w + 0.015), oz = Math.cos(ang) * (w + 0.015);
      m.position.set(ox, y + fh * 0.55, oz); m.rotation.y = ang; G.add(m);
      lat.position.set(Math.sin(ang) * (w + 0.035), y + fh * 0.55, Math.cos(ang) * (w + 0.035)); lat.rotation.y = ang; G.add(lat);
      m.userData.static = lat.userData.static = true;
    }
    boxMM(G, -hw - 0.15, y + fh - 0.25, -hw - 0.15, hw + 0.15, y + fh, hw + 0.15, red);
    const ra = hw + 1.3, rb = i === floors.length - 1 ? 0.25 : hw * 0.7;
    const rh = i === floors.length - 1 ? 2.4 : 0.9;
    const roof = new THREE.Mesh(upturnedRoof(ra, rb, rh, 0.75, 0.25), roofMat);
    roof.position.y = y + fh - 0.1; roof.castShadow = true; roof.receiveShadow = true; roof.userData.static = true; G.add(roof);
    if (i > 0) {
      const ry = y + 0.05;
      boxMM(G, -hw - 0.6, ry - 0.12, -hw - 0.6, hw + 0.6, ry, hw + 0.6, M.woodDark);
      for (const s of [-1, 1]) {
        boxMM(G, -hw - 0.6, ry + 0.7, s * (hw + 0.55) - 0.03, hw + 0.6, ry + 0.75, s * (hw + 0.55) + 0.03, red);
        boxMM(G, s * (hw + 0.55) - 0.03, ry + 0.7, -hw - 0.6, s * (hw + 0.55) + 0.03, ry + 0.75, hw + 0.6, red);
      }
    }
    y += fh;
  });
  const top = y + 2.2;
  cyl(G, 0.06, 0.08, 3.4, M.brass, 0, top + 1.2, 0);
  for (let k = 0; k < 7; k++) cyl(G, 0.32 - k * 0.025, 0.32 - k * 0.025, 0.07, M.brass, 0, top + 0.2 + k * 0.32, 0, { seg: 16 });
  sphere(G, 0.22, M.spiritStone, 0, top + 3.0, 0, { sy: 1.4, batch: false });
  // 大门（东面，正对宿舍玄关）+ 匾额「藏經閣」
  const door = group(G, 3.5, 0.8, 0);
  door.userData.dynamic = true;   // 自己合并，留在门这个组里才点得到
  boxMM(door, -0.05, 0, -1.25, 0.12, 2.9, 1.25, red);
  boxMM(door, 0.0, 0, -1.1, 0.16, 2.7, -0.01, M.woodDark);
  boxMM(door, 0.0, 0, 0.01, 0.16, 2.7, 1.1, M.woodDark);
  for (const z of [-0.55, 0.55]) for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) sphere(door, 0.035, M.brass, 0.17, 0.5 + r * 0.55, z + (c - 1) * 0.28, { seg: 8 });
  boxMM(door, 0.16, 0.0, -0.012, 0.172, 2.7, 0.012, glow, { batch: false });
  const plaqueTex = T.canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = '#1e2a2c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.lineWidth = 2; g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = '#e8c766'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 104px "Hiragino Mincho ProN","Songti SC","STSong",serif';
    g.fillText('藏經閣', w / 2, h / 2 + 4);
  }, { repeat: false });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: plaqueTex, emissive: '#ffffff', emissiveMap: plaqueTex, emissiveIntensity: 0.35 }));
  // 匾额挂在门楣上，上沿往前倾一点
  const pq = group(door, 0.3, 3.05, 0);
  pq.rotation.set(0.12, Math.PI / 2, 0, 'YXZ');
  boxMM(pq, -0.88, -0.34, -0.06, 0.88, 0.34, 0, M.woodDark);
  plaque.position.z = 0.016; pq.add(plaque);
  interactive(door, { name: '藏经阁', text: TXT.towerDoor, trace: false, kind: 'item', verb: '看看' });
  // 门前的光晕
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: T.softDot(), color: '#6fe0d0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(3.7, 2.2, 0); halo.rotation.y = Math.PI / 2; G.add(halo);
  // 楼前的青光（点光源跟着召唤程度变亮）
  const sl = new THREE.PointLight('#6fe0d0', 0, 12, 1.6); sl.position.set(5.2, 1.6, 0); T0.add(sl);
  // 周围慢慢往上飘的灵气（楼里时间被拉长了，所以飘得特别慢）
  const N = 260, r = mulberry32(31);
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = r() * 6.28, d = 3 + r() * 4; pos.set([Math.cos(a) * d, r() * 22, Math.sin(a) * d], i * 3); seed[i] = r(); }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: T.softDot() }, uI: { value: 0 }, uRise: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uI, uRise; varying float vA;
      void main(){
        vec3 p = position;
        float s = aSeed * 50.0;
        p.y = mod(p.y + uTime * 0.06 + uRise + aSeed * 20.0, 22.0) + 0.5;
        p.x += sin(uTime * 0.05 + s) * 0.6; p.z += cos(uTime * 0.04 + s) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = uI * (0.55 + 0.45 * sin(uTime * (0.8 + aSeed) + s));
        gl_PointSize = 0.16 * (0.6 + aSeed) * 700.0 / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.6; gl_FragColor = vec4(vec3(0.62, 1.0, 0.9) * a, a); }`,
  });
  const motes = new THREE.Points(mg, mm);
  motes.frustumCulled = false;
  T0.add(motes);
  // 召唤时冲天的一道光柱
  const pillarMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uO: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float a = uO * (1.0 - vUv.y) * (1.0 - vUv.y) * 0.55; gl_FragColor = vec4(vec3(0.55, 1.0, 0.92) * a, a); }`,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.4, 34, 40, 1, true), pillarMat);
  pillar.position.y = 17; pillar.visible = false; T0.add(pillar);
  // 碰撞：只在召唤出来以后才有
  const col = addCollider(cx - 4.5, -1, cz - 4.5, cx + 4.5, 30, cz + 4.5);
  col.on = false;

  // ———— 召唤 / 送走 ————
  const S = { f: 0, target: 0 };
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  world.zang = {
    get on() { return S.target === 1; },
    get busy() { return S.f !== S.target; },
    footprint: { x0: cx - 4.8, x1: cx + 5.9, z0: cz - 4.8, z1: cz + 4.8 },
    toggle() { this.set(S.target ? 0 : 1); },
    set(on) {
      S.target = on ? 1 : 0;
      if (on) { T0.visible = true; world.onSummon?.(); }
      world.sound?.(on ? 'summon' : 'dismiss');
    },
  };
  onUpdate((dt, t) => {
    if (S.f !== S.target) {
      const sp = dt / (S.target ? 2.6 : 1.8);
      S.f = S.target > S.f ? Math.min(1, S.f + sp) : Math.max(0, S.f - sp);
      world.shadowDirty = true;
      if (S.f === 0 && S.target === 0) T0.visible = false;
    }
    if (!T0.visible) { if (world.summonGlow) world.summonGlow.opacity = 0; return; }
    const e = ease(S.f);
    G.scale.set(0.9 + 0.1 * e, Math.max(0.002, e), 0.9 + 0.1 * e);
    col.on = S.f > 0.6;
    sl.intensity = 2.5 * e;
    glowLamp.factor = e;
    mm.uniforms.uTime.value = t;
    mm.uniforms.uI.value = e;
    const moving = S.f !== S.target;
    mm.uniforms.uRise.value += dt * (moving ? 4 : 0);
    const flash = moving ? Math.sin(Math.PI * S.f) : 0;
    pillar.visible = flash > 0.01;
    pillarMat.uniforms.uO.value = flash;
    if (world.summonGlow) world.summonGlow.opacity = Math.max(flash, e * (0.22 + 0.08 * Math.sin(t * 1.3)));
  });
  return T0;
}

// 石阶边的石灯笼
function stairLanterns(root) {
  const G = group(root);
  const glm = P.glowMat(M.lampPaper, 2.4);
  world.lamps.push({ mats: [glm], levels: { dawn: 0.15, day: 0, dusk: 0.85, night: 1 }, cur: 0, from: 0, to: 0 });
  const zs = [];
  for (let z = -72; z <= 64; z += 7) { if (z > STAIR.landing0 - 1 && z < STAIR.landing1 + 1) continue; zs.push(z); }
  zs.forEach((z, i) => {
    const x = i % 2 ? STAIR.x0 - 0.55 : STAIR.x1 + 0.55;
    const y = terrainHeight(x, z) - 0.05;
    const g = group(G, x, y, z);
    cyl(g, 0.2, 0.24, 0.14, M.granite, 0, 0.07, 0, { seg: 6 });
    cyl(g, 0.07, 0.08, 0.7, M.granite, 0, 0.5, 0, { seg: 8 });
    box(g, 0.24, 0.05, 0.24, M.granite, 0, 0.87, 0);
    box(g, 0.18, 0.2, 0.18, M.granite, 0, 0.99, 0);
    box(g, 0.19, 0.13, 0.12, glm.mat, 0, 0.99, 0, { batch: false });
    box(g, 0.12, 0.13, 0.19, glm.mat, 0, 0.99, 0, { batch: false });
    const rf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), M.granite); rf.position.y = 1.2; rf.rotation.y = Math.PI / 4; rf.castShadow = true; g.add(rf);
    addCircle(x, z, 0.25, y - 1, y + 2);
    g.userData.dynamic = true;
    if (i === 3) interactive(g, { name: '石阶边的石灯笼', text: TXT.stairLantern, trace: false });
  });
}

// 简单的和式房子（远景用）
function farHouse(geos, roofGeos, x, y, z, w, d, h, ry, r) {
  const b = new THREE.BoxGeometry(w, h, d); b.translate(0, h / 2, 0);
  const rf = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h * 0.55, 4, 1); rf.rotateY(Math.PI / 4); rf.scale(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45); rf.translate(0, h + h * 0.27, 0);
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  b.applyMatrix4(m); rf.applyMatrix4(m);
  geos.push(b.toNonIndexed()); roofGeos.push(rf.toNonIndexed());
}

function onsenStreet(root) {
  const G = group(root);
  const geos = [], roofs = [];
  const r = mulberry32(55);
  // 石阶顶上一条东西向的街
  const zTop = -78;
  const yTop = stairProfile(zTop);
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? -1 : 1;
    const x = -35 + (Math.floor(i / 2) - 3.5) * 9 + r() * 2;
    const z = zTop - 3 + side * 7 + (r() - 0.5) * 2;
    const y = Math.max(terrainHeight(x, z), yTop) - 0.2;
    farHouse(geos, roofs, x, y, z, 6 + r() * 3, 5 + r() * 2, 4 + r() * 3, 0, r);
  }
  // 最里头的旧木屋（街的东头）
  farHouse(geos, roofs, 22, Math.max(terrainHeight(22, -84), yTop) - 0.2, -84, 4.5, 4, 3.4, 0.2, r);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#b8a284', roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4a4e5a', roughness: 0.7 });
  const wm = new THREE.Mesh(mergeGeometries(geos), wallMat); wm.castShadow = false; G.add(wm);
  const rm = new THREE.Mesh(mergeGeometries(roofs), roofMat); G.add(rm);
  // 街上的提灯 + 冒热气
  const lg = P.glowMat(M.lanternRed, 3);
  world.lamps.push({ mats: [lg], levels: { dawn: 0.2, day: 0.1, dusk: 0.9, night: 1 }, cur: 0, from: 0, to: 0 });
  for (let i = 0; i < 18; i++) {
    const x = -48 + i * 4.5, z = zTop - 3 + (i % 2 ? -3.5 : 3.5);
    const y = Math.max(terrainHeight(x, z), yTop) + 2.6;
    sphere(G, 0.25, lg.mat, x, y, z, { sy: 1.3, batch: false, cast: false });
  }
  for (const [x, z] of [[-28, -82], [-8, -76], [6, -84], [-43, -78]]) {
    P.steam(G, x, Math.max(terrainHeight(x, z), yTop) + 5, z, { rate: 2, spread: 2, size: 9, rise: 2.2, life: 6, opacity: 0.25 });
  }
  const pick = new THREE.Mesh(new THREE.BoxGeometry(80, 14, 14), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(-14, yTop + 6, zTop - 3); G.add(pick);
  interactive(pick, { name: '温泉街', text: TXT.onsenStreet, trace: false });
}

function shrine(root) {
  const G = group(root);
  const x = 46, z = -92;
  const y = terrainHeight(x, z);
  const torii = new THREE.MeshStandardMaterial({ color: '#d2452a', roughness: 0.5, emissive: '#5a1a0a', emissiveIntensity: 0.25 });
  const tg = group(G, x, y, z, 0.6);
  for (const s of [-1, 1]) cyl(tg, 0.32, 0.38, 7.5, torii, s * 2.6, 3.75, 0, { seg: 12 });
  boxMM(tg, -3.9, 6.6, -0.35, 3.9, 7.0, 0.35, torii);
  boxMM(tg, -4.4, 7.25, -0.45, 4.4, 7.65, 0.45, M.lacquerBlack);
  boxMM(tg, -3.2, 5.6, -0.25, 3.2, 5.9, 0.25, torii);
  // 鸟居后面的社殿屋顶
  const sx = x + 12, sz = z - 14, sy = terrainHeight(sx, sz);
  boxMM(G, sx - 6, sy, sz - 4, sx + 6, sy + 4, sz + 4, new THREE.MeshStandardMaterial({ color: '#d9cbb0', roughness: 0.9 }));
  const rf = new THREE.Mesh(upturnedRoof(8, 0.4, 4, 0.8, 0.3), new THREE.MeshStandardMaterial({ color: '#3f5a52', roughness: 0.6, side: THREE.DoubleSide }));
  rf.position.set(sx, sy + 3.8, sz); rf.scale.set(1, 1, 0.7); G.add(rf);
  // 参道的石阶
  for (let i = 0; i < 26; i++) {
    const zz = z + 20 - i * 1.0, xx = x - 7 + i * 0.25;
    const yy = terrainHeight(xx, zz);
    boxMM(G, xx - 1.2, yy - 0.4, zz - 0.45, xx + 1.2, yy + 0.12, zz + 0.45, M.granite, { cast: false });
  }
  const pick = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 3), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(x, y + 4, z); G.add(pick);
  interactive(pick, { name: '建实神社的鸟居', text: TXT.shrine, trace: false });
}

function townAndSea(root) {
  const G = group(root);
  const geos = [], roofs = [];
  const r = mulberry32(88);
  // 山谷里的镇子（镇口一带）
  for (let i = 0; i < 90; i++) {
    const x = -90 + r() * 180, z = 85 + r() * 140;
    const y = terrainHeight(x, z);
    farHouse(geos, roofs, x, y - 0.3, z, 6 + r() * 6, 5 + r() * 5, 4 + r() * 5, r() * 0.6 - 0.3, r);
  }
  // 海边小镇（远处，一半泡在水里）
  const seaY = -62;
  for (let i = 0; i < 60; i++) {
    const x = -140 + r() * 280, z = 330 + r() * 70;
    const sunk = z > 380 ? 3 + r() * 3 : 0;
    farHouse(geos, roofs, x, seaY - sunk, z, 7 + r() * 6, 6 + r() * 4, 5 + r() * 6, r() * 0.5, r);
  }
  const wallMat = new THREE.MeshStandardMaterial({ color: '#c4b39a', roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4e5664', roughness: 0.7 });
  G.add(new THREE.Mesh(mergeGeometries(geos), wallMat), new THREE.Mesh(mergeGeometries(roofs), roofMat));
  // 电线杆（站在水里的那几根）
  const poles = [];
  for (let i = 0; i < 26; i++) { const p = new THREE.CylinderGeometry(0.25, 0.3, 14, 5); p.translate(-120 + i * 10 + r() * 3, seaY + 5, 395 + r() * 30); poles.push(p); }
  G.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ color: '#5a524a' })));
  // 镇上的热气
  for (const [x, z] of [[-30, 120], [20, 150], [50, 105], [-60, 170]]) P.steam(G, x, terrainHeight(x, z) + 6, z, { rate: 1.5, spread: 3, size: 16, rise: 3, life: 7, opacity: 0.22 });
  // 海
  const seaMat = new THREE.MeshStandardMaterial({ color: '#4e7f9a', roughness: 0.15, metalness: 0.35 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1600), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, seaY, 1250); G.add(sea);
  world.seaMat = seaMat;
  const pick = new THREE.Mesh(new THREE.BoxGeometry(400, 30, 120), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(0, seaY, 380); G.add(pick);
  interactive(pick, { name: '远处的海', text: TXT.sea, trace: false });
}

// 远山：几圈山脊
function mountains(root) {
  const G = group(root);
  const rings = [
    { R: 600, H: 340, base: 20, col: '#5d6e58', n: 3 },
    { R: 850, H: 460, base: 0, col: '#6f7f8f', n: 2 },
    { R: 1150, H: 560, base: -20, col: '#8a9bb0', n: 1.4 },
  ];
  rings.forEach((rg, k) => {
    const seg = 220;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // 南面（+z）留一个缺口给海
      const south = Math.max(0, Math.cos(a - Math.PI / 2));
      const gap = 1 - Math.pow(south, 6) * (k === 0 ? 0.95 : 0.8);
      const n = (fbm(Math.cos(a) * rg.n + k * 7, Math.sin(a) * rg.n, 3) + 0.5);
      const h = rg.base + rg.H * Math.max(0.05, n) * gap;
      const x = Math.cos(a) * rg.R, z = Math.sin(a) * rg.R;
      pos.push(x, rg.base - 120, z, x * 1.02, h, z * 1.02);
      c.set(rg.col);
      const autumn = new THREE.Color(k === 0 ? '#8a5a3a' : '#7a6a6a');
      // 颜色变化要很平缓，否则远看是一条条竖纹
      const t = Math.max(0, fbm(Math.cos(a) * 1.3 + k * 5, Math.sin(a) * 1.3, 2) + 0.15);
      c.lerp(autumn, Math.min(1, t) * 0.35);
      col.push(c.r * 0.8, c.g * 0.8, c.b * 0.8, c.r, c.g, c.b);
      if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));   // 远山是平涂的剪影，不吃光照，也就没有竖条纹
    G.add(m);
  });
}

export function buildSurroundings(root) {
  buildZangjingge(root);
  stairLanterns(root);
  onsenStreet(root);
  shrine(root);
  townAndSea(root);
  mountains(root);
}
