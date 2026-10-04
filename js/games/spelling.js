/**
 * 第二章 · 黑羽单词拼写
 * 看图、听词，再按顺序点击黑色羽毛字母。错误不扣分，只温柔提示。
 */
import * as CH from '../characters.js?v=3';

const WORDS = [
  { word: 'WIND', icon: '💨', clue: 'moving air', order: ['D', 'W', 'S', 'I', 'N'], voice: 'en-v2/c2_word_wind', voiceSeconds: 4.224 },
  {
    word: 'LAKE', icon: '💧', clue: 'water between the hills', order: ['K', 'T', 'L', 'E', 'A'],
    voice: 'en-v2/c2_word_lake_v3', voiceSeconds: 8.136,
    spoken: 'Lake. Letter L. Letter A. Letter K. Letter E. The word is Lake.',
  },
  { word: 'NEST', icon: '🪺', clue: 'a safe place for an egg', order: ['E', 'N', 'A', 'T', 'S'], voice: 'en-v2/c2_word_nest', voiceSeconds: 4.080 },
  { word: 'HOME', icon: '🏡', clue: 'a place where love waits', order: ['M', 'R', 'H', 'E', 'O'], voice: 'en-v2/c2_word_home', voiceSeconds: 4.056 },
];

const TRY_LINES = [
  next => `A thoughtful try. The next letter is ${next}.`,
  next => `Almost! Find the black feather with ${next}.`,
  next => `Keep going one letter at a time. Look for ${next}.`,
];

function rounded(ctx, x, y, w, h, r = 16) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBlackFeather(ctx, x, y, size, angle = 0, glow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = `rgba(218,188,122,${.18 + glow * .35})`;
  ctx.shadowBlur = 10 + glow * 14;
  const grad = ctx.createLinearGradient(-size * .35, -size * .55, size * .34, size * .54);
  grad.addColorStop(0, '#505262');
  grad.addColorStop(.38, '#252933');
  grad.addColorStop(1, '#0e141c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -size * .58);
  ctx.bezierCurveTo(size * .42, -size * .34, size * .38, size * .18, 0, size * .48);
  ctx.bezierCurveTo(-size * .28, size * .12, -size * .42, -size * .28, 0, -size * .58);
  ctx.fill();
  ctx.strokeStyle = 'rgba(159,165,181,.58)';
  ctx.lineWidth = Math.max(1, size * .025);
  ctx.beginPath(); ctx.moveTo(0, -size * .48); ctx.lineTo(0, size * .63); ctx.stroke();
  ctx.strokeStyle = 'rgba(123,130,148,.38)';
  for (let i = 0; i < 5; i++) {
    const yy = -size * .34 + i * size * .15;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(size * (.27 - i * .025), yy - size * .12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yy + size * .035); ctx.lineTo(-size * (.25 - i * .02), yy - size * .075); ctx.stroke();
  }
  ctx.restore();
}

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const previewWord = location.search.includes('preview=')
    ? new URLSearchParams(location.search).get('spellingWord')?.toUpperCase()
    : null;
  const previewIndex = WORDS.findIndex(item => item.word === previewWord);
  let wordIndex = previewIndex >= 0 ? previewIndex : 0;
  let entered = [];
  let used = new Set();
  let mistakes = 0;
  let t = 0;
  let wordDoneAt = 0;
  let finishAt = 0;
  let finished = false;
  let hintUntil = 0;
  let wrongTile = -1;
  let wrongUntil = 0;
  const particles = [];

  const current = () => WORDS[wordIndex];

  function layout() {
    const compact = H() < 560;
    const panelW = Math.min(W() - 28, 760);
    const panelH = compact ? 184 : Math.min(260, H() * .31);
    const panel = {
      x: (W() - panelW) / 2,
      y: compact ? 116 : Math.max(142, H() * .18),
      w: panelW,
      h: panelH,
    };
    const tileGap = Math.max(7, Math.min(14, W() * .016));
    const tileSize = Math.min(compact ? 66 : 82, (W() - 30 - tileGap * 4) / 5);
    const tileW = tileSize * 5 + tileGap * 4;
    const tileY = Math.min(H() - tileSize - (compact ? 18 : 48), panel.y + panel.h + (compact ? 18 : 38));
    const tiles = current().order.map((letter, index) => ({
      letter,
      index,
      x: (W() - tileW) / 2 + index * (tileSize + tileGap),
      y: tileY,
      w: tileSize,
      h: tileSize,
    }));
    return {
      compact, panel, tiles, tileSize,
      hear: { x: panel.x + panel.w - (compact ? 126 : 145), y: panel.y + 17, w: compact ? 108 : 126, h: 38 },
    };
  }

  function contains(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function spokenWord(item = current()) {
    return item.spoken || `${item.word}. ${item.word.split('').join(', ')}. ${item.word}.`;
  }

  function hearWord() {
    const item = current();
    // 已经拼完时再次点击 Hear Word，也要从头留足完整播放时间。
    // 否则旧的切题倒计时会在重播中途跳到下一题。
    if (wordDoneAt) wordDoneAt = t + item.voiceSeconds + .6;
    api.ui.speakGameLine(spokenWord(item), item.voice);
  }

  function beginWord() {
    entered = [];
    used = new Set();
    wordDoneAt = 0;
    hintUntil = t + 1.8;
    wrongTile = -1;
    api.ui.gameHint(`Spell ${current().word} · Tap the black-feather letters in order`);
    api.ui.toast(`${current().icon} Listen, then spell ${current().word}.`, 'Feather', 2200);
    hearWord();
  }

  function burst(x, y) {
    for (let i = 0; i < 14; i++) {
      particles.push({ x, y, a: i / 14 * Math.PI * 2, r: 3, life: .8 });
    }
  }

  function chooseTile(tile) {
    if (finished || finishAt || wordDoneAt || used.has(tile.index)) return;
    const expected = current().word[entered.length];
    if (tile.letter !== expected) {
      mistakes++;
      wrongTile = tile.index;
      wrongUntil = t + .58;
      hintUntil = t + 2.8;
      api.audio.sfx.gentle();
      api.ui.toast(TRY_LINES[mistakes % TRY_LINES.length](expected), 'Feather', 2100);
      return;
    }

    used.add(tile.index);
    entered.push(tile.letter);
    api.audio.sfx.ok();
    api.audio.sfx.sparkle();
    burst(tile.x + tile.w / 2, tile.y + tile.h / 2);

    if (entered.length === current().word.length) {
      const progressTargets = [15, 30, 45, 55];
      api.progress?.(progressTargets[wordIndex], `${current().word} joined the black-feather word trail`);
      // 完整录音包含“单词 → 逐字母拼读 → 再读单词”。必须等它播完
      // 才切换下一题，否则下一题的自动朗读会把当前录音截断。
      wordDoneAt = t + current().voiceSeconds + .6;
      api.ui.toast(`${current().word.split('').join(' – ')} spells ${current().word}!`, 'Feather', 2300);
      hearWord();
    }
  }

  function pointerDown(x, y) {
    if (finished || finishAt) return;
    const l = layout();
    if (contains(l.hear, x, y)) {
      api.audio.sfx.tap();
      hearWord();
      return;
    }
    const tile = l.tiles.find(item => contains(item, x, y));
    if (tile) chooseTile(tile);
  }

  function key(value) {
    const letter = String(value || '').toUpperCase();
    const l = layout();
    const tile = l.tiles.find(item => !used.has(item.index) && item.letter === letter);
    if (tile) chooseTile(tile);
    else if (/^[A-Z]$/.test(letter) && !wordDoneAt) {
      const expected = current().word[entered.length];
      mistakes++;
      hintUntil = t + 2.8;
      api.audio.sfx.gentle();
      api.ui.toast(TRY_LINES[mistakes % TRY_LINES.length](expected), 'Feather', 2100);
    }
  }

  function update(dt) {
    t += dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.r += 52 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (wordDoneAt && t >= wordDoneAt) {
      wordDoneAt = 0;
      if (wordIndex + 1 < WORDS.length) {
        wordIndex++;
        beginWord();
      } else {
        finishAt = t + 1.25;
        api.ui.gameHint('Four black-feather words complete · The word trail points toward home!');
        api.audio.sfx.chime();
      }
    }
    if (finishAt && t >= finishAt && !finished) {
      finished = true;
      api.finish({ spellingWords: WORDS.length, bonus: mistakes === 0 ? 60 : 0 });
    }
  }

  function drawWind(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(204,211,208,.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = H() * (.17 + i * .13);
      const shift = Math.sin(t * .7 + i) * W() * .04;
      ctx.beginPath();
      ctx.moveTo(-30 + shift, y);
      ctx.bezierCurveTo(W() * .28, y - 18, W() * .62, y + 22, W() + 30, y - 8);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = ((t * (18 + i * 2) + i * W() * .23) % (W() + 120)) - 60;
      const y = H() * (.12 + (i % 4) * .17) + Math.sin(t * 1.3 + i) * 14;
      drawBlackFeather(ctx, x, y, 24 + (i % 2) * 6, -.45 + Math.sin(t + i) * .18, .1);
    }
    ctx.restore();
  }

  function draw(ctx) {
    const item = current();
    const l = layout();
    const panel = l.panel;
    drawWind(ctx);

    ctx.save();
    ctx.fillStyle = 'rgba(9,18,27,.55)';
    ctx.fillRect(0, 0, W(), H());

    ctx.fillStyle = 'rgba(21,31,41,.95)';
    ctx.strokeStyle = 'rgba(205,184,137,.45)';
    ctx.lineWidth = 2;
    rounded(ctx, panel.x, panel.y, panel.w, panel.h, 12);
    ctx.fill(); ctx.stroke();

    drawBlackFeather(ctx, panel.x + 45, panel.y + 42, l.compact ? 38 : 48, -.28, .45);
    ctx.fillStyle = '#d8c28d';
    ctx.font = `700 ${l.compact ? 10 : 12}px "Cantarell", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('BLACK FEATHER WORD TRAIL', panel.x + (l.compact ? 73 : 85), panel.y + 33);
    ctx.fillStyle = '#aeb7b5';
    ctx.font = `600 ${l.compact ? 10 : 12}px "Cantarell", sans-serif`;
    ctx.fillText(`Word ${wordIndex + 1} of ${WORDS.length} · No points are ever lost`, panel.x + (l.compact ? 73 : 85), panel.y + 53);

    ctx.fillStyle = 'rgba(79,66,44,.9)';
    ctx.strokeStyle = 'rgba(223,198,143,.56)';
    rounded(ctx, l.hear.x, l.hear.y, l.hear.w, l.hear.h, 9);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0e2bd';
    ctx.font = `700 ${l.compact ? 11 : 13}px "Cantarell", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔊 Hear Word', l.hear.x + l.hear.w / 2, l.hear.y + l.hear.h / 2 + 1);

    ctx.fillStyle = '#f0e9dd';
    ctx.font = `700 ${l.compact ? 26 : 34}px "C059", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${item.icon}  ${item.word}`, W() / 2, panel.y + panel.h * .42);
    ctx.fillStyle = '#b7bfbd';
    ctx.font = `500 ${l.compact ? 12 : 14}px "Cantarell", sans-serif`;
    ctx.fillText(item.clue, W() / 2, panel.y + panel.h * .55);

    const slotGap = l.compact ? 8 : 12;
    const slotSize = Math.min(l.compact ? 44 : 58, (panel.w - 80 - slotGap * (item.word.length - 1)) / item.word.length);
    const slotsW = slotSize * item.word.length + slotGap * (item.word.length - 1);
    const sx = (W() - slotsW) / 2;
    const sy = panel.y + panel.h * .66;
    for (let i = 0; i < item.word.length; i++) {
      const filled = i < entered.length;
      const active = i === entered.length && !wordDoneAt;
      ctx.fillStyle = filled ? 'rgba(57,61,69,.98)' : 'rgba(226,225,209,.09)';
      ctx.strokeStyle = active ? 'rgba(232,204,145,.95)' : 'rgba(191,202,201,.38)';
      ctx.lineWidth = active ? 3 : 1.5;
      rounded(ctx, sx + i * (slotSize + slotGap), sy, slotSize, slotSize, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = filled ? '#f0dcae' : '#7e898b';
      ctx.font = `700 ${slotSize * .5}px "C059", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(filled ? entered[i] : '·', sx + i * (slotSize + slotGap) + slotSize / 2, sy + slotSize / 2 + 2);
    }

    const expected = item.word[entered.length];
    l.tiles.forEach(tile => {
      const isUsed = used.has(tile.index);
      const isHint = !isUsed && tile.letter === expected && t < hintUntil;
      const wobble = tile.index === wrongTile && t < wrongUntil ? Math.sin(t * 46) * 5 : 0;
      ctx.save();
      ctx.translate(wobble, Math.sin(t * 2.1 + tile.index) * 3);
      ctx.globalAlpha = isUsed ? .25 : 1;
      ctx.fillStyle = isHint ? 'rgba(81,70,49,.98)' : 'rgba(20,29,39,.96)';
      ctx.strokeStyle = isHint ? 'rgba(236,207,144,.95)' : 'rgba(177,188,190,.4)';
      ctx.lineWidth = isHint ? 3 : 1.5;
      rounded(ctx, tile.x, tile.y, tile.w, tile.h, 10);
      ctx.fill(); ctx.stroke();
      drawBlackFeather(ctx, tile.x + tile.w * .3, tile.y + tile.h * .5, tile.h * .5, -.24, isHint ? .7 : .2);
      ctx.fillStyle = '#f1dfb3';
      ctx.font = `750 ${tile.h * .4}px "C059", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tile.letter, tile.x + tile.w * .68, tile.y + tile.h / 2 + 2);
      ctx.restore();
    });

    if (!l.compact) {
      CH.draw(ctx, 'xiaoyu', W() * .075, H() * .91, H() * .00135, { t, em: wordDoneAt ? 'happy' : 'calm', facing: 1 });
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / .8);
      ctx.fillStyle = '#e6c97e';
      ctx.font = '13px sans-serif';
      ctx.fillText('✦', p.x + Math.cos(p.a) * p.r, p.y + Math.sin(p.a) * p.r);
    }
    ctx.globalAlpha = 1;

    if (finishAt) {
      ctx.fillStyle = 'rgba(14,23,31,.92)';
      ctx.strokeStyle = 'rgba(226,199,139,.72)';
      const w = Math.min(W() - 32, 500), h = 80, x = (W() - w) / 2, y = panel.y + panel.h / 2 - h / 2;
      rounded(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f1e4c8';
      ctx.font = `700 ${l.compact ? 18 : 23}px "C059", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('WIND · LAKE · NEST · HOME', W() / 2, y + h / 2);
    }
    ctx.restore();
  }

  beginWord();

  return {
    update, draw, pointerDown, key,
    debug: () => ({
      wordIndex,
      word: current().word,
      entered: entered.join(''),
      expected: current().word[entered.length] || null,
      mistakes,
      used: [...used],
      advanceIn: wordDoneAt ? Math.max(0, wordDoneAt - t) : 0,
      finished,
      layout: layout(),
    }),
  };
}
