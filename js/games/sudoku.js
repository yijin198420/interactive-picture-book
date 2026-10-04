/**
 * 第三章 · 雪花数独
 * 适合 5–8 岁的三档儿童数独：初级/中级为 4×4，高级为 6×6。
 * 填错不落子、不扣分；孩子随时可以请求提示或更换难度。
 */

const SOLUTION_4 = [
  1, 2, 3, 4,
  3, 4, 1, 2,
  2, 1, 4, 3,
  4, 3, 2, 1,
];

const SOLUTION_6 = [
  1, 2, 3, 4, 5, 6,
  4, 5, 6, 1, 2, 3,
  2, 3, 4, 5, 6, 1,
  5, 6, 1, 2, 3, 4,
  3, 4, 5, 6, 1, 2,
  6, 1, 2, 3, 4, 5,
];

const LEVELS = [
  {
    key: 'beginner', label: 'Beginner', icon: '🌱', n: 4, boxRows: 2, boxCols: 2,
    note: '4 × 4 · More numbers to help', color: '#aac6ad',
    solution: SOLUTION_4,
    puzzle: [0, 2, 3, 0, 3, 0, 1, 2, 2, 1, 0, 3, 0, 3, 2, 0],
  },
  {
    key: 'intermediate', label: 'Intermediate', icon: '🪶', n: 4, boxRows: 2, boxCols: 2,
    note: '4 × 4 · Fewer starting clues', color: '#cdb77f',
    solution: SOLUTION_4,
    puzzle: [0, 0, 3, 0, 3, 0, 0, 2, 2, 1, 0, 3, 0, 3, 0, 0],
  },
  {
    key: 'advanced', label: 'Advanced', icon: '✦', n: 6, boxRows: 2, boxCols: 3,
    note: '6 × 6 · A bigger star map', color: '#aebbd0',
    solution: SOLUTION_6,
    puzzle: [
      0, 2, 0, 4, 0, 0,
      4, 0, 6, 0, 2, 0,
      0, 3, 0, 5, 6, 0,
      0, 6, 1, 0, 3, 4,
      0, 4, 0, 6, 0, 2,
      0, 1, 2, 0, 4, 0,
    ],
  },
];

const FRIENDLY_TRIES = [
  'Almost! Check the same row and try another number.',
  'That number has another place. Look across the row once more.',
  'A thoughtful try! Check the little box and choose again.',
];

function rounded(ctx, x, y, w, h, r = 16) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  let phase = 'choose';
  let level = null;
  let grid = [];
  let fixed = [];
  let helped = new Set();
  let selected = -1;
  let wrongCell = -1;
  let wrongUntil = 0;
  let wrongCount = 0;
  let t = 0;
  let finishAt = 0;
  let finished = false;
  const sparkles = [];

  function chooseLayout() {
    const vertical = W() < 760;
    const gap = vertical ? 12 : 18;
    const cardW = vertical ? Math.min(W() - 44, 430) : Math.min(270, (W() - 100 - gap * 2) / 3);
    const cardH = vertical ? 92 : 158;
    const totalW = vertical ? cardW : cardW * 3 + gap * 2;
    const totalH = vertical ? cardH * 3 + gap * 2 : cardH;
    const startX = (W() - totalW) / 2;
    const startY = Math.max(190, (H() - totalH) / 2 + 34);
    const cards = LEVELS.map((item, i) => ({
      item,
      x: vertical ? startX : startX + i * (cardW + gap),
      y: vertical ? startY + i * (cardH + gap) : startY,
      w: cardW,
      h: cardH,
    }));
    return { vertical, cards, startY, totalH };
  }

  function playLayout() {
    const n = level.n;
    const compact = H() < 560;
    const top = compact ? 145 : Math.max(170, H() * .2);
    const bottomRoom = compact ? 95 : 150;
    const boardSize = Math.max(
      n * (compact ? 34 : 38),
      Math.min(W() * (W() < 620 ? .82 : .58), H() - top - bottomRoom, n * 82),
    );
    const x = (W() - boardSize) / 2;
    const y = top + Math.max(0, (H() - top - bottomRoom - boardSize) * .28);
    const cell = boardSize / n;
    const gap = Math.max(7, Math.min(13, W() * .015));
    const bankSize = Math.min(compact ? 50 : 62, (W() - 34 - gap * (n - 1)) / n);
    const bankW = bankSize * n + gap * (n - 1);
    const bankY = Math.min(H() - bankSize - 18, y + boardSize + 22);
    return {
      x, y, boardSize, cell, bankSize, bankY,
      bankX: (W() - bankW) / 2,
      gap,
      change: { x: 18, y: Math.max(92, top - 53), w: 132, h: 40 },
      hint: { x: W() - 150, y: Math.max(92, top - 53), w: 132, h: 40 },
    };
  }

  function contains(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function startLevel(next) {
    level = next;
    grid = next.puzzle.slice();
    fixed = grid.map(Boolean);
    helped = new Set();
    selected = grid.findIndex(value => value === 0);
    wrongCell = -1;
    wrongCount = 0;
    phase = 'play';
    api.audio.sfx.chime();
    api.ui.gameHint(`${next.label} Snowflake Sudoku · Use each number once in every row, column, and little box`);
    api.ui.toast('Tap an empty square, then choose a number below.', 'Grandpa Owl', 2600);
  }

  function returnToLevels() {
    if (finishAt) return;
    phase = 'choose';
    level = null;
    selected = -1;
    api.audio.sfx.tap();
    api.ui.gameHint('Choose Beginner, Intermediate, or Advanced Snowflake Sudoku');
  }

  function nextBlank(after = -1) {
    for (let offset = 1; offset <= grid.length; offset++) {
      const i = (after + offset) % grid.length;
      if (grid[i] === 0) return i;
    }
    return -1;
  }

  function burst(index) {
    const l = playLayout();
    const col = index % level.n, row = Math.floor(index / level.n);
    const cx = l.x + (col + .5) * l.cell, cy = l.y + (row + .5) * l.cell;
    for (let i = 0; i < 12; i++) {
      sparkles.push({ x: cx, y: cy, a: i / 12 * Math.PI * 2, r: 4, life: .72 });
    }
  }

  function completeIfReady() {
    if (grid.some(value => value === 0) || finishAt) return false;
    finishAt = t + 1.35;
    phase = 'complete';
    api.progress?.(55, 'The snowflake star map is complete');
    api.audio.sfx.chime();
    api.audio.sfx.sparkle();
    api.ui.gameHint(`${level.label} puzzle complete · Every number found its winter home!`);
    for (let i = 0; i < grid.length; i += Math.max(1, Math.floor(grid.length / 10))) burst(i);
    return true;
  }

  function placeNumber(value, fromHint = false) {
    if (phase !== 'play' || selected < 0 || grid[selected] !== 0) {
      api.ui.toast('Choose an empty square first.', 'Grandpa Owl');
      api.audio.sfx.gentle();
      return;
    }
    if (value !== level.solution[selected]) {
      wrongCell = selected;
      wrongUntil = t + .55;
      wrongCount++;
      api.audio.sfx.gentle();
      api.ui.toast(FRIENDLY_TRIES[wrongCount % FRIENDLY_TRIES.length], 'Grandpa Owl', 2300);
      return;
    }
    grid[selected] = value;
    if (fromHint) helped.add(selected);
    burst(selected);
    api.audio.sfx.ok();
    const placed = selected;
    if (!completeIfReady()) selected = nextBlank(placed);
  }

  function giveHint() {
    if (phase !== 'play') return;
    if (selected < 0 || grid[selected] !== 0) selected = nextBlank(-1);
    if (selected < 0) return;
    api.ui.toast('Here is one warm clue. You can keep going from here.', 'Grandpa Owl', 2400);
    placeNumber(level.solution[selected], true);
  }

  function pointerDown(x, y) {
    if (finished || finishAt) return;
    if (phase === 'choose') {
      const hit = chooseLayout().cards.find(card => contains(card, x, y));
      if (hit) startLevel(hit.item);
      return;
    }
    if (phase !== 'play') return;
    const l = playLayout();
    if (contains(l.change, x, y)) { returnToLevels(); return; }
    if (contains(l.hint, x, y)) { giveHint(); return; }
    if (x >= l.x && x <= l.x + l.boardSize && y >= l.y && y <= l.y + l.boardSize) {
      const col = Math.min(level.n - 1, Math.floor((x - l.x) / l.cell));
      const row = Math.min(level.n - 1, Math.floor((y - l.y) / l.cell));
      const index = row * level.n + col;
      if (fixed[index]) {
        api.ui.toast('That number is part of Grandpa Owl’s star map. Choose an empty square.', 'Grandpa Owl');
        api.audio.sfx.gentle();
      } else if (grid[index] === 0) {
        selected = index;
        api.audio.sfx.tap();
      }
      return;
    }
    for (let value = 1; value <= level.n; value++) {
      const rect = { x: l.bankX + (value - 1) * (l.bankSize + l.gap), y: l.bankY, w: l.bankSize, h: l.bankSize };
      if (contains(rect, x, y)) { placeNumber(value); return; }
    }
  }

  function key(keyValue) {
    if (phase !== 'play') return;
    const value = Number(keyValue);
    if (value >= 1 && value <= level.n) placeNumber(value);
  }

  function update(dt) {
    t += dt;
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const p = sparkles[i];
      p.life -= dt;
      p.r += 48 * dt;
      if (p.life <= 0) sparkles.splice(i, 1);
    }
    if (finishAt && t >= finishAt && !finished) {
      finished = true;
      api.finish({
        sudokuLevel: level.key,
        outcome: [
          'Grandpa Owl',
          `You solved the ${level.label.toLowerCase()} snowflake puzzle. Careful thinking and asking for clues both help us find the way.`,
          `en-v2/c3_sudoku_${level.key}`,
        ],
      });
    }
  }

  function drawLevelChooser(ctx) {
    const l = chooseLayout();
    ctx.save();
    ctx.fillStyle = 'rgba(10,22,34,.68)';
    ctx.fillRect(0, 0, W(), H());

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e8d8';
    ctx.font = `700 ${Math.max(25, Math.min(38, W() * .035))}px "C059", Georgia, serif`;
    ctx.fillText('Grandpa Owl’s Snowflake Sudoku', W() / 2, Math.max(130, l.startY - 72));
    ctx.fillStyle = '#cbd1ce';
    ctx.font = `600 ${Math.max(13, Math.min(17, W() * .017))}px "Cantarell", sans-serif`;
    ctx.fillText('Choose the puzzle that feels right today. You can change it anytime.', W() / 2, Math.max(158, l.startY - 39));

    l.cards.forEach((card, i) => {
      const pulse = 1 + Math.sin(t * 2.2 + i) * .008;
      ctx.save();
      ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
      ctx.scale(pulse, pulse);
      const x = -card.w / 2, y = -card.h / 2;
      ctx.fillStyle = 'rgba(24,36,47,.965)';
      ctx.strokeStyle = card.item.color;
      ctx.lineWidth = 2;
      rounded(ctx, x, y, card.w, card.h, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = card.item.color;
      ctx.font = `${l.vertical ? 25 : 34}px sans-serif`;
      ctx.textAlign = l.vertical ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.item.icon, l.vertical ? x + 20 : 0, l.vertical ? 0 : y + 38);
      ctx.fillStyle = '#f0e9dc';
      ctx.font = `700 ${l.vertical ? 20 : 22}px "C059", Georgia, serif`;
      ctx.textAlign = l.vertical ? 'left' : 'center';
      ctx.fillText(card.item.label, l.vertical ? x + 62 : 0, l.vertical ? -13 : 14);
      ctx.fillStyle = '#b8bfbd';
      ctx.font = `600 ${l.vertical ? 12 : 12}px "Cantarell", sans-serif`;
      ctx.fillText(card.item.note, l.vertical ? x + 62 : 0, l.vertical ? 15 : 44);
      ctx.restore();
    });

    ctx.fillStyle = '#d7c493';
    ctx.font = '650 13px "Cantarell", sans-serif';
    ctx.fillText('Every level completes the same chapter journey · Hints are always welcome', W() / 2, Math.min(H() - 28, l.startY + l.totalH + 48));
    ctx.restore();
  }

  function drawButton(ctx, rect, text, accent = false) {
    ctx.fillStyle = accent ? 'rgba(105,89,57,.94)' : 'rgba(23,35,46,.94)';
    ctx.strokeStyle = accent ? 'rgba(226,200,142,.62)' : 'rgba(197,210,211,.34)';
    ctx.lineWidth = 1.5;
    rounded(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent ? '#f2e4bd' : '#d8dedb';
    ctx.font = '700 13px "Cantarell", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  }

  function drawPuzzle(ctx) {
    const l = playLayout();
    const n = level.n;
    ctx.save();
    ctx.fillStyle = 'rgba(8,20,31,.64)';
    ctx.fillRect(0, 0, W(), H());

    drawButton(ctx, l.change, '‹ Change Level');
    drawButton(ctx, l.hint, '✦ Give Me a Hint', true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ede4d3';
    ctx.font = `700 ${W() < 620 ? 18 : 22}px "C059", Georgia, serif`;
    ctx.fillText(`${level.icon} ${level.label} · ${n} × ${n}`, W() / 2, l.y - 18);

    ctx.fillStyle = 'rgba(238,239,229,.96)';
    ctx.strokeStyle = 'rgba(215,191,137,.82)';
    ctx.lineWidth = 3;
    rounded(ctx, l.x - 7, l.y - 7, l.boardSize + 14, l.boardSize + 14, 10);
    ctx.fill(); ctx.stroke();

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const index = row * n + col;
        const x = l.x + col * l.cell, y = l.y + row * l.cell;
        const sr = selected >= 0 ? Math.floor(selected / n) : -1;
        const sc = selected >= 0 ? selected % n : -1;
        const sameBox = selected >= 0
          && Math.floor(row / level.boxRows) === Math.floor(sr / level.boxRows)
          && Math.floor(col / level.boxCols) === Math.floor(sc / level.boxCols);
        if (index === selected) ctx.fillStyle = 'rgba(229,199,128,.48)';
        else if (row === sr || col === sc || sameBox) ctx.fillStyle = 'rgba(197,213,211,.34)';
        else ctx.fillStyle = (row + col) % 2 ? 'rgba(244,242,230,.84)' : 'rgba(232,235,225,.82)';
        ctx.fillRect(x, y, l.cell, l.cell);

        if (grid[index]) {
          const shake = index === wrongCell && t < wrongUntil ? Math.sin(t * 46) * 4 : 0;
          ctx.fillStyle = fixed[index] ? '#27394a' : helped.has(index) ? '#68807d' : '#9a7137';
          ctx.font = `${fixed[index] ? 750 : 700} ${l.cell * .48}px "C059", Georgia, serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(grid[index]), x + l.cell / 2 + shake, y + l.cell / 2 + 2);
          if (helped.has(index)) {
            ctx.fillStyle = '#8b7650';
            ctx.font = `${Math.max(9, l.cell * .15)}px sans-serif`;
            ctx.fillText('✦', x + l.cell * .78, y + l.cell * .2);
          }
        }
      }
    }

    for (let i = 0; i <= n; i++) {
      const thickV = i % level.boxCols === 0;
      const thickH = i % level.boxRows === 0;
      ctx.strokeStyle = thickV || thickH ? 'rgba(55,70,79,.78)' : 'rgba(86,103,108,.34)';
      ctx.lineWidth = thickV ? 3 : 1;
      ctx.beginPath(); ctx.moveTo(l.x + i * l.cell, l.y); ctx.lineTo(l.x + i * l.cell, l.y + l.boardSize); ctx.stroke();
      ctx.lineWidth = thickH ? 3 : 1;
      ctx.beginPath(); ctx.moveTo(l.x, l.y + i * l.cell); ctx.lineTo(l.x + l.boardSize, l.y + i * l.cell); ctx.stroke();
    }

    for (let value = 1; value <= n; value++) {
      const x = l.bankX + (value - 1) * (l.bankSize + l.gap), y = l.bankY;
      ctx.fillStyle = 'rgba(28,40,50,.96)';
      ctx.strokeStyle = 'rgba(220,195,141,.58)';
      ctx.lineWidth = 2;
      rounded(ctx, x, y, l.bankSize, l.bankSize, 10);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0dfb7';
      ctx.font = `700 ${l.bankSize * .46}px "C059", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x + l.bankSize / 2, y + l.bankSize / 2 + 2);
    }

    for (const p of sparkles) {
      ctx.globalAlpha = Math.max(0, p.life / .72);
      ctx.fillStyle = '#e4c87f';
      ctx.font = '14px sans-serif';
      ctx.fillText('✦', p.x + Math.cos(p.a) * p.r, p.y + Math.sin(p.a) * p.r);
    }
    ctx.globalAlpha = 1;

    if (phase === 'complete') {
      ctx.fillStyle = 'rgba(17,28,37,.88)';
      ctx.strokeStyle = 'rgba(225,201,149,.7)';
      ctx.lineWidth = 2;
      const w = Math.min(W() - 36, 440), h = 82, x = (W() - w) / 2, y = l.y + l.boardSize / 2 - h / 2;
      rounded(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f1e5ca';
      ctx.font = '700 23px "C059", Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Every snowflake number found its home!', W() / 2, y + h / 2);
    }
    ctx.restore();
  }

  function draw(ctx) {
    if (phase === 'choose') drawLevelChooser(ctx);
    else drawPuzzle(ctx);
  }

  return {
    update, draw, pointerDown, key,
    debug: () => ({
      phase,
      level: level && level.key,
      grid: grid.slice(),
      solution: level ? level.solution.slice() : [],
      selected,
      wrongCount,
      layout: phase === 'choose' ? chooseLayout() : playLayout(),
    }),
  };
}
