/** 小工具函数：各模块共用 */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** 圆角矩形路径（不填充不描边） */
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 画一个标签胶囊（小游戏里的文字说明用） */
export function label(ctx, text, x, y, opts = {}) {
  const fontSize = opts.size || 16;
  ctx.font = `800 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const w = ctx.measureText(text).width + fontSize * 1.4;
  const h = fontSize * 2;
  ctx.fillStyle = opts.bg || 'rgba(255,246,230,0.94)';
  ctx.strokeStyle = opts.border || '#e0bd8a';
  ctx.lineWidth = 2.5;
  rrect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = opts.color || '#4a3222';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}
