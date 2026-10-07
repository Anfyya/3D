import * as THREE from 'three';

// 灯池：场景里登记了二十几盏点光源，但每个像素都要把所有灯算一遍，太贵。
// 这里把它们都摘下来当“虚拟灯”，每帧只挑离镜头最近、最亮的 K 盏，交给 K 盏真正的点光源。
// 真灯数量固定，所以不会触发着色器重新编译；新换上的灯 0.35 秒淡入，换下的淡出，看不出跳变。
export class LightPool {
  constructor(scene, k = 8) {
    scene.updateMatrixWorld(true);
    const found = [];
    scene.traverse((o) => { if (o.isPointLight) found.push(o); });
    this.virtual = found.map((l) => {
      const p = new THREE.Vector3();
      l.getWorldPosition(p);
      l.parent.remove(l);
      return { l, p, w: 0, slot: null, score: 0, leaving: false };
    });
    this.slots = [];
    for (let i = 0; i < k; i++) {
      const r = new THREE.PointLight('#ffffff', 0, 10, 2);
      scene.add(r);
      this.slots.push({ r, v: null });
    }
    this.ranked = [];
  }

  update(dt, cam) {
    const cp = cam.position;
    const ranked = this.ranked;
    ranked.length = 0;
    for (const v of this.virtual) {
      const I = v.l.intensity;
      v.score = 0;
      if (I <= 1e-3) continue;
      const d = v.p.distanceTo(cp);
      const range = v.l.distance || 30;
      if (d > range + 2) continue;
      let s = I / (1 + (d / 3.5) * (d / 3.5));
      if (Math.abs(v.p.y - cp.y) > 3.2) s *= 0.3;   // 楼上楼下的灯权重低一点
      v.score = s;
      ranked.push(v);
    }
    ranked.sort((a, b) => b.score - a.score);
    const want = Math.min(ranked.length, this.slots.length);
    // 不再入选的灯淡出
    for (const s of this.slots) {
      if (!s.v) continue;
      const idx = ranked.indexOf(s.v);
      s.v.leaving = idx < 0 || idx >= want;
    }
    // 新入选的灯占空位
    for (let i = 0; i < want; i++) {
      const v = ranked[i];
      if (v.slot) continue;
      const free = this.slots.find((s) => !s.v) || this.slots.find((s) => s.v.leaving && s.v.w <= 0.05);
      if (!free) break;
      if (free.v) free.v.slot = null;
      free.v = v; v.slot = free; v.w = 0; v.leaving = false;
    }
    for (const s of this.slots) {
      const r = s.r, v = s.v;
      if (!v) { r.intensity = 0; continue; }
      v.w = v.leaving ? Math.max(0, v.w - dt / 0.35) : Math.min(1, v.w + dt / 0.35);
      if (v.leaving && v.w <= 0) { v.slot = null; s.v = null; r.intensity = 0; continue; }
      r.position.copy(v.p);
      r.color.copy(v.l.color);
      r.intensity = v.l.intensity * v.w;
      r.distance = v.l.distance;
      r.decay = v.l.decay;
    }
  }
}
