/**
 * ============================================================
 * 小游戏④ 善意选择（第二/三/四章 · 价值观选择）
 * ------------------------------------------------------------
 * 纯 DOM 实现：三张大卡片。选择「不理想」的选项时，由故事里的
 * 长辈角色给出温和提示，允许重选；其余选项直接进入剧情反馈。
 * 选项可以携带成长指标（成长羽毛 / 故事贴纸）与结局类型标记。
 * ============================================================
 */

export function createGame(cfg, api) {
  const onPick = (opt) => {
    api.ui.hideChoice();                       // 选完立即收起卡片，把画面还给对话
    api.audio.sfx.ok();
    api.progress?.(55, opt.reason || 'A brave choice lit the way home');
    api.finish({
      outcome: opt.outcome,       // [说话人, 台词] 选择后的剧情反馈
      give: opt.give,             // { feather|star: n }
      reason: opt.reason,         // 奖励弹层文案
      kind: opt.kind,             // 结局类型标记（第四章身份选择用）
    });
  };
  onPick.gentle = () => api.audio.sfx.gentle();   // 重选时的柔和提示音
  api.ui.choice(cfg, onPick);

  return {
    update() {},
    draw() {},
    pointerDown() {},
  };
}
