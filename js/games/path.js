/**
 * ============================================================
 * 小游戏③ 溪流石头桥（第二章 · 路线探索）
 * ------------------------------------------------------------
 * 玩法：小青蛙阿碧要过溪，玩家从近岸开始，一块一块点石头搭桥。
 * 每一排只有一块石头是稳的，点到滑石头它会摇摇晃晃，阿碧会
 * 温柔提醒换一块（失败无惩罚，多试几次一定能过）。
 * 第一次踩滑后，稳石头上会出现小星星提示（鼓励观察）。
 * ============================================================
 */
import * as CH from '../characters.js?v=3';
import { dist, clamp, lerp, pick } from '../util.js';

const ROWS_D = 5, COLS_D = 3;
const FROG_LINES = ['This one is slippery. Thank you for trying again!', 'Oops, this one wobbles. Choose another light.', 'Ribbit… not quite steady. Let’s try a different one!'];
const OWL_LINES = ['That ice is thin. Let’s follow another warm light.', 'A careful step is a brave step. Try the next glow.', 'This way wobbles, but another path is waiting.'];

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const diff = cfg.diff || {};
  const ROWS = diff.rows || ROWS_D, COLS = COLS_D;
  const sink = !!diff.sink, sinkSec = diff.sinkSeconds || 4;
  const winterSkin = !!diff.winter;

  // 随机生成一条安全路线：每排与前一样相邻或相同
  const safe = [1];
  for (let r = 1; r < ROWS; r++) {
    safe[r] = clamp(safe[r - 1] + ((Math.random() * 3) | 0) - 1, 0, COLS - 1);
  }

  let current = 0;                 // 青蛙当前所在排（0 = 近岸）
  let hintRow = -1;                // 提示哪一排的稳石头（第一次踩滑后）
  let wrong = 0, sinkT = 0;        // sinkT：当前稳石已承受的时间
  let tracing = false, lastTraceKey = null; // 冬日章节可按住拖过暖光点，形成一条路线
  const wob = {};                  // 石头摇晃动画 "r,c" -> 剩余时间
  let t = 0, finishAt = 0, finished = false;
  const frog = { x: 0, y: 0, tx: 0, ty: 0, hopT: 0 };
  const ripplesFx = [];             // 落石时的小涟漪

  const rowY = (r) => H() * (0.78 - 0.62 * r / ROWS);       // 均分整个溪面
  const colX = (c) => W() * (0.5 + (c - (COLS - 1) / 2) * 0.22);
  const stoneR = () => Math.min(W(), H()) * 0.075;

  frog.x = frog.tx = W() * 0.5;
  frog.y = frog.ty = H() * 0.88;

  function chooseStone(x, y) {
    if (finished || finishAt) return;
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (dist(x, y, colX(c), rowY(r)) > stoneR()) continue;
        const traceKey = `${r},${c}`;
        if (tracing && traceKey === lastTraceKey) return;
        if (tracing) lastTraceKey = traceKey;
        if (r !== current + 1) {
          if (r > current + 1) {
            api.ui.toast('One step at a time—choose the next light first.', winterSkin ? 'Grandpa Owl' : 'Moss');
            api.audio.sfx.gentle();
          }
          return;
        }
        if (c === safe[r - 1]) {                    // 稳石头！
          current = r; sinkT = 0;
          if (winterSkin) api.progress?.(Math.min(40, r * 10), `Warm light ${r} of ${ROWS} connected`);
          frog.tx = colX(c); frog.ty = rowY(r) - 6; frog.hopT = 0.35;
          api.audio.sfx.hop();
          if (winterSkin) api.audio.sfx.sparkle();
          if (r === ROWS) {                          // 最后一步：跳上对岸
            frog.tx = W() * 0.5; frog.ty = H() * 0.12;
            finishAt = t + 0.9;
          }
        } else {                                     // 滑石头
          wob[r + ',' + c] = 0.6;
          if (hintRow < 0) hintRow = r;
          wrong++;
          api.audio.sfx.gentle();
          api.ui.toast(pick(winterSkin ? OWL_LINES : FROG_LINES), winterSkin ? 'Grandpa Owl' : 'Moss');
        }
        return;
      }
    }
  }

  function pointerDown(x, y) {
    tracing = winterSkin;
    lastTraceKey = null;
    chooseStone(x, y);
  }

  function pointerMove(x, y) {
    if (tracing) chooseStone(x, y);
  }

  function pointerUp() { tracing = false; lastTraceKey = null; }

  function update(dt) {
    t += dt;
    const wasMoving = Math.abs(frog.x - frog.tx) + Math.abs(frog.y - frog.ty) > 4;
    frog.x = lerp(frog.x, frog.tx, Math.min(1, dt * 7));
    frog.y = lerp(frog.y, frog.ty, Math.min(1, dt * 7));
    if (wasMoving && Math.abs(frog.x - frog.tx) + Math.abs(frog.y - frog.ty) <= 4) {
      ripplesFx.push({ x: frog.tx, y: frog.ty + 10, r: 6, a: 0.55 });   // 落石涟漪
    }
    if (frog.hopT > 0) frog.hopT -= dt;
    for (let i = ripplesFx.length - 1; i >= 0; i--) {
      const rp = ripplesFx[i];
      rp.r += 60 * dt; rp.a -= 1.1 * dt;
      if (rp.a <= 0) ripplesFx.splice(i, 1);
    }
    for (const k in wob) { wob[k] -= dt; if (wob[k] <= 0) delete wob[k]; }
    // 下沉挑战：青蛙脚下的稳石会被慢慢压沉
    if (sink && current > 0 && current < ROWS && !finishAt) {
      sinkT += dt;
      if (sinkT > sinkSec) {
        finished = true;
        api.finish({ fail: 'sink', reason: 'The stepping stone sank' });
        return;
      }
    }
    if (finishAt && t >= finishAt && !finished) {
      finished = true;
      api.finish({ bonus: wrong === 0 ? 60 : 0 });
    }
  }

  const cloudSkin = !!diff.cloud;           // 冒险皮肤：踩的是软软的云朵

  function drawStone(ctx, r, c) {
    const x = colX(c), y = rowY(r), rr = stoneR();
    const w = wob[r + ',' + c] || 0;
    // 下沉视觉：青蛙站的石头微微下沉 + 后期颤动警示
    let dy = 0, shake = 0;
    if (sink && r === current && current > 0) {
      const k = Math.min(1, sinkT / sinkSec);
      dy = k * 10;
      shake = k > 0.6 ? Math.sin(t * 30) * 2.5 * k : 0;
    }
    ctx.save();
    ctx.translate(x + shake, y + dy);
    if (w > 0) ctx.rotate(Math.sin(t * 28) * 0.14 * w);
    if (winterSkin) {
      const safeStone = c === safe[r - 1];
      const glowPulse = .68 + Math.sin(t * 2.15 + r * .72 + c * .4) * .08;
      ctx.fillStyle = safeStone ? `rgba(205,180,112,${glowPulse})` : 'rgba(155,183,198,.66)';
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * .55, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = safeStone ? 'rgba(245,220,160,.88)' : 'rgba(215,235,241,.58)';
      ctx.lineWidth = safeStone ? 3.5 : 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * .55, 0, 0, 7); ctx.stroke();
      if (safeStone) {
        const glowSize = rr * (.88 + Math.sin(t * 2.15 + r) * .045);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, glowSize);
        glow.addColorStop(0, `rgba(255,226,151,${.65 + Math.sin(t * 2.15 + r) * .08})`);
        glow.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, glowSize, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(89,119,137,.48)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-rr * .45, -rr * .12); ctx.lineTo(rr * .2, rr * .16); ctx.lineTo(rr * .48, -rr * .08); ctx.stroke();
      }
    } else if (cloudSkin) {
      // 云朵：三团圆弧，蓬松软软的
      ctx.fillStyle = r === current ? '#ffffff' : '#e9eef7';
      ctx.beginPath();
      ctx.arc(-rr * 0.5, -rr * 0.12, rr * 0.5, 0, 7);
      ctx.arc(0, -rr * 0.28, rr * 0.62, 0, 7);
      ctx.arc(rr * 0.52, -rr * 0.1, rr * 0.46, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(0, rr * 0.18, rr * 0.78, rr * 0.22, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(170,190,220,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.5, 0, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    } else {
      // 石头
      ctx.fillStyle = r === current ? '#c9c2b2' : '#b8b2a2';
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.55, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(120,150,110,0.45)';        // 一点点青苔
      ctx.beginPath(); ctx.ellipse(-rr * 0.3, -rr * 0.16, rr * 0.34, rr * 0.18, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(90,80,60,0.35)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.55, 0, 0, 7); ctx.stroke();
    }
    ctx.restore();
    // 当前可跳排的高亮圈
    if (r === current + 1 && !finishAt) {
      const warmTarget = c === safe[r - 1];
      ctx.save();
      ctx.strokeStyle = warmTarget ? 'rgba(255,235,190,.94)' : 'rgba(221,232,235,.26)';
      ctx.lineWidth = warmTarget ? 3.7 + Math.sin(t * 2.4) * .45 : 2;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.ellipse(x, y, rr + 8, rr * 0.55 + 8, 0, 0, 7); ctx.stroke();
      ctx.restore();
    }
    // 提示小星星（踩滑之后出现在稳石头上）
    if (hintRow === r && c === safe[r - 1] && r === current + 1) {
      ctx.save();
      ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 5);
      ctx.fillText('⭐', x, y - rr * 0.8);
      ctx.restore();
    }
  }

  function draw(ctx) {
    // 溪水（夹在两岸之间）
    const top = rowY(ROWS) - stoneR(), bottom = rowY(1) + stoneR();
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, winterSkin ? 'rgba(109,139,154,.52)' : '#a8d8cd');
    g.addColorStop(.5, winterSkin ? 'rgba(50,74,91,.58)' : '#90c8c5');
    g.addColorStop(1, winterSkin ? 'rgba(83,113,132,.5)' : '#7cb6bf');
    ctx.fillStyle = g; ctx.fillRect(0, top, W(), bottom - top);
    if (winterSkin) {
      // 薄冰上的霜纹和冷雾，强调“不安全的蓝冰”与暖光路线的区别。
      ctx.save();
      const frost = ctx.createLinearGradient(0, top, 0, bottom);
      frost.addColorStop(0, 'rgba(225,239,242,.2)'); frost.addColorStop(.5, 'rgba(114,148,168,.08)'); frost.addColorStop(1, 'rgba(232,241,239,.18)');
      ctx.fillStyle = frost; ctx.fillRect(0, top, W(), bottom - top);
      ctx.strokeStyle = 'rgba(220,236,239,.18)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        const x = W() * (.08 + i * .11), y = top + (i % 3 + 1) * (bottom - top) * .21;
        ctx.beginPath(); ctx.moveTo(x - 28, y); ctx.lineTo(x, y + 8); ctx.lineTo(x + 22, y - 5); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = top + 24 + i * (bottom - top - 40) / 5;
      const x = W() * 0.5 + Math.sin(t * 0.7 + i * 1.9) * W() * 0.3;
      const len = W() * 0.14;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
    }
    // 已连起的暖光路线：从近岸到每一个选中的安全点。
    if (winterSkin && current > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(232,202,130,.86)';
      ctx.lineWidth = Math.max(4, stoneR() * .11);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(235,202,125,.7)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(W() * .5, H() * .88);
      for (let r = 1; r <= current; r++) ctx.lineTo(colX(safe[r - 1]), rowY(r));
      ctx.stroke(); ctx.restore();
    }
    // 石头
    for (let r = ROWS; r >= 1; r--) for (let c = 0; c < COLS; c++) drawStone(ctx, r, c);
    // 落石涟漪
    for (const rp of ripplesFx) {
      ctx.strokeStyle = `rgba(255,255,255,${rp.a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.45, 0, 0, 7); ctx.stroke();
    }
    // 冬日章节由小羽亲自走过薄冰；普通关卡仍保留青蛙角色。
    const hop = frog.hopT > 0 ? Math.sin((0.35 - frog.hopT) / 0.35 * Math.PI) * 26 : 0;
    const actorBase = Math.min(W(), H());
    // 冬日路线的行距较紧：限制小羽高度，走到光点后也不遮住下一排。
    const travelerScale = winterSkin ? clamp(actorBase * 0.00095, 0.62, 0.78) : actorBase * 0.0016;
    const idleBob = frog.hopT > 0 ? 0 : Math.sin(t * 2.05) * 1.5;
    CH.draw(ctx, winterSkin ? 'xiaoyu' : 'frog', frog.x, frog.y - hop + idleBob, travelerScale, {
      em: current > 0 && current < ROWS ? 'wow' : 'happy', t,
    });
    // 对岸的引路朋友给路线一个清楚而温暖的目标。
    CH.draw(ctx, winterSkin ? 'owl' : 'frog', W() * (winterSkin ? .82 : .62), H() * (winterSkin ? .2 : .1) + Math.sin(t * 1.55 + 1.2) * 1.3, actorBase * (winterSkin ? 0.0012 : 0.0011), {
      em: 'happy', t, facing: -1,
    });
  }

  return { update, draw, pointerDown, pointerMove, pointerUp,
    debug: () => ({ safe, current, tracing, frog: { x: frog.x, y: frog.y } }) };
}
