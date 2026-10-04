/**
 * ============================================================
 * 小游戏⑤ 温暖的记忆（第三章 · 节奏收集）
 * ------------------------------------------------------------
 * 玩法：发光的记忆羽毛慢慢飘向光圈，在羽毛进入光圈时点一下，
 * 就能接住一句朋友的鼓励（配木琴音）。接不住也没关系，羽毛会
 * 再飘来一次——没有倒计时、没有失败。
 * 教育点：难过的时候，回想朋友的鼓励，主动给自己打气。
 * ============================================================
 */
import { rand, clamp } from '../util.js';
import * as CH from '../characters.js?v=3';

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const memories = cfg.memories || [];
  const diff = cfg.diff || {};
  const need = diff.need || cfg.need || memories.length || 6;
  const speed = diff.speed || 1;                 // 挑战模式：下落提速
  const onMiss = diff.onMiss;                    // 挑战模式：飘走时扣沙漏
  let missed = 0;

  const ring = { x: 0, y: 0, r: 0 };
  function layout() {
    ring.x = W() * 0.5; ring.y = H() * 0.6;
    ring.r = Math.min(W(), H()) * 0.13;
  }
  layout();

  let phase = 'fall';              // fall / caught / gap
  let caught = 0, t = 0, phaseUntil = 0, warnT = 0, trailT = 0;
  const f = { x: 0, y: 0, vy: 0, seed: 0 };
  const sparkles = [];
  const trail = [];                // 记忆羽毛飘落时的微光拖尾

  function spawn() {
    layout();
    f.x = W() * 0.5 + rand(-1, 1) * W() * 0.16;
    f.y = -60; f.vy = H() * 0.135 * speed;      // 挑战模式会提速
    f.seed = rand(0, 10);
    phase = 'fall';
  }
  spawn();

  function burst(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      sparkles.push({ x, y, vx: rand(-140, 140), vy: rand(-170, 30), life: rand(0.5, 1) });
    }
  }

  function pointerDown() {
    if (phase !== 'fall' || !f) return;
    const dx = Math.abs(f.x - ring.x), dy = Math.abs(f.y - ring.y);
    if (dy < ring.r * 1.15 && dx < ring.r * 2.2) {
      // 接住！响起一句温暖的回忆
      const mem = memories[caught % memories.length];
      caught++;
      phase = 'caught'; phaseUntil = t + 4.0;
      api.audio.sfx.chime();
      api.ui.toast(mem[1], mem[0], 3900, { voiceId: mem[2] });
      burst(f.x, f.y);
      if (caught >= need) { /* 等气泡读完再结束 */ }
    } else if (t - warnT > 3) {
      warnT = t;
      api.ui.toast('Wait until the feather floats into the ring, then tap.');
    }
  }

  function update(dt) {
    t += dt;
    if (phase === 'fall') {
      f.y += f.vy * dt;
      f.x += Math.sin(t * 1.4 + f.seed) * 14 * dt;
      trailT += dt;
      if (trailT > 0.22) {                       // 一路撒下点点微光
        trailT = 0;
        trail.push({ x: f.x + rand(-6, 6), y: f.y - 10, life: 0.7 });
      }
      if (f.y > H() + 60) {                     // 飘过了：剧情模式不惩罚；挑战模式扣沙漏
        phase = 'gap'; phaseUntil = t + 0.5;
        if (diff.onMiss) { missed++; onMiss(); }
        else if (t - warnT > 3) { warnT = t; api.ui.toast('That is okay—the feather will float back again.'); }
      }
    } else if (phase === 'caught' || phase === 'gap') {
      if (t >= phaseUntil) {
        if (caught >= need) { api.finish({ bonus: missed === 0 ? 60 : 0 }); return; }
        spawn();
      }
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= dt;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 150 * dt; s.life -= dt;
      if (s.life <= 0) sparkles.splice(i, 1);
    }
  }

  function drawFeather(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 68);
    glow.addColorStop(0, 'rgba(255,236,180,0.85)'); glow.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 68, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 30); ctx.stroke();
    ctx.fillStyle = '#fdf8ea';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(20, -8, 3, 30);
    ctx.quadraticCurveTo(-19, -8, 0, -26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,185,150,0.7)'; ctx.lineWidth = 1.4;
    for (const yy of [-14, -2, 10, 20]) {
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(9 - Math.abs(yy) * 0.25, yy + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(-9 + Math.abs(yy) * 0.25, yy + 5); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx) {
    layout();
    // 风的丝带：让“听风找节奏”在画面中也可见。
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const yy = H() * (0.2 + i * 0.105);
      const drift = Math.sin(t * 0.8 + i * 1.3) * W() * 0.035;
      ctx.strokeStyle = `rgba(224,235,219,${0.12 + i * 0.025})`;
      ctx.lineWidth = 2 + i * .45;
      ctx.beginPath();
      ctx.moveTo(-40, yy);
      ctx.bezierCurveTo(W() * .24 + drift, yy - 34, W() * .58 - drift, yy + 30, W() + 45, yy - 8);
      ctx.stroke();
    }
    ctx.restore();

    // 光圈
    const pulse = 1 + 0.05 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(ring.x, ring.y, ring.r * 0.2, ring.x, ring.y, ring.r * 1.9);
    g.addColorStop(0, 'rgba(255,230,170,0.5)'); g.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r * 1.9, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,140,0.95)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r * pulse, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 26;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r * pulse * 0.7, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    // 波纹从目标圈向外舒展开，给点击时机提供第二种视觉线索。
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const p = (t * .42 + i / 3) % 1;
      ctx.globalAlpha = (1 - p) * .34;
      ctx.strokeStyle = '#f3ddb1'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.r * (.72 + p * .72), ring.r * (.24 + p * .22), 0, 0, 7);
      ctx.stroke();
    }
    ctx.restore();
    // 记忆羽毛 + 微光拖尾
    if (phase === 'fall') {
      trail.forEach(s => {
        ctx.globalAlpha = Math.max(0, s.life / 0.7) * 0.7;
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath(); ctx.arc(s.x, s.y, 3.2, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      drawFeather(ctx, f.x, f.y, Math.sin(t * 1.4 + f.seed) * 0.25);
    }
    // 进度：小羽毛点
    const total = need, startX = W() * 0.5 - (total - 1) * 18;
    for (let i = 0; i < total; i++) {
      const x = startX + i * 36, y = H() * 0.14;
      ctx.save();
      if (i < caught) { ctx.fillStyle = '#f7b267'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪶', x, y + 7); }
      else {
        ctx.strokeStyle = 'rgba(255,246,230,0.85)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(x, y, 8, 12, 0.3, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
    // 星星
    ctx.fillStyle = '#ffe9b0';
    sparkles.forEach(s => {
      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 两侧芦苇与等待时机的小羽，让小游戏不再像悬空的测试界面。
    ctx.save();
    ctx.strokeStyle = 'rgba(111,126,77,.78)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const side = i < 5 ? 1 : -1;
      const x = side > 0 ? W() * (.04 + i * .026) : W() * (.96 - (i - 5) * .032);
      const sway = Math.sin(t * 1.2 + i) * 11;
      ctx.beginPath(); ctx.moveTo(x, H()); ctx.quadraticCurveTo(x + sway * .4, H() * .8, x + sway, H() * .64); ctx.stroke();
      if (i % 2 === 0) {
        ctx.save(); ctx.translate(x + sway, H() * .64); ctx.rotate(-.18 + sway * .005);
        ctx.fillStyle = 'rgba(126,83,51,.82)';
        ctx.beginPath(); ctx.ellipse(0, -9, 5, 15, 0, 0, 7); ctx.fill(); ctx.restore();
      }
    }
    ctx.restore();
    CH.draw(ctx, 'xiaoyu', W() * .16, H() * .82, H() * .00155, {
      em: phase === 'caught' ? 'happy' : 'calm', t, facing: 1,
    });
  }

  return { update, draw, pointerDown, debug: () => ({ caught, phase, f: { x: f.x, y: f.y }, ring: { y: ring.y, r: ring.r } }) };
}
