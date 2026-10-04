/**
 * ============================================================
 * 《小羽的春天》角色绘制（占位美术：圆润手绘风 Canvas 小动物）
 * ------------------------------------------------------------
 * 每个角色在「脚底为原点(0,0)、朝右」的本地坐标系里绘制，
 * 由 draw() 统一做位置/大小/翻转/表情处理。
 * 正式立绘完成后，替换对应绘制函数即可，接口不变。
 *
 * draw(ctx, id, x, y, k, o)
 *   id   角色名
 *   x,y  脚底在画面中的位置（像素）
 *   k    缩放（1 ≈ 角色高 0.3 屏高）
 *   o    { facing:1|-1, em:'happy|sad|wow|calm', t:全局时间, talk:是否说话, wing:翅膀角度 }
 * ============================================================
 */
import { clamp } from './util.js';

/* ---------- 表情小件 ---------- */
function eyePair(ctx, hx, hy, gap, r, o, seed = 0) {
  const t = o.t || 0;
  const blink = ((t + seed) % 3.9) < 0.13;
  for (const side of [-1, 1]) {
    const ex = hx + side * gap, ey = hy;
    if (o.em === 'happy') {           // 弯弯的笑眼 ^ ^
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = r * 0.42; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, ey + r * 0.35, r * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (blink) {
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = r * 0.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - r * 0.8, ey); ctx.lineTo(ex + r * 0.8, ey); ctx.stroke();
    } else {
      const big = o.em === 'wow' ? 1.25 : 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, r * big, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath(); ctx.arc(ex + r * 0.15, ey + r * 0.08, r * 0.52 * big, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + r * 0.34, ey - r * 0.16, r * 0.2, 0, 7); ctx.fill();
      if (o.em === 'sad') {           // 担心的小眉毛
        ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = r * 0.32; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.7, ey - r * 1.35 + side * r * 0.25);
        ctx.lineTo(ex + r * 0.7, ey - r * 1.1 - side * r * 0.25);
        ctx.stroke();
      }
    }
  }
}
function mouth(ctx, mx, my, s, em, talk, t) {
  ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = s * 0.4; ctx.lineCap = 'round';
  ctx.beginPath();
  if (em === 'happy') ctx.arc(mx, my - s * 0.4, s * 0.85, Math.PI * 0.15, Math.PI * 0.85);
  else if (em === 'sad') ctx.arc(mx, my + s * 0.9, s * 0.8, Math.PI * 1.2, Math.PI * 1.8);
  else if (em === 'wow' || talk) { ctx.arc(mx, my, s * 0.5, 0, 7); ctx.fillStyle = '#7a4a3a'; ctx.fill(); return; }
  else ctx.arc(mx, my - s * 0.3, s * 0.7, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}
function shadow(ctx, rx) {
  ctx.fillStyle = 'rgba(70,50,25,0.16)';
  ctx.beginPath(); ctx.ellipse(0, 2, rx, rx * 0.22, 0, 0, 7); ctx.fill();
}
function legs(ctx, color, spread, h) {
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * spread * 0.5, -h); ctx.lineTo(s * spread * 0.6, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * spread * 0.6, 0); ctx.lineTo(s * spread * 0.6 + 8, 0); ctx.stroke();
  }
}

/* ---------- 鸭子家族（共用骨架） ---------- */
function duck(ctx, { body, belly, wing, beak, tuft }, o) {
  shadow(ctx, 46);
  legs(ctx, '#e8975f', 26, 16);
  // 尾巴
  ctx.fillStyle = wing;
  ctx.beginPath(); ctx.moveTo(-30, -50); ctx.quadraticCurveTo(-52, -58, -44, -36); ctx.quadraticCurveTo(-36, -34, -28, -38); ctx.fill();
  // 身体
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -44, 36, 27, 0, 0, 7); ctx.fill();
  // 肚皮
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(4, -36, 24, 15, 0, 0, 7); ctx.fill();
  // 翅膀（飞行小游戏用 wing 角度扇动）
  ctx.save();
  ctx.translate(-4, -48); ctx.rotate((o.wing || 0) * 0.9);
  ctx.fillStyle = wing;
  ctx.beginPath(); ctx.ellipse(-6, 8, 20, 12, -0.5, 0, 7); ctx.fill();
  ctx.restore();
  // 头
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(18, -82, 21, 0, 7); ctx.fill();
  // 呆毛
  if (tuft) {
    ctx.strokeStyle = tuft; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (const [dx, dy, ex, ey] of [[14, -100, 10, -112], [18, -101, 18, -116], [22, -100, 27, -111]]) {
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.quadraticCurveTo((dx + ex) / 2, dy - 8, ex, ey); ctx.stroke();
    }
  }
  eyePair(ctx, 18, -86, 8, 5.4, o, 0.3);
  // 嘴（说话时一张一合）
  const open = o.talk ? (0.5 + 0.5 * Math.sin((o.t || 0) * 14)) * 7 : 0;
  ctx.fillStyle = beak;
  ctx.beginPath(); ctx.moveTo(33, -84); ctx.lineTo(52, -82 - open * 0.2); ctx.lineTo(34, -77); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(34, -77); ctx.lineTo(50, -75 + open); ctx.lineTo(33, -71 - open * 0.4); ctx.closePath(); ctx.fill();
}

const CHARS = {
  /* 小羽：灰色小鸭，个子稍大，头上有三根呆毛 */
  xiaoyu: (ctx, o) => duck(ctx, { body: '#a9b2be', belly: '#ccd4de', wing: '#8e98a6', beak: '#e8a34f', tuft: '#8e98a6' }, o),

  /* 鸭妈妈：奶油色，温柔 */
  duckMom: (ctx, o) => duck(ctx, { body: '#f2e4c4', belly: '#faf0da', wing: '#e0c9a0', beak: '#e8975f', tuft: null }, o),

  /* 黄色小鸭（哥哥姐姐） */
  duckling: (ctx, o) => duck(ctx, { body: '#ffd97a', belly: '#ffe9b0', wing: '#f2bd55', beak: '#ef9b55', tuft: null }, o),

  /* 一颗大大的蛋（第一章） */
  egg: (ctx, o) => {
    shadow(ctx, 34);
    ctx.fillStyle = '#fdf8ec';
    ctx.beginPath(); ctx.ellipse(0, -32, 27, 35, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c9d4de'; ctx.lineWidth = 2.6; ctx.globalAlpha = 0.7;
    for (const [dx, dy, r] of [[-8, -44, 4], [10, -30, 5], [-4, -18, 3.4], [6, -52, 3]]) {
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  /* 松鼠果果：大尾巴最显眼 */
  squirrel: (ctx, o) => {
    shadow(ctx, 38);
    // 大尾巴
    ctx.fillStyle = '#c98b5f';
    ctx.beginPath();
    ctx.moveTo(-24, -18);
    ctx.bezierCurveTo(-58, -20, -62, -78, -30, -92);
    ctx.bezierCurveTo(-44, -66, -40, -34, -18, -30);
    ctx.fill();
    // 身体
    ctx.fillStyle = '#b0774e';
    ctx.beginPath(); ctx.ellipse(0, -34, 24, 27, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8cba8';
    ctx.beginPath(); ctx.ellipse(4, -26, 13, 15, 0, 0, 7); ctx.fill();
    // 头 + 耳朵
    ctx.fillStyle = '#b0774e';
    ctx.beginPath(); ctx.arc(6, -72, 19, 0, 7); ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(6 + s * 12, -90, 6, 9, s * 0.3, 0, 7); ctx.fill();
    }
    eyePair(ctx, 6, -75, 8, 5, o, 1.1);
    mouth(ctx, 12, -63, 5, o.em, o.talk, o.t);
    // 小手
    ctx.strokeStyle = '#9c6840'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(14, -40); ctx.lineTo(24, -34); ctx.stroke();
  },

  /* 青蛙阿碧：头顶两只大眼睛 */
  frog: (ctx, o) => {
    shadow(ctx, 36);
    // 腿
    ctx.strokeStyle = '#7ba75c'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 14, -12); ctx.quadraticCurveTo(s * 22, -8, s * 26, 0); ctx.stroke();
    }
    // 身体
    ctx.fillStyle = '#8fbf6a';
    ctx.beginPath(); ctx.ellipse(0, -26, 30, 24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c3df9f';
    ctx.beginPath(); ctx.ellipse(2, -18, 18, 11, 0, 0, 7); ctx.fill();
    // 头顶大眼睛
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#8fbf6a';
      ctx.beginPath(); ctx.arc(s * 12, -48, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s * 12, -49, 7.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a2a1c';
      const look = o.em === 'wow' ? 1.3 : 1;
      ctx.beginPath(); ctx.arc(s * 12 + 1.6, -48, 3.6 * look, 0, 7); ctx.fill();
    }
    // 大嘴
    ctx.strokeStyle = '#4f7a3a'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.em === 'happy' || o.talk) ctx.arc(0, -32, 14, Math.PI * 0.12, Math.PI * 0.88);
    else if (o.em === 'sad') ctx.arc(0, -22, 12, Math.PI * 1.2, Math.PI * 1.8);
    else ctx.arc(0, -28, 11, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    // 腮红
    ctx.fillStyle = 'rgba(240,150,130,0.4)';
    ctx.beginPath(); ctx.ellipse(-20, -32, 5, 3.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -32, 5, 3.4, 0, 0, 7); ctx.fill();
  },

  /* 小鹿朵朵：身上有小斑点 */
  deer: (ctx, o) => {
    shadow(ctx, 46);
    // 四条腿
    ctx.strokeStyle = '#b98f63'; ctx.lineWidth = 6.4; ctx.lineCap = 'round';
    for (const [dx, dy] of [[-22, -30], [-12, -30], [12, -30], [22, -30]]) {
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + (dx < 0 ? -4 : 4), 0); ctx.stroke();
    }
    // 身体
    ctx.fillStyle = '#d8b98c';
    ctx.beginPath(); ctx.ellipse(0, -46, 33, 21, 0, 0, 7); ctx.fill();
    // 斑点
    ctx.fillStyle = '#f2e3c8';
    [[-10, -50], [4, -56], [14, -48], [-2, -42]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.ellipse(dx, dy, 4.4, 3.2, 0.4, 0, 7); ctx.fill();
    });
    // 尾巴
    ctx.beginPath(); ctx.ellipse(-33, -50, 6, 8, 0.4, 0, 7); ctx.fill();
    // 脖子 + 头
    ctx.fillStyle = '#d8b98c';
    ctx.beginPath(); ctx.moveTo(16, -58); ctx.lineTo(30, -92); ctx.lineTo(42, -88); ctx.lineTo(26, -52); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(38, -94, 14, 12, 0.3, 0, 7); ctx.fill();
    // 耳朵
    ctx.beginPath(); ctx.ellipse(30, -108, 6, 10, -0.7, 0, 7); ctx.fill();
    ctx.fillStyle = '#c9a877';
    ctx.beginPath(); ctx.ellipse(48, -106, 5.4, 9, 0.5, 0, 7); ctx.fill();
    eyePair(ctx, 38, -97, 6.4, 4.6, o, 2.2);
    mouth(ctx, 47, -89, 4, o.em, o.talk, o.t);
    // 小鼻子
    ctx.fillStyle = '#8a5a4a';
    ctx.beginPath(); ctx.arc(52, -91, 2.6, 0, 7); ctx.fill();
  },

  /* 鹿妈妈：更高更优雅 */
  deerMom: (ctx, o) => {
    CHARS.deer(ctx, o);
    // 加一点点妈妈的特征：脖子上的花纹项圈
    ctx.strokeStyle = '#e8a34f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(30, -74, 10, -0.6, 1.1); ctx.stroke();
  },

  /* 猫头鹰爷爷：圆滚滚，戴圆眼镜 */
  owl: (ctx, o) => {
    shadow(ctx, 40);
    // 耳簇
    ctx.fillStyle = '#8d7358';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 14, -92); ctx.lineTo(s * 24, -108); ctx.lineTo(s * 26, -86); ctx.closePath(); ctx.fill();
    }
    // 身体
    ctx.fillStyle = '#8d7358';
    ctx.beginPath(); ctx.ellipse(0, -48, 32, 42, 0, 0, 7); ctx.fill();
    // 肚皮羽毛
    ctx.fillStyle = '#e3d0b0';
    ctx.beginPath(); ctx.ellipse(0, -34, 20, 24, 0, 0, 7); ctx.fill();
    // 翅膀
    ctx.fillStyle = '#7a6248';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 30, -48, 9, 26, s * 0.25, 0, 7); ctx.fill();
    }
    // 脸盘
    ctx.fillStyle = '#d9c39c';
    ctx.beginPath(); ctx.ellipse(0, -70, 22, 19, 0, 0, 7); ctx.fill();
    // 圆眼镜 + 大眼睛
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(s * 9, -72, 8.4, 0, 7); ctx.stroke();
      const t = o.t || 0, blink = ((t + 3) % 4.2) < 0.12;
      if (blink) {
        ctx.beginPath(); ctx.moveTo(s * 9 - 6, -72); ctx.lineTo(s * 9 + 6, -72); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 9, -72, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(s * 9 + 1, -71, 3.6, 0, 7); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.moveTo(-2, -72); ctx.lineTo(2, -72); ctx.stroke();
    // 小嘴 + 胡子
    ctx.fillStyle = '#e8a34f';
    ctx.beginPath(); ctx.moveTo(-3, -62); ctx.lineTo(3, -62); ctx.lineTo(0, -55); ctx.closePath(); ctx.fill();
    mouth(ctx, 0, -52, 5, o.em, o.talk, o.t);
    // 爪子
    ctx.strokeStyle = '#e8a34f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 12, -10); ctx.lineTo(s * 14, 0); ctx.stroke();
    }
  },

  /* 黑天鹅妈妈：长脖子与红喙是标志（用于第四章与湖面远景） */
  swan: (ctx, o) => {
    shadow(ctx, 48);
    // 身体
    ctx.fillStyle = '#25252d';
    ctx.beginPath(); ctx.ellipse(0, -40, 38, 25, 0, 0, 7); ctx.fill();
    // 翅膀层次
    ctx.fillStyle = '#383743';
    ctx.beginPath(); ctx.ellipse(-6, -46, 28, 15, -0.35, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5a5869'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-26 + i * 9, -50 + i * 3); ctx.quadraticCurveTo(-8, -42 + i * 3, 14, -46 + i * 3); ctx.stroke();
    }
    // 尾巴
    ctx.fillStyle = '#25252d';
    ctx.beginPath(); ctx.moveTo(-34, -46); ctx.quadraticCurveTo(-56, -58, -44, -30); ctx.quadraticCurveTo(-36, -30, -30, -36); ctx.fill();
    // 长脖子（S 形）
    ctx.strokeStyle = '#25252d'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(20, -50); ctx.bezierCurveTo(38, -66, 30, -92, 46, -104); ctx.stroke();
    // 头
    ctx.fillStyle = '#25252d';
    ctx.beginPath(); ctx.arc(48, -106, 12, 0, 7); ctx.fill();
    eyePair(ctx, 50, -108, 5, 3.8, o, 3.3);
    // 橙色黑尖嘴
    ctx.fillStyle = '#e8975f';
    ctx.beginPath(); ctx.moveTo(57, -108); ctx.lineTo(70, -105); ctx.lineTo(57, -101); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.moveTo(66, -106.5); ctx.lineTo(70, -105); ctx.lineTo(66, -103.5); ctx.closePath(); ctx.fill();
    // 水纹脚
    ctx.strokeStyle = '#e8975f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-4, -16); ctx.lineTo(-4, -4); ctx.stroke();
  },
};

/* 别名（配对小游戏里用到的家长变体） */
CHARS.squirrelDad = (ctx, o) => CHARS.squirrel(ctx, o);
CHARS.frogMom = (ctx, o) => CHARS.frog(ctx, o);

/* ============================================================
 * 正式立绘（优先加载线上轻量 WebP，失败时回退原始 PNG）
 * ------------------------------------------------------------
 * 加载时先用程序化版本量出每个角色的本地高度，再把图片
 * 按「同高、脚底锚点、默认朝右」绘制——所有站位与缩放
 * 与程序化版本完全一致。图片缺失时自动回退程序化绘制。
 * ============================================================ */
const SPRITES = {};        // 'xiaoyu' / 'xiaoyu_sad' … -> { c, w, h }
let PROC_H = null;         // id -> 程序化版本的高度（本地单位），用于校准

/** 测量程序化角色的不透明包围盒高度 */
function measureProcedural() {
  const m = {};
  for (const id of ['xiaoyu', 'duckMom', 'duckling', 'egg', 'squirrel', 'frog', 'deer', 'deerMom', 'owl', 'swan']) {
    const fn = CHARS[id];
    if (!fn) continue;
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.translate(200, 392);
    fn(g, { t: 1.7 });                        // 选一个不眨眼的时刻
    const d = g.getImageData(0, 0, 400, 400).data;
    let minY = 1e9, maxY = -1;
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
      if (d[(y * 400 + x) * 4 + 3] > 8) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxY > minY) m[id] = 392 - minY;      // 脚底(392)以上的高度
  }
  return m;
}

/** 载入一张立绘：裁掉透明边 + 高于 820px 时降采样 */
async function loadOne(key, url) {
  const im = await new Promise((ok, err) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url;
  });
  const c0 = document.createElement('canvas'); c0.width = im.width; c0.height = im.height;
  c0.getContext('2d').drawImage(im, 0, 0);
  const d = c0.getContext('2d').getImageData(0, 0, im.width, im.height).data;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < im.height; y += 2) for (let x = 0; x < im.width; x += 2) {
    if (d[(y * im.width + x) * 4 + 3] > 12) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return;
  minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
  maxX = Math.min(im.width - 1, maxX + 2); maxY = Math.min(im.height - 1, maxY + 2);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const k = Math.min(1, 820 / bh);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(bw * k)); c.height = Math.max(2, Math.round(bh * k));
  c.getContext('2d').drawImage(c0, minX, minY, bw, bh, 0, 0, c.width, c.height);
  SPRITES[key] = { c, w: c.width, h: c.height };
}

/** 启动时调用一次；WebP 失败回退 PNG，再失败则用程序化绘制 */
export function loadSprites(
  base = 'assets/scenes/enhanced-scenes/characters-web/',
  fallbackBase = 'assets/characters/optimized/'
) {
  const ids = ['xiaoyu', 'xiaoyu_happy', 'xiaoyu_sad', 'xiaoyu_wow', 'xiaoyu_calm',
               'duckMom', 'duckling', 'egg', 'squirrel', 'frog', 'deer', 'deerMom', 'owl', 'swan'];
  return Promise.all(ids.map(async id => {
    try { await loadOne(id, base + id + '.webp'); }
    catch (e) { await loadOne(id, fallbackBase + id + '.png').catch(() => {}); }
  })).then(() => { PROC_H = measureProcedural(); });
}

function spriteFor(id, em) {
  if (id === 'squirrelDad') id = 'squirrel';
  if (id === 'frogMom') id = 'frog';
  if (id === 'xiaoyu' && em && SPRITES['xiaoyu_' + em]) return { sp: SPRITES['xiaoyu_' + em], id };
  return SPRITES[id] ? { sp: SPRITES[id], id } : null;
}

/** 统一入口：有立绘用立绘，没有回退程序化 */
export function draw(ctx, id, x, y, k, o = {}) {
  const hit = spriteFor(id, o.em);
  if (hit && PROC_H) {
    const h = PROC_H[hit.id] || 100;                 // 与程序化版本同高
    const w = h * hit.sp.w / hit.sp.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((o.facing || 1) * k, k);
    ctx.drawImage(hit.sp.c, -w / 2, -h, w, h);       // 脚底(0,0) 居中锚定
    ctx.restore();
    return;
  }
  const fn = CHARS[id];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((o.facing || 1) * k, k);
  fn(ctx, { ...o, t: o.t || 0 });
  ctx.restore();
}

/** 角色大致的「可点区域」半径（配对小游戏命中判断用） */
export function hitRadius(id) {
  return { egg: 38, duckling: 42, frog: 40, deer: 46, swan: 48, owl: 44 }[id] || 44;
}
