/**
 * ============================================================
 * 小游戏② 橡果回家（第二章 · 拖拽分类）
 * ------------------------------------------------------------
 * 玩法：把橡果拖进左边的树洞（过冬粮食），把落叶拖到右边的
 * 蘑菇小床（当小被子）。放错位置会有温柔提示，物品自己回家，
 * 不扣分、不失败。
 * 教育点：帮助伙伴整理，善意从小事开始。
 * ============================================================
 */
import { clamp, dist, rand } from '../util.js';

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const diff = cfg.diff || {};
  const nEach = diff.items || 5;               // 每类物品数（挑战模式可加）
  const moveAmp = diff.move || 0;              // >0：目标篮子缓慢左右移动
  const LBL = diff.labels || {};
  const sunny = !!diff.sunny;                 // 冒险皮肤：阳光果 / 月光叶配色

  // 生成散落的物品，摆在画面中间
  const items = [];
  const spots = [];
  for (let i = 0; i < nEach * 2; i++) {
    let x, y, ok = false, tries = 0;
    while (!ok && tries++ < 60) {
      x = rand(W() * 0.32, W() * 0.68);
      y = rand(H() * 0.34, H() * 0.6);
      ok = spots.every(s => dist(x, y, s.x, s.y) > Math.min(W(), H()) * (nEach > 5 ? 0.09 : 0.12));
    }
    spots.push({ x, y });
    items.push({ kind: i < nEach ? 'acorn' : 'leaf', x, y, hx: x, hy: y, tx: x, ty: y, done: false, wob: 0, pop: 0 });
  }

  let t = 0, wrong = 0;
  const targets = [
    { id: 'hole', x: () => W() * 0.17 + (moveAmp ? Math.sin(t * 0.7) * moveAmp : 0), y: () => H() * 0.54, accepts: 'acorn', label: LBL.acorn || 'Hollow Pantry' },
    { id: 'mush', x: () => W() * 0.83 + (moveAmp ? Math.sin(t * 0.7 + Math.PI) * moveAmp : 0), y: () => H() * 0.54, accepts: 'leaf', label: LBL.leaf || 'Mushroom Bed' },
  ];
  const targetR = () => Math.min(W(), H()) * 0.16;

  let hold = null, holdOff = { x: 0, y: 0 }, downPos = null;
  let sel = null;                 // 点一下拿起 → 再点目标 也能放（触屏友好）
  let finishAt = 0, finished = false;
  const sparkles = [];

  function overTarget(x, y) {
    return targets.find(g => dist(x, y, g.x(), g.y()) < targetR()) || null;
  }
  function place(item, g) {
    item.done = true;
    item.tx = g.x() + rand(-30, 30);
    item.ty = g.y() + rand(-16, 18);
    item.pop = 0.5;
    api.audio.sfx.ok();
    for (let i = 0; i < 10; i++) sparkles.push({ x: g.x(), y: g.y(), vx: rand(-90, 90), vy: rand(-120, 20), life: rand(0.4, 0.8) });
    if (items.every(it => it.done)) finishAt = t + 0.8;
  }
  function back(item, hint) {
    item.tx = item.hx; item.ty = item.hy; item.wob = 0.5;
    if (hint) { api.ui.toast(hint.msg, hint.who); api.audio.sfx.gentle(); }
  }

  function pointerDown(x, y) {
    if (finished || hold) return;
    downPos = { x, y };
    // 已选中的物品：直接点目标放置
    if (sel) {
      const g = overTarget(x, y);
      if (g) {
        if (g.accepts === sel.kind) place(sel, g);
        else { wrong++; back(sel, wrongHint(sel, g)); }
        sel = null; return;
      }
    }
    // 拿起一件物品（从最上面的开始找）
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.done || hold) continue;
      if (dist(x, y, it.x, it.y) < Math.max(46, Math.min(W(), H()) * 0.06)) {
        hold = it; holdOff.x = x - it.x; holdOff.y = y - it.y;
        sel = null; api.audio.sfx.tap();
        return;
      }
    }
  }
  function pointerMove(x, y) {
    if (!hold) return;
    hold.x = clamp(x - holdOff.x, 30, W() - 30);
    hold.y = clamp(y - holdOff.y, 80, H() - 30);
    hold.tx = hold.x; hold.ty = hold.y;
  }
  function pointerUp(x, y) {
    if (!hold) return;
    const it = hold; hold = null;
    const g = overTarget(x, y);
    if (g) {
      if (g.accepts === it.kind) { place(it, g); return; }
      wrong++; back(it, wrongHint(it, g)); return;
    }
    // 只是轻轻点了一下：进入「已选中」状态，等下一次点目标
    if (downPos && dist(x, y, downPos.x, downPos.y) < 12) {
      sel = it; it.tx = it.x; it.ty = it.y;
      api.ui.toast(LBL.acorn
        ? (it.kind === 'acorn' ? 'You picked up an acorn parcel. Take it to the basket on the left!' : 'You picked up a leaf letter. Put it in the wooden postbox on the right!')
        : (it.kind === 'acorn' ? 'You picked up an acorn. Put it in the hollow!' : 'You picked up a leaf. Put it by the mushroom bed!'));
    } else back(it, null);
  }
  function wrongHint(it, g) {
    if (LBL.acorn) return it.kind === 'acorn'
      ? { who: 'Acorn', msg: 'Acorn parcels belong in the travel basket on the left.' }
      : { who: 'Acorn', msg: 'Leaf letters belong in the wooden postbox on the right.' };
    return it.kind === 'acorn'
      ? { who: 'Acorn', msg: 'Acorns belong in the hollow on the left.' }
      : { who: 'Acorn', msg: 'Leaves belong by the mushroom bed on the right.' };
  }

  function update(dt) {
    t += dt;
    for (const it of items) {
      if (hold === it) continue;
      it.x += (it.tx - it.x) * Math.min(1, dt * 9);
      it.y += (it.ty - it.y) * Math.min(1, dt * 9);
      if (it.wob > 0) it.wob -= dt;
      if (it.pop > 0) it.pop -= dt;
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.life -= dt;
      if (s.life <= 0) sparkles.splice(i, 1);
    }
    if (finishAt && t >= finishAt && !finished) { finished = true; api.finish({ bonus: wrong === 0 ? 60 : 0 }); }
  }

  /* ---- 画面 ---- */
  function drawTree(ctx) {
    const x = targets[0].x(), y = targets[0].y();
    ctx.save();
    ctx.fillStyle = 'rgba(54,47,30,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 44, 66, 14, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#755b37'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - 4, 43, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.strokeStyle = 'rgba(244,219,160,.48)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y - 5, 39, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    const g = ctx.createLinearGradient(x - 50, y - 26, x + 52, y + 48);
    g.addColorStop(0, '#d7ae69'); g.addColorStop(.58, '#b78348'); g.addColorStop(1, '#8a6039');
    ctx.fillStyle = g; ctx.strokeStyle = '#6f5032'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 54, y - 18); ctx.quadraticCurveTo(x - 49, y + 45, x, y + 50);
    ctx.quadraticCurveTo(x + 49, y + 45, x + 54, y - 18);
    ctx.quadraticCurveTo(x, y - 34, x - 54, y - 18); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(91,60,32,.45)'; ctx.lineWidth = 2;
    for (let row = -5; row <= 34; row += 10) {
      ctx.beginPath(); ctx.moveTo(x - 48, y + row); ctx.quadraticCurveTo(x, y + row + 9, x + 48, y + row); ctx.stroke();
    }
    for (let col = -36; col <= 36; col += 18) {
      ctx.beginPath(); ctx.moveTo(x + col, y - 22); ctx.quadraticCurveTo(x + col * .78, y + 18, x + col * .65, y + 44); ctx.stroke();
    }
    ctx.fillStyle = '#f1ddb0'; ctx.strokeStyle = '#8b6d43'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x - 22, y - 7, 44, 25, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#66533b'; ctx.font = '700 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🌰', x, y + 10);
    ctx.restore();
  }
  function drawMushroom(ctx) {
    const x = targets[1].x(), y = targets[1].y();
    ctx.save();
    ctx.fillStyle = 'rgba(54,47,30,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 48, 61, 13, 0, 0, 7); ctx.fill();
    const post = ctx.createLinearGradient(x - 14, 0, x + 18, 0);
    post.addColorStop(0, '#795537'); post.addColorStop(.5, '#b1804f'); post.addColorStop(1, '#68462f');
    ctx.fillStyle = post; ctx.strokeStyle = '#5b422f'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x - 14, y - 2, 28, 52, 5); ctx.fill(); ctx.stroke();
    const box = ctx.createLinearGradient(x - 53, y - 50, x + 54, y + 24);
    box.addColorStop(0, '#b66e4b'); box.addColorStop(.5, '#d79062'); box.addColorStop(1, '#8e563e');
    ctx.fillStyle = box; ctx.strokeStyle = '#684535'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 53, y - 8); ctx.lineTo(x - 53, y - 35);
    ctx.quadraticCurveTo(x - 28, y - 65, x + 4, y - 54);
    ctx.quadraticCurveTo(x + 35, y - 50, x + 53, y - 28);
    ctx.lineTo(x + 53, y + 10); ctx.quadraticCurveTo(x, y + 20, x - 53, y + 10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,55,38,.32)'; ctx.lineWidth = 2;
    [-33,-12,11,32].forEach(dx => { ctx.beginPath(); ctx.moveTo(x + dx, y - 43); ctx.quadraticCurveTo(x + dx + 7, y - 12, x + dx - 2, y + 8); ctx.stroke(); });
    ctx.fillStyle = '#4e3c31'; ctx.beginPath(); ctx.roundRect(x - 27, y - 25, 54, 9, 4); ctx.fill();
    ctx.fillStyle = '#f2dfb5'; ctx.fillRect(x - 19, y - 22, 38, 4);
    ctx.strokeStyle = '#6d4b35'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 39, y - 42); ctx.lineTo(x + 39, y - 75); ctx.stroke();
    ctx.fillStyle = '#6f8a58'; ctx.beginPath(); ctx.moveTo(x + 41, y - 73); ctx.lineTo(x + 65, y - 66); ctx.lineTo(x + 41, y - 56); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawItem(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.wob > 0) ctx.rotate(Math.sin(t * 24) * 0.12 * it.wob);
    const sc = it.pop > 0 ? 1 + it.pop * 0.5 : 1;
    ctx.scale(sc, sc);
    if (it.done) ctx.globalAlpha = 0.9;
    if (it.kind === 'acorn') {
      if (sunny) {                             // 冒险皮肤：阳光果（暖黄小太阳果）
        ctx.fillStyle = '#ffd76e';
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-4, -4, 5, 0, 7); ctx.fill();
        for (let r = 0; r < 6; r++) {
          const a = r / 6 * Math.PI * 2;
          ctx.strokeStyle = '#f2b93c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
          ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#c98b5f';
        ctx.beginPath(); ctx.ellipse(0, 6, 14, 17, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a5a3a';
        ctx.beginPath(); ctx.ellipse(0, -8, 16, 10, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#6a4530'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -26); ctx.stroke();
      }
    } else {
      ctx.fillStyle = sunny ? '#a8ccf0' : '#e8a44f';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(20, -6, 14, 14);
      ctx.quadraticCurveTo(0, 22, -14, 14);
      ctx.quadraticCurveTo(-20, -6, 0, -18);
      ctx.fill();
      ctx.strokeStyle = sunny ? '#7fa8d8' : '#c9773a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 16); ctx.stroke();
    }
    ctx.restore();
    if (sel === it) {                 // 选中提示圈
      ctx.save();
      ctx.strokeStyle = '#f7a95c'; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); ctx.arc(it.x, it.y, 34, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  function draw(ctx) {
    const activeItem = hold || sel;
    if (activeItem) {
      const target = targets.find(g => g.accepts === activeItem.kind);
      const pulse = 1 + Math.sin(t * 4) * .06;
      ctx.save(); ctx.translate(target.x(), target.y()); ctx.scale(pulse, pulse);
      ctx.strokeStyle = 'rgba(238,206,118,.88)'; ctx.lineWidth = 5; ctx.setLineDash([9,8]); ctx.lineDashOffset = -t * 24;
      ctx.beginPath(); ctx.arc(0, 0, targetR() * .72, 0, 7); ctx.stroke(); ctx.restore();
    }
    drawTree(ctx); drawMushroom(ctx);
    // 目标名称
    drawLabel(ctx, LBL.acorn || '🌰 Hollow Pantry', targets[0].x(), targets[0].y() + 82);
    drawLabel(ctx, LBL.leaf || '🍂 Mushroom Bed', targets[1].x(), targets[1].y() + 82);
    items.forEach(it => drawItem(ctx, it));
    // 星星光点
    ctx.fillStyle = '#ffd98c';
    sparkles.forEach(s => {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  function drawLabel(ctx, text, x, y) {
    ctx.font = '800 17px "PingFang SC","Microsoft YaHei",sans-serif';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(255,246,230,0.94)';
    ctx.strokeStyle = '#e0bd8a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 14, y - 16);
    ctx.arcTo(x + w / 2, y - 16, x + w / 2, y + 16, 16);
    ctx.arcTo(x + w / 2, y + 16, x - w / 2, y + 16, 16);
    ctx.arcTo(x - w / 2, y + 16, x - w / 2, y - 16, 16);
    ctx.arcTo(x - w / 2, y - 16, x + w / 2, y - 16, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  return { update, draw, pointerDown, pointerMove, pointerUp,
    debug: () => ({ items: items.map(it => ({ kind: it.kind, x: it.x, y: it.y, done: it.done })),
      targets: targets.map(g => ({ id: g.id, x: g.x(), y: g.y(), accepts: g.accepts })),
      holdIdx: hold ? items.indexOf(hold) : -1, selIdx: sel ? items.indexOf(sel) : -1 }) };
}
