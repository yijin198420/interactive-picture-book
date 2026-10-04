/**
 * ============================================================
 * 小游戏① 池塘找朋友（第一章 · 观察配对）
 * ------------------------------------------------------------
 * 玩法：点一位「宝宝」，再点它的「大人」。配对成功会心心相印；
 * 配错了大人会摇摇头，温柔提示再来一次（没有惩罚）。
 * 教育点：每家宝宝都和爸妈不一样，差异是平常事。
 * ============================================================
 */
import * as CH from '../characters.js?v=3';
import { dist, rand, label } from '../util.js';

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const diff = cfg.diff || {};

  // 全部可选家庭（挑战模式按难度抽若干对）
  const allPairs = [
    { baby: { id: 'duckling', label: 'Duckling' }, parent: { id: 'duckMom', label: 'Mama Duck' } },
    { baby: { id: 'frog', label: 'Little Frog' }, parent: { id: 'frogMom', label: 'Mama Frog' } },
    { baby: { id: 'squirrel', label: 'Little Squirrel' }, parent: { id: 'squirrelDad', label: 'Papa Squirrel' } },
    { baby: { id: 'deer', label: 'Fawn' }, parent: { id: 'deerMom', label: 'Mama Deer' } },
    { baby: { id: 'owl', label: 'Little Owl' }, parent: { id: 'owl', label: 'Grandpa Owl' } },
  ];
  const pairs = diff.pairs
    ? allPairs.slice(0, diff.pairs)
    : (cfg.pairs || allPairs.slice(0, 4));

  // 挑战模式：插入「陌生邻居」（干扰项，点了算错）
  const decoys = (diff.decoys || []).map(id =>
    ({ id, label: id === 'swan' ? 'Cloud Traveler' : id === 'owl' ? 'Night-Wind Traveler' : 'Wandering Traveler' }));

  // 大人顺序打乱（含干扰项）
  const order = pairs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (decoys.length) {
    decoys.forEach(d => {
      order.splice(1 + ((Math.random() * order.length) | 0), 0, 'd' + decoys.indexOf(d));
    });
  }
  const parentAt = (j) => {
    const o = order[j];
    return typeof o === 'string' ? { decoy: decoys[+o.slice(1)] } : { pair: pairs[o], pi: o };
  };

  let selected = -1;             // 选中的宝宝下标
  const matched = new Set();     // 已配对的家庭下标
  const wob = new Array(order.length).fill(0);  // 大人摇头动画
  const hearts = [];
  let wrong = 0;
  let t = 0, finishAt = 0, finished = false;

  const nB = pairs.length, nP = order.length;
  const colX = (i, n) => W() * (0.5 + (i - (n - 1) / 2) * (n > 4 ? 0.19 : 0.225));
  const babyX = (i) => colX(i, nB), parentX = (j) => colX(j, nP);
  const babyY = () => H() * 0.82, parentY = () => H() * 0.46;
  const hitR = () => Math.max(52, Math.min(W(), H()) * (nP > 4 ? 0.07 : 0.085));

  function pointerDown(x, y) {
    if (finished) return;
    // 点宝宝
    for (let i = 0; i < nB; i++) {
      if (matched.has(i)) continue;
      if (dist(x, y, babyX(i), babyY() - H() * 0.07) < hitR()) {
        selected = i; api.audio.sfx.tap(); return;
      }
    }
    // 点大人（或干扰项）
    for (let j = 0; j < nP; j++) {
      const at = parentAt(j);
      if (at.pair && matched.has(at.pi)) continue;
      if (dist(x, y, parentX(j), parentY() - H() * 0.09) < hitR()) {
        if (at.decoy) {                          // 陌生邻居：摇头提示
          wob[j] = 0.6; wrong++; api.audio.sfx.gentle();
          api.ui.toast(diff.decoys && diff.decoys.length ? 'This traveler is passing by, not part of this family.' : 'This neighbor lives elsewhere. Who looks like the right grown-up?');
          return;
        }
        if (selected < 0) {
          api.ui.toast('Tap a little one first, then find their grown-up.');
          api.audio.sfx.gentle(); wob[j] = 0.5; return;
        }
        if (selected === at.pi) {                 // 配对成功！
          matched.add(at.pi); selected = -1;
          hearts.push({ x: parentX(j), y: parentY() - H() * 0.16, vy: -46, life: 1.4 });
          api.audio.sfx.match();
          if (matched.size === nB) finishAt = t + 0.9;
        } else {                                  // 温柔地再来一次
          wob[j] = 0.6; wrong++; api.audio.sfx.gentle();
          api.ui.toast('Look again. Which grown-up looks most like them?');
        }
        return;
      }
    }
  }

  function update(dt) {
    t += dt;
    for (let j = 0; j < wob.length; j++) if (wob[j] > 0) wob[j] -= dt;
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i]; h.y += h.vy * dt; h.life -= dt;
      if (h.life <= 0) hearts.splice(i, 1);
    }
    if (finishAt && t >= finishAt && !finished) {
      finished = true;
      api.finish({ bonus: wrong === 0 ? 60 : 0 });   // 零失误奖励（挑战模式计分）
    }
  }

  function draw(ctx) {
    const kP = H() * (nP > 4 ? 0.0018 : 0.0021), kB = H() * 0.0013;
    // 大人们 + 干扰邻居
    for (let j = 0; j < nP; j++) {
      const at = parentAt(j);
      const p = at.decoy || at.pair.parent;
      const wobbling = wob[j] > 0;
      ctx.save();
      if (wobbling) {
        ctx.translate(parentX(j), parentY());
        ctx.rotate(Math.sin(t * 26) * 0.09 * wob[j]);
        ctx.translate(-parentX(j), -parentY());
      }
      const em = at.decoy ? 'calm' : (matched.has(at.pi) ? 'happy' : 'calm');
      CH.draw(ctx, p.id, parentX(j), parentY(), kP * (at.decoy ? 0.9 : 1), { em, t });
      ctx.restore();
      label(ctx, p.label, parentX(j), parentY() + 12);
    }
    // 宝宝们
    pairs.forEach((pair, i) => {
      const b = pair.baby, x = babyX(i), y = babyY();
      CH.draw(ctx, b.id, x, y, kB, { em: matched.has(i) ? 'happy' : (selected === i ? 'wow' : 'calm'), t });
      label(ctx, b.label, x, y + 10);
      if (selected === i && !matched.has(i)) {   // 选中圈
        ctx.save();
        ctx.strokeStyle = '#f7a95c'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.arc(x, y - H() * 0.06, H() * 0.1, 0, 7); ctx.stroke();
        ctx.restore();
      }
      if (matched.has(i)) {                       // 已配对小爱心
        ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('💗', x, y - H() * 0.16 - 6);
      }
    });
    // 飘起的心
    ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
    hearts.forEach(h => {
      ctx.globalAlpha = Math.max(0, h.life / 1.4);
      ctx.fillText('💗', h.x, h.y);
    });
    ctx.globalAlpha = 1;
  }

  return { update, draw, pointerDown, debug: () => ({ order, matched: [...matched], selected }) };
}
