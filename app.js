// ---------- しくみの全体図（立体）----------
// 建物にたとえる: 6つの層を下から積み（①土台 → ⑥窓口）、4本の柱（全部の層を貫く横断の関心ごと）が四隅を貫く。
// 見た目: 夜の展示台。光る台座の上に、すりガラスの層を積んだ塔。柱の頭に光の玉。名札は暗い半透明の札。
// 外の部品は使わない（CSS の 3D だけ）。データと画面の動きだけを持ち、押したときの行き先は呼ぶ側が決める。
// 辞書（1枚の HTML）と、あとで作る Web 版（GitHub Pages＋GAS）の両方でこのファイルをそのまま使う。
const Arch3D = (() => {
  'use strict';
  const W = 240, D = 240, T = 40, GAP = 56;              // 層の幅・奥行き・厚み・間隔（厚いガラスの板を少しずつ離して積む）
  const POST = 10, RISE = 64, ORB = 16;                  // 柱の太さ・塔の上への突き出し・頭の玉の大きさ
  const PED_R = 215, PED_GAP = 16, PED_H = 18;           // 台座の半径・塔との間・厚み
  const HOME = { ax: 66, az: 35, zoom: 1 };              // 最初の向き（やや上から）
  const SPIN = 0.006;                                    // 自動で回る速さ（度／ミリ秒 = 6度／秒）
  const STACK = 5 * GAP + T;
  const Z0 = -STACK / 2;                                 // 積み上げの中心を原点にそろえる
  const ZPED = Z0 - PED_GAP;                             // 台座の上面
  const ZTOP = Z0 + STACK + RISE;                        // 柱の頭
  const PERSP = 1800;                                    // 遠近の強さ（arch3d.css の perspective と同じ値）
  const CORNERS = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v);
    }
    e.append(...kids.filter(k => k != null));
    return e;
  }
  const sub = s => ((s || '').match(/（(.*)）/) || [])[1] || '';

  // 箱（上面＋四方の側面）。上面の高さ = 厚み
  function box(cls, w, d, t, color, kind, id, z, x, y) {
    const b = h('div', { class: cls, 'data-kind': kind, 'data-id': id,
      style: `left:${x}px;top:${y}px;width:${w}px;height:${d}px;--c:${color};transform:translateZ(${z}px)` });
    b.append(
      h('i', { class: 'f top', style: `transform:translateZ(${t}px)` }),
      h('i', { class: 'f s', style: `left:0;top:${d}px;width:${w}px;height:${t}px` }),
      h('i', { class: 'f n', style: `left:0;top:0;width:${w}px;height:${t}px` }),
      h('i', { class: 'f w', style: `left:0;top:0;width:${t}px;height:${d}px` }),
      h('i', { class: 'f e', style: `left:${w}px;top:0;width:${t}px;height:${d}px` }));
    return b;
  }
  // 台座: 円盤を数枚重ねて厚みに見せる（いちばん上だけ金属の面）
  function pedestal() {
    const discs = [];
    for (let k = 4; k >= 0; k--) {
      const z = ZPED - PED_H * k / 4;
      discs.push(h('i', { class: 'a3d-ped' + (k === 0 ? ' top' : ''), 'aria-hidden': 'true',
        style: `left:${-PED_R}px;top:${-PED_R}px;width:${PED_R * 2}px;height:${PED_R * 2}px;transform:translateZ(${z}px)` }));
    }
    return discs;
  }
  // 星（背景）。毎回同じ並びになるよう、決まった種から作る
  function stars() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dots = [];
    for (let i = 0; i < 110; i++) {
      const a = (0.25 + rnd() * 0.6).toFixed(2), big = rnd() < 0.12 ? 1 : 0;
      dots.push(`${Math.round(rnd() * 1800)}px ${Math.round(rnd() * 900)}px 0 ${big}px rgba(220,230,255,${a})`);
    }
    return h('i', { class: 'a3d-stars', 'aria-hidden': 'true', style: `box-shadow:${dots.join(',')}` });
  }

  function mount(host, arch, opt = {}) {
    const st = Object.assign({}, HOME, opt.view || {});
    const world = h('div', { class: 'a3d-world' }, ...pedestal());
    const labels = h('div', { class: 'a3d-labels' });
    const view = h('div', { class: 'a3d-view' }, world);
    const glow = h('i', { class: 'a3d-glow', 'aria-hidden': 'true' });
    const parts = [];   // { kind, id, el, lbl, z（名札の高さ）, orb }

    // 層: 配列の順（①が先頭）に下から積む
    arch.layers.forEach((L, i) => {
      const z = Z0 + i * GAP;
      const el = box('a3d-slab', W, D, T, L.color, 'layer', L.id, z, -W / 2, -D / 2);
      const lbl = h('button', { type: 'button', class: 'a3d-lbl slab', 'data-kind': 'layer', 'data-id': L.id, style: `--c:${L.color}`,
        'aria-label': `${L.long}の断面を開く` }, h('i', { class: 'dot' }), h('b', { text: `${L.no} ${L.name}` }), h('small', { text: sub(L.long) }));
      parts.push({ kind: 'layer', id: L.id, el, lbl, z: z + T / 2 });
      world.append(el); labels.append(lbl);
    });
    // 柱: 四隅に立て、台座から塔の上まで全部の層を貫く。頭に光の玉
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    arch.cross.forEach((C, i) => {
      const [sx, sy] = corners[i % 4];
      const cx = sx * (W / 2 - POST * 1.6), cy = sy * (D / 2 - POST * 1.6);
      const el = box('a3d-post', POST, POST, ZTOP - ZPED, C.color, 'cross', C.id, ZPED, cx - POST / 2, cy - POST / 2);
      const orb = h('i', { class: 'a3d-orb', style: `--c:${C.color}`, 'aria-hidden': 'true' });
      const lbl = h('button', { type: 'button', class: 'a3d-lbl post', 'data-kind': 'cross', 'data-id': C.id, style: `--c:${C.color}`,
        'aria-label': `${C.name}の柱を開く` }, h('b', { text: `${C.icon} ${C.name}` }));
      parts.push({ kind: 'cross', id: C.id, el, lbl, orb, x: cx, y: cy });
      world.append(el); labels.append(orb, lbl);
    });

    const spinBtn = h('button', { type: 'button', 'data-act': 'spin', title: '自動でゆっくり回す／止める', text: '⟳ 自動回転' });
    const tools = h('div', { class: 'a3d-tools' },
      spinBtn,
      h('button', { type: 'button', 'data-act': 'in', title: '大きく（＋キー）', 'aria-label': '大きく', text: '＋' }),
      h('button', { type: 'button', 'data-act': 'out', title: '小さく（－キー）', 'aria-label': '小さく', text: '－' }),
      h('button', { type: 'button', 'data-act': 'home', title: '元の向きに戻す（0キー）', text: '元の向き' }));
    const hint = h('div', { class: 'a3d-hint', text: 'ドラッグで回せます（矢印キーでも）。層や柱を押すと、その断面が開きます。' });
    const stage = h('div', { class: 'a3d', tabindex: '0', role: 'group', 'aria-label': 'しくみの全体図（立体）。矢印キーで回転、＋－で拡大縮小' },
      stars(), glow, view, labels, tools, hint);
    host.append(stage);

    // ---- 向きと名札の位置（名札は画面の平面に置くので、どの向きでも読める） ----
    // 大きさと原点は「横にどう回しても収まる」外枠で決める（外枠は回す角度によらないので、回しても図が揺れない）。
    // 原点（= 奥行きの中心）は、その外枠が枠の真ん中に来る点。縦の傾きを変えたときだけ、なめらかに置き直す。
    let fit = 1, raf = 0, lblW = 0, lblH = 0, postW = 0, slabH = 0, frame = [0, 0];
    // 倒せる角度: 真上に近いと層の名札どうしが、真横に近いと隣の柱の名札どうしが重なる。どちらの限度も図の大きさで変わる。
    // 真上側: 層の間（GAP×sin）が名札1枚分より広い角度まで。
    // 真横側: 隣の柱の頭は、画面で横に E·sinθ、縦に E·cosθ·cos(傾き) 離れる（θ は回す角度で変わる）。
    //   どの θ でも名札（幅 w・高さ h）が重ならない条件 (w/E)² + (h/(E·cos 傾き))² ≤ 1 から上限を出す
    const AX_LO = 38, AX_HI = 74;
    const deg = r => r * 180 / Math.PI;
    const axMin = () => { const need = (slabH + 2) / (GAP * fit * st.zoom); return need >= 1 ? AX_HI : Math.max(AX_LO, deg(Math.asin(need))); };
    const axMax = () => {
      const E = (W - POST * 3.2) * fit * st.zoom, a = (postW + 4) / E;
      if (a >= 1) return AX_LO;
      const c = (lblH + 2) / (E * Math.sqrt(1 - a * a));
      return c >= 1 ? AX_LO : Math.min(AX_HI, deg(Math.acos(c)));
    };
    // 両方を満たせないほど小さい図では、6枚ある層の名札を優先する
    const clampAx = v => { const lo = axMin(), hi = axMax(); return lo > hi ? lo : Math.max(lo, Math.min(hi, v)); };
    const rad = d => d * Math.PI / 180;
    function project(x, y, z, s, azDeg = st.az, axDeg = st.ax) {
      const az = rad(azDeg), ax = rad(axDeg);
      const x1 = x * Math.cos(az) - y * Math.sin(az);
      const y1 = x * Math.sin(az) + y * Math.cos(az);
      const y2 = y1 * Math.cos(ax) - z * Math.sin(ax);
      const z2 = y1 * Math.sin(ax) + z * Math.cos(ax);
      const f = PERSP / (PERSP - z2 * s);
      return [x1 * s * f, y2 * s * f];
    }
    // 層の名札の置き場所（原点からの距離）: 塔のいちばん左の x と、その層の中心の高さ。
    // どちらも回す角度に対してなめらかに動くので、回し続けても名札が跳ばない
    function slabAnchor(p, s, az = st.az) {
      let mx = Infinity;
      for (const [x, y] of CORNERS) mx = Math.min(mx, project(x, y, p.z, s, az)[0]);
      return [mx, project(0, 0, p.z, s, az)[1]];
    }
    // 横に一周回したときの外枠（原点からの距離）。層の名札は塔の左、柱の名札は柱の頭の上（中央ぞろえなので右へ半分はみ出す）
    function bounds(s) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      for (let k = 0; k < 24; k++) {   // 台座（円なので回しても同じ）
        const a = k * Math.PI / 12;
        for (const z of [ZPED, ZPED - PED_H]) { const q = project(PED_R * Math.cos(a), PED_R * Math.sin(a), z, s, 0); add(q[0], q[1]); }
      }
      let lx = Infinity;
      for (let az = 0; az < 360; az += 10) {
        for (const [x, y] of CORNERS) for (const z of [Z0, ZTOP]) { const q = project(x, y, z, s, az); add(q[0], q[1]); }
        for (const p of parts) if (p.kind === 'layer') lx = Math.min(lx, slabAnchor(p, s, az)[0]);
      }
      return [Math.min(x0, lx - 14 - lblW), x1 + postW / 2, y0 - 8 - ORB - lblH, y1];
    }
    const TOOLS_H = 40;   // 下の道具の分
    function measure() {
      const r = stage.getBoundingClientRect();
      if (!r.width) return false;
      frame = [r.width, r.height];
      for (const p of parts) { p.w = p.lbl.offsetWidth; p.h = p.lbl.offsetHeight; }
      lblW = Math.max(...parts.filter(p => p.kind === 'layer').map(p => p.w));
      slabH = Math.max(...parts.filter(p => p.kind === 'layer').map(p => p.h));
      lblH = Math.max(...parts.filter(p => p.kind === 'cross').map(p => p.h));
      postW = Math.max(...parts.filter(p => p.kind === 'cross').map(p => p.w));
      // 大きさ: 名札は縮まないので、外枠が枠に収まるいちばん大きい倍率を二分法で探す
      const availW = r.width - 32, availH = r.height - 24 - TOOLS_H;
      let lo = 0.3, hi = 1.2;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2, [x0, x1, y0, y1] = bounds(mid);
        if (x1 - x0 <= availW && y1 - y0 <= availH) lo = mid; else hi = mid;
      }
      fit = lo;
      return true;
    }
    function draw() {
      raf = 0;
      const s = fit * st.zoom;
      const [x0, x1, y0, y1] = bounds(s);
      const org = [frame[0] / 2 - (x0 + x1) / 2, (frame[1] - TOOLS_H) / 2 - (y0 + y1) / 2];
      world.style.transform = `scale(${s}) rotateX(${st.ax}deg) rotateZ(${st.az}deg)`;
      stage.classList.add('ready');   // 1回目を描くまでは隠す（向きを付ける前の真上からの姿を見せない）
      world.style.left = org[0] + 'px';
      world.style.top = org[1] + 'px';
      view.style.perspectiveOrigin = `${org[0]}px ${org[1]}px`;   // 原点と奥行きの中心を同じ点にする（名札の計算と一致させる）
      // 塔のうしろの淡い光（塔の中ほどに置く）
      const gc = project(0, 0, Z0 + STACK / 2, s);
      glow.style.left = org[0] + gc[0] + 'px';
      glow.style.top = org[1] + gc[1] + 'px';
      glow.style.width = glow.style.height = Math.round(PED_R * 2.6 * s) + 'px';
      // 層の名札: 塔の左、その層の中心の高さ
      const boxes = [];
      for (const p of parts) {
        if (p.kind !== 'layer') continue;
        const [ax, ay] = slabAnchor(p, s);
        p.at = [org[0] + ax, org[1] + ay];
        p.lbl.style.left = p.at[0] + 'px';
        p.lbl.style.top = p.at[1] + 'px';
        boxes.push([p.at[0] - 14 - p.w, p.at[0] - 14, p.at[1] - p.h / 2, p.at[1] + p.h / 2]);
      }
      // 柱: 頭に玉、その上に名札。層の名札にかぶる向きのときだけ、層の名札の列の右へよける
      const colRight = Math.max(...boxes.map(b => b[1]));
      for (const p of parts) {
        if (p.kind !== 'cross') continue;
        const [ax, ay] = project(p.x, p.y, ZTOP, s);
        p.at = [org[0] + ax, org[1] + ay];
        p.orb.style.left = p.at[0] + 'px';
        p.orb.style.top = p.at[1] + 'px';
        p.lbl.style.left = p.at[0] + 'px';
        p.lbl.style.top = p.at[1] + 'px';
        let dx = -p.w / 2;
        const lift = ORB / 2 + 8;
        const lx0 = p.at[0] + dx, ly0 = p.at[1] - lift - p.h, ly1 = p.at[1] - lift;
        if (boxes.some(b => lx0 < b[1] + 4 && b[0] < lx0 + p.w && ly0 < b[3] && b[2] < ly1)) dx = colRight + 6 - p.at[0];
        p.lbl.style.transform = `translate(${dx}px, calc(-100% - ${lift}px))`;
      }
    }
    const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
    function refit() { if (measure()) { st.ax = clampAx(st.ax); redraw(); startSpin(); } }
    const ro = new ResizeObserver(refit);
    ro.observe(stage);

    // ---- 自動回転: ゆっくり回して立体だと分かるようにする。触っている間は止め、離れて少したつと戻る ----
    // 自分で回した・キーで回したときは止めたままにする（見たい向きを奪わない）。動きを減らす設定の人には最初から止める
    let spin = opt.spin !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let paused = false, lastT = 0, spinRaf = 0, resumeTimer = 0;
    function tick(t) {
      spinRaf = 0;
      if (!spin || !stage.isConnected || !stage.offsetWidth) { lastT = 0; return; }
      if (!paused && !drag && lastT) { st.az += Math.min(t - lastT, 50) * SPIN; draw(); }
      lastT = t;
      spinRaf = requestAnimationFrame(tick);
    }
    function startSpin() { if (spin && !spinRaf) { lastT = 0; spinRaf = requestAnimationFrame(tick); } }
    function setSpin(on) {
      spin = on;
      spinBtn.classList.toggle('on', on);
      spinBtn.setAttribute('aria-pressed', String(on));
      if (on) startSpin();
    }
    setSpin(spin);
    const pause = () => { clearTimeout(resumeTimer); paused = true; };
    const resumeLater = () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, 2500); };

    // ---- 触ったときの動き ----
    let focusKey = null;
    function focus(kind, id) {
      const key = kind && id ? kind + ':' + id : null;
      if (key === focusKey) return;
      focusKey = key;
      stage.classList.toggle('has-focus', !!key);
      for (const p of parts) {
        const on = key === p.kind + ':' + p.id;
        p.el.classList.toggle('hot', on);
        p.lbl.classList.toggle('hot', on);
        if (p.orb) p.orb.classList.toggle('hot', on);
      }
      // 外（右の一覧など）から注目させたときも、回転を止めて読めるようにする
      if (key) pause(); else resumeLater();
    }
    const partOf = t => { const e = t && t.closest && t.closest('[data-kind][data-id]'); return e && stage.contains(e) ? [e.dataset.kind, e.dataset.id] : null; };

    let drag = null, moved = false, dragEndAt = -1e9;
    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.a3d-tools')) return;
      drag = { x: e.clientX, y: e.clientY, ax: st.ax, az: st.az, id: e.pointerId };
      moved = false;
    });
    const onMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { moved = true; setSpin(false); stage.classList.add('dragging'); try { stage.setPointerCapture(drag.id); } catch (_) { /* 取れなくても回せる */ } }
      st.az = drag.az + dx * 0.4;
      st.ax = clampAx(drag.ax - dy * 0.3);
      redraw();
    };
    const onUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (moved) dragEndAt = performance.now();
      drag = null;
      moved = false;
      stage.classList.remove('dragging');
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);

    stage.addEventListener('click', e => {
      if (performance.now() - dragEndAt < 300) return;   // 回した直後の指離れは「押した」にしない
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'spin') setSpin(!spin); else if (a === 'home') reset(); else zoomBy(a === 'in' ? 1.15 : 1 / 1.15);
        return;
      }
      const p = partOf(e.target);
      if (p && opt.onOpen) opt.onOpen(p[0], p[1]);
    });
    stage.addEventListener('pointerenter', pause);
    stage.addEventListener('pointerover', e => {
      if (moved) return;
      const p = partOf(e.target);
      if (p) { focus(p[0], p[1]); if (opt.onHover) opt.onHover(p[0], p[1]); }
    });
    stage.addEventListener('pointerleave', () => { if (!drag) { focus(null); if (opt.onHover) opt.onHover(null); } resumeLater(); });
    stage.addEventListener('focusin', e => { pause(); const p = partOf(e.target); if (p) { focus(p[0], p[1]); if (opt.onHover) opt.onHover(p[0], p[1]); } });
    stage.addEventListener('focusout', resumeLater);
    stage.addEventListener('keydown', e => {
      if (e.target !== stage) return;
      const k = e.key;
      if (k === 'ArrowLeft') st.az -= 8; else if (k === 'ArrowRight') st.az += 8;
      else if (k === 'ArrowUp') st.ax = clampAx(st.ax - 6); else if (k === 'ArrowDown') st.ax = clampAx(st.ax + 6);
      else if (k === '+' || k === ';') { zoomBy(1.15); } else if (k === '-') { zoomBy(1 / 1.15); } else if (k === '0') { reset(); }
      else return;
      if (k.startsWith('Arrow')) setSpin(false);
      e.preventDefault();
      redraw();
    });
    // トラックパッドのつまみ（ctrl＋ホイール）でも拡大。ふつうのホイールはページを流すので奪わない
    stage.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });

    function zoomBy(f) { st.zoom = Math.max(0.6, Math.min(2.2, st.zoom * f)); refit(); }
    function reset() { Object.assign(st, HOME); refit(); }
    function destroy() {
      spin = false;
      clearTimeout(resumeTimer);
      ro.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      if (spinRaf) cancelAnimationFrame(spinRaf);
      stage.remove();
    }
    refit();
    return { focus, reset, zoomBy, destroy, refit, setSpin };
  }
  return { mount };
})();

// ---------- ZIP を作る（外の部品を使わない最小のもの。圧縮なし＝store） ----------
// AI 用ナレッジパックを1つのファイルで受け取れるようにするため。ファイル名は UTF-8（日本語名をそのまま使う）。
// files: [{ name: 'フォルダ/名前.md', text: '中身' }] → Blob（application/zip）
const ShikumiZip = (() => {
  'use strict';
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }
  function make(files, when) {
    const enc = new TextEncoder();
    const { time, date } = dosTime(when || new Date());
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data), size = data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);   // ローカルの見出し
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);       // ファイル名は UTF-8
      lh.setUint16(8, 0, true);            // 圧縮なし
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);   // 目録の見出し
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);    // 目録の終わり
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }
  return { make, crc32 };
})();

// 辞書の本体。中身（DATA）と、どこで動いているか（ENV）を受け取って画面を作る。
//   1枚版（開発の確かめ用・配らない）: 同じファイルに入れた中身で始める（offline_boot.js）
//   Web 版: 会社のアカウントのログインを GAS が確かめてから届けた中身で始める（web.js）
function startDictionary(DATA, ENV) {
'use strict';
ENV = ENV || { mode: 'offline' };
const WEB = ENV.mode === 'web';
const META = DATA.meta;
const ITEMS = DATA.items;
const VIEWPOINTS = DATA.viewpoints;
const LEGEND = DATA.legend;
const byId = new Map(ITEMS.map(x => [x.id, x]));
const KIND_LABEL = { term: '用語', wisdom: '知恵', system: 'システム診断', arch: '全体図', guide: '利用ガイド' };
const ARCH = DATA.arch;
const LAYER_BY_ID = new Map(ARCH.layers.map(x => [x.id, x]));
const CROSS_BY_ID = new Map(ARCH.cross.map(x => [x.id, x]));
// 用語の置き場（層・横串・全体）の表示名と行き先
function placeInfo(place) {
  if (LAYER_BY_ID.has(place)) { const L = LAYER_BY_ID.get(place); return { label: `${L.no} ${L.long}`, hash: `#/arch/layer/${L.id}`, color: L.color }; }
  if (CROSS_BY_ID.has(place)) { const C = CROSS_BY_ID.get(place); return { label: `${C.icon} ${C.name}の柱`, hash: `#/arch/cross/${C.id}`, color: C.color }; }
  return { label: 'しくみ全体', hash: '#/arch', color: '#8a93a0' };
}
const LAYERS_TOP = [...ARCH.layers].reverse();   // 画面では建物と同じく上ほど人に近い（⑥窓口 → ①土台）
const WISDOM_PLACES = new Map();
for (const x of [...ARCH.layers, ...ARCH.cross]) for (const w of x.wisdom) WISDOM_PLACES.set(w, [...(WISDOM_PLACES.get(w) || []), x.id]);
// システムの呼び名 → 項目。括弧の外の名前・括弧の中の正式な呼び方・別名（短すぎる・一般的すぎるものは除く）。長い順に当てる
// ふつうの言葉としても使う別名（自動リンクにしない）。社内の言葉なので台本に書かず、中身から受け取る
const SYS_GENERIC = new Set(DATA.sysGeneric || []);
const SYS_NAMES = ITEMS.filter(x => x.kind === 'system').flatMap(s => {
  const short = s.name.replace(/（.*?）/g, '').trim();
  const inner = (s.name.match(/（(.*?)）/) || [])[1] || '';
  return [short, inner, ...(s.aliases || [])]
    .filter(n => n && n.length >= 3 && !/^[a-z0-9-]+$/.test(n) && !/v\d/.test(n) && !SYS_GENERIC.has(n))
    .map(n => [n, s.id]);
}).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i).sort((a, b) => b[0].length - a[0].length);
const SYS_RE = SYS_NAMES.length ? new RegExp(SYS_NAMES.map(x => x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
const SYS_BY_NAME = new Map(SYS_NAMES);
// 文の中のほかのシステム名を、そのシステムの項目へのリンクにする。vp を渡すと、カーソルを合わせたときに同じ観点の判断を出す
function withSysLinks(text, selfId, vp) {
  const frag = document.createDocumentFragment();
  if (!SYS_RE || !text) { frag.append(text || ''); return frag; }
  let last = 0, m;
  SYS_RE.lastIndex = 0;
  while ((m = SYS_RE.exec(text))) {
    const id = SYS_BY_NAME.get(m[0]);
    if (!id || id === selfId) continue;
    frag.append(text.slice(last, m.index));
    frag.append(link(itemHash(id), { class: 'sysref', 'data-id': id, 'data-vp': vp || null, text: m[0] }));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}
// 「◯◯と同じ判断」のように、ほかのシステムの判断を指しているひとことには、その判断の中身を添える（表のカーソル表示用）
function resolveNote(note, selfId, vp) {
  if (!note || !SYS_RE) return note || '';
  const refs = [];
  SYS_RE.lastIndex = 0;
  let m;
  while ((m = SYS_RE.exec(note))) {
    const id = SYS_BY_NAME.get(m[0]), s = id && id !== selfId && byId.get(id);
    const c = s && s.checks && s.checks[vp];
    if (c && !refs.some(r => r.startsWith(m[0]))) refs.push(`${m[0]}の判断：${c[0]}${c[1] ? '／' + c[1] : ''}`);
  }
  return refs.length ? `${note}\n→ ${refs.join('\n→ ')}` : note;
}
const STAGES = DATA.stages;
const LAYERS = DATA.layers || {};   // 社員が直接使わない「裏方」は、使うシステムと段を分ける
const LAYER_SHORT = { '裏方': '共通の裏方' };
const ST_SHORT = { '対策済': '✔ 済', '受け入れ': '◐ 受入', '対応中': '▲ 対応中', '判断待ち': '◇ 判断待ち', '未確認': '？ 未確認', '対象外': '—' };

const $ = sel => document.querySelector(sel);
const view = $('#view');
const qInput = $('#q');

// ---------- 小さな DOM 部品（データは必ず textContent で入れる） ----------
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}
const link = (hash, attrs, ...children) => el('a', Object.assign({ href: hash }, attrs), ...children);
const itemHash = id => '#/item/' + encodeURIComponent(id);
const hashOf = it => it.route || itemHash(it.id);   // 全体図の項目は専用の画面へ

// ---------- 検索用の正規化（全角半角・大小・カタカナ→ひらがな・記号を吸収） ----------
function norm(s) {
  return (s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　・,，、。.:：;；!！?？「」『』()（）\[\]【】〔〕\-_\/／~〜"'`→←]+/g, '');
}
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// 本文の文字は読み込み時に一度だけ取り出す（template は中身を実行も読み込みもしない）
const scratch = document.createElement('template');
for (const it of ITEMS) {
  let text = '';
  if (it.body_html) { scratch.innerHTML = it.body_html; text = scratch.content.textContent; }
  it._n = {
    name: norm(it.name),
    alt: [it.yomi, ...(it.aliases || [])].filter(Boolean).map(norm),
    trouble: (it.trouble || []).map(norm),
    tags: (it.tags || []).map(norm),
    one: norm(it.oneline),
    body: norm(text) + norm(it.structure || '') + norm(it.extra || ''),
  };
}

function search(q) {
  const words = q.split(/[\s　]+/).map(norm).filter(Boolean);
  if (!words.length) return { hits: [], near: [] };
  const hits = [];
  for (const it of ITEMS) {
    let total = 0, why = null, ok = true;
    for (const w of words) {
      const n = it._n;
      let s = 0;
      if (n.name === w) s = 100;
      else if (n.name.startsWith(w)) s = 70;
      else if (n.name.includes(w)) s = 60;
      if (n.alt.some(a => a === w)) s = Math.max(s, 85);
      else if (n.alt.some(a => a.includes(w))) s = Math.max(s, 50);
      const ti = n.trouble.findIndex(a => a.includes(w));
      if (ti >= 0) { s = Math.max(s, 45); if (!why) why = it.trouble[ti]; }
      if (!s && n.tags.includes(w)) s = 30;
      if (!s && n.one.includes(w)) s = 20;
      if (!s && n.body.includes(w)) s = 6;
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) hits.push({ it, score: total + (it.curated ? 4 : 0), why });
  }
  hits.sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name, 'ja'));

  // 見つからない・少ない・本文にしか当たらないときは「近い項目」を出す（誤字・言い回し違いの受け皿）
  let near = [];
  const joined = words.join('');
  const weak = !hits.length || hits[0].score < 40 * words.length;
  if ((hits.length < 5 || weak) && joined.length >= 2) {
    const qb = bigrams(joined);
    const hitIds = new Set(hits.map(h => h.it.id));
    const overlap = f => { const fb = bigrams(f); let c = 0; for (const b of qb) if (fb.has(b)) c++; return [c, fb.size]; };
    for (const it of ITEMS) {
      if (hitIds.has(it.id)) continue;
      let best = 0, why = null;
      // 名前・別名は長さの違いも見る（Dice 係数）。長い説明文は偶然の一致が多いので使わない
      for (const f of [it._n.name, ...it._n.alt]) {
        if (!f || f.length < 2) continue;
        const [c, n] = overlap(f);
        best = Math.max(best, (2 * c) / (qb.size + n));
      }
      // 困りごとは文なので「入れた言葉のどれだけを含むか」で見る（少し割り引く）
      it._n.trouble.forEach((f, i) => {
        const [c] = overlap(f);
        const r = (c / qb.size) * 0.85;
        if (r > best) { best = r; why = it.trouble[i]; }
      });
      if (best >= 0.45) near.push({ it, score: best, why });
    }
    near.sort((a, b) => b.score - a.score);
    near = near.slice(0, 8);
  }
  return { hits, near, weak };
}

// 検索語の強調（表示用。元の文字のまま大小を無視して探す）
function highlight(text, q) {
  const frag = document.createDocumentFragment();
  const words = q.split(/[\s　]+/).filter(w => w.length >= 1);
  if (!words.length || !text) { frag.append(text || ''); return frag; }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(words.map(esc).sort((a, b) => b.length - a.length).join('|'), 'gi');
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(el('mark', { text: m[0] }));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  frag.append(text.slice(last));
  return frag;
}

// ---------- 用語のホバー ----------
const TERM_LIST = ITEMS.filter(x => x.kind === 'term')
  .flatMap(t => [t.name, ...(t.aliases || [])].filter(n => n && n.length >= 2).map(n => ({ n, id: t.id })))
  .sort((a, b) => b.n.length - a.n.length);
const TERM_RE = new RegExp(TERM_LIST.map(t => {
  const e = t.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 英字は英字の途中で、カタカナはカタカナの途中で当てない（GitHub の Git、ログイン の ログ を拾わない）
  if (/^[\x00-\x7f]+$/.test(t.n)) return `(?<![A-Za-z0-9])${e}(?![A-Za-z0-9])`;
  if (/^[゠-ヿー]+$/.test(t.n)) return `(?<![゠-ヿー])${e}(?![゠-ヿー])`;
  return e;
}).join('|'), 'g');
const TERM_BY_NAME = new Map(TERM_LIST.map(t => [t.n, t.id]));

function markTerms(root, selfId) {
  const used = new Set([selfId]);
  let budget = 40;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('a,code,pre,h1,h2,h3,.term,mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (budget <= 0) break;
    const text = node.nodeValue;
    TERM_RE.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = TERM_RE.exec(text)) && budget > 0) {
      const id = TERM_BY_NAME.get(m[0]);
      if (!id || used.has(id)) continue;
      used.add(id); budget--;
      frag = frag || document.createDocumentFragment();
      frag.append(text.slice(last, m.index));
      frag.append(el('span', { class: 'term', 'data-id': id, tabindex: '0', text: m[0] }));
      last = m.index + m[0].length;
    }
    if (frag) { frag.append(text.slice(last)); node.replaceWith(frag); }
  }
}

const tip = $('#tip');
function showTip(target) {
  const it = byId.get(target.dataset.id);
  if (!it) return;
  let body = [el('div', { text: it.oneline })];
  const vp = target.classList.contains('sysref') && target.dataset.vp;
  if (vp) {   // 診断の「◯◯と同じ判断」: 指している先の、同じ観点の判断をその場で見せる
    const v = VIEWPOINTS.find(x => x.id === vp), c = it.checks && it.checks[vp];
    body = c ? [el('div', { class: 'tip-sub', text: `観点「${v ? v.name : vp}」の判断` }), el('div', null, stChip(c[0]), ' ', c[1] || '（ひとことなし）')]
      : [el('div', { text: `観点「${v ? v.name : vp}」はまだ診断していません。` })];
  }
  tip.replaceChildren(el('b', { text: it.name }), ...body, el('div', { class: 'go', text: 'クリックで項目を開く' }));
  tip.style.display = 'block';
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight, pad = 12;
  let left = r.left;
  if (left + w > innerWidth - pad) left = Math.max(pad, innerWidth - pad - w);   // はみ出すかどうかで決める
  let top = r.bottom + 6;
  if (top + h > innerHeight - pad) top = Math.max(pad, r.top - h - 6);
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
document.addEventListener('mouseover', e => { const t = e.target.closest('.term, .sysref'); if (t) showTip(t); });
document.addEventListener('mouseout', e => { if (e.target.closest('.term, .sysref')) tip.style.display = 'none'; });
document.addEventListener('focusin', e => { const t = e.target.closest('.term, .sysref'); if (t) showTip(t); });
document.addEventListener('focusout', () => { tip.style.display = 'none'; });
document.addEventListener('click', e => {
  const t = e.target.closest('.term');
  if (t) { tip.style.display = 'none'; go(itemHash(t.dataset.id)); }
});

// ---------- 画面の行き来（飛んだら戻れる） ----------
const stack = [];
let currentHash = null, suppressPush = false;
const backBtn = $('#back');
// 戻ったときは、前に見ていた位置（押した用語のすぐ近く）まで戻す。新しく開いたときだけ上から見せる（2026-09-18 PO）
//   新しく開く = リンク・用語・行を押した／go() を呼んだ。それ以外の画面の切り替え（戻るボタン・ブラウザの戻る/進む）は戻る扱い
const scrollMemo = new Map();   // 画面（#/…）ごとに、離れたときの縦の位置
let newNavAt = -1e9;
try { history.scrollRestoration = 'manual'; } catch (_) { /* 古いブラウザは無視 */ }
document.addEventListener('click', e => { if (e.target.closest('a[href^="#/"]')) newNavAt = performance.now(); }, true);
function go(hash) { newNavAt = performance.now(); if (location.hash === hash) render(); else location.hash = hash; }
backBtn.addEventListener('click', () => {
  if (!stack.length) return;
  suppressPush = true;
  location.hash = stack.pop();
});
addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (currentHash) scrollMemo.set(currentHash, scrollY);
  const isNew = performance.now() - newNavAt < 1000;
  newNavAt = -1e9;
  if (!suppressPush && currentHash && currentHash !== h) stack.push(currentHash);
  suppressPush = false;
  currentHash = h;
  render(false, isNew ? 0 : (scrollMemo.get(h) || 0));
});

// 検索欄: 打つたびに結果を出す。履歴は汚さない（検索を始めた画面にだけ戻れるようにする）
let typingTimer = 0;
qInput.addEventListener('input', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    const q = qInput.value.trim();
    const h = q ? '#/q/' + encodeURIComponent(q) : '#/';
    if (!(currentHash || '').startsWith('#/q/') && q) stack.push(currentHash || '#/');
    history.replaceState(null, '', h);
    currentHash = h;
    render(true);
  }, 120);
});
qInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { qInput.value = ''; qInput.dispatchEvent(new Event('input')); }
  if (e.key === 'Enter') { const first = view.querySelector('a.row'); if (first) first.click(); }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== qInput && !e.ctrlKey && !e.metaKey) { e.preventDefault(); qInput.focus(); qInput.select(); }
});

// ---------- サイドの案内 ----------
const counts = { term: 0, wisdom: 0, system: 0, arch: 0, guide: 0 };
for (const it of ITEMS) counts[it.kind]++;
function renderNav(route) {
  const nav = $('#nav');
  const a = (hash, label, n, key, soon) => link(hash, { class: [route === key ? 'on' : '', soon ? 'soon' : ''].join(' ') }, el('span', { text: label }), n != null ? el('span', { class: 'n', text: n }) : null);
  nav.replaceChildren(
    a('#/', '全体マップ', null, 'home'),
    a('#/arch', 'しくみの全体図', '6層・4柱', 'arch'),
    ...(DATA.sysmap ? [a('#/sysmap', 'システム地図', '別ページ', 'sysmap')] : []),
    el('div', { class: 'sep' }),
    a('#/systems', 'システム別の診断', counts.system, 'systems'),
    a('#/wisdom', '知恵（困ったとき）', counts.wisdom, 'wisdom'),
    a('#/term', '用語', counts.term, 'term'),
    el('div', { class: 'sep' }),
    a('#/path', '学ぶ順路', '準備中', 'path', true),
    a('#/ai', 'AIエージェントの準備', DATA.ai_pack ? `V${DATA.ai_pack.version}` : null, 'ai'),
    a('#/guide', 'AIエージェント利用ガイド', DATA.guide ? `全${DATA.guide.chapters.length}章` : '準備中', 'guide', !DATA.guide),
    el('div', { class: 'sep' }),
    a('#/about', 'この辞書について', null, 'about'),
  );
  backBtn.style.display = stack.length ? 'block' : 'none';
}
$('#ver').textContent = `V${META.version}（${META.generated} 作成）`;
// Web 版: 誰で入っているかを常に見せる（違うアカウントで入ったと気づけるように）。ログアウトも同じ場所に置く
if (WEB && ENV.user) {
  const acct = $('#acct');
  acct.hidden = false;
  acct.replaceChildren(el('div', { class: 'who', text: 'ログイン中' }), el('div', { class: 'mail', text: ENV.user }),
    el('button', { type: 'button', class: 'logout', onclick: () => ENV.logout && ENV.logout(), text: 'ログアウト' }));
}

// ---------- 各画面 ----------
function badge(kind) { return el('span', { class: 'badge ' + kind, text: KIND_LABEL[kind] }); }

function rowFor(it, q, why) {
  return link(hashOf(it), { class: 'row' },
    el('div', null,
      el('span', { class: 't' }, q ? highlight(it.name, q) : it.name),
      badge(it.kind), ' ',
      it.stage ? el('span', { class: 'stage ' + it.stage, text: it.stage }) : null,
      it.kind === 'wisdom' && !it.curated ? el('span', { class: 'badge', text: '言い換え前' }) : null),
    el('div', { class: 'o' }, q ? highlight(it.oneline, q) : it.oneline),
    why ? el('div', { class: 'why' }, 'こんなとき：', q ? highlight(why, q) : why) : null);
}

// ---------- 全体マップ（最初の画面） ----------
const MAP = DATA.map;
const GROUPS = MAP.wisdom_groups;
// 分野の中は「言い換え済み」→「原本が新しい順」（いま動いている話が先に来る）
const groupItems = gid => ITEMS.filter(x => x.kind === 'wisdom' && x.group === gid)
  .sort((a, b) => (b.curated - a.curated) || (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name, 'ja'));

function viewMap() {
  const sh = MAP.shelves;
  const systems = ITEMS.filter(x => x.kind === 'system');
  const curatedN = ITEMS.filter(x => x.kind === 'wisdom' && x.curated).length;

  const shelfHead = (kind, hash) => link(hash, { class: 'sh-head' },
    el('span', { class: 'sh-icon', text: sh[kind].icon }),
    el('span', { class: 'sh-title', text: sh[kind].title }),
    el('span', { class: 'sh-count', text: counts[kind] }));

  // 棚1: システム別の診断（段階ごとの名前＋守りの状態の内訳）
  const tally = {};
  for (const s of systems) for (const c of Object.values(s.checks)) tally[c[0]] = (tally[c[0]] || 0) + 1;
  const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
  const bar = el('a', { class: 'st-bar', href: '#/systems', title: '守りの状態の内訳（表で見る）' },
    Object.keys(LEGEND).filter(k => tally[k]).map(k => el('span', { class: 'seg ' + k, style: `flex:${tally[k]}`, title: `${k} ${tally[k]}件` })));
  const shelfSystem = el('section', { class: 'shelf k-system', 'aria-label': sh.system.title },
    shelfHead('system', '#/systems'),
    el('p', { class: 'sh-desc', text: sh.system.desc }),
    ...STAGES.map(stage => {
      const rows = systems.filter(s => !s.layer && s.stage === stage);
      if (!rows.length) return null;
      return el('div', { class: 'stage-row' },
        el('div', null, el('span', { class: 'stage ' + stage, text: stage }), el('span', { class: 'sub small', text: ` ${rows.length}` })),
        el('div', { class: 'names' }, rows.map(s => link(itemHash(s.id), { class: 'name', text: s.name.replace(/（.*?）/, '') }))));
    }),
    ...Object.keys(LAYERS).map(layer => {
      const rows = systems.filter(s => s.layer === layer);
      if (!rows.length) return null;
      return el('div', { class: 'stage-row layer-row' },
        el('div', null, el('span', { class: 'stage 裏方', text: LAYER_SHORT[layer] || layer }), el('span', { class: 'sub small', text: ' 画面に出す数字を作る' })),
        el('div', { class: 'names' }, rows.map(s => link(itemHash(s.id), { class: 'name', text: s.name }))));
    }),
    el('div', { class: 'sh-sub', text: '守りの状態（観点ごとの件数）' }),
    bar,
    el('div', { class: 'st-legend' }, Object.keys(LEGEND).filter(k => tally[k]).map(k => el('span', null, stChip(k), ` ${tally[k]}`))),
    link('#/systems', { class: 'sh-more', text: '表で見る →' }));

  // 棚2: 知恵（分野ごとの箱）
  const tile = g => {
    const list = groupItems(g.id);
    return el('div', { class: 'wtile g-' + g.id },
      link('#/wisdom/' + g.id, { class: 'wt-head' }, el('span', { class: 'wt-icon', text: g.icon }), el('span', { class: 'wt-label', text: g.label }), el('span', { class: 'wt-count', text: list.length })),
      el('p', { class: 'wt-desc', text: g.desc }),
      el('ul', { class: 'wt-items' }, list.slice(0, 2).map(it => el('li', null, link(itemHash(it.id), { text: it.name })))),
      link('#/wisdom/' + g.id, { class: 'wt-more', text: `すべて見る（${list.length}）→` }));
  };
  const byGid = Object.fromEntries(GROUPS.map(g => [g.id, g]));
  const shelfWisdom = el('section', { class: 'shelf k-wisdom', 'aria-label': sh.wisdom.title },
    shelfHead('wisdom', '#/wisdom'),
    el('p', { class: 'sh-desc' }, sh.wisdom.desc, el('span', { class: 'sub small', text: `（人向けに言い換え済み ${curatedN}）` })),
    el('div', { class: 'wgrid' },
      ['make', 'run', 'protect'].map(id => byGid[id] && tile(byGid[id])),
      byGid.records && el('div', { class: 'span1' }, tile(byGid.records)),
      byGid.ai && el('div', { class: 'span2' }, tile(byGid.ai)),
      byGid.charter && el('div', { class: 'span3 base' }, tile(byGid.charter))));

  // 棚3: 用語
  const termByName = new Map(ITEMS.filter(x => x.kind === 'term').map(t => [t.name, t]));
  const shelfTerm = el('section', { class: 'shelf k-term', 'aria-label': sh.term.title },
    shelfHead('term', '#/term'),
    el('p', { class: 'sh-desc', text: sh.term.desc }),
    el('div', { class: 'term-chips' }, MAP.featured_terms.map(n => termByName.get(n)).filter(Boolean)
      .map(t => link(itemHash(t.id), { class: 'tchip', title: t.oneline, text: t.name }))),
    el('p', { class: 'sub small', text: '本文の点線の言葉にカーソルを合わせても、同じ説明が出ます。' }),
    link('#/term', { class: 'sh-more', text: 'すべての用語を見る →' }));

  // つなぎ線（広い画面は線と矢印、狭い画面は「↓ 言葉」だけ）
  const hlink = (area, text) => el('div', { class: 'm-link ' + area, style: `grid-area:${area}` }, el('span', { class: 'lbl', text }), el('span', { class: 'arr' }));
  const bus = (area, cls) => el('div', { class: 'm-bus ' + cls, style: `grid-area:${area}`, 'aria-hidden': 'true' }, el('i', { class: 'h' }), el('i', { class: 'v' }));

  const searchBox = el('button', { type: 'button', class: 'm-search', style: 'grid-area:search', onclick: () => { qInput.focus(); qInput.select(); } },
    el('span', { class: 'ms-icon', text: '🔍' }),
    el('span', null, el('b', { text: MAP.search.title }), el('span', { class: 'ms-desc', text: MAP.search.desc })),
    el('span', { class: 'ms-key', text: '/ キーでも開く' }));

  const future = el('section', { class: 'm-future', style: 'grid-area:future' },
    el('div', { class: 'mf-title', text: `${MAP.future.title}（準備中）` }),
    el('div', { class: 'mf-items' }, MAP.future.items.map((f, i) => link(i === 0 ? '#/path' : '#/guide', { class: 'mf-item' },
      el('span', { class: 'mf-icon', text: f.icon }), el('span', null, el('b', { text: f.title }), el('span', { class: 'sub small block', text: f.desc }))))));

  const map = el('div', { class: 'map' },
    searchBox,
    bus('busa', 'a'), bus('busg1', 'g'), el('div', { class: 'm-bus b', style: 'grid-area:busb' }, el('i', { class: 'h' }), el('i', { class: 'stem' }), el('i', { class: 'v' }), el('span', { class: 'lbl', text: MAP.search.link_label })), bus('busg2', 'g'), bus('busc', 'c'),
    el('div', { style: 'grid-area:a', class: 'cell' }, shelfSystem),
    hlink('l1', MAP.links.system_to_wisdom),
    el('div', { style: 'grid-area:b', class: 'cell' }, shelfWisdom),
    hlink('l2', MAP.links.wisdom_to_term),
    el('div', { style: 'grid-area:c', class: 'cell' }, shelfTerm),
    el('div', { class: 'm-up', style: 'grid-area:up' }, el('i', { class: 'v' }), el('span', { class: 'lbl', text: MAP.future.link_label })),
    future,
    el('div', { class: 'm-source', style: 'grid-area:src' }, '🗂️ ', MAP.source, ' ', link('#/about', { text: 'この辞書について →' })));

  // こんなとき（毎回違う困りごとを見せる）
  const troubles = ITEMS.filter(x => x.kind === 'wisdom' && x.curated).flatMap(x => (x.trouble || []).map(t => ({ t, id: x.id })));
  for (let i = troubles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [troubles[i], troubles[j]] = [troubles[j], troubles[i]]; }

  const archBand = link('#/arch', { class: 'arch-band' },
    el('span', { class: 'ab-stack', 'aria-hidden': 'true' }, LAYERS_TOP.map(L => el('i', { style: `background:${L.color}` }))),
    el('span', { class: 'ab-text' }, el('b', { text: `${ARCH.title}（アーキテクチャ）` }),
      el('span', { class: 'ab-desc', text: 'どこからどこまでが「しくみ」か。6つの層と4本の柱で、立体で見られます。用語・知恵・システムも層ごとに並べ直しています。' })),
    el('span', { class: 'ab-go', text: '開く →' }));

  return [
    el('h1', { text: '辞書の全体マップ' }),
    el('p', { class: 'sub lead', text: MAP.lead }),
    archBand,
    map,
    el('h2', { text: 'こんなとき、どうする？' }),
    el('div', { class: 'chips' }, troubles.slice(0, 10).map(x => el('button', { class: 'chip', type: 'button', onclick: () => go(itemHash(x.id)), text: x.t }))),
  ];
}

function viewSearch(q) {
  const { hits, near, weak } = search(q);
  const state = { kind: 'all' };
  const box = el('div', { class: 'list' });
  const filters = el('div', { class: 'filters' });
  const kinds = ['all', 'arch', 'system', 'wisdom', 'term'];
  const kc = { all: hits.length };
  for (const h of hits) kc[h.it.kind] = (kc[h.it.kind] || 0) + 1;
  function draw() {
    filters.replaceChildren(...kinds.map(k => el('button', { type: 'button', class: state.kind === k ? 'on' : '', onclick: () => { state.kind = k; draw(); } },
      `${k === 'all' ? 'すべて' : KIND_LABEL[k]} ${kc[k] || 0}`)));
    const list = hits.filter(h => state.kind === 'all' || h.it.kind === state.kind);
    box.replaceChildren(...list.slice(0, 80).map(h => rowFor(h.it, q, h.why)));
  }
  draw();
  const nearBlock = near.length ? [el('div', { class: 'group-h', text: 'もしかして（近い項目）' }), el('div', { class: 'list' }, near.map(h => rowFor(h.it, '', h.why)))] : [];
  const out = [el('h1', null, '「', q, '」の検索結果')];
  if (!hits.length) out.push(el('div', { class: 'empty' }, el('b', { text: 'ぴったりの項目は見つかりませんでした。' }), el('div', { class: 'sub', text: '言葉を短くするか、別の言い方でも試してください。' })));
  // 本文にしか当たらないときは、近い項目を先に見せる
  if (weak) out.push(...nearBlock);
  if (hits.length) out.push(el('div', { class: 'group-h', text: weak ? '本文に言葉を含む項目' : '見つかった項目' }), filters, box);
  if (!weak) out.push(...nearBlock);
  return out;
}

function viewList(kind, gid) {
  const items = ITEMS.filter(x => x.kind === kind);
  if (kind === 'term') {
    items.sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja'));
    return [el('h1', { text: '用語' }), el('p', { class: 'sub', text: '本文中の点線の言葉にカーソルを合わせても、同じ説明が出ます。' }), el('div', { class: 'list' }, items.map(it => rowFor(it)))];
  }
  // 知恵: 全体マップと同じ分野で並べる（分野を指定されたらその分野だけ）
  const shown = gid ? GROUPS.filter(g => g.id === gid) : GROUPS;
  const out = [
    el('h1', { text: gid && shown[0] ? `知恵 › ${shown[0].icon} ${shown[0].label}` : '知恵（困ったとき）' }),
    el('p', { class: 'sub', text: '社内で起きたこと・決めたことから生まれた型です。「言い換え前」の項目は、AI向けの書き方のままです。' }),
  ];
  if (gid) out.push(el('p', null, link('#/wisdom', { text: '← 知恵のすべての分野を見る' }), '　', link('#/', { text: '全体マップへ' })));
  else out.push(el('div', { class: 'chips' }, GROUPS.map(g => link('#/wisdom/' + g.id, { class: 'chip' }, `${g.icon} ${g.label} ${groupItems(g.id).length}`))));
  for (const g of shown) {
    const list = groupItems(g.id);
    out.push(el('div', { class: 'group-h' }, `${g.icon} ${g.label}（${list.length}）`, el('span', { class: 'sub', style: 'font-weight:400', text: `　${g.desc}` })),
      el('div', { class: 'list' }, list.map(it => rowFor(it))));
  }
  return out;
}

function stChip(status, note) {
  if (!status) return el('span', { class: 'st none', text: '—' });
  return el('span', { class: 'st ' + status, title: note ? `${status}：${note}` : status, text: ST_SHORT[status] || status });
}

function legendBox() {
  return el('div', { class: 'legend' }, Object.entries(LEGEND).map(([k, v]) => el('span', null, stChip(k), ' ', v)));
}

function dragScroll(box, hint) {
  let down = false, sx = 0, sl = 0;
  const check = () => { const over = box.scrollWidth - box.clientWidth > 2; box.classList.toggle('grab', over); hint.style.display = over ? 'block' : 'none'; };
  box.addEventListener('pointerdown', e => { if (!box.classList.contains('grab') || e.button !== 0) return; down = true; sx = e.clientX; sl = box.scrollLeft; box.classList.add('grabbing'); });
  addEventListener('pointermove', e => { if (down) box.scrollLeft = sl - (e.clientX - sx); });
  addEventListener('pointerup', () => { down = false; box.classList.remove('grabbing'); });
  addEventListener('resize', check);
  requestAnimationFrame(check);
  setTimeout(check, 50);
}

// ---------- 表の見出しを画面上端に残す（④MDナレッジ「一年の型」と同じ型） ----------
// 表は横スクロールの枠（overflow-x:auto）の中にある。CSS の規定でこの枠は縦のスクロール枠にもなるので、
// th に sticky top を書いても「ページを縦に流したとき」には効かない。
// そこで、本物の見出しが上へ流れた間だけ、見出しの写しを position:fixed で上端に出す。
// 位置・幅・列幅・横スクロール量は毎回本物から写す（決め打ちしない）。
const viewCleanups = [];
function floatHeader(scroller, table) {
  const float = el('div', { class: 'tl-float', 'aria-hidden': 'true' });
  const ft = el('table', { class: table.className + ' float' }, table.tHead.cloneNode(true));
  float.append(ft);
  document.body.append(float);
  const realCells = [...table.tHead.rows[0].cells];
  const copyCells = [...ft.tHead.rows[0].cells];
  // 上に固定されているバー（広い画面は検索欄、狭い画面は上のチップ列）の下端を測る
  const topOffset = () => {
    let off = 0;
    for (const sel of ['#side', '#bar']) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (cs.position === 'sticky' && r.top <= 1) off = Math.max(off, r.bottom);
    }
    return off;
  };
  function upd() {
    const r = scroller.getBoundingClientRect();
    const h = table.tHead.getBoundingClientRect();
    const off = topOffset();
    const show = r.width > 0 && h.bottom < off + 1 && r.bottom > off + h.height + 8;
    if (!show) { float.style.display = 'none'; return; }
    float.style.display = 'block';
    float.style.top = off + 'px';
    float.style.left = (r.left + scroller.clientLeft) + 'px';
    float.style.width = scroller.clientWidth + 'px';
    float.style.height = h.height + 'px';
    ft.style.width = table.offsetWidth + 'px';
    realCells.forEach((c, i) => { const w = c.getBoundingClientRect().width + 'px'; copyCells[i].style.width = w; copyCells[i].style.minWidth = w; copyCells[i].style.maxWidth = w; });
    ft.style.transform = `translateX(${-scroller.scrollLeft}px)`;
    copyCells[0].style.transform = `translateX(${scroller.scrollLeft}px)`;   // 左端の「システム」列は本物と同じく動かさない
  }
  addEventListener('scroll', upd, { passive: true });
  addEventListener('resize', upd);
  scroller.addEventListener('scroll', upd, { passive: true });
  requestAnimationFrame(upd);
  viewCleanups.push(() => {
    removeEventListener('scroll', upd);
    removeEventListener('resize', upd);
    float.remove();
  });
}

// システムの並び: 段階ごと（運用中→…→中止）、そのあと社員が直接使わない裏方。診断の表と縦串カードで同じ並びにする
function systemGroups() {
  const systems = ITEMS.filter(x => x.kind === 'system');
  return [
    ...STAGES.map(stage => [`${stage}`, systems.filter(s => !s.layer && s.stage === stage)]),
    ...Object.keys(LAYERS).map(layer => [LAYERS[layer], systems.filter(s => s.layer === layer)]),
  ].filter(([, rows]) => rows.length);
}

function viewSystems() {
  const systems = ITEMS.filter(x => x.kind === 'system');
  const head = el('tr', null, el('th', { class: 'sys', text: 'システム' }), VIEWPOINTS.map(v => el('th', { title: v.question, text: v.name })));
  const body = [];
  for (const [label, rows] of systemGroups()) {
    body.push(el('tr', { class: 'grp' }, el('td', { colspan: VIEWPOINTS.length + 1, text: `${label}（${rows.length}）` })));
    for (const s of rows) {
      const diagnosed = DATA.diagnosed_stages.includes(s.stage);
      body.push(el('tr', { class: 'sysrow', onclick: () => go(itemHash(s.id)) },
        el('td', { class: 'sys' }, link(itemHash(s.id), { text: s.name }), el('div', { class: 'sub', style: 'font-size:12px', text: s.owner })),
        diagnosed
          ? VIEWPOINTS.map(v => { const c = s.checks[v.id]; return el('td', null, c ? stChip(c[0], resolveNote(c[1], s.id, v.id)) : stChip(null)); })
          : el('td', { colspan: VIEWPOINTS.length, class: 'sub', style: 'text-align:left', text: `診断の対象外（${DATA.diagnose_note}）` })));
    }
  }
  const box = el('div', { class: 'scroller' }, el('table', { class: 'diag' }, el('thead', null, head), el('tbody', null, body)));
  const hint = el('div', { class: 'drag-hint', text: '⇔ 表を掴んで横に動かせます' });
  dragScroll(box, hint);
  floatHeader(box, box.querySelector('table.diag'));
  const tally = {};
  for (const s of systems) for (const c of Object.values(s.checks)) tally[c[0]] = (tally[c[0]] || 0) + 1;
  return [
    el('h1', { text: 'システム別の診断' }),
    el('p', { class: 'sub', text: `各システムの守りの状態です。載せているのは状態と教訓までで、直っていない穴の場所は担当者の記録にだけ残しています。${META.diag_basis}` }),
    el('div', { class: 'chips' }, Object.keys(LEGEND).map(k => el('span', null, stChip(k), ` ${tally[k] || 0}件`))),
    legendBox(), hint, box,
    el('p', { class: 'sub', style: 'font-size:13px', text: '見出しにカーソルを合わせると、その観点の問いが出ます。行を押すとシステムの詳しい診断を開きます。' }),
    el('p', null, link('#/arch/cards', { text: '守りでなく「しくみの作り」で見比べる（システムの縦串カード）→' })),
  ];
}

// ---------- しくみの全体図（アーキテクチャ） ----------
// 4つの見方: 立体の全体図（#/arch）／層の断面図（#/arch/layer/◯）と柱（#/arch/cross/◯）／システムの縦串カード（#/arch/cards）／用語の置き場（#/arch/terms）
const TERMS = ITEMS.filter(x => x.kind === 'term');
const termsAt = place => TERMS.filter(t => t.place === place).sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja'));
const cardSystems = () => systemGroups().flatMap(([, rows]) => rows).filter(s => s.card);
const stageChip = s => s.layer ? el('span', { class: 'stage 裏方', text: LAYER_SHORT[s.layer] || s.layer }) : el('span', { class: 'stage ' + s.stage, text: s.stage });
const LEVEL = s => /^あり/.test(s) ? 'hi' : /^薄い|^なし/.test(s) ? 'lo' : 'mid';
// 「A・B（C・D）・E」を括弧の外の「・」でだけ分ける
function splitDots(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s || '') {
    if (ch === '（' || ch === '(') depth++;
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '・' && !depth) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function placeBadges(it) {
  const places = it.kind === 'term' ? (it.place ? [it.place] : [])
    : it.kind === 'wisdom' ? (WISDOM_PLACES.get(it.id) || []) : [];
  return places.map(p => { const pi = placeInfo(p); return link(pi.hash, { class: 'place', style: `--c:${pi.color}`, title: 'しくみの全体図のどこに当たるか' }, '置き場：', pi.label); });
}
const termChips = list => el('div', { class: 'a-chips k-term' }, list.map(t => link(itemHash(t.id), { class: 'tchip', title: t.oneline, text: t.name })));

// 右の小さな建物（いまどこにいるか・ほかの層へ）
function archMini(kind, id) {
  return el('nav', { class: 'a-mini', 'aria-label': 'しくみの全体図の中の位置' },
    link('#/arch', { class: 'am-top' }, '🏗️ ', ARCH.title),
    el('div', { class: 'am-body' },
      el('div', { class: 'am-layers' }, LAYERS_TOP.map(L => {
        const on = kind === 'layer' && id === L.id;
        return link(`#/arch/layer/${L.id}`, { class: 'am-l' + (on ? ' on' : ''), style: `--c:${L.color}`, 'aria-current': on ? 'page' : null }, `${L.no} ${L.name}`);
      })),
      el('div', { class: 'am-posts' }, ARCH.cross.map(C => {
        const on = kind === 'cross' && id === C.id;
        return link(`#/arch/cross/${C.id}`, { class: 'am-p' + (on ? ' on' : ''), style: `--c:${C.color}`, title: `${C.name}の柱`, 'aria-current': on ? 'page' : null },
          el('span', { text: C.icon }), el('span', { class: 'am-pn', text: C.name }));
      }))),
    el('div', { class: 'am-more' },
      link('#/arch/cards', { class: kind === 'cards' ? 'on' : '', text: 'システムの縦串カード' }),
      link('#/arch/terms', { class: kind === 'terms' ? 'on' : '', text: '用語の置き場' })));
}
const archPage = (kind, id, nodes) => [el('div', { class: 'a-page' }, el('div', { class: 'a-main' }, nodes), archMini(kind, id))];
const crumbs = here => el('div', { class: 'crumbs' }, link('#/arch', { text: ARCH.title }), ' › ', here);

// 立体図の右の説明（触った層・柱の中身）
function archDetail(kind, id) {
  if (kind === 'layer' && LAYER_BY_ID.has(id)) {
    const L = LAYER_BY_ID.get(id);
    return [el('div', { class: 'ad-h', style: `--c:${L.color}` }, `${L.no} ${L.long}`),
      el('p', { class: 'ad-q', text: L.question }),
      el('div', { class: 'ad-sub', text: '社内で選んでいるもの' }),
      el('ul', { class: 'ad-list' }, L.choices.map(c => el('li', { text: c.name }))),
      el('div', { class: 'ad-meta', text: `用語 ${termsAt(id).length} ・ 知恵 ${L.wisdom.length} ・ システム ${cardSystems().length} の輪切り` }),
      link(`#/arch/layer/${id}`, { class: 'ad-go', text: 'この層の断面を開く →' })];
  }
  if (kind === 'cross' && CROSS_BY_ID.has(id)) {
    const C = CROSS_BY_ID.get(id);
    return [el('div', { class: 'ad-h', style: `--c:${C.color}` }, `${C.icon} ${C.name}の柱`),
      el('p', { class: 'ad-q', text: C.question }),
      el('div', { class: 'ad-sub', text: '社内でしていること' }),
      el('ul', { class: 'ad-list' }, splitDots(C.inhouse).map(t => el('li', { text: t }))),
      el('div', { class: 'ad-meta' }, '備え：', el('span', { class: 'lvl ' + LEVEL(C.strength), text: C.strength })),
      link(`#/arch/cross/${id}`, { class: 'ad-go', text: 'この柱を開く →' })];
  }
  return [el('div', { class: 'ad-h plain', text: '見方' }),
    el('p', { class: 'ad-q', text: '建物と同じです。下の ① 土台 から上の ⑥ 窓口 へ積み上がり、上ほど人に近く、下ほど機械に近くなります。' }),
    el('p', { class: 'ad-q', text: '四隅の4本の柱は、どの層にも必ずかかる関心ごと（守り・動かし続けること・線引き・お金）です。' }),
    el('p', { class: 'ad-q sub', text: '層や柱にカーソルを合わせると、ここに中身が出ます。押すと、その断面が開きます。' })];
}

let archMode = null;   // 立体／平ら（この辞書を開いている間だけ覚える）
const ARCH_NARROW = '(max-width: 640px)';   // これより狭いと立体の名札が収まらない（スマホ）→ 平らな図だけにする
function viewArch() {
  const narrow = matchMedia(ARCH_NARROW).matches;
  if (!archMode) archMode = matchMedia('(max-width: 900px)').matches ? 'flat' : '3d';
  if (narrow) archMode = 'flat';
  const detail = el('div', { class: 'ad', 'aria-live': 'polite' });
  let api = null, root = null, lastKey = '';
  const hot = new Set();
  function show(kind, id) {
    for (const e of hot) e.classList.remove('hot');
    hot.clear();
    if (!kind) return;
    root.querySelectorAll(`.aflat [data-kind="${kind}"][data-id="${id}"], .a-legend [data-kind="${kind}"][data-id="${id}"]`).forEach(e => { e.classList.add('hot'); hot.add(e); });
    const key = kind + ':' + id;
    if (key !== lastKey) { detail.replaceChildren(...archDetail(kind, id)); lastKey = key; }
  }
  const hoverable = (kind, id) => ({ 'data-kind': kind, 'data-id': id });
  const onEnter = e => { const t = e.target.closest('[data-kind][data-id]'); if (t) { show(t.dataset.kind, t.dataset.id); if (api) api.focus(t.dataset.kind, t.dataset.id); } };
  const onLeave = () => { show(null); if (api) api.focus(null); };

  // 平らな図（狭い画面・印刷・立体が苦手な人向け）: 上から ⑥→①、右に4本の柱
  const flat = el('div', { class: 'aflat', onmouseover: onEnter, onfocusin: onEnter, onmouseleave: onLeave },
    ...LAYERS_TOP.map((L, i) => link(`#/arch/layer/${L.id}`, Object.assign({ class: 'af-l', style: `--c:${L.color};grid-row:${i + 1}` }, hoverable('layer', L.id)),
      el('b', { text: `${L.no} ${L.long}` }), el('span', { class: 'af-q', text: L.question }))),
    ...ARCH.cross.map((C, i) => link(`#/arch/cross/${C.id}`, Object.assign({ class: 'af-p', style: `--c:${C.color};grid-column:${i + 2}` }, hoverable('cross', C.id)),
      el('span', { class: 'af-pi', text: C.icon }), el('span', { class: 'af-pn', text: C.name }))));

  const stageHost = el('div', { class: 'a3d-host' });
  api = Arch3D.mount(stageHost, ARCH, {
    onHover: (kind, id) => show(kind, id),
    onOpen: (kind, id) => go(kind === 'layer' ? `#/arch/layer/${id}` : `#/arch/cross/${id}`),
  });
  viewCleanups.push(() => api.destroy());

  const legend = el('div', { class: 'a-legend', onmouseover: onEnter, onfocusin: onEnter, onmouseleave: onLeave },
    el('div', { class: 'ad-sub', text: '6つの層（上ほど人に近い）' }),
    ...LAYERS_TOP.map(L => link(`#/arch/layer/${L.id}`, Object.assign({ class: 'al', style: `--c:${L.color}` }, hoverable('layer', L.id)),
      el('b', { text: `${L.no} ${L.name}` }), el('span', { class: 'al-s', text: L.long.replace(L.name, '') }), el('span', { class: 'al-n', text: `用語${termsAt(L.id).length}` }))),
    el('div', { class: 'ad-sub', text: '4本の柱（全部の層を貫く）' }),
    ...ARCH.cross.map(C => link(`#/arch/cross/${C.id}`, Object.assign({ class: 'al', style: `--c:${C.color}` }, hoverable('cross', C.id)),
      el('b', { text: `${C.icon} ${C.name}` }), el('span', { class: 'al-s', text: '' }), el('span', { class: 'al-n', text: `用語${termsAt(C.id).length}` }))));

  const setMode = m => {
    archMode = m;
    root.classList.toggle('mode-3d', m === '3d');
    root.classList.toggle('mode-flat', m === 'flat');
    modes.querySelectorAll('button').forEach(b => { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (m === '3d') api.refit();
  };
  const modeBtn = (m, label) => el('button', { type: 'button', class: archMode === m ? 'on' : '', 'aria-pressed': String(archMode === m), 'data-m': m, onclick: () => setMode(m), text: label,
    disabled: m === '3d' && narrow ? '' : null, title: m === '3d' && narrow ? '画面が狭いため、平らな図で表示しています（広い画面で立体が見られます）' : null });
  const modes = el('div', { class: 'a-mode', role: 'group', 'aria-label': '見せ方' }, modeBtn('3d', '🧊 立体で見る'), modeBtn('flat', '▤ 平らに見る'));

  root = el('div', { class: 'arch-top mode-' + archMode },
    el('div', { class: 'at-fig' }, modes, stageHost, flat),
    el('aside', { class: 'at-panel' }, detail, legend));
  detail.replaceChildren(...archDetail(null));

  const lens = (icon, title, desc, links) => el('div', { class: 'lens' },
    el('div', { class: 'ln-h' }, el('span', { class: 'ln-i', text: icon }), el('b', { text: title })),
    el('p', { class: 'ln-d', text: desc }), el('div', { class: 'ln-links' }, links));
  const lenses = el('div', { class: 'lenses' },
    lens('🪜', '層の断面図', '1つの層だけを切り出して、社内で何を選び、なぜそうしたかを見ます。', LAYERS_TOP.map(L => link(`#/arch/layer/${L.id}`, { class: 'lk', style: `--c:${L.color}`, text: `${L.no} ${L.name}` }))),
    lens('🏛️', '4本の柱', 'どの層にもかかる関心ごとです。層を作るたびに、この4つを確かめます。', ARCH.cross.map(C => link(`#/arch/cross/${C.id}`, { class: 'lk', style: `--c:${C.color}`, text: `${C.icon} ${C.name}` }))),
    lens('🗂️', 'システムの縦串カード', `社内の ${cardSystems().length} のシステムを、6つの層で輪切りにして並べます。`, [link('#/arch/cards', { class: 'lk', text: 'カードを並べて見る →' })]),
    lens('🏷️', '用語の置き場', `${TERMS.length} の用語を、しくみのどこで使う言葉かで並べます。用語の項目にも置き場を出しています。`, [link('#/arch/terms', { class: 'lk', text: '置き場ごとに見る →' })]));

  return [
    el('h1', { text: `${ARCH.title}（アーキテクチャ）` }),
    el('p', { class: 'sub lead', text: ARCH.lead }),
    root,
    el('h2', { text: '4つの見方' }),
    lenses,
    el('p', { class: 'src', text: `出典：${ARCH.basis}` }),
  ];
}

function viewArchLayer(id) {
  const L = LAYER_BY_ID.get(id);
  if (!L) return [el('h1', { text: '層が見つかりません' }), el('p', null, link('#/arch', { text: 'しくみの全体図へ' }))];
  const terms = termsAt(id);
  const wis = L.wisdom.map(w => byId.get(w)).filter(Boolean);
  // 各システムの答えを、同じ答えどうしでまとめる（社内の選び方の癖が見える）
  const byAns = new Map();
  for (const s of cardSystems()) { const a = s.card[id]; byAns.set(a, [...(byAns.get(a) || []), s]); }
  const ans = [...byAns].sort((a, b) => b[1].length - a[1].length);
  const i = LAYERS_TOP.indexOf(L);
  const up = LAYERS_TOP[i - 1], down = LAYERS_TOP[i + 1];
  return archPage('layer', id, [
    crumbs('層の断面図'),
    el('div', { class: 'meta' }, badge('arch'), el('span', { class: 'badge', text: `6つの層のうち下から${ARCH.layers.indexOf(L) + 1}番目` })),
    el('h1', { class: 'a-h1', style: `--c:${L.color}`, text: `${L.no} ${L.long}` }),
    el('div', { class: 'oneline', text: L.question }),
    el('h2', { text: '社内で選んでいるもの（と、その理由）' }),
    el('table', { class: 'checks' }, el('thead', null, el('tr', null, el('th', { text: '選んでいるもの' }), el('th', { text: 'なぜそれを選んだか' }))),
      el('tbody', null, L.choices.map(c => el('tr', null, el('td', null, el('b', { text: c.name })), el('td', { class: 'a-why', text: c.why }))))),
    el('h2', { text: '各システムではこうなっている' }),
    el('p', { class: 'sub small', text: '同じ答えのシステムをまとめています。システムを押すと、そのシステムの輪切り（6つの層すべて）が見られます。' }),
    el('table', { class: 'checks' }, el('thead', null, el('tr', null, el('th', { text: 'この層の形' }), el('th', { text: 'システム' }))),
      el('tbody', null, ans.map(([a, list]) => el('tr', null, el('td', { class: 'a-why', text: a }),
        el('td', null, el('div', { class: 'rel' }, list.map(s => link(itemHash(s.id), { class: 'chip' }, s.name, ' ', stageChip(s))))))))),
    el('h2', { text: `この層の用語（${terms.length}）` }),
    terms.length ? termChips(terms) : el('p', { class: 'sub', text: 'まだありません。' }),
    el('h2', { text: `この層の知恵（${wis.length}）` }),
    wis.length ? el('div', { class: 'list' }, wis.map(x => rowFor(x))) : el('p', { class: 'sub', text: 'まだありません。' }),
    el('div', { class: 'a-next' },
      up ? link(`#/arch/layer/${up.id}`, { style: `--c:${up.color}` }, '↑ 上の層：', `${up.no} ${up.long}`) : el('span'),
      down ? link(`#/arch/layer/${down.id}`, { style: `--c:${down.color}` }, '↓ 下の層：', `${down.no} ${down.long}`) : el('span')),
  ]);
}

function viewArchCross(id) {
  const C = CROSS_BY_ID.get(id);
  if (!C) return [el('h1', { text: '柱が見つかりません' }), el('p', null, link('#/arch', { text: 'しくみの全体図へ' }))];
  const terms = termsAt(id);
  const wis = C.wisdom.map(w => byId.get(w)).filter(Boolean);
  return archPage('cross', id, [
    crumbs('4本の柱'),
    el('div', { class: 'meta' }, badge('arch'), el('span', { class: 'badge', text: '全部の層を貫く' })),
    el('h1', { class: 'a-h1', style: `--c:${C.color}`, text: `${C.icon} ${C.name}の柱` }),
    el('div', { class: 'oneline', text: C.question }),
    el('h2', { text: '社内でしていること' }),
    el('ul', { class: 'a-why' }, splitDots(C.inhouse).map(t => el('li', { text: t }))),
    el('p', null, el('b', { text: 'いまの備え：' }), el('span', { class: 'lvl ' + LEVEL(C.strength), text: C.strength })),
    C.link ? el('p', null, link(C.link, { text: C.link === '#/systems' ? 'システムごとの守りの状態を見る（システム別の診断）→' : '関係する画面を開く →' })) : null,
    el('div', { class: 'note', text: 'この柱は、① 土台 から ⑥ 窓口 まで全部の層にかかります。どの層を作るときも、ここの問いを確かめます。' }),
    el('h2', { text: `この柱の用語（${terms.length}）` }),
    terms.length ? termChips(terms) : el('p', { class: 'sub', text: 'まだありません。' }),
    el('h2', { text: `この柱の知恵（${wis.length}）` }),
    wis.length ? el('div', { class: 'list' }, wis.map(x => rowFor(x))) : el('p', { class: 'sub', text: 'まだありません。' }),
  ]);
}

// システムの縦串カード: 1つのシステムを6つの層で輪切りにしたもの（上ほど人に近い）
function archCard(s, withHead) {
  return el('div', { class: 'acard' },
    withHead ? link(itemHash(s.id), { class: 'ac-head' }, el('b', { text: s.name }), stageChip(s)) : null,
    el('div', { class: 'ac-rows' }, LAYERS_TOP.map(L => link(`#/arch/layer/${L.id}`, { class: 'ac-row', style: `--c:${L.color}`, title: `${L.long}：ほかのシステムと見比べる` },
      el('span', { class: 'ac-l', text: `${L.no} ${L.name}` }), el('span', { class: 'ac-v', text: s.card[L.id] })))));
}

function viewArchCards() {
  const out = [
    crumbs('システムの縦串カード'),
    el('h1', { text: 'システムの縦串カード' }),
    el('p', { class: 'sub', text: '社内のシステムを、6つの層で輪切りにしました。上ほど人に近く、下ほど土台です。同じ段を横に見比べると、社内の選び方の癖が見えます。段を押すと、その層の断面図へ行きます。' }),
  ];
  for (const [label, rows] of systemGroups()) {
    const list = rows.filter(s => s.card);
    if (!list.length) continue;
    out.push(el('div', { class: 'group-h', text: `${label}（${list.length}）` }), el('div', { class: 'acards' }, list.map(s => archCard(s, true))));
  }
  return out;
}

function viewArchTerms() {
  const places = ['whole', ...LAYERS_TOP.map(L => L.id), ...ARCH.cross.map(C => C.id)];
  const sections = places.map(p => {
    const pi = placeInfo(p), list = termsAt(p);
    if (!list.length) return null;
    return [el('h2', { class: 'a-h2' }, link(pi.hash, { class: 'place big', style: `--c:${pi.color}` }, pi.label), el('span', { class: 'sub small', text: ` ${list.length}語` })), termChips(list)];
  });
  return archPage('terms', null, [
    crumbs('用語の置き場'),
    el('h1', { text: '用語の置き場' }),
    el('p', { class: 'sub', text: `${TERMS.length} の用語を、しくみのどこで使う言葉かで並べました。1つの用語は1か所にだけ置いています。言葉を押すと、その用語の項目が開きます。` }),
    ...sections.filter(Boolean).flat(),
  ]);
}

function viewItem(id) {
  const it = byId.get(id);
  if (!it) return [el('h1', { text: '項目が見つかりません' }), el('p', null, link('#/', { text: 'はじめに戻る' }))];
  const out = [];
  out.push(el('div', { class: 'meta' }, badge(it.kind), it.layer ? el('span', { class: 'stage 裏方', text: LAYER_SHORT[it.layer] || it.layer }) : null, it.stage ? el('span', { class: 'stage ' + it.stage, text: it.stage }) : null, ...(it.tags || []).map(t => el('span', { class: 'badge', text: t })), ...placeBadges(it)));
  out.push(el('h1', { text: it.name }));
  const aka = [it.yomi, ...(it.aliases || [])].filter(Boolean);
  if (aka.length) out.push(el('div', { class: 'aka', text: '別名・読み：' + aka.join('／') }));
  if (it.oneline) out.push(el('div', { class: 'oneline', text: it.oneline }));
  if (it.trouble && it.trouble.length) out.push(el('h2', { text: 'こんなとき' }), el('ul', { class: 'trouble' }, it.trouble.map(t => el('li', { text: t }))));

  if (it.kind === 'system') {
    out.push(el('p', null, el('b', { text: '構成：' }), it.structure, '　', el('b', { text: '担当：' }), it.owner));
    if (it.extra) out.push(el('div', { class: 'note', text: it.extra }));
    const sysChips = ids => el('div', { class: 'rel' }, ids.map(x => byId.get(x)).filter(Boolean).map(s => link(itemHash(s.id), { class: 'chip' }, s.name, ' ', el('span', { class: 'stage ' + s.stage, text: s.stage }))));
    if ((it.feeds || []).length) out.push(el('h2', { text: '数字を届けている先' }), sysChips(it.feeds));
    if ((it.fed_by || []).length) out.push(el('h2', { text: '画面の数字を作っている裏方' }), sysChips(it.fed_by));
    if (it.card) out.push(el('h2', { text: 'しくみの輪切り（6つの層）' }),
      el('p', { class: 'sub small' }, '上ほど人に近く、下ほど土台です。段を押すと、その層でほかのシステムがどうしているかを見比べられます。 ', link('#/arch/cards', { text: '全部のシステムを並べて見る →' })),
      el('div', { class: 'acards one' }, archCard(it, false)));
    const rows = VIEWPOINTS.filter(v => it.checks[v.id]).map(v => {
      const c = it.checks[v.id];
      return el('tr', null, el('td', null, el('b', { text: v.name }), el('div', { class: 'sub', style: 'font-size:12px', text: v.question })), el('td', null, stChip(c[0])), el('td', null, withSysLinks(c[1] || '', it.id, v.id)));
    });
    out.push(el('h2', { text: '守りの状態' }));
    if (!DATA.diagnosed_stages.includes(it.stage)) out.push(el('div', { class: 'empty', text: `診断の対象外です。${DATA.diagnose_note}。` }));
    else if (rows.length) out.push(el('table', { class: 'checks' }, el('thead', null, el('tr', null, el('th', { text: '観点' }), el('th', { text: '状態' }), el('th', { text: 'ひとこと' }))), el('tbody', null, rows)));
    else out.push(el('div', { class: 'empty', text: 'まだ診断していません。' }));
    out.push(el('div', { class: 'note', text: META.diag_basis + ' 直っていない穴の場所は担当者の記録にだけ残しています。' }));
    out.push(legendBox());
  }

  if (it.body_note) out.push(el('div', { class: 'note', text: it.body_note }));
  if (it.kind === 'wisdom' && !it.curated) out.push(el('div', { class: 'note', text: 'この項目は、AI向けの書き方のままです（人向けの言い換えは順に進めます）。' }));
  if (it.body_html) {
    out.push(el('h2', { text: it.kind === 'term' ? '説明' : '詳しく' }));
    const body = el('div', { class: 'body' });
    body.innerHTML = it.body_html;   // 作成時に無害化済みの HTML だけがここに来る
    out.push(body);
  }

  const lessons = (it.lessons || []).map(x => byId.get(x)).filter(Boolean);
  if (lessons.length) out.push(el('h2', { text: 'このシステムから生まれた教訓' }), el('div', { class: 'list' }, lessons.map(x => rowFor(x))));
  const used = (it.used_by || []).map(x => byId.get(x)).filter(Boolean);
  if (used.length) out.push(el('h2', { text: '関係するシステム' }), el('div', { class: 'rel' }, used.map(s => link(itemHash(s.id), { class: 'chip' }, s.name, ' ', el('span', { class: 'stage ' + s.stage, text: s.stage })))));
  if (it.source) out.push(el('div', { class: 'src', text: `出典：${it.source}${it.updated ? '（原本の更新 ' + it.updated + '）' : ''}` }));
  return out;
}

// ---------- AIエージェントの準備 ----------
// 新しく AI エージェントを使い始めるメンバーは、最初にここからナレッジパック（憲章と全社のナレッジの写し）を受け取り、
// AI に最初に読ませてから使い始める。開発の中心が版を上げたら、受け取り直して入れ替える（写し＝ミラーを最新に保つ）
function viewAi() {
  const P = DATA.ai_pack;
  const status = el('p', { class: 'ai-status', 'aria-live': 'polite' });
  const btn = el('button', { type: 'button', class: 'ai-btn', text: 'AI用ナレッジパックを受け取る（ZIP）' });
  if (!WEB || !ENV.fetchPack) {
    btn.disabled = true;
    status.textContent = 'パックは Web 版（ポータルの「しくみの辞書」）で受け取れます。';
  }
  btn.onclick = async () => {
    btn.disabled = true;
    status.textContent = '用意しています…';
    const res = await ENV.fetchPack();
    btn.disabled = false;
    if (!res || !res.ok) {
      status.replaceChildren(...[(res && res.error) || '受け取れませんでした。',
        res && res.auth && ENV.relogin ? el('button', { type: 'button', class: 'ai-relogin', onclick: () => ENV.relogin(), text: 'ログインし直す' }) : null].filter(Boolean));
      return;
    }
    const pk = res.data;
    const files = Object.entries(pk.files).map(([k, v]) => ({ name: 'shikumi_ai_pack/' + k, text: v }));
    const url = URL.createObjectURL(ShikumiZip.make(files));
    const a = el('a', { href: url, download: `shikumi_ai_pack_V${pk.version}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = `受け取りました（V${pk.version}・${files.length}ファイル）。下の手順 2 から進めてください。`;
  };
  const copyBox = text => {
    const b = el('button', { type: 'button', class: 'ai-copy', text: 'コピー' });
    b.onclick = () => { try { navigator.clipboard.writeText(text).then(() => { b.textContent = 'コピーしました'; setTimeout(() => { b.textContent = 'コピー'; }, 1500); }); } catch (_) { /* 選んでコピーしてもらう */ } };
    return el('div', { class: 'ai-code' }, el('code', { text }), b);
  };
  const line = '最初に C:\\Users\\（自分の名前）\\shikumi_ai_pack\\START_HERE.md を読み、そこに書かれた順で憲章とナレッジを読んでから作業する。';
  const step = (n, title, ...body) => el('li', { class: 'ai-step' }, el('div', { class: 'ai-step-h' }, el('span', { class: 'ai-n', text: n }), el('b', { text: title })), ...body);
  return [
    el('h1', { text: 'AIエージェントの準備' }),
    el('p', { class: 'sub lead', text: '新しく AI エージェント（Claude Code など）を使い始めるときは、最初に社内の決まり（憲章）とナレッジを読ませてから使います。そのための写し（ナレッジパック）をここで受け取れます。' }),
    el('div', { class: 'ai-card' },
      el('div', { class: 'ai-card-h' }, '最新のパック',
        P ? el('span', { class: 'ai-ver', text: `V${P.version}（${P.generated} 作成）・記事 ${P.articles}本・${P.files}ファイル` }) : null),
      btn, status),
    el('h2', { text: '使い始めるまでの手順' }),
    el('ol', { class: 'ai-steps' },
      step('1', '受け取る', el('p', { text: '上のボタンで ZIP を受け取ります（ログインした会社のアカウントでだけ受け取れます）。' })),
      step('2', '決まった場所に展開する', el('p', { text: 'ZIP を右クリック →「すべて展開」→ 展開先を C:\\Users\\（自分の名前）\\ にします。shikumi_ai_pack というフォルダができます。前の版があれば、先にそのフォルダを消してから展開します。' })),
      step('3', 'AI エージェントに「最初に読む」を覚えさせる',
        el('p', { text: 'Claude Code なら C:\\Users\\（自分の名前）\\.claude\\CLAUDE.md（無ければ作る）に、次の1行を書きます。ほかの AI エージェントは、それぞれの設定ファイル（AGENTS.md・GEMINI.md など）に同じ1行を書きます。' }),
        copyBox(line)),
      step('4', '読めたか確かめる', el('p', { text: '最初の会話で「START_HERE.md を読んで、憲章の要点を3つと、このパックの版を教えて」と頼みます。版（V○）と要点が返ってくれば準備完了です。' })),
      step('5', '写しを最新に保つ', el('p', { text: 'このページの版と、自分の shikumi_ai_pack\\MANIFEST.json の版が違ったら、受け取り直して入れ替えます。AI も会話の最初に日付を見て、古ければ知らせます。' }))),
    el('h2', { text: '守ること' }),
    el('ul', null,
      el('li', { text: '社外に渡さない。会社が認めた AI エージェントだけで使う。' }),
      el('li', { text: 'パックは写しです。書き換えても原本には戻りません。直したい点・足したいナレッジは、開発の中心へ提案してください。' }),
      el('li', { text: '個人の区分（開発の中心の人物像など）や、作業途中の引継書、監査記録の本文は入っていません。' })),
    el('h2', { text: 'これから加わる仕組み（予定）' }),
    el('p', { text: '各自の気づきを「ナレッジの提案」としてこの辞書から出し、メンバー全員の承認で原本に取り込む（または外す）仕組みを段階的に用意します。' }),
  ];
}

// ---------- システム地図 ----------
// 地図は単独の HTML（原本はハブ）。辞書の見た目と混ざらないよう別の枠（iframe）に入れる。
// 枠は sandbox（allow-scripts だけ）＝辞書とは別の出どころ扱い。地図の台本はログインの札や辞書の中身に触れられない。
// 地図の中のシステム名を押すと、枠から「この項目を開いて」と知らせが来る（辞書に在る項目だけ受け付ける）
function viewSysmap() {
  const SM = DATA.sysmap;
  if (!SM) return [el('h1', { text: 'システム地図' }), el('div', { class: 'empty', text: 'まだ入っていません。' })];
  // 🔴 台本の文字の中に、台本の終わりの札（小なり＋スラッシュ＋script）をそのまま書かない。
  //    1枚版では HTML がそこを台本の終わりと読み、台本が途中で切れる（コメントの中でも同じ）。build.py の検査で止まる
  const END = '<\/script>';
  const names = JSON.stringify(SYS_NAMES).replace(/</g, '\\u003c');
  // 枠の中の台本は中身をそのまま入れ、画面の CSP に指紋（sha256）で1つずつ許してある。
  // 別の出どころ扱いの枠では、外のファイルから読む台本は止まるため（2026-09-18 実測）
  const scripts = [...(SM.scripts || []), SM.link_script].filter(Boolean).map(t => `<script>${t}${END}`).join('\n');
  const html = SM.html;
  const at = html.lastIndexOf('</body>');
  const doc = (at < 0 ? html : html.slice(0, at)) + `\n<script type="application/json" id="dx-names">${names}${END}\n${scripts}\n` + (at < 0 ? '' : html.slice(at));
  const frame = el('iframe', { class: 'sysmap', title: 'システム地図', sandbox: 'allow-scripts', referrerpolicy: 'no-referrer' });
  frame.srcdoc = doc;
  const onMsg = e => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data;
    if (d && d.dx === 'open' && typeof d.id === 'string' && byId.has(d.id)) go(itemHash(d.id));
  };
  addEventListener('message', onMsg);
  viewCleanups.push(() => removeEventListener('message', onMsg));
  // 地図は辞書の補いなので、辞書の枠に組み込まず別ページとして画面いっぱいに出す（いつでも切り離せる。2026-09-19 PO）。
  // 戻り方は2つ: この帯の「ひとつ前に戻る」／ブラウザの戻る。どちらも前の画面の同じ位置へ戻る
  const back = el('button', { type: 'button', class: 'fp-back', text: '← ひとつ前に戻る' });
  back.addEventListener('click', () => { if (stack.length) backBtn.click(); else go('#/'); });
  // 幅の既定は、辞書の本文と同じ幅（図が大きくなりすぎて本文の文字が小さく見えないように。2026-09-19 PO）。押すと画面の幅まで広げる
  document.body.classList.remove('fp-wide');
  const wide = el('button', { type: 'button', class: 'fp-wide-btn', text: '⟷ 横いっぱいに広げる' });
  wide.addEventListener('click', () => {
    const on = document.body.classList.toggle('fp-wide');
    wide.textContent = on ? '標準の幅に戻す' : '⟷ 横いっぱいに広げる';
  });
  return [
    el('div', { class: 'fp-bar' },
      back,
      el('div', { class: 'fp-title' },
        el('b', { text: 'システム地図' }),
        el('span', { class: 'fp-hint', text: '地図の中のシステム名（点線）を押すと、辞書の項目が開きます' })),
      el('span', { class: 'fp-src', text: `出典：${SM.source}（原本の更新 ${SM.updated}）` }),
      wide,
      link('#/', { class: 'fp-home' }, '辞書のトップへ')),
    frame,
  ];
}

// ---------- AIエージェント利用ガイド ----------
function viewGuide(anchor) {
  const G = DATA.guide;
  const chapters = G.chapters;
  const toc = el('nav', { class: 'gd-toc', 'aria-label': '章のもくじ' },
    el('span', { class: 'gd-toc-h', text: 'もくじ' }),
    ...G.parts.flatMap(pt => [
      el('span', { class: 'gd-toc-p', text: pt.name }),
      ...chapters.filter(c => c.part === pt.id).map(c =>
        link('#/guide/' + c.id, { class: 'gd-toc-a', 'data-ch': c.id },
          el('span', { class: 'gd-toc-n', text: c.no }), el('span', { text: c.title }))),
    ]));

  const secs = chapters.map(c => {
    const body = el('div', { class: 'gd-body' });
    body.innerHTML = c.html;               // 作成時に無害化済みの HTML だけがここに来る
    return el('section', { class: 'gd-sec', id: 'gd-' + c.id },
      el('h2', { class: 'gd-h2' }, el('span', { class: 'gd-n', text: c.no }), el('span', { text: c.title })),
      c.lead ? el('p', { class: 'gd-lead', text: c.lead }) : null,
      body,
      el('a', { class: 'gd-top', href: '#/guide', text: '↑ もくじへ' }));
  });

  const main = el('div', { class: 'gd-main' },
    el('div', { class: 'gd-intro' },
      el('span', { class: 'gd-intro-h', text: G.intro.head }),
      el('ul', { class: 'gd-intro-l' }, ...G.intro.points.map(t => { const li = el('li'); li.innerHTML = t; return li; })),
      el('table', { class: 'gd-t gd-check' }, el('tbody', null,
        ...G.intro.check.map(([q, a]) => el('tr', null, el('td', null, el('b', { text: q })), el('td', { text: a })))))),
    ...secs,
    el('div', { class: 'gd-contact' },
      el('span', { class: 'gd-intro-h', text: G.contact.head }),
      el('table', { class: 'gd-t' }, el('tbody', null,
        ...G.contact.rows.map(([k, v]) => el('tr', null, el('td', { text: k }), el('td', { text: v }))))),
      el('p', { class: 'gd-note', text: G.contact.note })),
    el('p', { class: 'gd-src', text: G.source }));

  // 本文は、この面の中だけを流す（サイドを隠した別ページ。もくじは面の中に留まる）
  const page = el('div', { class: 'gd-page' }, el('div', { class: 'gd-wrap' }, main, toc));

  // 読んでいる章を、もくじで光らせる
  // 位置から選ぶ（面の上から1/3の線を越えた最後の章）。見張りの仕掛けに頼らないので、どの環境でも同じに動く
  let cur = '';
  const mark = () => {
    const base = page.getBoundingClientRect().top;
    const line = base + page.clientHeight / 3;
    let id = chapters[0].id;
    for (const sec of secs) {
      if (sec.getBoundingClientRect().top - line <= 0) id = sec.id.replace('gd-', '');
    }
    if (id === cur) return;
    cur = id;
    for (const a of toc.querySelectorAll('.gd-toc-a')) a.classList.toggle('on', a.dataset.ch === id);
  };
  // 間引きはタイマーで行う（画面が隠れている間も同じ動きになる。描画待ちの仕掛けは止まることがある）
  let tick = 0;
  const onScroll = () => { if (tick) return; tick = setTimeout(() => { tick = 0; mark(); }, 60); };
  page.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  // もくじを押したときは、画面を作り直さずにその章まで流す（作り直すと位置が飛ぶ。2026-09-20 PO）
  const jump = (id, smooth) => {
    const t = document.getElementById('gd-' + id);
    if (!t) return;
    page.scrollTo({ top: t.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' });
    history.replaceState(null, '', '#/guide/' + id);
    setTimeout(mark, smooth ? 400 : 0);
  };
  toc.addEventListener('click', e => {
    const a = e.target.closest('.gd-toc-a');
    if (!a) return;
    e.preventDefault();
    jump(a.dataset.ch, true);
  });
  main.addEventListener('click', e => {
    const a = e.target.closest('.gd-top');
    if (!a) return;
    e.preventDefault();
    page.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', '#/guide');
  });

  const first = setTimeout(() => { if (anchor) jump(anchor, false); else mark(); }, 0);
  viewCleanups.push(() => { clearTimeout(first); if (tick) clearTimeout(tick); removeEventListener('resize', onScroll); });

  const back = el('button', { type: 'button', class: 'fp-back', text: '← ひとつ前に戻る' });
  back.addEventListener('click', () => { if (stack.length) backBtn.click(); else go('#/'); });
  return [
    el('div', { class: 'fp-bar' },
      back,
      el('div', { class: 'fp-title' },
        el('b', { text: G.title }),
        el('span', { class: 'fp-hint', text: G.sub })),
      el('span', { class: 'fp-src', text: `${G.version}・${G.updated} 更新` }),
      link('#/', { class: 'fp-wide-btn', text: '辞書のトップへ' })),
    page,
  ];
}

function viewSoon(kind) {
  const text = kind === 'path'
    ? ['学ぶ順路（準備中）', '初期の教科書（17章・導入手順で学ぶ形）を、この辞書の項目で並べ直します。項目は1か所にだけ書き、順路はその並び方を持つだけにします。']
    : ['AIエージェント利用ガイド（準備中）', '9/22 以降に作ります。できたら、ガイドの各節からこの辞書の項目へ、辞書の項目からガイドの節へ行き来できるようにします。'];
  return [el('h1', { text: text[0] }), el('div', { class: 'empty', text: text[1] })];
}

function viewAbout() {
  const p = t => el('p', { text: t });
  return [
    el('h1', { text: 'この辞書について' }),
    el('h2', { text: '何が入っているか' }),
    el('ul', null,
      el('li', { text: `用語 ${counts.term}：教科書で使っていた用語に、セキュリティと運用の用語を足したもの` }),
      el('li', { text: `知恵 ${counts.wisdom}：社内のナレッジ（全社で使うもの）から自動で作ったもの` }),
      el('li', { text: `システム別の診断 ${counts.system}：状態と教訓まで。直っていない穴の場所は載せません` }),
      el('li', { text: `しくみの全体図：6つの層と4本の柱。用語・知恵・システムを、しくみのどこに当たるかで並べ直したもの` }),
      DATA.sysmap ? el('li', { text: 'システム地図：社内のシステムのデータの流れの図。地図の中のシステム名から辞書の項目へ飛べる' }) : null,
      DATA.ai_pack ? el('li', { text: 'AIエージェントの準備：メンバーの AI エージェントに最初に読ませる、憲章と全社のナレッジの写し（ZIP）' }) : null),
    el('h2', { text: 'どう作っているか' }),
    p('中身は1か所にだけ書き、この辞書は毎回そこから作り直しています。ナレッジを直せば、次に作り直したときに辞書も直ります。'),
    el('pre', { class: 'body', style: 'white-space:pre-wrap', text: META.flow }),
    ...(WEB ? [
      el('h2', { text: '誰が見られるか' }),
      p('許可された会社の Google アカウントでログインした人だけが見られます（範囲は窓口の GAS の設定で決める）。社外の人・個人の Gmail では中身が届きません。'),
      p('画面の枠は公開の場所から届きますが、中身はログインを確かめてから届けています。中身を印刷やファイルにして社外へ渡さないでください。'),
    ] : [
      el('h2', { text: 'このファイルについて' }),
      p('これは開発の確かめ用の1枚版です。配らないでください（社内の人にはポータルの「しくみの辞書」から開いてもらいます）。'),
      p('このファイルは外と通信しません。'),
    ]),
    el('h2', { text: '状態の見方' }), legendBox(),
  ];
}

// ---------- 描画 ----------
function render(fromTyping, restoreY) {
  // 🔴 前の画面が足した浮き見出しやイベントは、新しい画面を作る**前**に片付ける（後にすると作ったばかりのものを消す）
  while (viewCleanups.length) viewCleanups.pop()();
  const h = location.hash || '#/';
  const [, route = '', arg = ''] = h.match(/^#\/([^/]*)\/?(.*)$/) || [];
  let nodes, key = route || 'home';
  if (route === 'q') { const q = decodeURIComponent(arg); if (!fromTyping) qInput.value = q; nodes = viewSearch(q); key = 'search'; }
  else if (route === 'item') nodes = viewItem(decodeURIComponent(arg));
  else if (route === 'term' || route === 'wisdom') nodes = viewList(route, decodeURIComponent(arg));
  else if (route === 'systems') nodes = viewSystems();
  else if (route === 'sysmap') nodes = viewSysmap();
  else if (route === 'arch') {
    const [sub, id] = decodeURIComponent(arg).split('/');
    nodes = sub === 'layer' ? viewArchLayer(id) : sub === 'cross' ? viewArchCross(id) : sub === 'cards' ? viewArchCards() : sub === 'terms' ? viewArchTerms() : viewArch();
  }
  else if (route === 'ai') nodes = viewAi();
  else if (route === 'guide') nodes = DATA.guide ? viewGuide(decodeURIComponent(arg)) : viewSoon('guide');
  else if (route === 'path') nodes = viewSoon(route);
  else if (route === 'about') nodes = viewAbout();
  else { nodes = viewMap(); key = 'home'; }
  if (route !== 'q' && !fromTyping) qInput.value = '';
  if (route === 'item') { const it = byId.get(decodeURIComponent(arg)); key = it ? (it.kind === 'system' ? 'systems' : it.kind) : ''; }
  // 別ページとして出す画面（サイドと検索を隠す）。地図とガイドは読む面が広いほうがよい（2026-09-20 PO）
  document.body.classList.toggle('fullpage', route === 'sysmap' || (route === 'guide' && !!DATA.guide));
  if (route !== 'sysmap') document.body.classList.remove('fp-wide');
  view.replaceChildren(...[nodes].flat());
  view.classList.toggle('wide', key === 'home' || key === 'sysmap' || (route === 'arch' && (!arg || arg === 'cards')));   // 図とカードは横長の画面を使い切る
  if (route === 'item') view.querySelectorAll('.body, .oneline').forEach(n => markTerms(n, decodeURIComponent(arg)));
  if (route === 'arch') view.querySelectorAll('.oneline, .a-why').forEach(n => markTerms(n, null));
  // 利用ガイドでも用語にホバーを付ける（章ごとに数える＝同じ用語は1章に1回だけ印が付く。2026-09-21 PO）
  if (route === 'guide') view.querySelectorAll('.gd-sec').forEach(n => markTerms(n, null));
  renderNav(key);
  if (!fromTyping) scrollTo(0, restoreY || 0);   // 戻ったときは離れたときの位置へ（中身を作り終えてから動かすので、同じ位置に戻る）
  tip.style.display = 'none';
}

currentHash = location.hash || '#/';
render();
}

// ---------- Web 版の入口: ログインを確かめてから中身を受け取り、辞書を始める ----------
// 信頼境界（ここが守りの要）:
//   - この画面の枠（GitHub Pages・公開）には中身を一切置かない。中身は GAS がログインを確かめてから返す
//   - Google から戻ったアドレスの # 以降は誰でも作れる値。この端末で出した合言葉（state）と一致したときだけ使う
//   - 札（アクセストークン）が本物で、見られる会社のアカウントかは、GAS が毎回 Google に問い合わせて確かめる（範囲は GAS の設定）。
//     画面の側でアカウントを判断して開けることはしない（画面の判断は書き換えられるため）
// ログインは同じタブで Google へ移って戻る方式（窓＝ポップアップの方式は、2段階認証から戻ると結果が届かない件があった）
(() => {
  'use strict';
  const CONFIG = {"gasUrl": "https://script.google.com/macros/s/AKfycbxU-1heh_7zIBVvKsSfNdZU_1YKm_AP5Hr5Wpa192KDCB_2Ma84jo5d0YViMy3xZog/exec", "clientId": "1072945615483-74jadmaet56chvhkfh2cpt4ae9dvh140.apps.googleusercontent.com", "redirectUri": "https://acoop-ai.github.io/shikumi-release/"};                 // { gasUrl, clientId, redirectUri }（build.py が web/config.json から差し込む）
  const TOKEN_KEY = 'shikumi_token_v1';          // { t: 札, exp: 期限 }。札は1時間で切れる
  const STATE_KEY = 'shikumi_oauth_state_v1';    // [{ s: 合言葉, t: 出した時刻, h: ログイン前に見ていた画面 }]
  const STATE_MAX_AGE = 10 * 60 * 1000;          // 合言葉は10分・1回限り

  const $ = s => document.querySelector(s);
  const gate = $('#gate'), msg = $('#gate-msg'), btn = $('#gate-login'), busy = $('#gate-busy');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 保存できなくても今回は使える */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* 同上 */ } },
  };

  function showGate(text, isError, buttonLabel) {
    document.body.classList.add('locked');
    gate.hidden = false;
    busy.hidden = true;
    msg.textContent = text;
    msg.classList.toggle('err', !!isError);
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = buttonLabel || 'Google でログイン';
  }
  function showBusy(text) {
    document.body.classList.add('locked');
    gate.hidden = false;
    msg.textContent = text;
    msg.classList.remove('err');
    btn.hidden = true;
    busy.hidden = false;
  }

  function randomState() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  function login() {
    const now = Date.now(), s = randomState();
    const pending = (store.get(STATE_KEY) || []).filter(x => now - x.t < STATE_MAX_AGE).slice(-4);
    pending.push({ s, t: now, h: location.hash || '' });
    store.set(STATE_KEY, pending);
    btn.disabled = true;
    msg.textContent = 'Google のログイン画面へ移ります…';
    const q = new URLSearchParams({
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      response_type: 'token',
      scope: 'openid email',
      include_granted_scopes: 'true',
      // 会社以外のアカウントが自動で選ばれ続けないよう、毎回アカウントを選ばせる
      prompt: 'select_account',
      state: s,
    });
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
  }

  // Google から戻ったときの札を受け取る（boot.js がアドレスから取り出しておいたもの）
  function consumeRedirect() {
    const h = window.__oauthHash;
    window.__oauthHash = null;
    if (!h) return null;
    const p = new URLSearchParams(h.replace(/^#/, ''));
    const now = Date.now();
    const pending = store.get(STATE_KEY) || [];
    const hit = pending.find(x => x.s === p.get('state') && now - x.t < STATE_MAX_AGE);
    const rest = pending.filter(x => x !== hit && now - x.t < STATE_MAX_AGE);
    if (rest.length) store.set(STATE_KEY, rest); else store.del(STATE_KEY);
    if (!hit) return { error: 'ログインを確かめられませんでした（時間がたちすぎたか、別の画面から始めたログインです）。もう一度ログインしてください。' };
    if (p.get('error')) return { error: p.get('error') === 'access_denied' ? 'ログインが取り消されました。' : 'ログインに失敗しました。もう一度お試しください。', back: hit.h };
    const token = p.get('access_token');
    if (!token) return { error: 'ログインに失敗しました。もう一度お試しください。', back: hit.h };
    const sec = Math.max(60, Number(p.get('expires_in')) || 3600);
    store.set(TOKEN_KEY, { t: token, exp: now + (sec - 60) * 1000 });
    return { ok: true, back: hit.h };
  }

  async function load(token) {
    showBusy('中身を読み込んでいます…');
    let res;
    try {
      const r = await fetch(CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // 事前確認（preflight）の要らない送り方
        body: JSON.stringify({ action: 'load', accessToken: token }),
        cache: 'no-store',
        credentials: 'omit',
      });
      res = await r.json();
    } catch (e) {
      showGate('中身を読み込めませんでした。通信の状態を確かめて、もう一度お試しください。', true, 'もう一度読み込む');
      btn.onclick = () => load(token);
      return;
    }
    if (!res || !res.ok) {
      if (res && res.auth) {   // 札が切れた・会社のアカウントでない → 札を捨ててログインから
        store.del(TOKEN_KEY);
        showGate((res && res.error) || 'このアカウントでは見られません。会社のアカウントでログインしてください。', true);
      } else {
        showGate((res && res.error) || '中身を読み込めませんでした。', true, 'もう一度読み込む');
        btn.onclick = () => load(token);
      }
      return;
    }
    document.body.classList.remove('locked');
    gate.hidden = true;
    startDictionary(res.data, { mode: 'web', user: res.email, logout, fetchPack, relogin });
  }

  // AIエージェント用ナレッジパックを受け取る（「AIエージェントの準備」の画面から呼ぶ）。中身と同じく、ログインを確かめてから届く
  async function fetchPack() {
    const tok = store.get(TOKEN_KEY);
    if (!tok || !tok.t || tok.exp <= Date.now()) return { ok: false, auth: true, error: 'ログインの期限が切れました。もう一度ログインしてください。' };
    try {
      const r = await fetch(CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'pack', accessToken: tok.t }),
        cache: 'no-store',
        credentials: 'omit',
      });
      const res = await r.json();
      if (res && res.auth) store.del(TOKEN_KEY);
      return res;
    } catch (e) {
      return { ok: false, error: '受け取れませんでした。通信の状態を確かめて、もう一度お試しください。' };
    }
  }
  // ログインし直す（入り直したら、いま見ている画面に戻る）
  function relogin() { store.del(TOKEN_KEY); login(); }

  function logout() {
    const tok = store.get(TOKEN_KEY);
    store.del(TOKEN_KEY);
    // 札を Google 側でも無効にする（届かなくても、この端末からは消えている）
    if (tok && tok.t) {
      try { fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(tok.t), { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true }); } catch (_) { /* 同上 */ }
    }
    location.replace(location.pathname);
  }

  btn.onclick = login;
  if (!CONFIG.gasUrl) {
    showGate('いま準備中です。公開の準備ができたら、ここからログインできるようになります。', true);
    btn.hidden = true;
    return;
  }
  const back = consumeRedirect();
  if (back && back.back) history.replaceState(null, '', location.pathname + location.search + back.back);   // ログイン前に見ていた画面へ
  if (back && back.error) { showGate(back.error, true); return; }
  const tok = store.get(TOKEN_KEY);
  if (tok && tok.t && tok.exp > Date.now()) load(tok.t);
  else { store.del(TOKEN_KEY); showGate('会社の Google アカウントでログインしてください。'); }
})();
