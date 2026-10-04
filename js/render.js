/**
 * ============================================================
 * 《小羽的春天》场景渲染 v2（程序化水彩 · 静态层缓存架构）
 * ------------------------------------------------------------
 * 画面质量升级的核心：每个场景拆成两层——
 *   base(W,H,rng) 静态层：天空洗染、山丘晕染、细画树木/草地/小物，
 *                    用上百次叠加笔触一次性画进离屏画布缓存
 *                    （只在切换场景 / 改变窗口尺寸时重绘，
 *                      重绘耗时可被章节转场完全遮住）
 *   live(ctx,W,H,t) 动态层：芦苇摇摆、水面波光、光柱、闪光、
 *                    树洞飘雪等每帧元素（保持轻量）
 * 静态层使用带种子的随机数（mulberry32），重绘结果稳定一致。
 * 性能：逐帧只需一次 drawImage + 少量动态元素 + 粒子；
 *       纸纹 / 光晕 / 暗角也全部预渲染缓存。
 * 接口不变：SCENES / setScene / sceneMood / ripple / celebrate / drawScene。
 * ============================================================
 */
import { rand, pick } from './util.js';

/* ---------- 可复现随机（静态层专用） ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const RR = (rng, a, b) => a + rng() * (b - a);
function seedOf(str) { let h = 2166136261; for (const c of str) h = (h ^ c.charCodeAt(0)) * 16777619 | 0; return h >>> 0; }

/* ---------- 预渲染资源 ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** 水彩纸纹理（全场景共用的颗粒底） */
let paperPattern = null;
function getPaper(ctx) {
  if (paperPattern) return paperPattern;
  const c = makeCanvas(220, 220), g = c.getContext('2d');
  for (let i = 0; i < 1000; i++) {
    g.fillStyle = `rgba(${125 + rand(0, 55) | 0},${105 + rand(0, 45) | 0},${85 + rand(0, 35) | 0},${rand(0.015, 0.05)})`;
    g.fillRect(rand(0, 220), rand(0, 220), rand(0.6, 1.7), rand(0.6, 1.7));
  }
  for (let i = 0; i < 26; i++) {          // 淡淡的纸纤维
    g.strokeStyle = `rgba(150,128,98,${rand(0.012, 0.03)})`;
    g.lineWidth = 1;
    const x = rand(0, 220), y = rand(0, 220);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + rand(-18, 18), y + rand(4, 14), x + rand(-28, 28), y + rand(8, 24));
    g.stroke();
  }
  paperPattern = ctx.createPattern(c, 'repeat');
  return paperPattern;
}

/** 预渲染光晕贴图 */
const GLOWS = {};
function glow(r, g, b) {
  const key = r + ',' + g + ',' + b;
  if (GLOWS[key]) return GLOWS[key];
  const c = makeCanvas(96, 96), x = c.getContext('2d');
  const rg = x.createRadialGradient(48, 48, 2, 48, 48, 46);
  rg.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  rg.addColorStop(0.45, `rgba(${r},${g},${b},0.28)`);
  rg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = rg; x.fillRect(0, 0, 96, 96);
  GLOWS[key] = c;
  return c;
}
function drawGlow(ctx, sprite, x, y, size, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

/** 暗角，随窗口尺寸重建 */
let vigCanvas = null, vigW = 0, vigH = 0;
function vignette(ctx, W, H) {
  if (!vigCanvas || vigW !== W || vigH !== H) {
    vigCanvas = makeCanvas(W, H); vigW = W; vigH = H;
    const g = vigCanvas.getContext('2d');
    const rg = g.createRadialGradient(W * 0.5, H * 0.44, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    rg.addColorStop(0, 'rgba(70,50,30,0)');
    rg.addColorStop(1, 'rgba(70,50,30,0.17)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  ctx.drawImage(vigCanvas, 0, 0);
}

/* ---------- 全局风力 ---------- */
const wind = (t) => Math.sin(t * 0.4) * 0.6 + Math.sin(t * 0.13) * 0.4;

/* ============================================================
 * 基础形状
 * ============================================================ */
/** 水彩晕染形：边缘不规则的圆（中点二次曲线平滑，手绘圆润边缘） */
function blob(ctx, x, y, r, seed, irregular = 0.16, lobes = 9) {
  const pts = [];
  for (let i = 0; i < lobes; i++) {
    const a = i / lobes * Math.PI * 2;
    const rr = r * (1 + irregular * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2));
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  ctx.beginPath();
  let m = mid(pts[lobes - 1], pts[0]);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < lobes; i++) {
    const p = pts[i], nm = mid(p, pts[(i + 1) % lobes]);
    ctx.quadraticCurveTo(p[0], p[1], nm[0], nm[1]);
  }
  ctx.closePath();
}
/** 远山之间的雾带 */
function mist(ctx, W, y, alpha, tint = '255,252,240') {
  const g = ctx.createLinearGradient(0, y - 26, 0, y + 30);
  g.addColorStop(0, `rgba(${tint},0)`);
  g.addColorStop(0.5, `rgba(${tint},${alpha})`);
  g.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, y - 26, W, 56);
}
/** 色粒沉积：区域内细密深色斑点（水彩颜料颗粒感） */
function granulate(ctx, W, H, y0, y1, tint, rng, n = 130, a = 0.06) {
  ctx.fillStyle = tint;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = RR(rng, a * 0.5, a);
    ctx.beginPath();
    ctx.arc(W * rng(), H * RR(rng, y0, y1), RR(rng, 0.5, 1.8), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
/** 远处树林线：山脊上一排起伏的小团块剪影 */
function treeline(ctx, W, y, color, rng, s = 1) {
  ctx.fillStyle = color;
  let x = -24;
  while (x < W + 24) {
    const r = RR(rng, 7, 15) * s;
    blob(ctx, x, y + RR(rng, -3, 3), r, rng() * 9, 0.3); ctx.fill();
    x += r * RR(rng, 0.85, 1.35);
  }
}
/** 拉长的椭圆晕（高空薄云/炊烟用） */
function streakCloud(ctx, x, y, len, thick, color, rng) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(len / thick, 1);
  ctx.fillStyle = color;
  blob(ctx, 0, 0, thick, rng() * 9, 0.3, 11); ctx.fill();
  ctx.restore();
}

/* ============================================================
 * 静态层绘画技法（只在 base() 里调用，随便堆细节不心疼帧率）
 * ============================================================ */

/** 天空：纵向洗染 + 相邻色互渗的晕染边界带 + 淡云雾洗带 */
function washSky(ctx, W, H, rng, stops, bandTint, bands = 3) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 两条颜色互渗带：上带色向下渗、下带色向上渗，模拟水彩分色湿接
  for (let b = 0; b < stops.length - 1; b++) {
    const [p1, c1] = stops[b], [p2, c2] = stops[b + 1];
    const y = H * (p1 + p2) / 2;
    ctx.globalAlpha = RR(rng, 0.2, 0.34);
    ctx.fillStyle = c2;                     // 下面的颜色向上咬入
    for (let i = 0; i < 3; i++) {
      blob(ctx, W * RR(rng, 0.1, 0.9), y + RR(rng, -14, 6), W * RR(rng, 0.18, 0.4), rng() * 9, 0.34);
      ctx.fill();
    }
    ctx.globalAlpha = RR(rng, 0.18, 0.3);
    ctx.fillStyle = c1;                     // 上面的颜色向下咬入
    for (let i = 0; i < 2; i++) {
      blob(ctx, W * RR(rng, 0.1, 0.9), y + RR(rng, -4, 16), W * RR(rng, 0.16, 0.34), rng() * 9, 0.34);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < bands; i++) {
    const y = H * (0.07 + i * 0.15) + RR(rng, -6, 6);
    ctx.fillStyle = `rgba(${bandTint},${RR(rng, 0.06, 0.14)})`;
    blob(ctx, W * RR(rng, 0.2, 0.8), y, W * RR(rng, 0.22, 0.42), rng() * 10, 0.3, 7);
    ctx.fill();
  }
  // 高空拉长的薄云（水彩干刷一笔）
  for (let i = 0; i < 2; i++) {
    streakCloud(ctx, W * RR(rng, 0.15, 0.85), H * RR(rng, 0.04, 0.2),
      RR(rng, 70, 150), RR(rng, 9, 14), `rgba(${bandTint},${RR(rng, 0.25, 0.45)})`, rng);
  }
}

/** 太阳/月亮：核心 + 双层光晕 + 放射淡光丝（全部烘焙） */
function bakeSun(ctx, W, x, y, r, core, rgb, rng, rays = 0) {
  drawGlow(ctx, glow(rgb[0], rgb[1], rgb[2]), x, y, r * 11, 0.55);
  drawGlow(ctx, glow(rgb[0], rgb[1], rgb[2]), x, y, r * 5, 0.75);
  ctx.fillStyle = core;
  blob(ctx, x, y, r, 1.7, 0.05); ctx.fill();
  for (let i = 0; i < rays; i++) {          // 水彩笔触般的放射光丝
    const a = RR(rng, 0, Math.PI * 2), len = r * RR(rng, 2.2, 4);
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${RR(rng, 0.05, 0.13)})`;
    ctx.lineWidth = RR(rng, 2, 5); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
}

/** 云：多团块 + 底部柔影（烘焙在静态层，天空的生命感交给光与粒子） */
function bakeCloud(ctx, x, y, s, tint, rng) {
  const puffs = 4 + (rng() * 3 | 0);
  ctx.fillStyle = `rgba(${tint},0.35)`;      // 底层大晕
  blob(ctx, x + RR(rng, -6, 6) * s, y + 6 * s, 34 * s, rng() * 9, 0.28); ctx.fill();
  for (let i = 0; i < puffs; i++) {
    const px = x + (i - puffs / 2) * 16 * s + RR(rng, -5, 5) * s;
    const py = y + RR(rng, -3, 4) * s - Math.abs(i - puffs / 2) * 3 * s;
    ctx.fillStyle = `rgba(${tint},${RR(rng, 0.55, 0.9)})`;
    blob(ctx, px, py, (11 + rng() * 9) * s, rng() * 9, 0.22); ctx.fill();
  }
  ctx.fillStyle = `rgba(120,110,140,0.10)`;  // 云底的柔灰影
  blob(ctx, x, y + 8 * s, 26 * s, rng() * 9, 0.3); ctx.fill();
}

/** 山丘/坡地：裁剪内多层洗染斑点（水彩颗粒感）+ 可选山脊受光 */
function hillWash(ctx, W, H, baseY, amp, o, rng) {
  const ridge = (i) => baseY - amp * (0.4 + 0.6 * Math.sin(i * 2.1 + o.ph));
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, ridge(0) + 12);
  for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(W * (i - 0.5) / 8, ridge(i), W * i / 8, ridge(i));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
  ctx.fillStyle = o.base; ctx.fillRect(0, baseY - amp * 2 - 20, W, H);
  const n = Math.round((o.spots ?? 10) * 1.5);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? o.hi : o.deep;
    ctx.globalAlpha = RR(rng, 0.1, 0.26);
    blob(ctx, W * rng(), baseY + RR(rng, -6, H * 0.4), W * RR(rng, 0.04, 0.13), rng() * 9, 0.32);
    ctx.fill();
  }
  granulate(ctx, W, H, Math.max(0, (baseY - amp) / H), 1, o.deep, rng, 90, 0.05);
  // 山脚/坡脚颜色沉积（水彩重力沉积感）
  const foot = ctx.createLinearGradient(0, H * 0.7, 0, H);
  foot.addColorStop(0, 'rgba(0,0,0,0)');
  foot.addColorStop(1, o.footTint || 'rgba(60,45,30,0.10)');
  ctx.fillStyle = foot; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  ctx.globalAlpha = 1;
  ctx.restore();
  if (o.rim) {
    ctx.strokeStyle = o.rim; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0, ridge(0));
    for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(W * (i - 0.5) / 8, ridge(i), W * i / 8, ridge(i));
    ctx.stroke(); ctx.globalAlpha = 1;
  }
}

/** 细画一棵树：外圈湿晕 + 三层树冠 + 边缘碎叶点 + 分叉枝干 + 地面投影 */
function richTree(ctx, x, y, s, P, rng) {
  const cy = y - 56 * s;
  // 地面柔和投影
  ctx.fillStyle = 'rgba(60,45,30,0.13)';
  ctx.beginPath(); ctx.ellipse(x + 14 * s, y + 3 * s, 34 * s, 8 * s, 0, 0, 7); ctx.fill();
  // 外圈湿晕（颜料洇出树冠的感觉）
  ctx.fillStyle = P.mid; ctx.globalAlpha = 0.22;
  blob(ctx, x, cy - 2 * s, 34 * s, rng() * 9, 0.3, 11); ctx.fill();
  ctx.globalAlpha = 1;
  // 枝干：主干 + 两枝 + 受光线
  ctx.strokeStyle = P.trunk; ctx.lineCap = 'round';
  ctx.lineWidth = 9 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2 * s, y - 20 * s, x, y - 40 * s); ctx.stroke();
  ctx.lineWidth = 4.5 * s;
  ctx.beginPath(); ctx.moveTo(x, y - 26 * s); ctx.quadraticCurveTo(x - 14 * s, y - 36 * s, x - 22 * s, y - 46 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 32 * s); ctx.quadraticCurveTo(x + 13 * s, y - 42 * s, x + 20 * s, y - 54 * s); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,246,220,0.28)'; ctx.lineWidth = 2 * s;   // 干身受光
  ctx.beginPath(); ctx.moveTo(x - 2.4 * s, y - 2 * s); ctx.lineTo(x - 2.4 * s, y - 34 * s); ctx.stroke();
  // 树冠团块
  const blobs = [[x, cy - 4 * s, 21 * s]];
  const n = 9 + (rng() * 5 | 0);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 20 * s;
    blobs.push([x + Math.cos(a) * d, cy - rng() * 16 * s, (10 + rng() * 12) * s]);
  }
  for (const [c, col, dy, k] of [[P.dark, P.dark, 2.5 * s, 0.98], [P.mid, P.mid, 0, 1], [P.hi, P.hi, -3 * s, 0.62]]) {
    ctx.fillStyle = c;
    for (const [bx, by, br] of blobs) {
      blob(ctx, bx - (col === P.hi ? br * 0.22 : 0), by + dy, br * k, rng() * 9, 0.24); ctx.fill();
    }
  }
  // 树冠边缘的碎叶点（打破光滑轮廓）
  ctx.fillStyle = P.mid;
  for (const [bx, by, br] of blobs) {
    for (let i = 0; i < 4; i++) {
      const a = rng() * 7, edge = br * RR(rng, 0.95, 1.15);
      ctx.globalAlpha = RR(rng, 0.4, 0.8);
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * edge, by + Math.sin(a) * edge * 0.9, RR(rng, 1.2, 2.6) * s, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (P.accent) {
    ctx.fillStyle = P.accent;
    for (let i = 0; i < 14; i++) {
      const a = rng() * 7, d = rng() * 26 * s;
      ctx.globalAlpha = RR(rng, 0.5, 0.95);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, (1.3 + rng() * 1.3) * s, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** 松树：三四层塔形 + 可选积雪压枝 */
function pineTree(ctx, x, y, s, P, rng) {
  ctx.strokeStyle = P.trunk || '#6a4a3a'; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16 * s); ctx.stroke();
  for (let L = 0; L < 4; L++) {
    const w = (26 - L * 5.5) * s, yy = y - 12 * s - L * 13 * s, hh = 17 * s;
    ctx.fillStyle = L % 2 ? P.mid : P.dark;
    ctx.beginPath(); ctx.moveTo(x - w, yy);
    ctx.quadraticCurveTo(x - w * 0.4, yy - hh * 0.5, x, yy - hh);
    ctx.quadraticCurveTo(x + w * 0.4, yy - hh * 0.5, x + w, yy);
    ctx.quadraticCurveTo(x + w * 0.5, yy + 3 * s, x, yy + 2 * s);
    ctx.quadraticCurveTo(x - w * 0.5, yy + 3 * s, x - w, yy);
    ctx.fill();
    if (P.snow) {
      ctx.fillStyle = P.snow; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x, yy - hh);
      ctx.quadraticCurveTo(x + w * 0.5, yy - hh * 0.3, x + w * 0.75, yy);
      ctx.quadraticCurveTo(x + w * 0.2, yy - hh * 0.25, x, yy - hh * 0.5);
      ctx.quadraticCurveTo(x - w * 0.4, yy - hh * 0.15, x - w * 0.75, yy);
      ctx.quadraticCurveTo(x - w * 0.1, yy - hh * 0.4, x, yy - hh);
      ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

/** 冬日光树：两级分叉的枯枝 */
function bareTree(ctx, x, y, s, col, rng) {
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  const br = (bx, by, ang, len, w) => {
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    if (w > 1.6 * s) {
      br(ex, ey, ang - 0.5 - rng() * 0.25, len * 0.62, w * 0.6);
      br(ex, ey, ang + 0.45 + rng() * 0.3, len * 0.6, w * 0.6);
    }
  };
  br(x, y, -Math.PI / 2, 34 * s, 7 * s);
}

/** 草地/坡面：底色 + 洗染 + 密集短草笔触 + 小花 */
function meadow(ctx, W, H, y, o, rng) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, y + 12);
  ctx.quadraticCurveTo(W * 0.25, y - 10, W * 0.5, y + 4);
  ctx.quadraticCurveTo(W * 0.75, y + 14, W, y - 6);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = o.base; ctx.fill(); ctx.clip();
  for (let i = 0; i < (o.spots ?? 8); i++) {
    ctx.fillStyle = i % 2 ? o.hi : o.deep;
    ctx.globalAlpha = RR(rng, 0.08, 0.2);
    blob(ctx, W * rng(), y + RR(rng, 0, H - y), W * RR(rng, 0.05, 0.15), rng() * 9, 0.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 双层草叶：后排短而淡、前排长而深
  ctx.lineCap = 'round';
  const blade = (n, h0, h1, w0, w1, alpha) => {
    ctx.strokeStyle = o.blade; ctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const gx = W * (i / n) + RR(rng, -10, 10), gy = y + RR(rng, 6, (H - y) * 0.92);
      const h = RR(rng, h0, h1), lean = RR(rng, -5, 5);
      ctx.lineWidth = RR(rng, w0, w1);
      ctx.beginPath(); ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + lean * 0.4, gy - h * 0.6, gx + lean, gy - h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  blade(Math.round((o.blades ?? 40) * 0.8), 4, 9, 1.1, 1.8, 0.5);
  blade(Math.round((o.blades ?? 40) * 1.1), 7, 15, 1.3, 2.4, 0.9);
  // 地面小石子
  if (o.stones) for (let i = 0; i < o.stones; i++) {
    const sx = W * RR(rng, 0.02, 0.98), sy = y + RR(rng, 10, (H - y) * 0.9);
    ctx.fillStyle = i % 2 ? 'rgba(150,140,125,0.55)' : 'rgba(120,110,100,0.5)';
    blob(ctx, sx, sy, RR(rng, 2, 4.5), rng() * 9, 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.arc(sx - 1, sy - 1, 1.1, 0, 7); ctx.fill();
  }
  // 小花：五瓣小点
  if (o.flowers) for (let i = 0; i < (o.flowers.n ?? 8); i++) {
    const fx = W * RR(rng, 0.03, 0.97), fy = y + RR(rng, 10, (H - y) * 0.85);
    const col = o.flowers.colors[(rng() * o.flowers.colors.length) | 0], fr = RR(rng, 2, 3.6);
    ctx.strokeStyle = '#6a8f5a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(fx, fy + fr); ctx.lineTo(fx, fy + fr + 6); ctx.stroke();
    ctx.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * Math.PI * 2;
      ctx.beginPath(); ctx.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.62, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,250,214,0.95)';
    ctx.beginPath(); ctx.arc(fx, fy, fr * 0.42, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/** 水面静态部分：渐变 + 天光带 + 岸景倒影色带 + 水平纹理丝 + 岸线弧光 */
function waterBase(ctx, W, H, y0, top, bottom, reflect, rng) {
  const g = ctx.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  // 远岸天光带（水天相接处更亮）
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + (H - y0) * 0.28);
  sky.addColorStop(0, 'rgba(255,252,238,0.30)'); sky.addColorStop(1, 'rgba(255,252,238,0)');
  ctx.fillStyle = sky; ctx.fillRect(0, y0, W, (H - y0) * 0.28);
  if (reflect) {
    ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = reflect.color;
    for (const [fx, fw, fh] of reflect.bands) {
      blob(ctx, W * fx, y0 + 12 + fh * 0.4, Math.max(W * fw, fh), rng() * 9, 0.3);
      ctx.fill();
    }
    // 倒影的纵向拖影（几道竖直柔痕）
    ctx.globalAlpha = 0.10;
    for (const [fx] of reflect.bands) {
      for (let i = 0; i < 3; i++) {
        const x = W * fx + RR(rng, -14, 14), len = RR(rng, 18, 46);
        ctx.strokeStyle = reflect.color; ctx.lineWidth = RR(rng, 2, 5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y0 + 6); ctx.lineTo(x + RR(rng, -4, 4), y0 + 6 + len); ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {              // 细密水平纹理
    const y = y0 + RR(rng, 6, H - y0 - 4), x = W * rng(), len = RR(rng, 14, 70);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  }
  // 岸线弧光（沿水岸的柔和弧线）
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const x = W * RR(rng, 0.1, 0.9), yy = y0 + RR(rng, 4, 12);
    ctx.beginPath(); ctx.moveTo(x - 30, yy + 4);
    ctx.quadraticCurveTo(x, yy - 6, x + 30, yy + 4); ctx.stroke();
  }
}

/** 林间光束（斜落的柔和光柱） */
function lightShafts(ctx, W, H, cx, tint, rng, n = 3) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = cx + RR(rng, -W * 0.28, W * 0.28), w = RR(rng, W * 0.03, W * 0.08);
    const tilt = RR(rng, 0.22, 0.45);
    const g = ctx.createLinearGradient(x, 0, x + tilt * H, H);
    g.addColorStop(0, `rgba(${tint},${RR(rng, 0.16, 0.26)})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, -10); ctx.lineTo(x + w, -10);
    ctx.lineTo(x + w + tilt * H, H + 10); ctx.lineTo(x + tilt * H - w * 0.4, H + 10);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** 高空小飞鸟（故事书里常见的小细节） */
function birdFlock(ctx, x, y, rng, n = 4, col = 'rgba(90,80,90,0.5)') {
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const bx = x + i * 15 + RR(rng, -6, 6), by = y + RR(rng, -8, 8), s = RR(rng, 3, 5.5);
    ctx.beginPath();
    ctx.moveTo(bx - s, by); ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.7, bx, by);
    ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by);
    ctx.stroke();
  }
}

/** 前景框景：角落大而柔的暗色植物（轻微景深感） */
function foreFoliage(ctx, W, H, corners, rng) {
  for (const side of corners) {
    const x = side === 'l' ? 0 : W, dir = side === 'l' ? 1 : -1;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#2e4428';
    blob(ctx, x + dir * RR(rng, 20, 50), H - RR(rng, 10, 40), RR(rng, 60, 110), rng() * 9, 0.35); ctx.fill();
    for (let i = 0; i < 5; i++) {             // 几片大叶
      const a = -Math.PI / 2 + dir * RR(rng, 0.2, 1.2);
      const lx = x + dir * RR(rng, 10, 60), ly = H - RR(rng, 0, 30), len = RR(rng, 50, 110);
      ctx.strokeStyle = 'rgba(46,68,40,0.5)'; ctx.lineWidth = RR(rng, 8, 16); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + Math.cos(a) * len * 0.5, ly + Math.sin(a) * len * 0.5,
                           lx + Math.cos(a) * len, ly + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 小木屋（雪原远处，点一盏暖窗） */
function cabin(ctx, x, y, s, rng) {
  ctx.fillStyle = '#7a5a44';
  ctx.fillRect(x - 20 * s, y - 24 * s, 40 * s, 24 * s);
  ctx.fillStyle = '#8d6a50';
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 20 * s, y - 24 * s + i * 8 * s + 1, 40 * s, 5 * s);
  ctx.fillStyle = '#5f4234';                  // 屋顶积雪
  ctx.beginPath();
  ctx.moveTo(x - 26 * s, y - 22 * s); ctx.lineTo(x, y - 40 * s); ctx.lineTo(x + 26 * s, y - 22 * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2f6fc';
  ctx.beginPath();
  ctx.moveTo(x - 25 * s, y - 23 * s); ctx.lineTo(x, y - 39 * s); ctx.lineTo(x + 25 * s, y - 23 * s);
  ctx.quadraticCurveTo(x, y - 28 * s, x - 25 * s, y - 23 * s);
  ctx.fill();
  drawGlow(ctx, glow(255, 196, 110), x + 8 * s, y - 12 * s, 26 * s, 0.9);   // 暖窗
  ctx.fillStyle = '#ffd894';
  ctx.fillRect(x + 4 * s, y - 16 * s, 8 * s, 8 * s);
  ctx.strokeStyle = '#5f4234'; ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 4 * s, y - 16 * s, 8 * s, 8 * s);
}

/** 荷叶（静态大 pad；水面的微动在动态层） */
function lilyPad(ctx, x, y, r, col, hi, rng) {
  ctx.fillStyle = col;
  blob(ctx, x, y, r, rng() * 9, 0.16); ctx.fill();
  ctx.strokeStyle = 'rgba(60,110,60,0.25)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {               // 叶脉
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.8); ctx.stroke();
  }
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.2, r * 0.38, r * 0.18, -0.5, 0, 7); ctx.fill();
}

/* ============================================================
 * 动态层小件（每帧绘制，保持轻量）
 * ============================================================ */
function sunGlowLive(ctx, x, y, r, rgb, t) {
  drawGlow(ctx, glow(rgb[0], rgb[1], rgb[2]), x, y, r * (8 + Math.sin(t * 0.7) * 0.6), 0.5);
}
/** 芦苇：随风摆动 */
function reeds(ctx, W, H, groundY, t, color, alpha = 1) {
  const w = wind(t);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const h = 60 + (i % 4) * 18;
    for (const side of [0, 1]) {
      const x = side ? W - 30 - i * 18 - (i % 3) * 12 : 26 + i * 20 + (i % 3) * 14;
      const sway = (Math.sin(t * 1.15 + i + side * 2) * 5 + w * 7);
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(x, groundY);
      ctx.quadraticCurveTo(x + sway * 0.4, groundY - h * 0.6, x + sway, groundY - h);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x + sway, groundY - h - 6, 3.5, 9, sway * 0.02, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
function grassTufts(ctx, W, H, y, t, color) {
  const w = wind(t);
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = (i + 0.5) * W / 14 + Math.sin(i * 7) * 8;
    const sway = Math.sin(t * 1.6 + i * 1.3) * 3 + w * 5;
    const h = 14 + (i % 3) * 7;
    ctx.beginPath(); ctx.moveTo(x, y + 4);
    ctx.quadraticCurveTo(x + sway * 0.5, y - h * 0.6, x + sway, y - h);
    ctx.stroke();
  }
}
/** 水面动态：日月倒影光柱 + 波光短线 + 波纹弧 */
function waterLive(ctx, W, H, y0, t, opts = {}) {
  if (opts.light) {
    const lx = opts.light.x * W, lw = 26 + Math.sin(t * 0.8) * 6;
    const lg = ctx.createLinearGradient(0, y0, 0, H);
    lg.addColorStop(0, opts.light.color); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(lx - lw / 2, y0);
    for (let yy = y0; yy < H; yy += 18) ctx.lineTo(lx - lw / 2 + Math.sin(yy * 0.08 + t * 2) * 7, yy);
    for (let yy = H; yy > y0; yy -= 18) ctx.lineTo(lx + lw / 2 + Math.sin(yy * 0.08 + t * 2) * 7, yy);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.strokeStyle = opts.shimmer || 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const y = y0 + 12 + i * (H - y0) * 0.1;
    const phase = t * 0.6 + i * 1.7;
    const x = W * 0.5 + Math.sin(phase) * W * 0.3;
    const len = W * (0.14 + 0.05 * Math.sin(i * 2.4));
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t + i);
    ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 3; i++) {
    const y = y0 + 20 + i * (H - y0) * 0.24;
    const x = W * (0.3 + 0.25 * i) + Math.sin(t * 0.5 + i * 2) * W * 0.06;
    ctx.beginPath();
    ctx.moveTo(x - 34, y); ctx.quadraticCurveTo(x - 17, y - 7, x, y);
    ctx.quadraticCurveTo(x + 17, y + 7, x + 34, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/** 闪光点（固定位置，随时间眨眼） */
function twinkles(ctx, W, H, t, spots, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  spots.forEach(([fx, fy, s], i) => {
    const a = Math.max(0, Math.sin(t * 1.6 + i * 2.2));
    if (a < 0.15) return;
    const x = fx * W, y = fy * H, r = 3 + s * 3;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

/* ============================================================
 * 场景注册表：base 静态层 + live 动态层
 * ============================================================ */
export const SCENES = {

  /* ---------- 一章 · 池塘清晨（标题页同款） ---------- */
  pondMorning: {
    mood: 'warm',
    particles: [{ type: 'dandelion', n: 6 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#ffeecb'], [0.52, '#fcd9a8'], [1, '#f8c896']], '255,250,238');
      bakeSun(ctx, W, W * 0.82, H * 0.17, 30, '#ffe1a0', [255, 214, 150], rng, 9);
      bakeCloud(ctx, W * 0.24, H * 0.12, 1.1, '255,251,242', rng);
      bakeCloud(ctx, W * 0.62, H * 0.09, 0.75, '255,251,242', rng);
      birdFlock(ctx, W * 0.4, H * 0.1, rng, 4);
      hillWash(ctx, W, H, H * 0.46, 36, { base: '#b3d19a', deep: '#8fba7e', hi: '#cfe3b0', ph: 0.7, spots: 9, rim: 'rgba(255,250,220,0.7)' }, rng);
      treeline(ctx, W, H * 0.452, '#9cb986', rng, 0.8);       // 远山树线
      mist(ctx, W, H * 0.46, 0.5);
      hillWash(ctx, W, H, H * 0.53, 26, { base: '#93c283', deep: '#79ab6c', hi: '#a9d394', ph: 2.9, spots: 9 }, rng);
      waterBase(ctx, W, H, H * 0.56, '#9fd0c5', '#6ca6b8', { color: '#5d9468', bands: [[0.28, 0.1, 16], [0.72, 0.12, 20]] }, rng);
      meadow(ctx, W, H, H * 0.5, { base: '#9cc98a', deep: '#7fb471', hi: '#b6dba0', blade: '#6a9c5e', spots: 7, blades: 52, stones: 8,
        flowers: { n: 12, colors: ['#f4b8c8', '#ffd98c', '#fff'] } }, rng);
      // 两岸草坡上的树
      richTree(ctx, W * 0.07, H * 0.52, 0.9, { trunk: '#7d6a4a', dark: '#6fa25e', mid: '#8bbb72', hi: '#a8d08a' }, rng);
      richTree(ctx, W * 0.95, H * 0.55, 1.0, { trunk: '#7d6a4a', dark: '#689c5c', mid: '#84b56e', hi: '#9fcb86' }, rng);
      // 荷叶群 + 两朵荷花
      lilyPad(ctx, W * 0.12, H * 0.66, 24, '#79b06a', 'rgba(255,255,255,0.22)', rng);
      lilyPad(ctx, W * 0.2, H * 0.73, 19, '#6da462', 'rgba(255,255,255,0.18)', rng);
      lilyPad(ctx, W * 0.88, H * 0.68, 22, '#79b06a', 'rgba(255,255,255,0.2)', rng);
      lilyPad(ctx, W * 0.8, H * 0.76, 17, '#6da462', 'rgba(255,255,255,0.16)', rng);
      for (const [fx, fy] of [[0.12, 0.66], [0.88, 0.68]]) {   // 含苞的荷花
        const lx = W * fx, ly = H * fy;
        ctx.fillStyle = '#f6c6d2';
        blob(ctx, lx + 6, ly - 12, 7, rng() * 9, 0.2); ctx.fill();
        ctx.fillStyle = '#fbe2ea';
        blob(ctx, lx + 4, ly - 14, 4.4, rng() * 9, 0.2); ctx.fill();
        ctx.strokeStyle = '#7fa070'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(lx, ly - 4); ctx.quadraticCurveTo(lx + 4, ly - 8, lx + 6, ly - 8); ctx.stroke();
      }
      granulate(ctx, W, H, 0.56, 0.98, 'rgba(70,120,120,0.5)', rng, 70, 0.05);   // 水面色粒
      foreFoliage(ctx, W, H, ['l'], rng);
    },
    live(ctx, W, H, t) {
      sunGlowLive(ctx, W * 0.82, H * 0.17, 30, [255, 214, 150], t);
      waterLive(ctx, W, H, H * 0.56, t, { light: { x: 0.82, color: 'rgba(255,226,160,0.55)' } });
      twinkles(ctx, W, H, t, [[0.3, 0.63, 0.4], [0.55, 0.68, 0.6], [0.78, 0.66, 0.5], [0.44, 0.74, 0.3]], 'rgba(255,255,240,0.9)');
      reeds(ctx, W, H, H * 0.58, t, '#5f8f5a');
    },
  },

  /* ---------- 一章 · 夜晚池塘 ---------- */
  pondNight: {
    mood: 'warm',
    particles: [{ type: 'firefly', n: 11 }, { type: 'star', n: 26 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#2e3d63'], [0.55, '#232e4d'], [1, '#1c2440']], '190,205,232', 2);
      // 银河淡带 + 烘焙星团（动态层还有闪烁星）
      ctx.save(); ctx.translate(W * 0.55, H * 0.22); ctx.rotate(-0.35);
      streakCloud(ctx, 0, 0, W * 0.42, 26, 'rgba(226,232,246,0.10)', rng);
      ctx.restore();
      ctx.fillStyle = 'rgba(240,244,252,0.5)';
      for (let i = 0; i < 22; i++) {
        ctx.globalAlpha = RR(rng, 0.2, 0.7);
        ctx.beginPath(); ctx.arc(W * rng(), H * RR(rng, 0.03, 0.4), RR(rng, 0.5, 1.2), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      bakeSun(ctx, W, W * 0.78, H * 0.14, 22, '#f4eccb', [220, 224, 200], rng, 6);  // 月亮
      hillWash(ctx, W, H, H * 0.46, 30, { base: '#2a3554', deep: '#202a46', hi: '#354260', ph: 1.6, spots: 7 }, rng);
      mist(ctx, W, H * 0.46, 0.3, '200,214,236');
      waterBase(ctx, W, H, H * 0.56, '#35537e', '#22355a', { color: '#1d2f4e', bands: [[0.3, 0.1, 14], [0.7, 0.11, 16]] }, rng);
      // 岸边剪影树
      richTree(ctx, W * 0.08, H * 0.54, 1.0, { trunk: '#1d2840', dark: '#1a2438', mid: '#212d48', hi: '#283654' }, rng);
      lilyPad(ctx, W * 0.18, H * 0.68, 20, '#24405c', 'rgba(200,216,240,0.14)', rng);
      lilyPad(ctx, W * 0.86, H * 0.72, 17, '#24405c', 'rgba(200,216,240,0.12)', rng);
    },
    live(ctx, W, H, t) {
      sunGlowLive(ctx, W * 0.78, H * 0.14, 22, [220, 224, 200], t);
      waterLive(ctx, W, H, H * 0.56, t, {
        light: { x: 0.78, color: 'rgba(244,236,203,0.5)' },
        shimmer: 'rgba(244,236,203,0.26)',
      });
      twinkles(ctx, W, H, t, [[0.3, 0.64, 0.5], [0.6, 0.7, 0.4], [0.85, 0.66, 0.55]], 'rgba(244,236,203,0.8)');
      reeds(ctx, W, H, H * 0.58, t, '#2c3a30');
    },
  },

  /* ---------- 二章 · 秋日森林 ---------- */
  forestAutumn: {
    mood: 'travel',
    particles: [{ type: 'leaf', n: 11 }, { type: 'dandelion', n: 4 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#ffe9c6'], [0.5, '#f6c690'], [1, '#efae74']], '255,244,226');
      bakeSun(ctx, W, W * 0.18, H * 0.18, 26, '#ffd894', [255, 205, 140], rng, 8);
      bakeCloud(ctx, W * 0.66, H * 0.1, 0.9, '255,248,236', rng);
      birdFlock(ctx, W * 0.55, H * 0.09, rng, 3);
      hillWash(ctx, W, H, H * 0.5, 32, { base: '#cfa874', deep: '#b58f5e', hi: '#e0bd8a', ph: 0.4, spots: 9, rim: 'rgba(255,240,210,0.6)' }, rng);
      mist(ctx, W, H * 0.5, 0.5, '255,240,220');
      // 三层树：远淡 → 近浓（光柱画在远树后、近树前，像从枝叶间洒下）
      richTree(ctx, W * 0.5, H * 0.56, 0.75, { trunk: '#9a6c48', dark: '#dca45e', mid: '#e8b678', hi: '#f4cd96' }, rng);
      richTree(ctx, W * 0.66, H * 0.58, 0.9, { trunk: '#8a5a3a', dark: '#cf8347', mid: '#e09a5c', hi: '#efb680' }, rng);
      lightShafts(ctx, W, H, W * 0.2, '255,232,170', rng, 3);
      richTree(ctx, W * 0.12, H * 0.62, 1.4, { trunk: '#8a5a3a', dark: '#d98f4f', mid: '#e8a44f', hi: '#f4c078', accent: '#c96a3e' }, rng);
      richTree(ctx, W * 0.88, H * 0.63, 1.5, { trunk: '#8a5a3a', dark: '#d98f4f', mid: '#e8a44f', hi: '#f4c078', accent: '#c96a3e' }, rng);
      meadow(ctx, W, H, H * 0.62, { base: '#bb9058', deep: '#a37c48', hi: '#d0a86c', blade: '#8a6740', spots: 8, blades: 46, stones: 7,
        flowers: { n: 6, colors: ['#e8875f', '#ffd98c'] } }, rng);
      // 地上光斑
      ctx.fillStyle = 'rgba(255,232,170,0.14)';
      for (let i = 0; i < 5; i++) {
        blob(ctx, W * rng(), H * RR(rng, 0.66, 0.78), RR(rng, 30, 70), rng() * 9, 0.3); ctx.fill();
      }
      meadow(ctx, W, H, H * 0.74, { base: '#a67d48', deep: '#8d683c', hi: '#bc9458', blade: '#7c5c36', spots: 7, blades: 40 }, rng);
      // 蕨类（树脚一丛放射的弯叶，画在草地上）
      for (const [fx, fy] of [[0.17, 0.7], [0.84, 0.72], [0.4, 0.78]]) {
        const fxp = W * fx, fyp = H * fy;
        ctx.strokeStyle = '#7c8a4e'; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.42, len = RR(rng, 16, 26);
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(fxp, fyp);
          ctx.quadraticCurveTo(fxp + Math.cos(a) * len * 0.5, fyp + Math.sin(a) * len * 0.7,
                               fxp + Math.cos(a) * len, fyp + Math.sin(a) * len * 0.9);
          ctx.stroke();
        }
      }
      // 小蘑菇
      for (const [fx, fy] of [[0.26, 0.78], [0.6, 0.76], [0.75, 0.82]]) {
        const mx = W * fx, my = H * fy, ms = RR(rng, 0.8, 1.3);
        ctx.fillStyle = '#c96a3e';
        ctx.beginPath(); ctx.ellipse(mx, my - 7 * ms, 7 * ms, 5 * ms, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f4e0c8';
        ctx.fillRect(mx - 1.6 * ms, my - 7 * ms, 3.2 * ms, 7 * ms);
        ctx.fillStyle = 'rgba(255,240,220,0.6)';
        ctx.beginPath(); ctx.arc(mx - 2 * ms, my - 8.5 * ms, 1.4 * ms, 0, 7); ctx.fill();
      }
      // 满地秋叶
      for (let i = 0; i < 26; i++) {
        const lx = W * RR(rng, 0.02, 0.98), ly = H * RR(rng, 0.66, 0.95);
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(rng() * 7);
        ctx.fillStyle = pick(leafColors); ctx.globalAlpha = RR(rng, 0.5, 0.9);
        ctx.beginPath(); ctx.ellipse(0, 0, RR(rng, 3.4, 6), RR(rng, 1.8, 3), 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      foreFoliage(ctx, W, H, ['l', 'r'], rng);
    },
    live(ctx, W, H, t) {
      grassTufts(ctx, W, H, H * 0.8, t, '#8a6740');
    },
  },

  /* ---------- 二章 · 夜路细雨 ---------- */
  forestNight: {
    mood: 'travel',
    particles: [{ type: 'firefly', n: 12 }, { type: 'star', n: 20 }, { type: 'drizzle', n: 14 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#3b3b62'], [0.55, '#262a45'], [1, '#1f2238']], '170,182,214', 2);
      bakeSun(ctx, W, W * 0.2, H * 0.13, 18, '#f0e6c0', [214, 218, 190], rng, 5);
      hillWash(ctx, W, H, H * 0.5, 30, { base: '#2d3050', deep: '#232742', hi: '#383c5e', ph: 1.1, spots: 7 }, rng);
      mist(ctx, W, H * 0.5, 0.28, '190,200,224');
      richTree(ctx, W * 0.12, H * 0.62, 1.4, { trunk: '#241c30', dark: '#32425a', mid: '#3a4a5e', hi: '#46586e' }, rng);
      richTree(ctx, W * 0.88, H * 0.63, 1.5, { trunk: '#241c30', dark: '#32425a', mid: '#3a4a5e', hi: '#46586e' }, rng);
      richTree(ctx, W * 0.55, H * 0.55, 0.8, { trunk: '#241c30', dark: '#2c3a50', mid: '#33425a', hi: '#3e5068' }, rng);
      meadow(ctx, W, H, H * 0.62, { base: '#34415e', deep: '#2a3550', hi: '#3e4c6a', blade: '#263148', spots: 7 }, rng);
      meadow(ctx, W, H, H * 0.74, { base: '#2c3852', deep: '#232d46', hi: '#36445f', blade: '#202a40', spots: 6 }, rng);
      // 发光蘑菇（画在草地上，大丛小簇）
      for (let i = 0; i < 6; i++) {
        const x = W * RR(rng, 0.05, 0.95), y = H * RR(rng, 0.7, 0.84), s = RR(rng, 0.6, 1.25);
        drawGlow(ctx, glow(180, 230, 190), x, y - 6 * s, 32 * s, 0.5);
        ctx.fillStyle = '#9fd8b0';
        ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 7 * s, 4.5 * s, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(230,255,238,0.7)';
        ctx.beginPath(); ctx.arc(x - 2 * s, y - 9.5 * s, 1.6 * s, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a7a68';
        ctx.fillRect(x - 1.6 * s, y - 8 * s, 3.2 * s, 8 * s);
      }
      // 地面夜雾
      mist(ctx, W, H * 0.8, 0.16, '200,212,232');
      foreFoliage(ctx, W, H, ['r'], rng);
    },
    live(ctx, W, H, t) {
      grassTufts(ctx, W, H, H * 0.8, t, '#263148');
    },
  },

  /* ---------- 二章 · 溪边 ---------- */
  streamSide: {
    mood: 'travel',
    particles: [{ type: 'leaf', n: 8 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#e2f2e5'], [0.55, '#c4e2c0'], [1, '#a8d4b4']], '250,255,250');
      bakeCloud(ctx, W * 0.7, H * 0.1, 1.0, '255,255,255', rng);
      bakeCloud(ctx, W * 0.28, H * 0.07, 0.7, '255,255,255', rng);
      birdFlock(ctx, W * 0.45, H * 0.1, rng, 3);
      hillWash(ctx, W, H, H * 0.42, 26, { base: '#a4cb90', deep: '#88b478', hi: '#bcdcaa', ph: 2.2, spots: 8, rim: 'rgba(255,255,250,0.6)' }, rng);
      mist(ctx, W, H * 0.42, 0.4, '240,252,238');
      richTree(ctx, W * 0.08, H * 0.5, 1.1, { trunk: '#7d6a4a', dark: '#8db26a', mid: '#9cbf72', hi: '#b2d08a' }, rng);
      richTree(ctx, W * 0.92, H * 0.52, 1.2, { trunk: '#7d6a4a', dark: '#7fa860', mid: '#8fb468', hi: '#a4c880' }, rng);
      // 垂柳：从两岸树冠垂下的柔枝
      for (const side of [0, 1]) {
        const bx = side ? W * 0.9 : W * 0.1;
        for (let i = 0; i < 5; i++) {
          const x0 = bx + RR(rng, -30, 30), len = RR(rng, 60, 130);
          ctx.strokeStyle = 'rgba(110,150,86,0.6)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x0, H * 0.42);
          ctx.bezierCurveTo(x0 + RR(rng, -14, 14), H * 0.42 + len * 0.4,
                            x0 + RR(rng, -18, 18), H * 0.42 + len * 0.7,
                            x0 + RR(rng, -10, 10), H * 0.42 + len);
          ctx.stroke();
          ctx.fillStyle = 'rgba(140,180,110,0.75)';   // 枝上小叶
          for (let k = 0; k < 5; k++) {
            const ty = H * 0.42 + len * (0.35 + k * 0.15);
            ctx.beginPath(); ctx.ellipse(x0 + RR(rng, -8, 8), ty, RR(rng, 2.4, 4), RR(rng, 1.2, 2), rng() * 3, 0, 7); ctx.fill();
          }
        }
      }
      meadow(ctx, W, H, H * 0.5, { base: '#8fbf7f', deep: '#77a869', hi: '#a5cf90', blade: '#6a9c58',
        spots: 7, flowers: { n: 10, colors: ['#fff', '#ffd98c', '#f4b8c8'] } }, rng);
      waterBase(ctx, W, H, H * 0.56, '#a8d8cd', '#6ca6b8', { color: '#5d9468', bands: [[0.1, 0.1, 14], [0.9, 0.12, 16]] }, rng);
      // 溪中踩脚石 + 石边水花
      for (const [fx, fy, s] of [[0.32, 0.63, 1], [0.52, 0.66, 1.2], [0.72, 0.63, 0.9], [0.44, 0.7, 1]]) {
        const x = W * fx, y = H * fy;
        ctx.fillStyle = '#9a9084';
        blob(ctx, x, y, 17 * s, rng() * 9, 0.2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        blob(ctx, x - 4 * s, y - 4 * s, 8 * s, rng() * 9, 0.2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - 20 * s, y + 3); ctx.quadraticCurveTo(x, y - 4, x + 20 * s, y + 3); ctx.stroke();
      }
      meadow(ctx, W, H, H * 0.88, { base: '#7fb069', deep: '#6a9c58', hi: '#92c07c', blade: '#5c8c4c',
        spots: 6, flowers: { n: 8, colors: ['#f4b8c8', '#fff'] } }, rng);
      foreFoliage(ctx, W, H, ['l'], rng);
    },
    live(ctx, W, H, t) {
      waterLive(ctx, W, H, H * 0.56, t);
      twinkles(ctx, W, H, t, [[0.35, 0.62, 0.5], [0.6, 0.66, 0.6], [0.8, 0.7, 0.4]], 'rgba(255,255,255,0.85)');
      grassTufts(ctx, W, H, H * 0.93, t, '#6a9c58');
    },
  },

  /* ---------- 二章 · 黄昏岔路口 ---------- */
  crossroadsDusk: {
    mood: 'travel',
    particles: [{ type: 'dandelion', n: 5 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#ffddaa'], [0.45, '#f2a37c'], [1, '#d97e6a']], '255,230,200', 4);
      bakeSun(ctx, W, W * 0.5, H * 0.28, 36, '#ffb37a', [255, 168, 118], rng, 10);
      bakeCloud(ctx, W * 0.2, H * 0.14, 0.9, '255,225,196', rng);
      bakeCloud(ctx, W * 0.8, H * 0.11, 0.8, '255,225,196', rng);
      birdFlock(ctx, W * 0.35, H * 0.16, rng, 5, 'rgba(110,70,80,0.5)');
      hillWash(ctx, W, H, H * 0.5, 30, { base: '#a86e74', deep: '#8e5862', hi: '#c08690', ph: 0.9, spots: 8, rim: 'rgba(255,220,190,0.65)' }, rng);
      mist(ctx, W, H * 0.5, 0.42, '255,226,196');
      richTree(ctx, W * 0.08, H * 0.6, 1.2, { trunk: '#5c4044', dark: '#7c5560', mid: '#8a5f6a', hi: '#9c7180', accent: '#d99a6a' }, rng);
      richTree(ctx, W * 0.93, H * 0.6, 1.1, { trunk: '#5c4044', dark: '#7c5560', mid: '#8a5f6a', hi: '#9c7180' }, rng);
      // 指路牌
      const sx = W * 0.62, sy = H * 0.6;
      ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 46); ctx.stroke();
      ctx.fillStyle = '#a8764a';
      ctx.beginPath(); ctx.moveTo(sx - 30, sy - 46); ctx.lineTo(sx + 8, sy - 46);
      ctx.lineTo(sx + 16, sy - 38); ctx.lineTo(sx + 8, sy - 30); ctx.lineTo(sx - 30, sy - 30);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,40,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      // 两条岔路（长长的影子）
      ctx.fillStyle = 'rgba(70,50,60,0.18)';
      ctx.beginPath(); ctx.ellipse(W * 0.1, H * 0.64, 90, 14, 0.15, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W * 0.9, H * 0.64, 90, 14, -0.15, 0, 7); ctx.fill();
      // 树木拉长的黄昏投影（太阳在中天，影子向两侧）
      ctx.fillStyle = 'rgba(90,55,60,0.14)';
      ctx.beginPath(); ctx.ellipse(W * 0.16, H * 0.66, 130, 16, -0.28, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W * 0.86, H * 0.66, 120, 15, 0.28, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9a878';
      ctx.beginPath(); ctx.moveTo(W * 0.48, H * 0.62);
      ctx.quadraticCurveTo(W * 0.3, H * 0.8, W * 0.12, H);
      ctx.lineTo(W * 0.38, H); ctx.quadraticCurveTo(W * 0.46, H * 0.8, W * 0.52, H * 0.64); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W * 0.52, H * 0.62);
      ctx.quadraticCurveTo(W * 0.7, H * 0.8, W * 0.88, H);
      ctx.lineTo(W * 0.62, H); ctx.quadraticCurveTo(W * 0.54, H * 0.8, W * 0.48, H * 0.64); ctx.fill();
      meadow(ctx, W, H, H * 0.62, { base: '#9aa06a', deep: '#828a58', hi: '#b0b47c', blade: '#87905a',
        spots: 7, flowers: { n: 7, colors: ['#ffd98c', '#e8875f'] } }, rng);
      foreFoliage(ctx, W, H, ['l', 'r'], rng);
    },
    live(ctx, W, H, t) {
      sunGlowLive(ctx, W * 0.5, H * 0.28, 36, [255, 168, 118], t);
      grassTufts(ctx, W, H, H * 0.68, t, '#87905a');
    },
  },

  /* ---------- 三章 · 雪原 ---------- */
  snowfield: {
    mood: 'snow',
    particles: [{ type: 'snow', n: 26 }, { type: 'snowBig', n: 12 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#e9eff8'], [0.55, '#cddcec'], [1, '#b9c9e2']], '250,252,255', 2);
      bakeCloud(ctx, W * 0.3, H * 0.12, 1.2, '255,255,255', rng);
      bakeCloud(ctx, W * 0.75, H * 0.09, 0.9, '255,255,255', rng);
      hillWash(ctx, W, H, H * 0.5, 26, { base: '#cfdcec', deep: '#bccfe2', hi: '#e2ecf6', ph: 1.3, spots: 8, rim: 'rgba(255,255,255,0.85)' }, rng);
      mist(ctx, W, H * 0.5, 0.4, '240,246,252');
      // 远处小木屋（暖窗 + 烟囱炊烟）
      cabin(ctx, W * 0.5, H * 0.56, 1.0, rng);
      ctx.fillStyle = '#5f4234';
      ctx.fillRect(W * 0.5 - 14, H * 0.56 - 52, 7, 14);      // 烟囱
      for (let i = 0; i < 4; i++) {                           // 三四缕软烟
        streakCloud(ctx, W * 0.5 - 10 + i * 5 + Math.sin(i) * 4, H * 0.56 - 60 - i * 13,
          16 + i * 7, 7 - i * 0.8, `rgba(226,232,240,${0.35 - i * 0.07})`, rng);
      }
      // 松树行列（远小近大）
      pineTree(ctx, W * 0.28, H * 0.57, 1.0, { dark: '#8aa8c0', mid: '#a4bcd0', snow: '#eef4fb' }, rng);
      pineTree(ctx, W * 0.7, H * 0.58, 1.15, { dark: '#84a2ba', mid: '#9eb8cc', snow: '#eef4fb' }, rng);
      pineTree(ctx, W * 0.58, H * 0.55, 0.7, { dark: '#92aec4', mid: '#aac2d4', snow: '#eef4fb' }, rng);
      bareTree(ctx, W * 0.1, H * 0.6, 1.2, '#7a6a68', rng);
      bareTree(ctx, W * 0.9, H * 0.62, 1.3, '#7a6a68', rng);
      // 雪原大坡（几层雪浪 + 蓝色阴影）
      hillWash(ctx, W, H, H * 0.64, 20, { base: '#f2f6fc', deep: '#dbe6f2', hi: '#ffffff', ph: 2.4, spots: 9 }, rng);
      ctx.fillStyle = 'rgba(168,192,222,0.22)';
      ctx.beginPath(); ctx.ellipse(W * 0.35, H * 0.78, W * 0.3, H * 0.045, 0.05, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.88, W * 0.26, H * 0.05, -0.04, 0, 7); ctx.fill();
      // 一串小脚印 + 雪面闪光点 + 蓝调色粒
      ctx.fillStyle = 'rgba(150,175,205,0.5)';
      for (let i = 0; i < 7; i++) {
        const fx = 0.2 + i * 0.07, fy = 0.82 + Math.sin(i * 1.4) * 0.02;
        ctx.beginPath(); ctx.ellipse(W * fx, H * fy, 3.4, 5, 0.3, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(W * (fx + 0.012), H * fy + 8, 3, 4.4, 0.3, 0, 7); ctx.fill();
      }
      granulate(ctx, W, H, 0.64, 0.98, 'rgba(150,175,210,0.5)', rng, 110, 0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 16; i++) {                           // 雪粒闪光（静态细点）
        ctx.globalAlpha = RR(rng, 0.25, 0.7);
        ctx.beginPath(); ctx.arc(W * rng(), H * RR(rng, 0.66, 0.96), RR(rng, 0.6, 1.4), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    live(ctx, W, H, t) {
      twinkles(ctx, W, H, t, [[0.25, 0.72, 0.6], [0.45, 0.79, 0.4], [0.62, 0.73, 0.7], [0.82, 0.84, 0.5], [0.15, 0.85, 0.45]], 'rgba(255,255,255,0.95)');
    },
  },

  /* ---------- 三章 · 树洞过冬 ---------- */
  treeHollow: {
    mood: 'snow',
    particles: [{ type: 'snow', n: 10 }],
    base(ctx, W, H, rng) {
      // 洞内暖木色 + 木纹环
      washSky(ctx, W, H, rng, [[0, '#4c3c31'], [0.6, '#332820'], [1, '#241c16']], '90,70,52', 2);
      ctx.strokeStyle = 'rgba(20,12,8,0.25)'; ctx.lineWidth = 3;      // 年轮弧
      for (let i = 0; i < 9; i++) {
        const y = H * RR(rng, 0.05, 0.95), w = W * RR(rng, 0.3, 0.9);
        ctx.beginPath(); ctx.moveTo(W / 2 - w / 2, y);
        ctx.quadraticCurveTo(W / 2 + RR(rng, -60, 60), y + RR(rng, -30, 30), W / 2 + w / 2, y + RR(rng, -14, 14));
        ctx.stroke();
      }
      const R = Math.min(W, H) * 0.3, cx = W * 0.5, cy = H * 0.38;
      // 窗外雪景（烘焙部分）
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
      washSky(ctx, W, H, rng, [[0, '#d4e0ee'], [1, '#a8bcd8']], '240,246,252', 1);
      ctx.fillStyle = '#eef4fb'; ctx.fillRect(0, cy + R * 0.1, W, H);
      ctx.fillStyle = '#cfdcec';
      blob(ctx, cx - R * 0.45, cy - R * 0.4, R * 0.3, rng() * 9, 0.3); ctx.fill();
      pineTree(ctx, cx + R * 0.45, cy + R * 0.3, 0.8, { dark: '#9ab4c8', mid: '#b4cada', snow: '#f4f8fd' }, rng);
      ctx.restore();
      // 窗框 + 窗沿积雪
      ctx.strokeStyle = '#5a4636'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,20,14,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.fillStyle = '#f4f8fd';
      blob(ctx, cx, cy + R - 2, R * 0.7, rng() * 9, 0.3); ctx.fill();
      ctx.fillStyle = '#3a2c22';
      ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.94, W * 0.52, H * 0.09, 0, 0, 7); ctx.fill();
      // 洞里的落叶小床
      ctx.fillStyle = '#a86a3a';
      for (let i = 0; i < 8; i++)
        { blob(ctx, W * RR(rng, 0.32, 0.68), H * RR(rng, 0.87, 0.92), RR(rng, 10, 20), rng() * 9, 0.3); ctx.fill(); }
      // 挂着的一小串橡果
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W * 0.14, H * 0.2); ctx.lineTo(W * 0.16, H * 0.34); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#9a6a3a';
        ctx.beginPath(); ctx.ellipse(W * 0.16, H * (0.36 + i * 0.05), 7, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a4e28';
        ctx.beginPath(); ctx.ellipse(W * 0.16, H * (0.36 + i * 0.05) + 9, 5, 3, 0, 0, 7); ctx.fill();
      }
      // 石阶上的一支小蜡烛（洞里的暖光源之一）
      const cax = W * 0.82, cay = H * 0.6;
      ctx.fillStyle = '#e8dcc2';
      ctx.fillRect(cax - 5, cay - 16, 10, 16);
      ctx.fillStyle = 'rgba(120,90,60,0.4)';
      ctx.fillRect(cax - 5, cay - 16, 10, 3);
      drawGlow(ctx, glow(255, 200, 120), cax, cay - 22, 44, 0.7);
      ctx.fillStyle = '#ffd894';
      ctx.beginPath(); ctx.ellipse(cax, cay - 22, 2.6, 5, 0, 0, 7); ctx.fill();
      // 墙上的苔点与小裂纹
      ctx.fillStyle = 'rgba(120,140,90,0.35)';
      for (let i = 0; i < 14; i++) {
        blob(ctx, W * rng(), H * RR(rng, 0.12, 0.85), RR(rng, 2, 5), rng() * 9, 0.3); ctx.fill();
      }
    },
    live(ctx, W, H, t) {
      const R = Math.min(W, H) * 0.3, cx = W * 0.5, cy = H * 0.38;
      // 窗里飘雪
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 8; i++) {
        const x = cx - R + ((i * 53 + t * 18) % (R * 2));
        const y = cy - R + ((i * 71 + t * 26) % (R * 2));
        ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3) * 0.7, 0, 7); ctx.fill();
      }
      ctx.restore();
      // 暖黄的灯光（轻轻呼吸）
      drawGlow(ctx, glow(255, 198, 118), W * 0.5, H * 0.78, H * 0.75, 0.55 + Math.sin(t * 2.2) * 0.05);
    },
  },

  /* ---------- 四章 · 春日湖面 ---------- */
  springLake: {
    mood: 'spring',
    particles: [{ type: 'petal', n: 14 }],
    base(ctx, W, H, rng) {
      washSky(ctx, W, H, rng, [[0, '#fff6e4'], [0.5, '#ffe0d6'], [1, '#ffd0cc']], '255,250,246');
      bakeSun(ctx, W, W * 0.16, H * 0.14, 28, '#ffd98c', [255, 215, 165], rng, 8);
      bakeCloud(ctx, W * 0.72, H * 0.1, 1.1, '255,253,248', rng);
      bakeCloud(ctx, W * 0.4, H * 0.07, 0.7, '255,253,248', rng);
      birdFlock(ctx, W * 0.6, H * 0.09, rng, 4, 'rgba(150,110,110,0.45)');
      hillWash(ctx, W, H, H * 0.46, 28, { base: '#aed4a4', deep: '#93bd8a', hi: '#c4e2b4', ph: 0.5, spots: 9, rim: 'rgba(255,250,240,0.7)' }, rng);
      mist(ctx, W, H * 0.46, 0.45, '255,246,238');
      // 开花的树（粉白两层花冠 + 满树花点）
      richTree(ctx, W * 0.1, H * 0.56, 1.3, { trunk: '#8a5a4a', dark: '#f0a8be', mid: '#f4b8c8', hi: '#fbd6e0', accent: '#fff0f5' }, rng);
      richTree(ctx, W * 0.9, H * 0.58, 1.45, { trunk: '#8a5a4a', dark: '#f2b2c6', mid: '#f7c6d4', hi: '#fde2ea', accent: '#fff5f8' }, rng);
      richTree(ctx, W * 0.52, H * 0.5, 0.8, { trunk: '#8a5a4a', dark: '#f0a8be', mid: '#f4b8c8', hi: '#fbd6e0' }, rng);
      waterBase(ctx, W, H, H * 0.56, '#a8ddd0', '#79b8c9', { color: '#d894ac', bands: [[0.1, 0.08, 18], [0.9, 0.09, 20], [0.5, 0.06, 14]] }, rng);
      meadow(ctx, W, H, H * 0.5, { base: '#a8d098', deep: '#8cba84', hi: '#c2e0ae', blade: '#7cb070',
        spots: 7, flowers: { n: 12, colors: ['#f4b8c8', '#fff', '#ffd98c'] } }, rng);
      // 远处两只白天鹅（伏笔）
      for (const [fx, fy] of [[0.3, 0.63], [0.37, 0.635]]) {
        const x = W * fx, y = H * fy;
        ctx.fillStyle = '#f6f8f8';
        ctx.beginPath(); ctx.ellipse(x, y, 13, 6, -0.1, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 10, y - 7, 4.4, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f6f8f8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + 9, y - 9); ctx.quadraticCurveTo(x + 14, y - 14, x + 12, y - 18); ctx.stroke();
        ctx.fillStyle = '#e8a05a';
        ctx.beginPath(); ctx.moveTo(x + 13, y - 8); ctx.lineTo(x + 17, y - 6.6); ctx.lineTo(x + 13, y - 5.4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';                 // 倒影
        ctx.beginPath(); ctx.ellipse(x, y + 7, 12, 3.4, -0.06, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.6;   // 天鹅周身涟漪
        ctx.beginPath(); ctx.ellipse(x, y + 3, 18, 5, 0, 0, 7); ctx.stroke();
      }
      // 漂在水面的花瓣
      for (let i = 0; i < 12; i++) {
        const px = W * RR(rng, 0.05, 0.95), py = H * RR(rng, 0.59, 0.9);
        ctx.save(); ctx.translate(px, py); ctx.rotate(rng() * 7);
        ctx.fillStyle = pick(petalColors); ctx.globalAlpha = RR(rng, 0.5, 0.85);
        ctx.beginPath(); ctx.ellipse(0, 0, RR(rng, 3, 5.5), RR(rng, 1.6, 3), 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      foreFoliage(ctx, W, H, ['l', 'r'], rng);
    },
    live(ctx, W, H, t) {
      sunGlowLive(ctx, W * 0.16, H * 0.14, 28, [255, 215, 165], t);
      waterLive(ctx, W, H, H * 0.56, t, { light: { x: 0.16, color: 'rgba(255,220,165,0.4)' } });
      twinkles(ctx, W, H, t, [[0.3, 0.63, 0.5], [0.5, 0.68, 0.6], [0.7, 0.65, 0.45], [0.88, 0.72, 0.5]], 'rgba(255,255,245,0.9)');
    },
  },
};

/* ============================================================
 * 场景状态 / 粒子 / 主入口
 * ============================================================ */
let currentScene = 'pondMorning';
let particles = [];
const petalColors = ['#f7c6d4', '#f4b8c8', '#ffe0ea', '#fff2f6'];
const leafColors = ['#e8a44f', '#d98f4f', '#cf8347', '#f4c078'];

/* ============================================================
 * 增强插画背景层（assets/scenes/enhanced-scenes/*-web.webp）
 * ------------------------------------------------------------
 * 默认使用 1920×1080 的网页优化 WebP（九张合计约 2.4MB）；
 * 加载失败时自动回退 2560×1440 的超清 PNG。
 * 环境动感由程序化粒子（雪/花瓣/萤火虫等）在画布叠加层提供。
 * 双 <img> 缓冲淡入切换；画布转透明叠加层：只画角色 / 小游戏 /
 * 粒子 / 庆祝效果 / 点击涟漪 / 暗角。
 * 文件缺失时自动回退程序化绘制，行为与之前完全一致。
 * ============================================================ */
const SPECIAL_BG = {
  springJourney: 'assets/scenes/handpainted-rework-v2/spring-journey-web.webp',
  springForest: 'assets/scenes/handpainted-rework-v2/forest-creek-web.webp',
  springDusk: 'assets/scenes/handpainted-rework-v2/windy-dusk-web.webp',
};
const SPECIAL_BG_FALLBACK = {
  springJourney: 'assets/scenes/handpainted-rework-v2/spring-journey-master.png',
  springForest: 'assets/scenes/handpainted-rework-v2/forest-creek-master.png',
  springDusk: 'assets/scenes/handpainted-rework-v2/windy-dusk-master.png',
};
const BG_URL = (name) => SPECIAL_BG[name] || `assets/scenes/enhanced-scenes/${name}-web.webp`;
const BG_FALLBACK_URL = (name) => SPECIAL_BG_FALLBACK[name]
  || `assets/scenes/enhanced-scenes/${name}-enhanced.png`;
let bgEls = null, bgIdx = 0;
let bgReady = false;            // 当前背景图已加载并显示
function bgInit() {
  if (bgEls) return;
  bgEls = [document.getElementById('bgSceneA'), document.getElementById('bgSceneB')];
}
function setBgImage(name) {
  bgInit();
  const url = BG_URL(name);
  const cur = bgEls[bgIdx], next = bgEls[1 - bgIdx];
  if (cur.dataset.scene === name && cur.classList.contains('scene-active')) {
    bgReady = true;
    return;                                      // 同名不重切
  }
  bgReady = false;
  const swap = () => {
    next.classList.add('scene-active');
    cur.classList.remove('scene-active');
    next.style.opacity = '1';
    cur.style.opacity = '0';
    next.dataset.scene = name;
    bgIdx = 1 - bgIdx;
    bgReady = true;
  };
  next.onload = swap;
  next.onerror = () => {
    if (next.dataset.fallback !== '1') {
      next.dataset.fallback = '1';
      next.src = BG_FALLBACK_URL(name);           // WebP 失败 → 超清 PNG
    } else {
      bgReady = false;                            // PNG 也失败 → 程序化回退
    }
  };
  next.dataset.scene = '';
  next.dataset.fallback = '0';
  next.src = url;
  if (next.complete && next.naturalWidth) queueMicrotask(swap);
}

/* 静态层缓存（单场景；切换或改尺寸时重绘，耗时可被转场遮住） */
let baseCanvas = null, baseKey = '';

function makeParticle(type, W, H) {
  switch (type) {
    case 'leaf':      return { type, x: rand(0, W), y: rand(-H, 0), v: rand(18, 34), vx: rand(-14, 14), r: rand(4, 8), a: rand(0, 7), va: rand(-2, 2), c: pick(leafColors) };
    case 'snow':      return { type, x: rand(0, W), y: rand(-H, 0), v: rand(14, 26), vx: rand(-8, 8), r: rand(1.4, 2.6), a: 0, va: rand(1, 3) };
    case 'snowBig':   return { type, x: rand(0, W), y: rand(-H, 0), v: rand(10, 18), vx: rand(-14, 6), r: rand(3.4, 5), a: rand(0, 7), va: rand(0.5, 1.5) };
    case 'drizzle':   return { type, x: rand(0, W), y: rand(-H, 0), v: rand(150, 210), r: rand(7, 13) };
    case 'petal':     return { type, x: rand(0, W), y: rand(-H, 0), v: rand(12, 24), vx: rand(-18, 8), r: rand(3, 5.5), a: rand(0, 7), va: rand(-3, -1), c: pick(petalColors) };
    case 'dandelion': return { type, x: rand(0, W), y: rand(-H, 0), v: rand(8, 15), vx: rand(4, 16), r: rand(3, 5), a: rand(0, 7), va: rand(-0.6, 0.6) };
    case 'firefly':   return { type, x: rand(0, W), y: rand(H * 0.2, H * 0.85), t0: rand(0, 10), r: rand(2, 3.5) };
    case 'star':      return { type, x: rand(0, W), y: rand(0, H * 0.4), t0: rand(0, 10), r: rand(0.8, 1.8) };
  }
}

export function setScene(name) {
  currentScene = name;
  document.body.dataset.scene = name;
  particles = [];
  setBgImage(name);                     // 增强插画背景（缺失自动回退）
  const sc = SCENES[name];
  if (sc && sc.particles) {
    sc.particles.forEach(p => {
      for (let i = 0; i < p.n; i++) particles.push(makeParticle(p.type, innerWidth, innerHeight));
    });
  } else if (name === 'springJourney' || name === 'springForest') {
    for (let i = 0; i < 12; i++) particles.push(makeParticle('dandelion', innerWidth, innerHeight));
  } else if (name === 'springDusk') {
    for (let i = 0; i < 22; i++) particles.push(makeParticle('firefly', innerWidth, innerHeight));
  }
  return sc;
}
export function sceneMood(name) { return (SCENES[name] || {}).mood; }

/** 点击涟漪（柔和的触摸反馈） */
export const ripples = [];
export function ripple(x, y) { ripples.push({ x, y, r: 4, a: 0.5 }); }

/**
 * 庆祝粒子：
 *   'game'   小游戏完成时的花瓣绽放
 *   'star'   获得故事贴纸
 *   'feather'获得勇气之羽
 *   'festival' 结局庆典：花瓣雨 + 星光（可持续数秒）
 */
export function celebrate(kind) {
  const W = innerWidth, H = innerHeight;
  if (kind === 'festival') {
    for (let i = 0; i < 50; i++) {
      particles.push({ type: 'petal', x: rand(0, W), y: rand(-60, -10), v: rand(26, 58), vx: rand(-16, 10),
        r: rand(3, 6), a: rand(0, 7), va: rand(-2.5, 2.5), c: pick(petalColors), delay: rand(0, 5.5) });
    }
    for (let i = 0; i < 14; i++) {
      particles.push({ type: 'burstStar', x: rand(0.12, 0.88) * W, y: rand(0.12, 0.55) * H, vx: rand(-24, 24), vy: rand(-36, 8),
        r: rand(5, 9), a: rand(0, 7), va: rand(-2, 2), life: 2.4, maxLife: 2.4, delay: rand(0.5, 5) });
    }
    return;
  }
  const cx = W / 2, cy = H * 0.42;
  const type = kind === 'star' ? 'burstStar' : kind === 'feather' ? 'burstFeather' : 'petal';
  for (let i = 0; i < 18; i++) {
    const ang = rand(0, Math.PI * 2), sp = rand(90, 250);
    particles.push({ type, x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 70,
      r: rand(3.5, 7), a: rand(0, 7), va: rand(-4, 4), life: 1.35, maxLife: 1.35, c: pick(petalColors) });
  }
}

export function drawScene(ctx, W, H, t, dt) {
  const sc = SCENES[currentScene] || SCENES.pondMorning;

  if (bgReady) {
    // ---- 增强插画模式：画布透明，只叠加动态内容 ----
    ctx.clearRect(0, 0, W, H);
  } else {
    // ---- 程序化模式：静态层缓存 ----
    const key = currentScene + '@' + W + 'x' + H;
    if (baseKey !== key) {
      baseCanvas = makeCanvas(W, H);
      sc.base(baseCanvas.getContext('2d'), W, H, mulberry32(seedOf(currentScene)));
      baseKey = key;
    }
    ctx.drawImage(baseCanvas, 0, 0);
  }

  // 动态层 + 粒子（插画模式跳过程序化的芦苇/波光层以免与插画错位；
  // 环境粒子保留——静态插画需要它们提供动感）
  if (!bgReady) {
    sc.live && sc.live(ctx, W, H, t);
  }
  const w = wind(t);
  for (const p of particles) {
    if (p.delay > 0) { p.delay -= dt; continue; }
    if (p.type === 'firefly') {
      const tt = t * 0.7 + p.t0;
      const x = p.x + Math.sin(tt) * 26, y = p.y + Math.cos(tt * 0.8) * 18;
      const glowA = 0.35 + 0.3 * Math.sin(t * 2.4 + p.t0 * 3);
      drawGlow(ctx, glow(255, 236, 150), x, y, 26, glowA);
      continue;
    }
    if (p.type === 'star') {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + p.t0));
      ctx.fillStyle = `rgba(255,250,230,${tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      continue;
    }
    if (p.type === 'burstStar' || p.type === 'burstFeather' || p.type === 'petal' && p.maxLife) {
      // 庆祝粒子：重力 + 渐隐
      p.life -= dt;
      if (p.life <= 0) { p.type = '___dead'; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 210 * dt; p.a += p.va * dt;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y); ctx.rotate(p.a);
      if (p.type === 'burstStar') {
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.r, 0); ctx.lineTo(p.r, 0);
        ctx.moveTo(0, -p.r); ctx.lineTo(0, p.r);
        ctx.moveTo(-p.r * 0.5, -p.r * 0.5); ctx.lineTo(p.r * 0.5, p.r * 0.5);
        ctx.moveTo(p.r * 0.5, -p.r * 0.5); ctx.lineTo(-p.r * 0.5, p.r * 0.5);
        ctx.stroke();
      } else if (p.type === 'burstFeather') {
        ctx.fillStyle = '#eef2f6';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#c9d4de'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-p.r * 1.4, 0); ctx.lineTo(p.r * 1.4, 0); ctx.stroke();
      } else {
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
      continue;
    }
    // 常规飘落粒子
    p.y += p.v * dt; p.x += (p.vx !== undefined ? p.vx + w * 8 : 0) * dt; p.a += (p.va || 0) * dt;
    if (p.y > H + 14) Object.assign(p, makeParticle(p.type, W, H), { y: -14 });
    if (p.type === 'leaf') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.5, p.r * 0.75, 0, 0, 7); ctx.fill();
      ctx.restore();
    } else if (p.type === 'petal') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 7); ctx.fill();
      ctx.restore();
    } else if (p.type === 'snow' || p.type === 'snowBig') {
      ctx.fillStyle = p.type === 'snowBig' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    } else if (p.type === 'drizzle') {
      ctx.strokeStyle = 'rgba(190,208,228,0.4)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + p.r); ctx.stroke();
    } else if (p.type === 'dandelion') {
      // 蒲公英小伞：中心 + 放射绒毛
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const a = p.a + k * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill();
    }
  }
  particles = particles.filter(p => p.type !== '___dead');

  // 3) 点击涟漪（两种模式都保留：触摸反馈）
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += 90 * dt; rp.a -= 1.6 * dt;
    if (rp.a <= 0) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = `rgba(255,252,240,${rp.a})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 7); ctx.stroke();
  }

  // 4) 收尾：程序化模式叠水彩纸纹；两种模式都叠柔和暗角（统一电影感）
  if (!bgReady) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = getPaper(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  vignette(ctx, W, H);
}
