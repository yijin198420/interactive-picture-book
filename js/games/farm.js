/**
 * 第一章原型：农场小帮手
 * 根据环境线索，依次找出三位藏起来的朋友，再把物品拖给正确的朋友。
 * 没有倒计时、死亡或扣分；放错会自动回到原位并给温柔提示。
 */
import * as CH from '../characters.js?v=3';
import { clamp, dist, label } from '../util.js';

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  // 两套藏身位置会在每次游玩时轮换，让重玩时不能只凭记忆点击。
  const hideSets = [
    [
      { x: .14, y: .72 }, { x: .35, y: .58 }, { x: .82, y: .72 },
    ],
    [
      { x: .2, y: .69 }, { x: .76, y: .51 }, { x: .61, y: .74 },
    ],
  ];
  const hideSet = hideSets[Math.random() < .5 ? 0 : 1];
  const friends = [
    {
      id: 'duckling', name: 'Pip the Duckling', need: 'grain',
      clue: 'Look low beside the tall reeds. Find a small friend with an orange beak.',
      nudge: 'The reeds near the shore are rustling.',
      line: 'Pip is hungry and is looking for a little bag of grain.',
    },
    {
      id: 'squirrel', name: 'Acorn the Squirrel', need: 'acorn',
      clue: 'Search the grass by the water. Find the friend with the biggest tail.',
      nudge: 'A bush near the water is moving softly.',
      line: 'Acorn’s acorn rolled into the grass.',
    },
    {
      id: 'frog', name: 'Moss the Frog', need: 'leaf',
      clue: 'Look close to the lily pads. Find two round eyes above the green leaves.',
      nudge: 'Something blinked beside the lily pads.',
      line: 'Moss would like a big leaf to keep off the drizzle.',
    },
  ].map((friend, index) => ({ ...friend, ...hideSet[index] }));

  // 线索顺序也会变化，但始终一次只寻找一位朋友。
  const clueOrder = [0, 1, 2];
  for (let i = clueOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clueOrder[i], clueOrder[j]] = [clueOrder[j], clueOrder[i]];
  }
  const items = [
    { kind: 'leaf', icon: '☘', label: 'Big Leaf', x: .36, y: .84 },
    { kind: 'grain', icon: '🌾', label: 'Grain Bag', x: .5, y: .84 },
    { kind: 'acorn', icon: '🌰', label: 'Acorn', x: .64, y: .84 },
  ].map(it => ({ ...it, hx: it.x, hy: it.y, tx: it.x, ty: it.y, done: false, pop: 0, wob: 0 }));

  const found = new Set();
  const foundAt = new Map();
  let phase = 'find';
  let hold = null, selected = null, down = null;
  let t = 0, finishAt = 0, finished = false;
  let clueIndex = 0, clueStartedAt = 0, cluePauseUntil = 0, misses = 0, hintLevel = 0;
  const sparkles = [];

  const fx = f => W() * f.x;
  const fy = f => H() * f.y;
  const ix = it => W() * it.x;
  const iy = it => H() * it.y;
  const hitR = () => Math.max(46, Math.min(58, Math.min(W(), H()) * .075));

  const activeFriend = () => friends[clueOrder[Math.min(clueIndex, clueOrder.length - 1)]];
  function announceClue() {
    if (phase !== 'find' || clueIndex >= friends.length) return;
    const friend = activeFriend();
    api.ui.gameHint(`Clue ${clueIndex + 1} of 3 · ${friend.clue}`);
  }

  function setPhaseDelivery() {
    phase = 'deliver';
    api.ui.gameHint('Drag each item to the friend who needs it, or tap the item and then the friend');
    api.ui.toast('You found everyone! Now let’s deliver the three items.', 'Feather', 2200);
    api.audio.sfx.chime();
  }

  function friendAt(x, y) {
    return friends.find(f => dist(x, y, fx(f), fy(f) - H() * .075) < hitR()) || null;
  }

  function itemAt(x, y) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.done && dist(x, y, ix(it), iy(it)) < hitR() * .72) return it;
    }
    return null;
  }

  function deliver(it, friend) {
    if (friend.need !== it.kind) {
      it.wob = .55; it.x = it.hx; it.y = it.hy; it.tx = it.hx; it.ty = it.hy;
      const right = friends.find(f => f.need === it.kind);
      api.ui.toast(`${right.name} needs this item. Let’s try again.`, 'Feather', 2200);
      api.audio.sfx.gentle();
      return;
    }
    it.done = true; it.tx = friend.x; it.ty = friend.y - .13; it.pop = .6;
    const helpedCount = items.filter(item => item.done).length;
    const progressTargets = [15, 35, 55];
    api.progress?.(progressTargets[helpedCount - 1], `${friend.name} received the ${it.label}`);
    api.audio.sfx.ok();
    api.ui.toast(`${friend.name} has it now. Thank you for looking so carefully!`, 'Feather', 1800);
    for (let i = 0; i < 14; i++) {
      sparkles.push({ x: fx(friend), y: fy(friend) - H() * .12, a: i / 14 * Math.PI * 2, r: 5, life: .85 });
    }
    if (items.every(x => x.done)) finishAt = t + 1.4;
  }

  function pointerDown(x, y) {
    if (finished) return;
    if (phase === 'find') {
      if (t < cluePauseUntil) return;
      const target = activeFriend();
      const f = friendAt(x, y);
      if (!f) {
        misses++;
        hintLevel = Math.max(hintLevel, misses >= 4 ? 2 : misses >= 2 ? 1 : 0);
        api.ui.toast(misses >= 2 ? target.nudge : 'Look carefully at the place described in the clue.', 'Mama Duck');
        api.audio.sfx.gentle();
        return;
      }
      if (found.has(f.name)) { api.ui.toast(`${f.name} has already shared a clue.`); return; }
      if (f !== target) {
        misses++;
        hintLevel = Math.max(hintLevel, misses >= 4 ? 2 : misses >= 2 ? 1 : 0);
        api.ui.toast(`Good spotting—but this clue leads somewhere else. ${target.nudge}`, 'Mama Duck', 2200);
        api.audio.sfx.gentle();
        return;
      }
      found.add(f.name); foundAt.set(f.name, t);
      api.audio.sfx.chime(); api.ui.toast(f.line, f.name, 2300);
      clueIndex++;
      cluePauseUntil = t + .7;
      if (found.size === friends.length) setTimeout(setPhaseDelivery, 700);
      else {
        setTimeout(() => {
          clueStartedAt = t; misses = 0; hintLevel = 0;
          announceClue();
        }, 720);
      }
      return;
    }
    if (selected) {
      const f = friendAt(x, y);
      if (f) { const it = selected; selected = null; deliver(it, f); return; }
    }
    const it = itemAt(x, y);
    if (!it) return;
    hold = it; selected = null; down = { x, y };
    api.audio.sfx.tap();
  }

  function pointerMove(x, y) {
    if (!hold) return;
    hold.x = clamp(x / W(), .05, .95); hold.y = clamp(y / H(), .12, .93);
    hold.tx = hold.x; hold.ty = hold.y;
  }

  function pointerUp(x, y) {
    if (!hold) return;
    const it = hold; hold = null;
    const f = friendAt(x, y);
    if (f) { deliver(it, f); return; }
    if (down && dist(x, y, down.x, down.y) < 14) {
      selected = it; api.ui.toast(`You picked up the ${it.label}. Now tap a friend to deliver it.`, 'Feather');
      return;
    }
    it.x = it.hx; it.y = it.hy; it.tx = it.hx; it.ty = it.hy;
  }

  function update(dt) {
    t += dt;
    if (phase === 'find' && clueIndex < friends.length && t >= cluePauseUntil) {
      const waited = t - clueStartedAt;
      hintLevel = Math.max(hintLevel, waited > 18 ? 2 : waited > 10 ? 1 : 0);
    }
    for (const it of items) {
      if (hold !== it) {
        it.x += (it.tx - it.x) * Math.min(1, dt * 8);
        it.y += (it.ty - it.y) * Math.min(1, dt * 8);
      }
      if (it.pop > 0) it.pop -= dt;
      if (it.wob > 0) it.wob -= dt;
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      sparkles[i].life -= dt; sparkles[i].r += 35 * dt;
      if (sparkles[i].life <= 0) sparkles.splice(i, 1);
    }
    if (finishAt && t >= finishAt && !finished) {
      finished = true; api.finish({});
    }
  }

  function roundBox(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, r); ctx.fill(); ctx.stroke();
  }

  function drawItem(ctx, it) {
    const x = ix(it), y = iy(it), pulse = selected === it ? 1 + Math.sin(t * 5) * .07 : 1;
    ctx.save(); ctx.translate(x, y);
    if (it.wob > 0) ctx.rotate(Math.sin(t * 28) * .12 * it.wob);
    ctx.scale(pulse + Math.max(0, it.pop) * .35, pulse + Math.max(0, it.pop) * .35);
    ctx.fillStyle = it.done ? 'rgba(42,53,61,.7)' : 'rgba(235,222,190,.94)';
    ctx.strokeStyle = it.done ? 'rgba(190,170,126,.35)' : '#9f8457'; ctx.lineWidth = 2;
    roundBox(ctx, 0, 0, 66, 58, 17);
    ctx.fillStyle = it.done ? '#b8ad93' : '#55462f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 22px "Songti SC",serif'; ctx.fillText(it.icon, 0, -2);
    ctx.restore();
    if (!it.done) label(ctx, it.label, x, y + 44);
  }

  // 把角色下半身融进芦苇、灌木或睡莲；只遮挡画面，不缩小可点击范围。
  function drawHideCover(ctx, friend) {
    const x = fx(friend), y = fy(friend), u = Math.max(24, Math.min(W(), H()) * .047);
    ctx.save();
    ctx.lineCap = 'round';
    if (friend.id === 'duckling') {
      for (let i = -4; i <= 4; i++) {
        const sway = Math.sin(t * .7 + i) * u * .06;
        ctx.strokeStyle = i % 2 ? 'rgba(76,91,55,.92)' : 'rgba(126,112,65,.9)';
        ctx.lineWidth = Math.max(2, u * .065);
        ctx.beginPath(); ctx.moveTo(x + i * u * .18, y + u * .16);
        ctx.quadraticCurveTo(x + i * u * .2 + sway, y - u * .5, x + i * u * .18 + sway, y - u * (1 + (i & 1) * .25));
        ctx.stroke();
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(107,83,48,.78)';
          ctx.beginPath(); ctx.ellipse(x + i * u * .18 + sway, y - u * (1.02 + (i & 1) * .25), u * .07, u * .2, -.15, 0, 7); ctx.fill();
        }
      }
    } else if (friend.id === 'squirrel') {
      ctx.strokeStyle = 'rgba(73,73,47,.82)'; ctx.lineWidth = Math.max(2, u * .07);
      ctx.beginPath(); ctx.moveTo(x - u * .9, y + u * .08); ctx.quadraticCurveTo(x, y - u * .34, x + u * .92, y + u * .04); ctx.stroke();
      const leaves = [[-.78,-.02,-.5],[-.56,-.28,.45],[-.28,-.1,-.2],[-.04,-.4,.2],[.18,-.14,-.4],[.42,-.34,.35],[.68,-.05,-.25],[.84,-.23,.5]];
      leaves.forEach(([dx, dy, angle], index) => {
        ctx.fillStyle = index % 3 === 0 ? 'rgba(116,125,70,.94)' : index % 2 ? 'rgba(73,96,58,.94)' : 'rgba(91,111,65,.94)';
        ctx.beginPath(); ctx.ellipse(x + dx * u, y + dy * u, u * .24, u * .43, angle, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(170,157,95,.28)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + dx * u, y + dy * u); ctx.lineTo(x + dx * u + Math.cos(angle) * u * .23, y + dy * u + Math.sin(angle) * u * .23); ctx.stroke();
      });
    } else {
      const pad = ctx.createRadialGradient(x - u * .25, y - u * .16, u * .08, x, y, u);
      pad.addColorStop(0, 'rgba(145,157,87,.98)');
      pad.addColorStop(1, 'rgba(74,111,65,.98)');
      ctx.fillStyle = pad;
      ctx.beginPath(); ctx.ellipse(x, y - u * .06, u * .95, u * .33, -.05, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(180,166,102,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - u * .06); ctx.lineTo(x + u * .7, y - u * .14); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSearchHint(ctx, friend) {
    if (hintLevel <= 0 || friend !== activeFriend()) return;
    const x = fx(friend), y = fy(friend) - H() * .105;
    const count = hintLevel === 1 ? 2 : 4;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const a = t * .8 + i * 2.1;
      const px = x + Math.cos(a) * (28 + i * 5);
      const py = y + Math.sin(a * 1.3) * (15 + i * 2);
      const alpha = .35 + .45 * (Math.sin(t * 3 + i) * .5 + .5);
      ctx.fillStyle = `rgba(239,216,155,${alpha})`;
      ctx.font = `${hintLevel === 1 ? 13 : 16}px serif`;
      ctx.textAlign = 'center'; ctx.fillText('✦', px, py);
    }
    ctx.restore();
  }

  function draw(ctx) {
    const searchScale = H() * .00135;
    const deliveryScale = H() * .0017;
    friends.forEach((f, i) => {
      const isFound = found.has(f.name);
      const baseScale = phase === 'find' && !isFound ? searchScale : deliveryScale;
      const speciesScale = f.id === 'duckling' ? .8 : f.id === 'frog' ? .92 : 1;
      const bob = phase === 'find' && !isFound ? Math.sin(t * 1.7 + i * 1.9) * 2 : 0;
      CH.draw(ctx, f.id, fx(f), fy(f) + bob, baseScale * speciesScale, {
        t, em: isFound ? 'happy' : 'calm', facing: f.x > .66 ? -1 : 1,
      });
      if (phase === 'find' && !isFound) {
        drawHideCover(ctx, f);
        drawSearchHint(ctx, f);
      } else {
        label(ctx, f.name, fx(f), fy(f) + 14, { size: phase === 'find' ? 12 : 14 });
      }
      if (phase === 'find' && isFound) {
        ctx.fillStyle = '#d6c083'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', fx(f), fy(f) - H() * .17);
      }
    });

    if (phase === 'deliver') {
      if (selected) {
        const f = friends.find(x => x.need === selected.kind);
        ctx.save(); ctx.strokeStyle = 'rgba(222,193,128,.58)'; ctx.lineWidth = 3; ctx.setLineDash([9, 9]); ctx.lineDashOffset = -t * 28;
        ctx.beginPath(); ctx.moveTo(ix(selected), iy(selected)); ctx.quadraticCurveTo(W() * .5, H() * .45, fx(f), fy(f) - H() * .08); ctx.stroke(); ctx.restore();
      }
      items.forEach(it => drawItem(ctx, it));
    }

    const progress = phase === 'find'
      ? `Clue ${Math.min(clueIndex + 1, 3)} / 3   ·   Friends Found ${found.size} / ${friends.length}`
      : `Items Delivered  ${items.filter(x => x.done).length} / ${items.length}`;
    ctx.save(); ctx.font = '600 16px "PingFang SC",sans-serif';
    const w = Math.max(190, ctx.measureText(progress).width + 34), x = W() / 2, y = H() * .22;
    ctx.fillStyle = 'rgba(17,26,36,.88)'; ctx.strokeStyle = 'rgba(200,177,128,.38)'; ctx.lineWidth = 1.5;
    roundBox(ctx, x, y, w, 40, 12); ctx.fillStyle = '#e6dcc6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(progress, x, y + 1); ctx.restore();

    sparkles.forEach(s => {
      ctx.globalAlpha = Math.max(0, s.life / .85); ctx.strokeStyle = '#d9bd79'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x + Math.cos(s.a) * s.r, s.y + Math.sin(s.a) * s.r, 3, 0, 7); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  announceClue();

  return { update, draw, pointerDown, pointerMove, pointerUp,
    debug: () => ({
      phase, clueIndex, clueOrder, current: phase === 'find' && clueIndex < friends.length ? activeFriend().name : null,
      misses, hintLevel, found: [...found],
      friends: friends.map(friend => ({ name: friend.name, x: friend.x, y: friend.y, found: found.has(friend.name) })),
      items: items.map(x => ({ kind: x.kind, done: x.done })),
    }) };
}
