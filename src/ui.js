import * as THREE from 'three';
import { world, PICK_LAYER } from './core/build.js';
import { PRESETS } from './world/timeofday.js';

const $ = (s) => document.querySelector(s);
const TIME_KEYS = ['dawn', 'day', 'dusk', 'night'];

export class UI {
  constructor({ player, tod, camera, places, onEnter }) {
    Object.assign(this, { player, tod, camera, places });
    this.found = new Set(JSON.parse(safeGet('dorm.found') || '[]'));
    this.dialogOpen = false;
    this.menuOpen = false;
    this.hot = null;
    this.lastArea = null;
    this.ray = new THREE.Raycaster();
    this.ray.far = 3.2;
    this.ray.layers.enable(PICK_LAYER);
    this.pickRay = new THREE.Raycaster();
    this.pickRay.layers.enable(PICK_LAYER);
    this._hover = null;

    // 时间段按钮
    const mkChips = (el) => {
      el.innerHTML = '';
      TIME_KEYS.forEach((k, i) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.dataset.k = k;
        b.innerHTML = `${PRESETS[k].label}`;
        b.title = `${i + 1} · ${PRESETS[k].clock}`;
        b.onclick = (e) => { e.stopPropagation(); this.setTime(k); };
        el.appendChild(b);
      });
    };
    mkChips($('#titleTimes'));
    mkChips($('#timebar'));

    $('#enter').onclick = () => onEnter();
    $('#summonBtn').onclick = (e) => { e.currentTarget.blur(); this.summon(); };
    $('#dialog').onclick = () => this.closeDialog();
    $('#menu').onclick = (e) => { if (e.target.id === 'menu') this.toggleMenu(false); };

    addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.code === 'KeyE' || e.code === 'Enter') { if (this.dialogOpen) this.closeDialog(); else this.use(); }
      else if (e.code === 'Space' && this.dialogOpen) this.closeDialog();
      else if (e.code === 'Escape') { if (this.dialogOpen) this.closeDialog(); if (this.menuOpen) this.toggleMenu(false); }
      else if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); this.toggleMenu(); }
      else if (e.code === 'KeyG') this.summon();
      else if (e.code === 'KeyF') { this.player.ghost = !this.player.ghost; this.toast(this.player.ghost ? '灵体模式：飘起来了，可以穿墙（空格上升，C 下降）' : '回到地面'); this.updateStat(); }
      else if (/^Digit[1-4]$/.test(e.code)) this.setTime(TIME_KEYS[+e.code.slice(5) - 1]);
    });
    this.player.onLimit = (msg) => this.toast(msg);
  }

  // 召唤 / 送走藏经阁（只有主人能做到）
  summon() {
    const z = world.zang;
    if (!z || z.busy) return;
    z.toggle();
    this.toast(z.on ? '召唤——藏经阁从前庭的阵纹里升起来了' : '藏经阁慢慢沉回阵纹里，前庭又空了');
    const b = $('#summonBtn');
    b.classList.toggle('on', z.on);
    b.textContent = z.on ? '送走藏经阁' : '召唤藏经阁';
  }

  setTime(k) {
    this.tod.set(k);
    this.toast(`${PRESETS[k].label}　${PRESETS[k].clock}`);
  }

  start() {
    this.started = true;
    $('#title').style.opacity = 0;
    setTimeout(() => $('#title').classList.add('hidden'), 800);
    $('#hud').classList.remove('hidden');
    this.updateStat();
  }

  // 指针锁定的提示：锁上了提示怎么转头；没锁上（或环境不支持）提示怎么锁 / 用什么代替
  lockHint(locked) {
    const h = $('#lockhint');
    if (!h || !this.started) return;
    if (locked) {
      h.classList.remove('show');
      if (!this._lockedOnce) { this._lockedOnce = true; this.toast('手指在触控板上轻轻滑动就能转头（不用按下）。Esc 拿回鼠标，[ ] 调灵敏度', 4200); }
    } else {
      h.textContent = this.player.noLock ? '两指滑动转头 · 按住拖动也行' : '轻点画面：之后不用按，手指一滑就能转头';
      h.classList.add('show');
      clearTimeout(this._lh);
      if (this.player.noLock) this._lh = setTimeout(() => h.classList.remove('show'), 5000);
    }
  }

  ready() {
    $('#enter').disabled = false;
    $('#enter').textContent = '回宿舍';
    $('#loading').textContent = '';
  }
  progress(msg) { $('#loading').textContent = msg; }

  toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ———— 看向的东西 ————
  update() {
    if (!this.started) return;
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    // 射线检测不管物体是否可见，这里跳过被隐藏的（比如白天收起来的被褥）
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hit = this.ray.intersectObjects(world.pickables, false).find((h) => shown(h.object));
    let owner = hit?.object.userData.owner || null;
    if (this.dialogOpen || this.menuOpen) owner = null;
    if (owner !== this.hot) {
      this.hot = owner;
      $('#cross').classList.toggle('hot', !!owner);
      if (owner) {
        const info = owner.userData.info;
        const verb = info.verb || (info.text ? '看看' : '');
        $('#prompt').innerHTML = verb ? `<kbd>E</kbd>${verb} · ${info.name}` : info.name;
      } else $('#prompt').innerHTML = '';
    }
    // 区域名
    const p = this.player.feet;
    let best = null;
    for (const a of world.areas) {
      if (p.x >= a.x0 && p.x <= a.x1 && p.z >= a.z0 && p.z <= a.z1 && p.y >= a.y0 && p.y <= a.y1) {
        if (!best || a.prio > best.prio) best = a;
      }
    }
    const name = best?.name || '';
    if (name && name !== this.lastArea) {
      this.lastArea = name;
      const el = $('#place');
      el.querySelector('.big').textContent = name;
      el.classList.add('show');
      clearTimeout(this._pt);
      this._pt = setTimeout(() => el.classList.remove('show'), 3200);
    }
  }

  // 鼠标/触控板指针：悬停提示 + 点击
  // 鼠标移动很频繁：只记下位置，每帧最多处理一次
  queueHover(cx, cy) { this._hover = [cx, cy]; }
  flushHover() { if (this._hover) { const [x, y] = this._hover; this._hover = null; this.hoverAt(x, y); } }

  pick(cx, cy) {
    const r = this.pickRay;
    r.far = Infinity;
    r.setFromCamera({ x: (cx / innerWidth) * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, this.camera);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const items = r.intersectObjects(world.pickables, false).find((h) => shown(h.object) && h.distance < 6);
    return { r, item: items?.object.userData.owner || null };
  }

  hoverAt(cx, cy) {
    if (!this.started || this.dialogOpen || this.menuOpen) return;
    const tip = document.querySelector('#tip');
    const { item } = this.pick(cx, cy);
    if (item) {
      const info = item.userData.info;
      tip.textContent = (info.verb || (info.text ? '看看' : '')) + ' · ' + info.name;
      tip.style.left = cx + 16 + 'px'; tip.style.top = cy + 12 + 'px';
      tip.classList.add('show');
      document.body.style.cursor = 'pointer';
    } else { tip.classList.remove('show'); document.body.style.cursor = ''; }
  }

  clickAt(cx, cy) {
    const { r, item } = this.pick(cx, cy);
    if (item) { this.hot = item; this.use(); return; }
    // 点到地面（朝上的面）就走过去
    r.layers.disable(PICK_LAYER);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hits = r.intersectObjects(world.scene.children, true).filter((h) => h.face && !h.object.isPoints && !h.object.isSprite && shown(h.object));
    r.layers.enable(PICK_LAYER);
    const h = hits[0];
    if (!h || h.distance > 30) return;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.y > 0.6) { this.player.walkTo(h.point); this.marker?.(h.point); }
  }

  use() {
    const o = this.hot;
    if (!o) return;
    const info = o.userData.info;
    const r = info.use?.();
    if (typeof r === 'string') { this.showDialog(info.name, r); return; }
    const key = keyOf(info);
    if (info.text && info.kind !== 'door') {
      this.showDialog(info.speaker || info.name, info.text);
      this.markFound(key);
    } else if (info.text && info.kind === 'door' && !r) {
      // 门既能开关也有说明：第一次开时顺便读一下
      if (!this.found.has(key)) { this.markFound(key); this.showDialog(info.name, info.text); }
    }
  }

  showDialog(name, text) {
    this.dialogOpen = true;
    const d = $('#dialog');
    d.querySelector('.name').textContent = name;
    const el = d.querySelector('.text');
    d.classList.remove('hidden');
    // 逐字显示
    clearInterval(this._ti);
    let i = 0;
    const chars = [...text];
    el.textContent = '';
    this._full = text;
    this._ti = setInterval(() => {
      i += 2;
      el.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) clearInterval(this._ti);
    }, 28);
    this.hot = null;
    $('#prompt').innerHTML = '';
  }

  closeDialog() {
    const el = $('#dialog .text');
    if (el.textContent.length < [...this._full].length) { clearInterval(this._ti); el.textContent = this._full; return; }
    this.dialogOpen = false;
    $('#dialog').classList.add('hidden');
  }

  markFound(key) {
    if (this.found.has(key)) return;
    this.found.add(key);
    safeSet('dorm.found', JSON.stringify([...this.found]));
    this.updateStat();
  }

  // 清单里列出来的东西：有说明文字的（门除外）。物件清单里的东西按编号记，其他按名字记
  traceList() {
    const seen = new Map();
    for (const o of world.interactives) {
      const info = o.userData.info;
      if (!info.text || (info.kind === 'door' && !info.id) || info.trace === false) continue;
      const key = keyOf(info);
      if (!seen.has(key)) seen.set(key, info.name);
    }
    return [...seen].map(([key, name]) => ({ key, name }));
  }

  updateStat() {
    const all = this.traceList();
    const n = all.filter((x) => this.found.has(x.key)).length;
    const bad = world.itemErrors.length;
    $('#stat').innerHTML = `生活痕迹 ${n} / ${all.length}` + (bad ? `<br><span class="warn">⚠ ${bad} 件没摆上（M 看原因）</span>` : '') + (this.player.ghost ? '<br><span class="ghost">· 灵体模式 ·</span>' : '');
  }

  toggleMenu(force) {
    this.menuOpen = force ?? !this.menuOpen;
    const m = $('#menu');
    m.classList.toggle('hidden', !this.menuOpen);
    if (!this.menuOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const all = this.traceList();
    const errs = world.itemErrors;
    const panel = m.querySelector('.panel');
    panel.innerHTML = `<button class="close">关闭 ✕</button><h2>地点</h2><div class="hint">点一下就走过去</div><div class="grid"></div>
      <h2>生活痕迹</h2><div class="hint">走近看看、按 E 读一读。已经看过的会亮起来。</div><div class="traces"></div>
      ${errs.length ? '<h2 class="warn">没摆上的东西</h2><div class="hint">物件清单（data/items.json）里这几条有问题，已经跳过了</div><div class="errs"></div>' : ''}`;
    panel.querySelector('.close').onclick = () => this.toggleMenu(false);
    const grid = panel.querySelector('.grid');
    for (const p of this.places) {
      const b = document.createElement('button');
      b.innerHTML = `${p.name}<small>${p.sub || ''}</small>`;
      b.onclick = () => { this.player.ghost = false; this.player.teleport(p.x, p.y, p.z, p.yaw, p.pitch ?? -0.08); this.toggleMenu(false); this.updateStat(); };
      grid.appendChild(b);
    }
    panel.querySelector('.traces').innerHTML = all.map(({ key, name }) => `<div class="${this.found.has(key) ? '' : 'no'}">${this.found.has(key) ? '●' : '○'} ${esc(name)}</div>`).join('');
    if (errs.length) panel.querySelector('.errs').innerHTML = errs.map((e) => `<div>⚠ ${esc(e.label || e.id)}${e.label ? ` <small>${esc(e.id)}</small>` : ''}<br><small>${esc(e.reason)}</small></div>`).join('');
  }
}

const keyOf = (info) => info.id || info.name;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 无痕模式下存不了，没关系 */ } }
