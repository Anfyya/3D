import * as THREE from 'three';
import { world } from '../core/build.js';
import { lerp, clamp } from '../core/util.js';

// 四个时间段。方位角从北（-z）顺时针量，东 = 90°
export const PRESETS = {
  dawn: {
    label: '清晨 · 晨雾', clock: '06:20',
    sunAz: 100, sunEl: 13, sunColor: '#ffc89a', sunInt: 2.2, moon: false,
    hemiSky: '#a9b9d6', hemiGround: '#6f6a66', hemiInt: 0.85,
    fogColor: '#cfd6de', fogDensity: 0.0085,
    skyTop: '#7896c4', skyHorizon: '#f4dcc8', skyBottom: '#cfd6de',
    cloudLit: '#ffe4cf', cloudShade: '#a7aec8', cover: 0.36, cloudAlpha: 0.9, scales: 0.6,
    stars: 0, moonVis: 0.25, glow: 1, sunSize: 0.0012,
    exposure: 1.0, lamp: 0.25, day: 0.6, fill: '#c9d2e6', fillInt: 2.0,
    mist: 1, bloom: 0.2, sat: 1.0, warm: '#ffe9d6', cool: '#5d6d96', vignette: 0.2, spirit: 0.35,
  },
  day: {
    label: '午后', clock: '14:30',
    sunAz: 205, sunEl: 36, sunColor: '#fff0d8', sunInt: 3.1, moon: false,
    hemiSky: '#bcd6f2', hemiGround: '#8c7a5c', hemiInt: 1.05,
    fogColor: '#cfe0ef', fogDensity: 0.0012,
    skyTop: '#2f74d0', skyHorizon: '#cfe6f7', skyBottom: '#b9cfe0',
    cloudLit: '#ffffff', cloudShade: '#b3c2dc', cover: 0.44, cloudAlpha: 1, scales: 0.85,
    stars: 0, moonVis: 0, glow: 1, sunSize: 0.0009,
    exposure: 1.0, lamp: 0, day: 1, fill: '#f0e4cc', fillInt: 3.0,
    mist: 0.12, bloom: 0.12, sat: 1.03, warm: '#fff4e2', cool: '#6c7ea8', vignette: 0.15, spirit: 0.18,
  },
  dusk: {
    label: '黄昏', clock: '17:20',
    sunAz: 258, sunEl: 4.5, sunColor: '#ffa468', sunInt: 2.4, moon: false,
    hemiSky: '#c4a6bc', hemiGround: '#8a6250', hemiInt: 1.05,
    fogColor: '#e2a888', fogDensity: 0.0016,
    skyTop: '#41548f', skyHorizon: '#ffb07a', skyBottom: '#9a7480',
    cloudLit: '#ffbf8e', cloudShade: '#7d6890', cover: 0.42, cloudAlpha: 1, scales: 1.0,
    stars: 0.05, moonVis: 0.4, glow: 1.2, sunSize: 0.0016,
    exposure: 1.0, lamp: 0.85, day: 0.45, fill: '#d6c0b2', fillInt: 1.3,
    mist: 0.35, bloom: 0.24, sat: 1.0, warm: '#ffe2c8', cool: '#5a5590', vignette: 0.22, spirit: 0.4,
  },
  night: {
    label: '夜', clock: '21:40',
    sunAz: 150, sunEl: 42, sunColor: '#9fb6e8', sunInt: 0.55, moon: true,
    hemiSky: '#33447a', hemiGround: '#1a1a24', hemiInt: 0.42,
    fogColor: '#1a2440', fogDensity: 0.0024,
    skyTop: '#060c22', skyHorizon: '#20305a', skyBottom: '#121a32',
    cloudLit: '#56648c', cloudShade: '#1c2440', cover: 0.25, cloudAlpha: 0.75, scales: 0.35,
    stars: 1, moonVis: 1, glow: 0, sunSize: 0.0009,
    exposure: 1.05, lamp: 1, day: 0, fill: '#6a7aa8', fillInt: 0.3,
    mist: 0.3, bloom: 0.34, sat: 0.98, warm: '#ffe0c0', cool: '#3a4a86', vignette: 0.28, spirit: 0.6,
  },
};

const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyHorizon', 'skyBottom', 'cloudLit', 'cloudShade', 'fill', 'warm', 'cool'];
const NUM_KEYS = ['scales', 'sunInt', 'hemiInt', 'fogDensity', 'cover', 'cloudAlpha', 'stars', 'moonVis', 'glow', 'sunSize', 'exposure', 'lamp', 'day', 'fillInt', 'mist', 'bloom', 'sat', 'vignette', 'spirit'];

function dirFrom(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

export class TimeOfDay {
  constructor({ scene, renderer, sky, sun, hemi, bloom, grade }) {
    Object.assign(this, { scene, renderer, sky, sun, hemi, bloom, grade });
    this.cur = {}; this.from = {}; this.to = {};
    for (const k of COLOR_KEYS) { this.cur[k] = new THREE.Color(); this.from[k] = new THREE.Color(); this.to[k] = new THREE.Color(); }
    this.cur.dir = new THREE.Vector3(); this.from.dir = new THREE.Vector3(); this.to.dir = new THREE.Vector3();
    this.t = 1; this.key = null;
    this.listeners = [];
  }

  set(key, instant = false) {
    const p = PRESETS[key];
    if (!p) return;
    this.key = key;
    world.tod.key = key;
    for (const k of COLOR_KEYS) { this.from[k].copy(this.cur[k]); this.to[k].set(p[k]); }
    for (const k of NUM_KEYS) { this.from[k] = this.cur[k] ?? p[k]; this.to[k] = p[k]; }
    this.from.dir.copy(this.cur.dir.lengthSq() ? this.cur.dir : dirFrom(p.sunAz, p.sunEl));
    this.to.dir.copy(dirFrom(p.sunAz, p.sunEl));
    this.moonDir = dirFrom(150, 42);
    this.t = instant ? 1 : 0;
    // 每盏灯各自的目标亮度
    for (const l of world.lamps) {
      l.from = l.cur ?? 0;
      l.to = l.override ?? (l.levels ? (l.levels[key] ?? 0) : p.lamp);   // override：物件清单写死了「点着 / 熄着」
    }
    // 某些东西只在特定时间段出现（比如铺开/叠好的被褥）
    for (const tv of world.timeVariants) tv.obj.visible = tv.keys.includes(key);
    for (const f of world.onTime) f(key);
    world.shadowDirty = true;
    this.listeners.forEach((f) => f(key));
    if (instant) this.apply(1);
  }

  onChange(f) { this.listeners.push(f); }

  apply(e) {
    const c = this.cur;
    for (const k of COLOR_KEYS) c[k].copy(this.from[k]).lerp(this.to[k], e);
    for (const k of NUM_KEYS) c[k] = lerp(this.from[k], this.to[k], e);
    c.dir.copy(this.from.dir).lerp(this.to.dir, e).normalize();

    // 太阳 / 月亮（同一盏平行光）
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunInt * clamp(c.dir.y * 6, 0, 1);
    const center = new THREE.Vector3(6, 0, -2);
    this.sun.position.copy(center).addScaledVector(c.dir, 90);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiInt;

    this.scene.fog.color.copy(c.fogColor);
    this.scene.fog.density = c.fogDensity;

    const u = this.sky.uniforms;
    u.uTop.value.copy(c.skyTop); u.uHorizon.value.copy(c.skyHorizon); u.uBottom.value.copy(c.skyBottom);
    u.uSunDir.value.copy(this.key === 'night' ? dirFrom(258, -20) : c.dir);
    u.uSunColor.value.copy(c.sunColor);
    u.uCloudLit.value.copy(c.cloudLit); u.uCloudShade.value.copy(c.cloudShade);
    u.uCover.value = c.cover; u.uCloudAlpha.value = c.cloudAlpha; u.uScales.value = c.scales;
    u.uStars.value = c.stars; u.uMoon.value = c.moonVis; u.uGlow.value = c.glow; u.uSunSize.value = c.sunSize;
    u.uMoonDir.value.copy(this.moonDir);

    this.renderer.toneMappingExposure = c.exposure;
    if (this.bloom) this.bloom.strength = c.bloom;
    if (this.grade) {
      const g = this.grade.uniforms;
      g.uSat.value = c.sat; g.uWarm.value.copy(c.warm); g.uCool.value.copy(c.cool); g.uVignette.value = c.vignette;
    }
    world.tod.lamp = c.lamp;
    world.tod.day = c.day;
    world.tod.mist = c.mist;
    world.tod.spirit = c.spirit;
    world.tod.fill = c.fill;
    world.tod.fillInt = c.fillInt;
    world.tod.sunDir = c.dir;
    world.tod.sunColor = c.sunColor;
    world.tod.fogColor = c.fogColor;
  }

  update(dt, time) {
    this.sky.uniforms.uTime.value = time;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 1.6);
      world.shadowDirty = true;
      const e = this.t * this.t * (3 - 2 * this.t);
      this.apply(e);
      for (const l of world.lamps) l.cur = lerp(l.from, l.to, e);
    } else {
      for (const l of world.lamps) l.cur = l.to;
    }
    // 灯光（含闪烁）
    for (const l of world.lamps) {
      const flick = l.flicker ? 1 + Math.sin(time * 11 + l.phase) * 0.04 + Math.sin(time * 23.7 + l.phase * 2) * 0.03 : 1;
      const v = (l.cur ?? 0) * flick * (l.factor ?? 1);
      // 灯整体收一点：灯罩不要亮成一团光球，屋里的光也别太黄太满
      if (l.light) l.light.intensity = l.intensity * v * 0.85;
      if (l.mats) for (const m of l.mats) m.mat.emissiveIntensity = m.base * v * 0.65;
    }
    // 室内补光：白天是天光的反射，晚上交给灯
    for (const f of world.fills || []) {
      f.light.color.copy(world.tod.fill);
      f.light.intensity = f.base * world.tod.fillInt;
    }
    // 障子纸透光
    const M = world.mats;
    if (M) {
      M.shojiPaper.emissiveIntensity = 0.05 + world.tod.day * 0.38 + world.tod.lamp * 0.12;
      M.shojiPaperTorn.emissiveIntensity = M.shojiPaper.emissiveIntensity * 0.9;
      M.shojiPaperNew.emissiveIntensity = M.shojiPaper.emissiveIntensity * 1.25;   // 新纸白亮，透光多一点
    }
  }
}
