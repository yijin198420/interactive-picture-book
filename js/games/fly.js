/**
 * ============================================================
 * 小游戏⑥ 湖面试飞（第四章 · 飞行动作）
 * ------------------------------------------------------------
 * 玩法：点按画面（或空格）扇翅膀，穿过暖风圈就能借力上升，
 * 收集 5 个风圈后天鹅群会来迎接。碰 到湖面只会轻轻擦出
 * 水花，绝不会坠落失败——重点是勇敢尝试的体验。
 * ============================================================
 */
import * as CH from '../characters.js?v=3';
import { clamp, lerp, rand, dist } from '../util.js';

const NEED = 5;

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const diff = cfg.diff || {};
  const NEEDv = diff.need || NEED;
  const ringSpeed = diff.speed || 1;             // 挑战模式：风圈更快
  const stormN = diff.clouds || 0;               // 挑战模式：乌云障碍（撞到即失败）
  let splashed = false;

  const player = { y: H() * 0.55, vy: 0, wing: 0 };
  const px = () => W() * 0.3;
  const waterY = () => H() * 0.8;

  let phase = 'fly';                // fly / join
  let t = 0, got = 0, spawnT = 0.4, joinT = 0, splashT = 0, finished = false;
  const rings = [], sparkles = [], clouds = [];
  const petals = [];                // 春天的花瓣随风飘过（速度感）
  for (let i = 0; i < 6; i++) {
    clouds.push({ x: rand(0, W()), y: rand(H() * 0.06, H() * 0.4), s: rand(0.5, 1.3), v: rand(8, 26) });
  }
  for (let i = 0; i < 7; i++) {
    petals.push({ x: rand(0, W()), y: rand(0, H() * 0.7), v: rand(20, 42), a: rand(0, 7), va: rand(-2, 2), c: ['#f7c6d4', '#fde2ea', '#fff2f6'][(Math.random() * 3) | 0] });
  }
  const swans = [0, 1, 2].map(i => ({ x: W() + 160 + i * 130, y: H() * 0.35 + rand(-30, 30) }));
  const storms = [];
  for (let i = 0; i < stormN; i++) {
    storms.push({ x: W() + 200 + i * rand(300, 480), y: rand(H() * 0.14, H() * 0.66),
                  r: Math.min(W(), H()) * 0.11, v: rand(0.36, 0.5), seed: rand(0, 9) });
  }

  function flap() {
    if (phase !== 'fly' || finished) return;
    player.vy = -H() * 0.6;
    player.wing = 1;
    api.audio.sfx.flap();
  }

  function pointerDown() { flap(); }

  function update(dt) {
    t += dt;
    for (const c of clouds) {
      c.x -= (c.v + (phase === 'join' ? 120 : 40)) * dt;
      if (c.x < -120) { c.x = W() + 120; c.y = rand(H() * 0.06, H() * 0.4); }
    }
    for (const p of petals) {                    // 花瓣向左飘，带出飞行速度感
      p.x -= (p.v + 60) * dt; p.y += Math.sin(t * 2 + p.a) * 20 * dt; p.a += p.va * dt;
      if (p.x < -20) { p.x = W() + 20; p.y = rand(0, H() * 0.7); }
    }

    if (phase === 'fly') {
      // 温和的物理：重力 + 扇翅冲量，湖面托底
      player.vy += H() * 0.85 * dt;
      player.y += player.vy * dt;
      if (player.y > waterY() - 34) {
        player.y = waterY() - 34; player.vy = Math.min(player.vy, 0);
        if (t - splashT > 0.5) {
          splashT = t; splashed = true; api.audio.sfx.splash();
          for (let i = 0; i < 6; i++) sparkles.push({ x: px() + rand(-16, 16), y: waterY(), vx: rand(-60, 60), vy: rand(-200, -60), life: rand(0.3, 0.6) });
        }
      }
      if (player.y < 60) { player.y = 60; player.vy = Math.max(player.vy, 0); }
      player.wing = Math.max(0, player.wing - dt * 3.2);

      // 乌云障碍：撞上即本关失败（挑战模式）
      for (const st of storms) {
        st.x -= W() * st.v * dt;
        st.y += Math.sin(t * 1.1 + st.seed) * 26 * dt;
        if (st.x < -160) { st.x = W() + rand(160, 420); st.y = rand(H() * 0.14, H() * 0.66); }
        if (!finished && dist(px(), player.y, st.x, st.y) < st.r * 0.82) {
          finished = true;
          api.audio.sfx.gentle();
          api.finish({ fail: 'cloud', reason: 'A rain cloud blocked the way' });
          return;
        }
      }

      // 暖风圈
      spawnT -= dt;
      if (spawnT <= 0 && got + rings.length < NEEDv + 2) {
        spawnT = rand(1.3, 1.8) / ringSpeed;
        rings.push({ x: W() + 80, y: rand(H() * 0.2, H() * 0.62), r: Math.min(W(), H()) * 0.085, counted: false });
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        rg.x -= W() * 0.32 * ringSpeed * dt;
        if (!rg.counted && rg.x < px()) {
          rg.counted = true;
          if (Math.abs(player.y - rg.y) < rg.r * 1.3) {      // 穿过风圈！
            got++; player.vy -= H() * 0.32; player.wing = 1;
            api.audio.sfx.star();
            for (let k = 0; k < 12; k++) sparkles.push({ x: rg.x, y: rg.y, vx: rand(-120, 120), vy: rand(-120, 120), life: rand(0.4, 0.8) });
            if (got >= NEEDv) { phase = 'join'; joinT = 0; api.audio.sfx.chime(); }
          }
        }
        if (rg.x < -100) rings.splice(i, 1);
      }
    } else if (phase === 'join') {
      // 天鹅群飞来，小羽加入编队
      joinT += dt;
      player.vy = lerp(player.vy, 0, dt * 2);
      player.y = lerp(player.y, H() * 0.34, dt * 1.6);
      swans.forEach((s, i) => { s.x = lerp(s.x, px() + 150 + i * 120, dt * 1.8); s.y = lerp(s.y, H() * 0.34 + (i - 1) * 46, dt * 1.5); });
      if (joinT > 2.6 && !finished) { finished = true; api.finish({ bonus: !splashed ? 60 : 0 }); }
    }

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt; s.life -= dt;
      if (s.life <= 0) sparkles.splice(i, 1);
    }
  }

  function draw(ctx) {
    const Wv = W(), Hv = H();
    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, Hv);
    g.addColorStop(0, '#bfe0f2'); g.addColorStop(0.7, '#e8f4f0'); g.addColorStop(1, '#fff2dd');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wv, Hv);
    // 太阳
    const sg = ctx.createRadialGradient(Wv * 0.82, Hv * 0.16, 10, Wv * 0.82, Hv * 0.16, 130);
    sg.addColorStop(0, 'rgba(255,220,150,0.8)'); sg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = sg; ctx.fillRect(Wv * 0.82 - 130, Hv * 0.16 - 130, 260, 260);
    // 云
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const c of clouds) {
      [[0, 0, 30], [24, 6, 22], [-24, 6, 20]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(c.x + dx * c.s, c.y + dy * c.s, r * c.s, 0, 7); ctx.fill();
      });
    }
    // 远山与春湖
    ctx.fillStyle = '#a8cfa0';
    ctx.beginPath(); ctx.moveTo(0, waterY());
    for (let x = 0; x <= Wv; x += Wv / 6) ctx.quadraticCurveTo(x + Wv / 12, waterY() - 40 - 20 * Math.sin(x), x + Wv / 6, waterY());
    ctx.lineTo(Wv, waterY()); ctx.closePath(); ctx.fill();
    const wg = ctx.createLinearGradient(0, waterY(), 0, Hv);
    wg.addColorStop(0, '#a8ddd0'); wg.addColorStop(1, '#6ca6b8');
    ctx.fillStyle = wg; ctx.fillRect(0, waterY(), Wv, Hv - waterY());
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = waterY() + 16 + i * (Hv - waterY()) * 0.14;
      const x = Wv * 0.5 + Math.sin(t * 0.6 + i * 1.7) * Wv * 0.3;
      const len = Wv * 0.15;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
    }
    // 暖风圈
    for (const rg of rings) {
      const gg = ctx.createRadialGradient(rg.x, rg.y, rg.r * 0.3, rg.x, rg.y, rg.r * 1.6);
      gg.addColorStop(0, 'rgba(255,214,140,0.5)'); gg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r * 1.6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffca7a'; ctx.lineWidth = 8;
      ctx.setLineDash([18, 12]); ctx.lineDashOffset = t * 40;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 乌云障碍（挑战模式）：灰云团 + 小雨丝
    for (const st of storms) {
      const wob = Math.sin(t * 2 + st.seed) * 4;
      ctx.fillStyle = '#8a93a8';
      [[0, 0, 1], [0.7, 0.2, 0.72], [-0.7, 0.22, 0.66], [0.3, -0.3, 0.6]].forEach(([dx, dy, k]) => {
        ctx.beginPath();
        ctx.arc(st.x + dx * st.r + wob, st.y + dy * st.r, st.r * 0.62 * k, 0, 7);
        ctx.fill();
      });
      ctx.fillStyle = '#77809a';
      ctx.beginPath(); ctx.ellipse(st.x + wob, st.y + st.r * 0.45, st.r * 0.9, st.r * 0.3, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(190,205,225,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const rx = st.x + i * st.r * 0.45 + wob, ry = st.y + st.r * 0.6 + ((t * 90 + i * 30) % 26);
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 10); ctx.stroke();
      }
    }
    // 天鹅群
    swans.forEach((s, i) => {
      CH.draw(ctx, 'swan', s.x, s.y + Math.sin(t * 2 + i) * 5, Hv * 0.0013, { em: 'happy', t, facing: 1 });
    });
    // 飘落的花瓣（春天的空气感）
    for (const p of petals) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.8, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    // 小羽在湖面的柔和投影（高度感）
    const shadowA = Math.max(0.06, 0.22 - (waterY() - player.y) / Hv * 0.4);
    ctx.fillStyle = `rgba(60,90,110,${shadowA})`;
    ctx.beginPath();
    ctx.ellipse(px(), waterY() + 8, 34, 8, 0, 0, 7);
    ctx.fill();
    // 小羽（飞行姿态：随速度微微抬头/俯身，翅膀扇动）
    const tilt = clamp(player.vy / (Hv * 1.2), -0.35, 0.3);
    ctx.save();
    ctx.translate(px(), player.y + Math.sin(t * 3) * 2);
    ctx.rotate(tilt + player.wing * 0.06);   // 扇翅时轻微起伏（立绘模式下保留动感）
    CH.draw(ctx, 'xiaoyu', 0, 0, Hv * 0.0017, { em: got >= NEED ? 'happy' : 'wow', t, wing: player.wing, facing: 1 });
    ctx.restore();
    // 星光
    ctx.fillStyle = '#ffd98c';
    sparkles.forEach(s => {
      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // 计数
    ctx.font = '800 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = Wv / 2, cy = 44;
    const txt = `🌬️ Warm-Wind Rings ${got} / ${NEED}`;
    const tw = ctx.measureText(txt).width + 36;
    ctx.fillStyle = 'rgba(255,246,230,0.94)'; ctx.strokeStyle = '#e0bd8a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2 + 18, cy - 22);
    ctx.arcTo(cx + tw / 2, cy - 22, cx + tw / 2, cy + 22, 22);
    ctx.arcTo(cx + tw / 2, cy + 22, cx - tw / 2, cy + 22, 22);
    ctx.arcTo(cx - tw / 2, cy + 22, cx - tw / 2, cy - 22, 22);
    ctx.arcTo(cx - tw / 2, cy - 22, cx + tw / 2, cy - 22, 22);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3222';
    ctx.fillText(txt, cx, cy + 1);
  }

  return { update, draw, pointerDown, key: flap,
    debug: () => ({ got, phase, py: player.y, rings: rings.map(r => ({ x: r.x, y: r.y, counted: r.counted })) }) };
}
