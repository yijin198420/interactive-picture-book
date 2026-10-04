/**
 * 第四章：黑羽记忆拼图
 * 六片、无倒计时、无扣分。支持拖放，也支持“点拼片 → 点位置”。
 * 拼错会回到原处；停留一会儿后才给柔和的位置光提示。
 */
import { clamp, dist, rrect } from '../util.js';

const COLS = 3;
const ROWS = 2;
const COUNT = COLS * ROWS;

export function createGame(cfg, api) {
  const W = () => api.W(), H = () => api.H();
  const picture = document.createElement('canvas');
  picture.width = 900; picture.height = 600;
  const pg = picture.getContext('2d');
  const scene = new Image();
  scene.src = 'assets/scenes/handpainted-rework-v2/windy-dusk-web.webp';
  const swan = new Image();
  swan.src = 'assets/scenes/enhanced-scenes/characters-web/swan.webp';

  let t = 0, wrong = 0, hintLevel = 0, finishAt = 0, finished = false;
  let hold = null, selected = null, down = null;
  let lastW = 0, lastH = 0;
  const particles = [];

  const trayOrder = Array.from({ length: COUNT }, (_, i) => i);
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trayOrder[i], trayOrder[j]] = [trayOrder[j], trayOrder[i]];
  }
  if (trayOrder.every((value, index) => value === index)) [trayOrder[0], trayOrder[1]] = [trayOrder[1], trayOrder[0]];

  const pieces = Array.from({ length: COUNT }, (_, slot) => ({
    slot, trayIndex: trayOrder.indexOf(slot), x: 0, y: 0, tx: 0, ty: 0,
    hx: 0, hy: 0, placed: false, pop: 0, wob: 0,
  }));

  function paintBlackFeather(g, x, y, scale, rotation) {
    g.save();
    g.translate(x, y); g.rotate(rotation); g.scale(scale, scale);
    const ink = g.createLinearGradient(-70, -150, 75, 160);
    ink.addColorStop(0, '#101620'); ink.addColorStop(.5, '#242632'); ink.addColorStop(1, '#060a10');
    g.fillStyle = ink;
    g.beginPath();
    g.moveTo(0, 170);
    g.bezierCurveTo(-56, 108, -82, 16, -30, -154);
    g.bezierCurveTo(5, -121, 40, -70, 50, 3);
    g.bezierCurveTo(57, 66, 35, 126, 0, 170);
    g.closePath(); g.fill();
    g.strokeStyle = '#a98b5e'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-3, 174); g.quadraticCurveTo(3, 35, -26, -146); g.stroke();
    g.strokeStyle = 'rgba(172,166,154,.42)'; g.lineWidth = 2;
    for (let yy = -118; yy < 112; yy += 18) {
      const centerX = -15 + (yy + 118) * .055;
      const span = 36 + Math.sin((yy + 125) / 240 * Math.PI) * 25;
      g.beginPath(); g.moveTo(centerX, yy); g.lineTo(centerX - span, yy - 24); g.stroke();
      g.beginPath(); g.moveTo(centerX + 2, yy + 3); g.lineTo(centerX + span * .72, yy - 16); g.stroke();
    }
    g.restore();
  }

  function paintPicture() {
    const w = picture.width, h = picture.height;
    pg.clearRect(0, 0, w, h);
    if (scene.complete && scene.naturalWidth) {
      const sourceRatio = scene.naturalWidth / scene.naturalHeight;
      const targetRatio = w / h;
      let sx = 0, sy = 0, sw = scene.naturalWidth, sh = scene.naturalHeight;
      if (sourceRatio > targetRatio) { sw = sh * targetRatio; sx = (scene.naturalWidth - sw) / 2; }
      else { sh = sw / targetRatio; sy = (scene.naturalHeight - sh) / 2; }
      pg.drawImage(scene, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      const sky = pg.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#243151'); sky.addColorStop(.48, '#9c6e72'); sky.addColorStop(1, '#263b39');
      pg.fillStyle = sky; pg.fillRect(0, 0, w, h);
    }
    const wash = pg.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, 'rgba(8,15,25,.1)'); wash.addColorStop(.55, 'rgba(24,20,28,.12)'); wash.addColorStop(1, 'rgba(4,10,18,.38)');
    pg.fillStyle = wash; pg.fillRect(0, 0, w, h);

    // 黑羽横跨多个拼片，是整幅图最重要的连续线索。
    pg.save(); pg.shadowColor = 'rgba(237,201,128,.38)'; pg.shadowBlur = 24;
    paintBlackFeather(pg, 566, 294, 1.16, .56); pg.restore();

    // 使用故事里的正式黑天鹅妈妈插画，避免拼图中出现难以辨认的剪影。
    if (swan.complete && swan.naturalWidth) {
      const swanH = 260;
      const swanW = swanH * swan.naturalWidth / swan.naturalHeight;
      pg.save();
      pg.shadowColor = 'rgba(3,8,14,.46)'; pg.shadowBlur = 16; pg.shadowOffsetY = 8;
      pg.drawImage(swan, 640, 302, swanW, swanH);
      pg.restore();
    }

    // 低调金色轨迹，引导眼睛横跨整幅画，而不是依靠编号。
    pg.strokeStyle = 'rgba(238,207,139,.58)'; pg.lineWidth = 3; pg.setLineDash([3, 12]); pg.lineCap = 'round';
    pg.beginPath(); pg.moveTo(105, 470); pg.bezierCurveTo(300, 360, 480, 430, 705, 350); pg.stroke(); pg.setLineDash([]);
  }
  scene.onload = paintPicture;
  scene.onerror = paintPicture;
  swan.onload = paintPicture;
  swan.onerror = paintPicture;
  paintPicture();

  function layout() {
    const portrait = H() > W() * .9;
    const bw = portrait
      ? Math.min(W() * .82, 420)
      : Math.min(W() * .4, H() * .58 * 1.5, 480);
    const bh = bw * 2 / 3;
    const bx = (W() - bw) / 2;
    const by = portrait ? Math.max(126, H() * .17) : Math.max(128, H() * .2);
    return { portrait, bx, by, bw, bh, tw: bw / COLS, th: bh / ROWS };
  }

  function slotCenter(slot, l = layout()) {
    const col = slot % COLS, row = Math.floor(slot / COLS);
    return { x: l.bx + (col + .5) * l.tw, y: l.by + (row + .5) * l.th };
  }

  function trayCenter(index, l = layout()) {
    if (l.portrait) {
      const col = index % 3, row = Math.floor(index / 3);
      return {
        x: W() / 2 + (col - 1) * l.tw * 1.06,
        y: l.by + l.bh + 34 + l.th / 2 + row * l.th * 1.07,
      };
    }
    const side = index < 3 ? -1 : 1;
    const row = index % 3;
    const sideSpace = l.bx;
    return {
      x: side < 0 ? sideSpace * .5 : W() - sideSpace * .5,
      y: l.by + l.th / 2 + row * l.th,
    };
  }

  function relayout(force = false) {
    if (!force && lastW === W() && lastH === H()) return;
    lastW = W(); lastH = H();
    const l = layout();
    pieces.forEach(piece => {
      const home = trayCenter(piece.trayIndex, l);
      piece.hx = home.x; piece.hy = home.y;
      const target = piece.placed ? slotCenter(piece.slot, l) : home;
      piece.tx = target.x; piece.ty = target.y;
      if (force || (!piece.x && !piece.y)) { piece.x = target.x; piece.y = target.y; }
    });
  }
  relayout(true);

  function pieceAt(x, y) {
    const l = layout();
    const order = [...pieces].sort((a, b) => Number(a === hold || a === selected) - Number(b === hold || b === selected));
    for (let i = order.length - 1; i >= 0; i--) {
      const piece = order[i];
      if (piece.placed) continue;
      if (Math.abs(x - piece.x) <= l.tw * .52 && Math.abs(y - piece.y) <= l.th * .52) return piece;
    }
    return null;
  }

  function slotAt(x, y) {
    const l = layout();
    if (x < l.bx || x > l.bx + l.bw || y < l.by || y > l.by + l.bh) return -1;
    const col = clamp(Math.floor((x - l.bx) / l.tw), 0, COLS - 1);
    const row = clamp(Math.floor((y - l.by) / l.th), 0, ROWS - 1);
    return row * COLS + col;
  }

  function place(piece) {
    piece.placed = true; piece.pop = .62; piece.wob = 0;
    const target = slotCenter(piece.slot);
    piece.x = piece.tx = target.x; piece.y = piece.ty = target.y;
    hold = null; selected = null;
    api.audio.sfx.ok();
    for (let i = 0; i < 12; i++) {
      particles.push({ x: target.x, y: target.y, a: i / 12 * Math.PI * 2, r: 4, life: .9 });
    }
    const count = pieces.filter(item => item.placed).length;
    if (count === 2) api.progress?.(15, 'Two pieces of the black-feather memory found their place');
    if (count === 4) api.progress?.(25, 'The dusk lake picture is taking shape');
    if (count === 6) {
      api.progress?.(40, 'The black-feather memory picture is complete');
      api.ui.toast('The picture is whole—the black feather leads to the swan by the lake.', 'Feather', 2300);
      finishAt = t + 1.45;
    }
  }

  function returnHome(piece, showHint = false) {
    piece.tx = piece.hx; piece.ty = piece.hy; piece.wob = .55;
    hold = null;
    if (showHint) {
      wrong++; hintLevel = Math.max(hintLevel, wrong >= 4 ? 2 : wrong >= 2 ? 1 : 0);
      api.audio.sfx.gentle();
      api.ui.toast(wrong >= 2
        ? 'Match the horizon, the black feather, and the golden trail across the edges.'
        : 'That piece belongs in another part of the picture. Try a different space.', 'Feather', 2200);
    }
  }

  function pointerDown(x, y) {
    if (finished || hold) return;
    if (selected) {
      const slot = slotAt(x, y);
      if (slot >= 0) {
        if (slot === selected.slot) place(selected);
        else { const piece = selected; selected = null; returnHome(piece, true); }
        return;
      }
    }
    const piece = pieceAt(x, y);
    if (!piece) return;
    hold = piece; selected = null; down = { x, y, px: piece.x, py: piece.y };
    api.audio.sfx.tap();
  }

  function pointerMove(x, y) {
    if (!hold) return;
    const l = layout();
    hold.x = clamp(x, l.tw * .45, W() - l.tw * .45);
    hold.y = clamp(y, 90, H() - l.th * .45);
    hold.tx = hold.x; hold.ty = hold.y;
  }

  function pointerUp(x, y) {
    if (!hold) return;
    const piece = hold;
    const slot = slotAt(x, y);
    if (slot === piece.slot) { place(piece); return; }
    if (slot >= 0) { returnHome(piece, true); return; }
    if (down && dist(x, y, down.x, down.y) < 14) {
      hold = null; selected = piece;
      piece.x = piece.tx = piece.hx; piece.y = piece.ty = piece.hy;
      api.ui.toast('Piece picked up. Now tap the place where its colors and lines continue.', 'Feather', 1800);
      return;
    }
    returnHome(piece, false);
  }

  function update(dt) {
    t += dt; relayout();
    if (t > 18) hintLevel = Math.max(hintLevel, 2);
    else if (t > 10) hintLevel = Math.max(hintLevel, 1);
    pieces.forEach(piece => {
      if (piece !== hold) {
        piece.x += (piece.tx - piece.x) * Math.min(1, dt * 10);
        piece.y += (piece.ty - piece.y) * Math.min(1, dt * 10);
      }
      if (piece.pop > 0) piece.pop -= dt;
      if (piece.wob > 0) piece.wob -= dt;
    });
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].life -= dt; particles[i].r += 42 * dt;
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
    if (finishAt && t >= finishAt && !finished) { finished = true; api.finish({}); }
  }

  function drawBoard(ctx, l) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,20,29,.92)'; ctx.strokeStyle = 'rgba(222,197,144,.72)'; ctx.lineWidth = 3;
    rrect(ctx, l.bx - 12, l.by - 12, l.bw + 24, l.bh + 24, 18); ctx.fill(); ctx.stroke();

    ctx.globalAlpha = hintLevel > 1 ? .17 : hintLevel > 0 ? .11 : .065;
    ctx.drawImage(picture, l.bx, l.by, l.bw, l.bh);
    ctx.globalAlpha = 1;

    for (let slot = 0; slot < COUNT; slot++) {
      const col = slot % COLS, row = Math.floor(slot / COLS);
      const x = l.bx + col * l.tw, y = l.by + row * l.th;
      const piece = pieces.find(item => item.slot === slot);
      if (!piece.placed) {
        ctx.fillStyle = 'rgba(218,205,174,.035)';
        ctx.fillRect(x + 4, y + 4, l.tw - 8, l.th - 8);
      }
      ctx.strokeStyle = piece.placed ? 'rgba(231,211,167,.16)' : 'rgba(223,211,181,.3)';
      ctx.lineWidth = 1.5; ctx.setLineDash(piece.placed ? [] : [7, 7]);
      ctx.strokeRect(x + 3, y + 3, l.tw - 6, l.th - 6);
    }
    ctx.setLineDash([]);

    const guidePiece = selected || hold || (hintLevel > 0 ? pieces.find(piece => !piece.placed) : null);
    if (guidePiece) {
      const target = slotCenter(guidePiece.slot, l);
      const pulse = .42 + Math.sin(t * 3.2) * .12;
      ctx.strokeStyle = `rgba(239,210,145,${pulse})`; ctx.lineWidth = hintLevel > 1 ? 4 : 2.5;
      ctx.strokeRect(target.x - l.tw / 2 + 6, target.y - l.th / 2 + 6, l.tw - 12, l.th - 12);
    }
    ctx.restore();
  }

  function drawPiece(ctx, piece, l) {
    const col = piece.slot % COLS, row = Math.floor(piece.slot / COLS);
    const scale = 1 + Math.max(0, piece.pop) * .22;
    ctx.save(); ctx.translate(piece.x, piece.y);
    if (piece.wob > 0) ctx.rotate(Math.sin(t * 28) * .1 * piece.wob);
    ctx.scale(scale, scale); ctx.translate(-piece.x, -piece.y);

    if (!piece.placed) {
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    }
    ctx.beginPath(); ctx.roundRect(piece.x - l.tw / 2, piece.y - l.th / 2, l.tw, l.th, Math.max(7, l.tw * .055)); ctx.clip();
    ctx.drawImage(picture,
      piece.x - (col + .5) * l.tw,
      piece.y - (row + .5) * l.th,
      l.bw, l.bh);
    if (!piece.placed) {
      const shade = ctx.createLinearGradient(piece.x - l.tw / 2, piece.y - l.th / 2, piece.x + l.tw / 2, piece.y + l.th / 2);
      shade.addColorStop(0, 'rgba(255,244,209,.09)'); shade.addColorStop(1, 'rgba(5,10,18,.18)');
      ctx.fillStyle = shade; ctx.fillRect(piece.x - l.tw / 2, piece.y - l.th / 2, l.tw, l.th);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = selected === piece || hold === piece ? '#f0d28f' : piece.placed ? 'rgba(214,190,139,.24)' : 'rgba(231,215,179,.72)';
    ctx.lineWidth = selected === piece || hold === piece ? 4 : 2;
    ctx.beginPath(); ctx.roundRect(piece.x - l.tw / 2, piece.y - l.th / 2, l.tw, l.th, Math.max(7, l.tw * .055)); ctx.stroke();
    if (selected === piece) {
      ctx.strokeStyle = 'rgba(243,216,153,.7)'; ctx.setLineDash([7, 7]); ctx.lineDashOffset = -t * 28;
      ctx.strokeRect(piece.x - l.tw / 2 - 5, piece.y - l.th / 2 - 5, l.tw + 10, l.th + 10);
    }
    ctx.restore();
  }

  function draw(ctx) {
    const l = layout();
    drawBoard(ctx, l);
    pieces.filter(piece => piece.placed).forEach(piece => drawPiece(ctx, piece, l));
    pieces.filter(piece => !piece.placed && piece !== hold).forEach(piece => drawPiece(ctx, piece, l));
    if (hold) drawPiece(ctx, hold, l);

    particles.forEach(particle => {
      ctx.save(); ctx.globalAlpha = Math.max(0, particle.life / .9);
      ctx.fillStyle = '#f1d58f'; ctx.font = '14px serif'; ctx.textAlign = 'center';
      ctx.fillText('✦', particle.x + Math.cos(particle.a) * particle.r, particle.y + Math.sin(particle.a) * particle.r);
      ctx.restore();
    });

    const count = pieces.filter(piece => piece.placed).length;
    const text = `Memory Picture  ${count} / ${COUNT}`;
    const counterY = l.by + l.bh + 18;
    ctx.save(); ctx.font = '700 15px "PingFang SC",sans-serif';
    const width = Math.max(184, ctx.measureText(text).width + 32);
    ctx.fillStyle = 'rgba(16,24,34,.92)'; ctx.strokeStyle = 'rgba(211,187,135,.48)'; ctx.lineWidth = 1.5;
    rrect(ctx, W() / 2 - width / 2, counterY - 17, width, 34, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8dfcd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W() / 2, counterY);
    ctx.restore();
  }

  api.ui.gameHint('Complete the black-feather lake picture · Drag a piece into the matching space');

  return {
    update, draw, pointerDown, pointerMove, pointerUp,
    debug: () => ({
      placed: pieces.filter(piece => piece.placed).map(piece => piece.slot),
      pieces: pieces.map(piece => ({ slot: piece.slot, trayIndex: piece.trayIndex, x: Math.round(piece.x), y: Math.round(piece.y), placed: piece.placed })),
      layout: layout(), selected: selected?.slot ?? null, holding: hold?.slot ?? null,
      wrong, hintLevel, finished,
    }),
  };
}
