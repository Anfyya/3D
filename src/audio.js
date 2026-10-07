import * as THREE from 'three';
import { world } from './core/build.js';
import { F1, F2 } from './world/layout.js';

// 全部是现场合成的声音：铃铛、拉门、虫鸣、鸟叫、地炉噼啪、钟摆、唱机里的小曲（原创旋律）
export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.t = 0;
    this.nextBird = 2; this.nextCrackle = 0; this.nextTick = 0; this.nextWatch = 0;
    addEventListener('pointerdown', () => this.ctx?.state === 'suspended' && this.ctx.resume());
    addEventListener('keydown', (e) => { if (e.code === 'KeyV') this.toggle(); });
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    // 白噪声缓冲
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 风
    const wind = this.loopNoise();
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(wf).connect(this.windGain).connect(this.master);
    // 浴室的水声
    const water = this.loopNoise();
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.8;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    water.connect(bf).connect(this.waterGain).connect(this.master);
    // 夜里的虫鸣：几只铃虫，各自的音高和节奏
    this.bugGain = ctx.createGain(); this.bugGain.gain.value = 0; this.bugGain.connect(this.master);
    this.bugs = [4250, 4480, 3980, 4700].map((f, i) => ({ f, next: i * 0.7, pan: i % 2 ? -0.6 : 0.6 }));
  }

  toggle() {
    this.on = !this.on;
    if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, this.ctx.currentTime, 0.1);
  }

  loopNoise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true; s.start();
    return s;
  }

  env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }

  tone(freq, t0, dur, peak, type = 'sine', dest = this.master, pan = 0) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    this.env(g, t0, 0.004, peak, dur);
    let node = o.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node = g.connect(p); p.connect(dest); } else g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  burst(t0, dur, freq, q, peak, type = 'bandpass') {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t0, Math.min(0.03, dur / 4), peak, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.1);
  }

  play(name) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (name === 'bell' || name === 'genkan') {
      if (name === 'genkan') { this.burst(t, 0.45, 700, 1.5, 0.25); this.burst(t + 0.05, 0.3, 2400, 2, 0.06); }
      // 小铃铛：几次叮铃
      for (let k = 0; k < 4; k++) {
        const tt = t + (name === 'genkan' ? 0.05 : 0) + k * (0.07 + Math.random() * 0.05);
        const v = 0.12 * (1 - k * 0.2);
        for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) this.tone(2150 * m * (0.99 + Math.random() * 0.02), tt, 0.9 - k * 0.1, v * a);
      }
    } else if (name === 'shoji') {
      this.burst(t, 0.5, 2600, 0.7, 0.12);
      this.burst(t + 0.02, 0.35, 900, 1.2, 0.06);
    } else if (name === 'slide') {
      this.burst(t, 0.4, 650, 1.0, 0.18);
    } else if (name === 'music') {
      this.music();
    } else if (name === 'summon' || name === 'dismiss') {
      // 召唤：一声很低的磬，然后一串往上（送走时往下）飘的泛音
      const up = name === 'summon';
      this.tone(up ? 98 : 110, t, 4.5, 0.16, 'sine');
      this.tone(up ? 196.5 : 220.7, t, 3.2, 0.07, 'sine');
      this.tone(up ? 523 : 587, t + 0.02, 2.4, 0.03, 'triangle');
      this.burst(t, 1.6, 1200, 0.6, 0.05);
      for (let k = 0; k < 9; k++) {
        const n = up ? k : 8 - k;
        this.tone(660 * Math.pow(2, n / 6), t + 0.25 + k * 0.17, 1.4, 0.022 * (1 - k * 0.06), 'sine', this.master, ((k % 3) - 1) * 0.5);
      }
    }
  }

  // 原创的小曲：三拍子，像旧唱片里的八音盒
  music() {
    if (world.musicPlaying) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0.9;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    out.connect(lp).connect(hp).connect(this.master);
    // 唱片的沙沙声
    const crack = this.loopNoise();
    const cf = c.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
    const cg = c.createGain(); cg.gain.value = 0.012;
    crack.connect(cf).connect(cg).connect(this.master);
    const beat = 60 / 84;
    const mel = [
      [76, 1], [72, 0.5], [74, 0.5], [76, 1], [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 1], [69, 1], [71, 2], [0, 1],
      [72, 1], [71, 0.5], [69, 0.5], [67, 1], [69, 1.5], [72, 0.5], [76, 1], [74, 1], [71, 1], [72, 1], [69, 3],
      [81, 1], [79, 0.5], [77, 0.5], [76, 1], [77, 1.5], [76, 0.5], [74, 1], [72, 1], [74, 1], [76, 1], [71, 3],
      [72, 1], [74, 0.5], [76, 0.5], [79, 1], [77, 1], [76, 1], [74, 1], [71, 1], [72, 1], [74, 1], [69, 3],
    ];
    const bass = [45, 41, 43, 40, 45, 41, 38, 45, 41, 43, 48, 40, 45, 38, 40, 45];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    let t = c.currentTime + 0.4;
    const t0 = t;
    for (const [n, d] of mel) {
      if (n) {
        const f = midi(n);
        this.tone(f, t, d * beat * 1.6, 0.11, 'triangle', out);
        this.tone(f * 2, t, d * beat * 0.8, 0.03, 'sine', out);
      }
      t += d * beat;
    }
    bass.forEach((n, i) => {
      const tb = t0 + i * 3 * beat;
      this.tone(midi(n), tb, beat * 2.5, 0.07, 'sine', out);
      this.tone(midi(n + 7), tb + beat, beat * 0.9, 0.035, 'triangle', out);
      this.tone(midi(n + 12), tb + beat * 2, beat * 0.9, 0.035, 'triangle', out);
    });
    world.musicPlaying = true;
    setTimeout(() => { world.musicPlaying = false; crack.stop(); }, (t - c.currentTime + 1) * 1000);
  }

  bird(t, pan) {
    const c = this.ctx;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.11 + Math.random() * 0.05);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, tt);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), tt + 0.06);
      const g = c.createGain(); this.env(g, tt, 0.006, 0.035, 0.07);
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(this.master); } else o.connect(g).connect(this.master);
      o.start(tt); o.stop(tt + 0.15);
    }
  }

  update(dt, camera, player) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    this.t += dt;
    const key = world.tod.key;
    const p = player.feet;
    const inside = p.x > -15 && p.x < 15 && p.z > -10 && p.z < 10 && p.y > 0.3;
    const sm = (g, v) => g.gain.setTargetAtTime(v, now, 0.4);
    sm(this.windGain, (inside ? 0.025 : 0.07) * (0.7 + Math.sin(this.t * 0.3) * 0.3) * (key === 'night' ? 0.6 : 1));
    const dBath = Math.hypot(p.x + 13.5, p.z - 8.5) + Math.abs(p.y - 0.4);
    sm(this.waterGain, 0.09 / (1 + dBath * dBath * 0.25));
    // 虫鸣：夜里最响，黄昏开始
    const bugLevel = { night: 1, dusk: 0.45, dawn: 0.12, day: 0 }[key] ?? 0;
    sm(this.bugGain, bugLevel * (inside ? 0.45 : 1));
    if (bugLevel > 0) {
      for (const b of this.bugs) {
        if (this.t > b.next) {
          // 「リーン」：快速颤音的一小段
          for (let k = 0; k < 9; k++) this.tone(b.f, now + k * 0.045, 0.04, 0.03, 'sine', this.bugGain, b.pan);
          b.next = this.t + 0.9 + Math.random() * 1.6;
        }
      }
    }
    // 鸟：清晨和午后
    if ((key === 'dawn' || key === 'day') && this.t > this.nextBird) {
      this.bird(now, Math.random() * 1.6 - 0.8);
      this.nextBird = this.t + (key === 'dawn' ? 1.5 : 4) + Math.random() * 4;
    }
    // 地炉噼啪
    const dIr = Math.hypot(p.x - 7.5, p.z + 6.3) + Math.abs(p.y - F1) * 2;
    if (world.iroriLit !== false && dIr < 7 && this.t > this.nextCrackle) {
      this.burst(now, 0.03 + Math.random() * 0.05, 1800 + Math.random() * 2500, 3, 0.25 / (1 + dIr * dIr * 0.4), 'bandpass');
      this.nextCrackle = this.t + 0.08 + Math.random() * 0.6;
    }
    // 挂钟的滴答
    const dCk = Math.hypot(p.x - 6.0, p.z + 9.8) + Math.abs(p.y - F1 - 1.5);
    if (dCk < 6 && this.t > this.nextTick) {
      this.burst(now, 0.025, 3200, 6, 0.12 / (1 + dCk * dCk * 0.5), 'bandpass');
      this.nextTick = this.t + 1.0;
    }
    // 床头怀表：很轻、很快
    const wp = world.watchPos;
    if (wp) {
      const dW = Math.hypot(p.x - wp.x, p.z - wp.z) + Math.abs(p.y + 1.5 - wp.y);
      if (dW < 2.4 && this.t > this.nextWatch) {
        this.burst(now, 0.012, 6000, 8, 0.05 / (1 + dW * dW * 2), 'bandpass');
        this.nextWatch = this.t + 0.2;
      }
    }
  }
}
