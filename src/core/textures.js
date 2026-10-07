import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

// 所有贴图都用 canvas 现画，不依赖外部图片
let ANISO = 8;
export function setAniso(a) { ANISO = a; }

const cache = new Map();
export function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function canvasTex(w, h, draw, { repeat = true, srgb = true, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}
function hexA(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
}

// 细碎的斑驳噪点，给各种表面加一点手绘的质感
function speckle(g, w, h, n, colors, rmin, rmax, r) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = rmin + r() * (rmax - rmin);
    g.globalAlpha = 0.05 + r() * 0.12;
    g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r()), r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// ———— 木头 ————
export function woodPlanks({ base = '#b9875a', rows = 8, seed = 1, seams = true, size = 1024, contrast = 1 } = {}) {
  return cached('planks' + base + rows + seed + seams, () => canvasTex(size, size, (g, w, h) => {
    const r = mulberry32(seed);
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      // 每块木板之间有接缝，长度不一
      let x = -r() * w;
      while (x < w) {
        const len = w * (0.45 + r() * 0.7);
        const f = 0.86 + r() * 0.24;
        g.fillStyle = shade(base, f);
        g.fillRect(x, i * ph, len, ph);
        // 木纹
        for (let k = 0; k < 14; k++) {
          const y0 = i * ph + r() * ph;
          g.strokeStyle = r() < 0.5 ? hexA(shade(base, 0.62), 0.22 * contrast) : hexA(shade(base, 1.25), 0.16 * contrast);
          g.lineWidth = 0.6 + r() * 1.8;
          g.beginPath();
          g.moveTo(x, y0);
          const amp = r() * 3;
          for (let s = 0; s <= 12; s++) {
            const xx = x + (len * s) / 12;
            g.lineTo(xx, clamp(y0 + Math.sin(s * 0.9 + k) * amp, i * ph + 1, (i + 1) * ph - 1));
          }
          g.stroke();
        }
        // 偶尔一个木节
        if (r() < 0.25) {
          const kx = x + r() * len, ky = i * ph + ph * (0.3 + r() * 0.4);
          g.fillStyle = hexA(shade(base, 0.5), 0.5);
          g.beginPath(); g.ellipse(kx, ky, 5 + r() * 6, 3 + r() * 2, 0, 0, Math.PI * 2); g.fill();
        }
        if (seams) { g.fillStyle = hexA(shade(base, 0.35), 0.8); g.fillRect(x, i * ph, 2, ph); }
        x += len;
      }
      if (seams) { g.fillStyle = hexA(shade(base, 0.3), 0.85); g.fillRect(0, i * ph, w, 2); }
    }
    // 整体光泽起伏
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, 'rgba(255,240,220,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }));
}

export function woodGrain({ base = '#8a5a36', seed = 3, size = 512, lines = 60, vertical = false } = {}) {
  return cached('grain' + base + seed + vertical, () => canvasTex(size, size, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < lines; k++) {
      const y0 = r() * h;
      g.strokeStyle = r() < 0.6 ? hexA(shade(base, 0.6), 0.25) : hexA(shade(base, 1.3), 0.18);
      g.lineWidth = 0.5 + r() * 2.5;
      g.beginPath();
      const amp = 2 + r() * 6, ph = r() * 6;
      for (let s = 0; s <= 24; s++) {
        const xx = (w * s) / 24;
        const yy = y0 + Math.sin(s * 0.5 + ph) * amp;
        if (vertical) (s ? g.lineTo(yy, xx) : g.moveTo(yy, xx)); else (s ? g.lineTo(xx, yy) : g.moveTo(xx, yy));
      }
      g.stroke();
    }
    speckle(g, w, h, 300, [shade(base, 0.7), shade(base, 1.2)], 1, 3, r);
  }));
}

// 焼杉板：外墙下半截的深色竖板
export function charredBoards() {
  return cached('yakisugi', () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(11);
    const n = 6, bw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade('#3b2f2a', 0.85 + r() * 0.3);
      g.fillRect(i * bw, 0, bw, h);
      for (let k = 0; k < 18; k++) {
        g.strokeStyle = hexA('#6d5a4d', 0.18 + r() * 0.15);
        g.lineWidth = 1 + r() * 2;
        const x0 = i * bw + r() * bw;
        g.beginPath(); g.moveTo(x0, 0);
        for (let s = 0; s <= 10; s++) g.lineTo(x0 + Math.sin(s + k) * 3, (h * s) / 10);
        g.stroke();
      }
      g.fillStyle = 'rgba(15,10,8,0.85)'; g.fillRect(i * bw, 0, 3, h);
      // 压条
      g.fillStyle = 'rgba(25,18,14,0.9)'; g.fillRect(i * bw + bw / 2 - 5, 0, 10, h);
      g.fillStyle = 'rgba(120,100,85,0.25)'; g.fillRect(i * bw + bw / 2 - 5, 0, 2, h);
    }
  }));
}

// ———— 墙面 ————
export function plaster({ base = '#e8dcc2', seed = 5, fibers = true } = {}) {
  return cached('plaster' + base + seed, () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2200, [shade(base, 0.88), shade(base, 1.06), shade(base, 0.94)], 2, 14, r);
    if (fibers) {
      // 聚楽壁里掺的碎稻草
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = hexA(r() < 0.5 ? '#a4865a' : '#c9ad7a', 0.35);
        g.lineWidth = 0.8;
        const x = r() * w, y = r() * h, a = r() * Math.PI, l = 2 + r() * 6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  }));
}

// ———— 榻榻米（单张，带畳縁）————
export function tatami({ seed = 2, age = 0.5 } = {}) {
  return cached('tatami' + seed + age, () => canvasTex(512, 1024, (g, w, h) => {
    const r = mulberry32(seed);
    const base = new THREE.Color('#bfc184').lerp(new THREE.Color('#d6c58c'), age);
    g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, w, h);
    // 蔺草的横向编织
    for (let y = 0; y < h; y += 4) {
      const f = 0.9 + r() * 0.14;
      g.fillStyle = '#' + base.clone().multiplyScalar(f).getHexString();
      g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(80,70,30,0.12)'; g.fillRect(0, y + 3, w, 1);
    }
    // 竖向经线
    for (let x = 30; x < w - 30; x += 48) { g.fillStyle = 'rgba(70,60,30,0.08)'; g.fillRect(x, 0, 2, h); }
    speckle(g, w, h, 400, ['#9a9a5a', '#e0d8a0'], 1, 4, r);
    // 畳縁：长边两侧的布边
    const bw = 20;
    for (const x of [0, w - bw]) {
      g.fillStyle = '#2b2f3a'; g.fillRect(x, 0, bw, h);
      g.fillStyle = 'rgba(160,140,90,0.35)';
      for (let y = 0; y < h; y += 14) g.fillRect(x + 4, y, bw - 8, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  }, { repeat: false }));
}

// ———— 障子 ————
// 格子（不透明部分 = 木条），其余透明，用于投出窗棂影子
export function shojiLattice({ cols = 3, rows = 8, frame = 20, bar = 7, wood = '#d9c3a0' } = {}) {
  return cached('lat' + cols + rows + frame + bar + wood, () => canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = wood;
    g.fillRect(0, 0, w, frame); g.fillRect(0, h - frame * 1.6, w, frame * 1.6);
    g.fillRect(0, 0, frame, h); g.fillRect(w - frame, 0, frame, h);
    for (let i = 1; i < cols; i++) g.fillRect(frame + ((w - 2 * frame) * i) / cols - bar / 2, 0, bar, h);
    for (let j = 1; j < rows; j++) g.fillRect(0, frame + ((h - frame * 2.6) * j) / rows - bar / 2, w, bar);
    // 木条一侧的阴影
    g.fillStyle = 'rgba(90,60,30,0.35)';
    for (let i = 1; i < cols; i++) g.fillRect(frame + ((w - 2 * frame) * i) / cols + bar / 2 - 2, 0, 2, h);
  }, { repeat: false }));
}

// 欄間：竖向细木条（筬欄間），可以横向重复
export function ranmaLattice() {
  return cached('ranma', () => canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#6a4a30';
    g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 4, h);
    g.fillRect(0, h / 2 - 3, w, 6);
    g.fillStyle = 'rgba(30,20,10,0.4)';
    for (let x = 4; x < w; x += 12) g.fillRect(x + 3, 0, 1, h);
  }));
}

export function shojiPaper({ torn = false, seed = 9, fresh = false } = {}) {
  return cached('paper' + torn + seed + fresh, () => canvasTex(256, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = fresh ? '#fcfbf7' : torn ? '#e9e0cc' : '#f6f1e6'; g.fillRect(0, 0, w, h);
    if (fresh) {
      // 新糊的纸：白亮，只有很淡的纤维
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(210,200,180,${0.05 + r() * 0.07})`; g.lineWidth = 0.5;
        const x = r() * w, y = r() * h, a = r() * Math.PI * 2, l = 3 + r() * 10;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      return;
    }
    if (torn === 'corner') {
      // 旧纸发黄，右上角（从屋里看）破了几个洞。门扇是侧着装的，从屋里看贴图左右是反的，所以洞画在贴图左上
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(185,155,95,${0.1 + r() * 0.12})`;
        g.beginPath(); g.ellipse(r() * w, r() * h, 12 + r() * 34, 8 + r() * 22, r() * 3, 0, Math.PI * 2); g.fill();
      }
      // 破洞边上一圈发黄的毛边，再挖掉洞（挖洞要用不透明的颜色）
      const holes = [[0.2, 0.09, 24, 20], [0.36, 0.17, 12, 15], [0.12, 0.22, 9, 10], [0.3, 0.05, 8, 7]];
      for (const [hx, hy, rx, ry] of holes) {
        g.fillStyle = 'rgba(150,115,60,0.35)';
        g.beginPath(); g.ellipse(hx * w, hy * h, rx * 1.45, ry * 1.45, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      for (const [hx, hy, rx, ry] of holes) {
        g.beginPath();
        for (let a = 0; a <= 16; a++) {
          const t = (a / 16) * Math.PI * 2, k = 0.6 + r() * 0.6;
          const px = hx * w + Math.cos(t) * rx * k, py = hy * h + Math.sin(t) * ry * k;
          a ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      return;
    }
    // 和纸纤维
    for (let i = 0; i < 500; i++) {
      g.strokeStyle = `rgba(190,175,150,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.6;
      const x = r() * w, y = r() * h, a = r() * Math.PI * 2, l = 3 + r() * 12;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r() * 6, y + r() * 6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    if (torn) {
      // 发黄的水渍和补丁
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(190,160,100,${0.1 + r() * 0.12})`;
        g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 8 + r() * 20, r() * 3, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#fbf8f0';
      g.fillRect(w * 0.55, h * 0.18, w * 0.2, h * 0.07);
      g.strokeStyle = 'rgba(160,140,110,0.4)'; g.strokeRect(w * 0.55, h * 0.18, w * 0.2, h * 0.07);
      // 破洞（alpha = 0）
      g.globalCompositeOperation = 'destination-out';
      const holes = [[0.3, 0.42, 22, 30], [0.7, 0.63, 14, 18], [0.42, 0.78, 26, 16], [0.2, 0.25, 9, 12]];
      for (const [hx, hy, rx, ry] of holes) {
        g.beginPath();
        for (let a = 0; a <= 16; a++) {
          const t = (a / 16) * Math.PI * 2, k = 0.6 + r() * 0.6;
          const px = hx * w + Math.cos(t) * rx * k, py = hy * h + Math.sin(t) * ry * k;
          a ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }, { repeat: false }));
}

// 襖：淡色纸面 + 青海波纹 + 黑漆边框 + 引手
export function fusuma({ base = '#ece3cf', pattern = '#c9b994', seed = 4, frame = '#2a2420' } = {}) {
  return cached('fusuma' + base + pattern + seed, () => canvasTex(256, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // 青海波
    g.strokeStyle = hexA(pattern, 0.45); g.lineWidth = 1.2;
    const R = 18;
    for (let y = h * 0.55; y < h + R; y += R * 0.5) {
      const off = (Math.round(y / (R * 0.5)) % 2) * R;
      for (let x = -R; x < w + R; x += R * 2) {
        for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x + off, y, (R * k) / 3, Math.PI, 0); g.stroke(); }
      }
    }
    // 上半部一片淡淡的金色云霞
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(214,190,130,${0.18 + r() * 0.1})`;
      const y = h * (0.12 + r() * 0.3);
      g.beginPath(); g.ellipse(w * r(), y, 60 + r() * 60, 12 + r() * 8, 0, 0, Math.PI * 2); g.fill();
    }
    speckle(g, w, h, 300, ['#d8cdb4', '#fff8e8'], 1, 3, r);
    g.fillStyle = frame;
    g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    // 引手
    g.fillStyle = '#5a4a3a'; g.beginPath(); g.arc(w - 34, h * 0.52, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a201a'; g.beginPath(); g.arc(w - 34, h * 0.52, 7, 0, Math.PI * 2); g.fill();
  }, { repeat: false }));
}

// ———— 屋顶瓦 ————
export function roofTiles() {
  return cached('tiles', () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(21);
    const rows = 4, cols = 4;
    const rh = h / rows, cw = w / cols;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cw, y = j * rh;
        const f = 0.9 + r() * 0.2;
        // 每片瓦横向是圆筒状的明暗
        const grd = g.createLinearGradient(x, 0, x + cw, 0);
        grd.addColorStop(0, shade('#3e4553', 0.75 * f));
        grd.addColorStop(0.35, shade('#6c7586', 1.05 * f));
        grd.addColorStop(0.6, shade('#566070', 0.95 * f));
        grd.addColorStop(1, shade('#2e333d', 0.8 * f));
        g.fillStyle = grd; g.fillRect(x, y, cw, rh);
        // 下沿的阴影
        const g2 = g.createLinearGradient(0, y, 0, y + rh);
        g2.addColorStop(0, 'rgba(255,255,255,0.07)'); g2.addColorStop(0.8, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.45)');
        g.fillStyle = g2; g.fillRect(x, y, cw, rh);
      }
      g.fillStyle = 'rgba(15,18,24,0.85)'; g.fillRect(0, (j + 1) * rh - 4, w, 4);
    }
    speckle(g, w, h, 500, ['#8a93a3', '#2a2f38'], 1, 3, r);
  }));
}

// ———— 石头 ————
export function stone({ base = '#8d8b85', seed = 13, size = 512 } = {}) {
  return cached('stone' + base + seed, () => canvasTex(size, size, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3500, [shade(base, 0.7), shade(base, 1.25), shade(base, 0.9), '#6a7060'], 1, 5, r);
    speckle(g, w, h, 60, [shade(base, 0.85), '#6f7a5a'], 20, 60, r);
  }));
}

// 石垣：一块块不规则的石头
export function stoneWall({ base = '#8f8a80', seed = 17 } = {}) {
  return cached('stonewall' + base + seed, () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = '#3b3833'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rowH = 50 + r() * 40;
      let x = -r() * 60;
      while (x < w) {
        const sw = 60 + r() * 80;
        const f = 0.75 + r() * 0.4;
        g.fillStyle = shade(base, f);
        const pts = [];
        const cx = x + sw / 2, cy = y + rowH / 2;
        for (let a = 0; a < 7; a++) {
          const t = (a / 7) * Math.PI * 2 + r() * 0.3;
          pts.push([cx + Math.cos(t) * (sw / 2 - 3) * (0.85 + r() * 0.15), cy + Math.sin(t) * (rowH / 2 - 3) * (0.85 + r() * 0.15)]);
        }
        g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
        // 上亮下暗
        const grd = g.createLinearGradient(0, y, 0, y + rowH);
        grd.addColorStop(0, 'rgba(255,255,240,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = grd; g.fill();
        // 青苔
        if (r() < 0.35) { g.fillStyle = `rgba(90,110,60,${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(cx + (r() - 0.5) * sw * 0.5, y + rowH * 0.25, sw * 0.3, rowH * 0.15, 0, 0, Math.PI * 2); g.fill(); }
        x += sw + 3;
      }
      y += rowH + 3;
    }
    // 由于是重复贴图，接缝处会稍有不齐，这里不去管它
  }));
}

// 三和土（土间地面）
export function tataki() {
  return cached('tataki', () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(31);
    g.fillStyle = '#8c7f6c'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, ['#6f6454', '#a49883', '#7d705e', '#5e5547'], 1, 4, r);
  }));
}

// 地面细节贴图（和顶点色相乘）
export function groundDetail() {
  return cached('ground', () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(41);
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, ['#b0b0b0', '#f2f2f2', '#c4c4c4', '#9a9a9a'], 1, 6, r);
    for (let i = 0; i < 1400; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '90,110,70' : '240,240,220'},0.18)`;
      g.lineWidth = 1;
      const x = r() * w, y = r() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke();
    }
  }));
}

// 碎石（枯山水 / 小路）
export function gravel() {
  return cached('gravel', () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(51);
    g.fillStyle = '#c9c3b6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      const v = 150 + r() * 90;
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      const s = 1 + r() * 3;
      g.beginPath(); g.ellipse(r() * w, r() * h, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(60,55,45,0.25)'; g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  }));
}

// ———— 布料 ————
export function fabric(kind) {
  return cached('fabric' + kind, () => canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(kind.length * 97);
    if (kind === 'futonBlue') {
      // 白底蓝色麻叶纹（亚托莉的被褥）
      g.fillStyle = '#f2eee6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,100,160,0.55)'; g.lineWidth = 1.4;
      const s = 32;
      for (let y = 0; y < h + s; y += s) for (let x = 0; x < w + s; x += s) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s); g.moveTo(x + s, y); g.lineTo(x, y + s);
        g.moveTo(x + s / 2, y); g.lineTo(x + s / 2, y + s); g.stroke();
      }
    } else if (kind === 'futonPink') {
      // 浅樱色底 + 小花（丛雨的被褥）
      g.fillStyle = '#f3e3e1'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * h, s = 6 + r() * 5;
        g.fillStyle = r() < 0.5 ? 'rgba(220,140,150,0.6)' : 'rgba(150,170,120,0.45)';
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.5, s * 0.32, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e8c070'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'quilt') {
      // 旧木屋带来的厚被：靛蓝底、红白唐草
      g.fillStyle = '#2f3f66'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(230,220,200,0.55)'; g.lineWidth = 3;
      for (let i = 0; i < 18; i++) {
        let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { const nx = x + (r() - 0.3) * 60, ny = y + (r() - 0.5) * 60; g.quadraticCurveTo(x + 30, y - 20, nx, ny); x = nx; y = ny; }
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.6 ? '#c0443e' : '#e7d7b5';
        const x = r() * w, y = r() * h;
        for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 4, a, 0, Math.PI * 2); g.fill(); }
      }
      // 缝线（厚被的绗缝）
      g.strokeStyle = 'rgba(20,25,40,0.5)'; g.lineWidth = 2; g.setLineDash([6, 6]);
      for (let k = 64; k < w; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
      g.setLineDash([]);
    } else if (kind === 'blanket') {
      // 毛毯：米色格纹
      g.fillStyle = '#d9c7a6'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < w; k += 64) {
        g.fillStyle = 'rgba(160,80,60,0.28)'; g.fillRect(k, 0, 14, h); g.fillRect(0, k, w, 14);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(k + 30, 0, 4, h); g.fillRect(0, k + 30, w, 4);
      }
      speckle(g, w, h, 1500, ['#c4b090', '#ece0c6'], 1, 3, r);
    } else if (kind === 'sheet') {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 800, ['#e2ddd2', '#ffffff'], 2, 6, r);
    } else if (kind === 'bedcover') {
      // 我床上的被子：浅灰蓝细条纹
      g.fillStyle = '#c9d3dc'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < w; k += 24) { g.fillStyle = 'rgba(90,110,140,0.25)'; g.fillRect(k, 0, 3, h); }
      speckle(g, w, h, 600, ['#b7c1cb', '#e0e8ee'], 2, 5, r);
    } else if (kind === 'zabuton') {
      g.fillStyle = '#5a3d5c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(230,200,150,0.35)'; g.lineWidth = 2;
      for (let k = 0; k < w; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); }
      speckle(g, w, h, 1200, ['#4a3350', '#6e4c70'], 1, 3, r);
    } else if (kind === 'zabutonBlue') {
      g.fillStyle = '#34507a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1500, ['#2a4268', '#48659a'], 1, 3, r);
    } else if (kind === 'noren') {
      // 靛蓝暖帘
      g.fillStyle = '#263c63'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1800, ['#1e3154', '#33507e'], 1, 3, r);
      g.fillStyle = 'rgba(240,235,220,0.9)';
      g.beginPath(); g.arc(w * 0.5, h * 0.4, 50, 0, Math.PI * 2); g.lineWidth = 9; g.strokeStyle = 'rgba(240,235,220,0.9)'; g.stroke();
      g.font = 'bold 56px "Hiragino Mincho ProN","Songti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('湯', w * 0.5, h * 0.4);
    } else if (kind === 'linen') {
      g.fillStyle = '#e5ddcc'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < w; k += 3) { g.fillStyle = `rgba(150,130,100,${0.05 + r() * 0.06})`; g.fillRect(k, 0, 1, h); g.fillRect(0, k, w, 1); }
    } else if (kind === 'canvasBag') {
      g.fillStyle = '#6b5a3e'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < w; k += 4) { g.fillStyle = `rgba(30,20,10,${0.1 + r() * 0.08})`; g.fillRect(k, 0, 2, h); g.fillRect(0, k, w, 2); }
    } else if (kind === 'rug') {
      // 米色地毯，深色边框和一圈小纹样
      g.fillStyle = '#d8c6a2'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1500, ['#cbb791', '#e4d4b4'], 1, 3, r);
      g.fillStyle = '#6a3a2c'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26); g.fillRect(0, 0, 26, h); g.fillRect(w - 26, 0, 26, h);
      g.fillStyle = '#b08a4a';
      for (let k = 40; k < w - 40; k += 28) { g.fillRect(k, 34, 12, 12); g.fillRect(k, h - 46, 12, 12); g.fillRect(34, k, 12, 12); g.fillRect(w - 46, k, 12, 12); }
    } else if (kind === 'runner') {
      // 走廊的靛蓝长地毯
      g.fillStyle = '#2f4566'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1500, ['#273b58', '#3a5378'], 1, 3, r);
      g.fillStyle = 'rgba(235,225,200,0.85)'; g.fillRect(0, 18, w, 8); g.fillRect(0, h - 26, w, 8);
      g.fillStyle = 'rgba(200,170,110,0.6)';
      for (let k = 0; k < w; k += 64) { g.beginPath(); g.arc(k + 32, h / 2, 14, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'towel') {
      g.fillStyle = '#f4f0e8'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,120,170,0.6)'; g.fillRect(0, h * 0.8, w, h * 0.06); g.fillRect(0, h * 0.1, w, h * 0.06);
    } else {
      g.fillStyle = '#ccc'; g.fillRect(0, 0, w, h);
    }
  }));
}

// ———— 文字贴图 ————
export function textTex(text, { w = 256, h = 256, bg = '#f4ead2', color = '#2a2420', font = '"Hiragino Mincho ProN","Songti SC","STSong",serif', size = 0.42, vertical = false, border = null, weight = 'bold', sub = null } = {}) {
  return cached('text' + text + w + h + bg + color + vertical + sub + size, () => canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (bg) speckle(g, w, h, 200, ['rgba(120,100,70,1)'], 1, 3, mulberry32(text.length));
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(3, w * 0.03); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.floor(Math.min(w, h) * size);
    g.font = `${weight} ${fs}px ${font}`;
    if (vertical) {
      const chars = [...text];
      const step = fs * 1.05;
      const y0 = h / 2 - ((chars.length - 1) * step) / 2;
      chars.forEach((c, i) => g.fillText(c, w / 2, y0 + i * step));
    } else {
      g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
      if (sub) { g.font = `${Math.floor(fs * 0.45)}px ${font}`; g.fillText(sub, w / 2, h * 0.75); }
    }
  }, { repeat: false }));
}

// 手写便签（亚托莉留的字条）
export function noteTex(lines, { w = 256, h = 192, color = '#3a3a5a' } = {}) {
  return cached('note' + lines.join('|'), () => canvasTex(w, h, (g) => {
    g.fillStyle = '#fbf6e8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,150,190,0.35)'; g.lineWidth = 1;
    for (let y = 36; y < h; y += 30) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); }
    g.fillStyle = color; g.textBaseline = 'alphabetic';
    g.font = '26px "Kaiti SC","STKaiti","Hiragino Maru Gothic ProN",cursive';
    lines.forEach((l, i) => g.fillText(l, 16, 32 + i * 30));
  }, { repeat: false }));
}

// ———— 树叶簇（透明卡片）————
function mapleLeaf(g, x, y, s, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color;
  g.beginPath();
  const lobes = 7;
  for (let i = 0; i <= lobes * 2; i++) {
    const t = (i / (lobes * 2)) * Math.PI * 2 - Math.PI / 2;
    const isTip = i % 2 === 0;
    const k = isTip ? (i === 0 || i === lobes * 2 ? 1 : 0.75 + 0.25 * Math.cos((i / (lobes * 2)) * Math.PI * 2)) : 0.38;
    const rr = s * k;
    i ? g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : g.moveTo(Math.cos(t) * rr, Math.sin(t) * rr);
  }
  g.closePath(); g.fill();
  g.restore();
}
function ovalLeaf(g, x, y, s, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color;
  g.beginPath(); g.ellipse(0, 0, s * 0.42, s, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}
function ginkgoLeaf(g, x, y, s, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color;
  g.beginPath(); g.moveTo(0, s * 0.6); g.arc(0, 0, s, -Math.PI * 0.85, -Math.PI * 0.15); g.closePath(); g.fill();
  g.restore();
}
function bambooLeaf(g, x, y, s, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color;
  g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.18, 0, 0, s); g.quadraticCurveTo(-s * 0.18, 0, 0, -s); g.fill();
  g.restore();
}

function needleTuft(g, x, y, s, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = color; g.lineWidth = 3.4; g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const t = (i / 8 - 0.5) * 2.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(t) * s, Math.cos(t) * s * 0.6 + s * 0.2); g.stroke();
  }
  g.restore();
}

export function leafCluster({ kind = 'maple', palette, seed = 1, count = 140, size = 512 } = {}) {
  return cached('leaf' + kind + seed + palette.join(), () => canvasTex(size, size, (g, w, h) => {
    const r = mulberry32(seed);
    g.clearRect(0, 0, w, h);
    const draw = { maple: mapleLeaf, oval: ovalLeaf, ginkgo: ginkgoLeaf, bamboo: bambooLeaf, needle: needleTuft }[kind];
    for (let i = 0; i < count; i++) {
      // 圆形分布，中间密边上疏
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.42;
      const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.92;
      const depth = y / h; // 下方偏暗，假装有体积
      const base = new THREE.Color(palette[Math.floor(r() * palette.length)]);
      base.multiplyScalar(1.12 - depth * 0.42 + (r() - 0.5) * 0.12);
      const s = (kind === 'bamboo' ? 26 : kind === 'oval' ? 15 : kind === 'needle' ? 22 : 19) * (0.75 + r() * 0.5);
      draw(g, x, y, s, r() * Math.PI * 2, '#' + base.getHexString());
    }
  }, { repeat: false }));
}

// ———— 粒子 / 雾 / 光柱 ————
export function softDot() {
  return cached('dot', () => canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false }));
}

export function mistTex(seed = 3) {
  return cached('mist' + seed, () => canvasTex(512, 256, (g, w, h) => {
    const r = mulberry32(seed);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = w * (0.1 + r() * 0.8), y = h * (0.35 + r() * 0.3), rx = 40 + r() * 110, ry = 20 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, `rgba(255,255,255,${0.08 + r() * 0.08})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.save(); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }, { repeat: false, srgb: false }));
}

// 可无缝平铺的云雾噪声（雾层用它代替每个像素现算的噪声）
export function cloudNoise() {
  return cached('cloudNoise', () => canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(77);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const blob = (x, y, rad, a) => {
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    };
    for (let i = 0; i < 70; i++) blob(r() * w, r() * h, 30 + r() * 60, 0.10 + r() * 0.1);
    for (let i = 0; i < 160; i++) blob(r() * w, r() * h, 8 + r() * 18, 0.06 + r() * 0.08);
    g.globalCompositeOperation = 'source-over';
  }, { srgb: false }));
}

export function shaftTex() {
  return cached('shaft', () => canvasTex(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const g2 = g.createLinearGradient(0, 0, w, 0);
    g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.25, 'rgba(0,0,0,0)'); g2.addColorStop(0.75, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = g2; g.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false }));
}

// 书脊
export function bookSpines(seed = 1) {
  return cached('books' + seed, () => canvasTex(512, 128, (g, w, h) => {
    const r = mulberry32(seed);
    let x = 0;
    const cols = ['#7a2e2a', '#2f4a6b', '#3d5c3a', '#c9b48a', '#5b3b5e', '#a36b2f', '#e8e0d0', '#38383f', '#8c4b3a'];
    while (x < w) {
      const bw = 10 + r() * 18;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      const top = r() * 22;
      g.fillRect(x, top, bw - 1, h - top);
      g.fillStyle = 'rgba(255,240,200,0.5)';
      if (r() < 0.7) g.fillRect(x + 2, top + 10, bw - 5, 3);
      if (r() < 0.5) g.fillRect(x + 2, h - 20, bw - 5, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + bw - 2, top, 1, h - top);
      x += bw;
    }
  }, { repeat: false }));
}

// 唱片封套
export function recordSleeve(seed) {
  return cached('sleeve' + seed, () => canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(seed * 7 + 1);
    const pal = [['#d9c7a0', '#8a3b2e'], ['#2b3c5a', '#e8d6a8'], ['#5e7d5a', '#f0e6cc'], ['#7a4a6a', '#f3dfc0'], ['#e4ddcf', '#2d4a6d']][seed % 5];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    g.fillStyle = pal[1];
    if (seed % 2) { g.beginPath(); g.arc(w * (0.3 + r() * 0.4), h * 0.4, 50 + r() * 30, 0, Math.PI * 2); g.fill(); }
    else { for (let i = 0; i < 5; i++) g.fillRect(0, h * (0.15 + i * 0.12), w, 6); }
    g.font = 'bold 22px serif'; g.fillText(['夜曲', 'Waltz', '秋の歌', 'Serenade', '月光'][seed % 5], 20, h - 26);
  }, { repeat: false }));
}
