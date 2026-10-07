import * as THREE from 'three';
import { world } from './core/build.js';
import { terrainHeight, worldLimit } from './world/terrain.js';
import { COMPOUND } from './world/layout.js';
import { clamp } from './core/util.js';

const EYE = 1.56, RADIUS = 0.24, STEP = 0.52;   // 缘侧高 0.47 米，要能一步跨上去
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.feet = new THREE.Vector3(-11.5, 6, -12);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI; this.pitch = -0.12;
    this.eyeY = this.feet.y + EYE;
    this.keys = {};
    this.ghost = false;
    this.enabled = false;
    this.bob = 0;
    this.onLimit = null;
    this.locked = false;
    this.dragging = false;
    this.dragMoved = 0;

    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    // 转头灵敏度（[ 和 ] 调），记在本地
    this.sens = +(safeGet('dorm.sens') || 1);
    addEventListener('keydown', (e) => {
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        this.sens = clamp(this.sens * (e.code === 'BracketRight' ? 1.15 : 1 / 1.15), 0.3, 3);
        safeSet('dorm.sens', this.sens.toFixed(3));
        this.onSens?.(this.sens);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.locked) this.lockWorked = true;
      this.onLockChange?.(this.locked);
    });
    // 锁定指针后：手指在触控板上滑动（不用按下）直接转头，没有惯性，跟游戏一样
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        const mx = e.movementX, my = e.movementY;
        if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;   // 浏览器偶尔会给一个离谱的跳变，丢掉
        const k = (this.locked ? 0.0024 : 0.004) * this.sens;
        if (this.dragging) this.dragMoved += Math.abs(mx) + Math.abs(my);
        this.yaw -= mx * k;
        this.pitch = clamp(this.pitch - my * k * (this.invertY ? -1 : 1), -1.45, 1.45);
        this.autoTarget = null;
      }
    });
    dom.addEventListener('mousedown', (e) => { if (!this.locked && e.button === 0) { this.dragging = true; this.dragMoved = 0; } });
    // 触控板：两指滑动 = 转头看；捏合 = 放大看细节（Chrome/Firefox 是 ctrl+wheel，Safari 是 gesture 事件）
    this.baseFov = camera.fov;
    this.invertY = false;
    addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey) { this.zoom(e.deltaY * k * 0.12); return; }
      this.yaw -= e.deltaX * k * 0.0032 * this.sens;
      this.pitch = clamp(this.pitch - e.deltaY * k * 0.0032 * this.sens * (this.invertY ? -1 : 1), -1.45, 1.45);
      this.autoTarget = null;
    }, { passive: false });
    let g0 = 1;
    addEventListener('gesturestart', (e) => { e.preventDefault(); g0 = camera.fov; });
    addEventListener('gesturechange', (e) => { if (!this.enabled) return; e.preventDefault(); camera.fov = clamp(g0 / e.scale, 25, 80); camera.updateProjectionMatrix(); });
    addEventListener('keydown', (e) => { if (e.code === 'KeyI') this.invertY = !this.invertY; if (e.code === 'KeyZ') { camera.fov = this.baseFov; camera.updateProjectionMatrix(); } });
    addEventListener('mouseup', () => { this.dragging = false; });
    // 触屏：单指拖动看，屏幕下半双指前进（简单支持）
    let last = null;
    dom.addEventListener('touchstart', (e) => { last = e.touches[0]; this.touchFwd = e.touches.length >= 2; }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (last && this.enabled) { this.yaw -= (t.clientX - last.clientX) * 0.005; this.pitch = clamp(this.pitch - (t.clientY - last.clientY) * 0.005, -1.4, 1.4); }
      last = t; this.touchFwd = e.touches.length >= 2;
    }, { passive: true });
    dom.addEventListener('touchend', (e) => { this.touchFwd = e.touches.length >= 2; if (!e.touches.length) last = null; }, { passive: true });
  }

  zoom(d) {
    this.camera.fov = clamp(this.camera.fov + d, 25, 80);
    this.camera.updateProjectionMatrix();
  }

  // 点一下地面：自动走过去
  walkTo(p) { this.autoTarget = p.clone(); this.autoStuck = 0; this.autoLast = this.feet.clone(); this.seated = false; }

  // 坐下（温泉池边）：视线放低，一走动就站起来
  sit(p, yaw) {
    this.autoTarget = null;
    this.feet.copy(p);
    this.vy = 0; this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = -0.2;
    this.seated = true;
  }

  teleport(x, y, z, yaw, pitch = -0.08) {
    this.autoTarget = null;
    this.seated = false;
    this.feet.set(x, y, z);
    this.vy = 0;
    this.eyeY = y + EYE;
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
    this.syncCamera();
  }

  groundAt(x, z, fromY) {
    let g = terrainHeight(x, z);
    ray.set(new THREE.Vector3(x, fromY, z), DOWN);
    ray.far = 60;
    // 隐藏起来的东西（比如没召唤时的藏经阁台阶）不能踩。只看父级：楼梯斜坡这种“本身就看不见、专门用来走”的面要照样能踩
    const hit = ray.intersectObjects(world.walkables, false).find((h) => { for (let o = h.object.parent; o; o = o.parent) if (!o.visible) return false; return true; });
    if (hit) g = Math.max(g, hit.point.y);
    return g;
  }

  collide(p, feetY) {
    const y0 = feetY + STEP - 0.12, y1 = feetY + 1.7;
    for (let it = 0; it < 3; it++) {
      for (const c of world.colliders) {
        if (!c.on || c.maxY < y0 || c.minY > y1) continue;
        const nx = clamp(p.x, c.minX, c.maxX), nz = clamp(p.z, c.minZ, c.maxZ);
        const dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = RADIUS - d;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
        } else {
          // 圆心在盒子里面：沿最短方向推出去
          const opts = [[c.minX - RADIUS - p.x, 0], [c.maxX + RADIUS - p.x, 0], [0, c.minZ - RADIUS - p.z], [0, c.maxZ + RADIUS - p.z]];
          opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
      for (const c of world.circles) {
        if (c.maxY < y0 || c.minY > y1) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = RADIUS + c.r;
        if (d < m && d > 1e-6) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
      }
    }
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp || this.touchFwd ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const turn = (k.ArrowLeft || k.KeyQ ? 1 : 0) - (k.ArrowRight ? 1 : 0);
    this.yaw += turn * 1.9 * dt;
    const run = k.ShiftLeft || k.ShiftRight;
    const speed = this.ghost ? (run ? 8 : 3.5) : (run ? 6 : 3.0);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const want = new THREE.Vector3(-sin * fwd + cos * side, 0, -cos * fwd - sin * side);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    if (fwd || side) { this.autoTarget = null; this.seated = false; }
    if (this.autoTarget && !this.ghost) {
      const d = new THREE.Vector3(this.autoTarget.x - this.feet.x, 0, this.autoTarget.z - this.feet.z);
      const dist = d.length();
      this.autoStuck += dt;
      if (this.autoStuck > 0.6) {
        if (this.feet.distanceTo(this.autoLast) < 0.15) this.autoTarget = null;
        this.autoStuck = 0; this.autoLast.copy(this.feet);
      }
      if (dist < 0.3) this.autoTarget = null;
      else if (this.autoTarget) want.copy(d.multiplyScalar(Math.min(3.0, dist * 2.5 + 0.6) / dist));
    }
    const a = 1 - Math.exp(-dt * (this.ghost ? 4 : 12));
    this.vel.lerp(want, a);

    if (this.ghost) {
      // 灵体模式：像丛雨一样飘，能穿墙
      const up = (k.Space ? 1 : 0) - (k.KeyC || k.ControlLeft ? 1 : 0);
      this.vy += ((up * speed * 0.7) - this.vy) * a;
      this.feet.x += this.vel.x * dt; this.feet.z += this.vel.z * dt;
      this.feet.y = clamp(this.feet.y + this.vy * dt, terrainHeight(this.feet.x, this.feet.z) - 0.5, 24);
      // 灵体也飘不出围墙
      this.feet.x = clamp(this.feet.x, COMPOUND.x0 + 0.6, COMPOUND.x1 - 0.6); this.feet.z = clamp(this.feet.z, COMPOUND.z0 + 0.6, COMPOUND.z1 - 0.6);
      this.eyeY += (this.feet.y + EYE - this.eyeY) * Math.min(1, dt * 10);
      this.syncCamera();
      return;
    }

    const p = new THREE.Vector3(this.feet.x + this.vel.x * dt, 0, this.feet.z + this.vel.z * dt);
    this.collide(p, this.feet.y);
    // 太远就挡回来
    const lim = worldLimit(p.x, p.z);
    if (lim) { this.onLimit?.(lim); p.x = this.feet.x; p.z = this.feet.z; this.vel.multiplyScalar(0); }
    const g = this.groundAt(p.x, p.z, this.feet.y + STEP);
    if (g > this.feet.y + STEP) { p.x = this.feet.x; p.z = this.feet.z; }  // 太高，上不去
    this.feet.x = p.x; this.feet.z = p.z;
    const ground = this.groundAt(this.feet.x, this.feet.z, this.feet.y + STEP);
    if (this.feet.y > ground + 0.02) {
      this.vy -= 18 * dt;
      this.feet.y = Math.max(ground, this.feet.y + this.vy * dt);
      if (this.feet.y === ground) this.vy = 0;
    } else { this.feet.y = ground; this.vy = 0; }

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += moving * dt * 2.2;
    // 泡在温泉池里（池底或池里的台阶上）视线低到水面上一点；坐在池边视线是坐着的高度
    const sz = world.soakZone, f = this.feet;
    let eye = EYE;
    if (sz && f.x > sz.x0 && f.x < sz.x1 && f.z > sz.z0 && f.z < sz.z1 && f.y < sz.yMax) eye = 0.72;
    if (this.seated) eye = 0.85;
    const targetEye = this.feet.y + eye + Math.sin(this.bob * Math.PI) * 0.018 * Math.min(1, moving / 2);
    // 上台阶、坐下、泡进水里时视线平滑一点
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * (eye === EYE ? 14 : 5));
    this.syncCamera();
  }

  syncCamera() {
    this.camera.position.set(this.feet.x, this.eyeY, this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } }
