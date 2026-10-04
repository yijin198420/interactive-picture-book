/**
 * ============================================================
 * 《小羽的春天》主控：状态机 + 渲染循环 + 输入 + 存档
 * ------------------------------------------------------------
 * 状态流转：
 *   title → cover → story ⇄ game → (reward / chapterEnd) → cover…
 *   第四章末尾 → ending
 * 进度（章节 / 步骤 / 指标 / 设置）自动保存到 localStorage。
 * ============================================================
 */
import * as A from './audio.js?v=17';
import * as R from './render.js?v=6';
import * as CH from './characters.js?v=3';
import * as UI from './ui.js?v=32';
import { STORY } from '../data/story.js?v=35';
import { getEnding } from '../data/endings.js?v=13';
import { createGame as gMatch } from './games/match.js?v=2';
import { createGame as gSort } from './games/sort.js?v=3';
import { createGame as gPath } from './games/path.js?v=30';
import { createGame as gChoice } from './games/choice.js?v=2';
import { createGame as gRhythm } from './games/rhythm.js?v=31';
import { createGame as gFly } from './games/fly.js?v=2';
import { createGame as gFarm } from './games/farm.js?v=16';
import { createGame as gSudoku } from './games/sudoku.js?v=5';
import { createGame as gSpelling } from './games/spelling.js?v=8';
import { createGame as gPuzzle } from './games/puzzle.js?v=3';
import { createChallengeController } from './challenge.js?v=9';

const GAME_ENGINES = { match: gMatch, sort: gSort, path: gPath, choice: gChoice, rhythm: gRhythm, fly: gFly, farm: gFarm, sudoku: gSudoku, spelling: gSpelling, puzzle: gPuzzle };
const SAVE_KEY = 'xiaoyu-spring-save-v2';
const SET_KEY = 'xiaoyu-spring-settings-v1';

/* 说话人名字 → 角色编号（用于对口型动画与表情） */
const SPEAKER_CHAR = {
  'Feather': 'xiaoyu', 'Little Duck': 'duckling', 'Mama Duck': 'duckMom', 'Ducklings': 'duckling',
  'Acorn': 'squirrel', 'Moss': 'frog', 'Daisy': 'deer', 'Mama Deer': 'deerMom',
  'Grandpa Owl': 'owl', 'Swan': 'swan', 'Swan Mother': 'swan', 'Friends': null,
};

/* 与特定台词同步出现的绘本叠景。独立归档，避免把剧情关键物件
   烘焙进通用背景，后续可继续为其它章节补充。 */
const STORY_VISUALS = {
  reedPendantUnlit: Object.assign(new Image(), {
    src: 'assets/scenes/story-overlays-v3/reed-pendant-unlit-web.webp?v=1',
  }),
  reedPendant: Object.assign(new Image(), {
    src: 'assets/scenes/story-overlays-v2/reed-feather-nest-pendant-web.webp?v=1',
  }),
};

/* ---------- 画布 ---------- */
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resize(); R.setScene(S.scene); });
resize();

/* ---------- 全局状态 ---------- */
const S = {
  mode: 'story',             // story（剧情）/ challenge（挑战模式）
  state: 'title',            // title / cover / story / game / chapterEnd / ending
  ci: 0, si: 0,              // 章节与步骤下标
  feathers: 0, stars: 0,
  finished: false, finalChoice: null,
  scene: 'springDusk', chars: [], charsBeforeGame: [],
  speaker: null, stepEm: null, visual: null,
  game: null, gameStep: null,
  paused: false,
  chapterEarned: [],
  chapterScores: [0, 0, 0, 0],
};
let settings = { music: 70, sfx: 80, narration: true, subtitle: true };
let quickMuted = false;

/* ---------- 存档 ---------- */
function saveGame() {
  // 视觉验收预览不写入儿童的正式进度，避免开发测试覆盖真实羽光轨迹。
  if (location.search.includes('preview=')) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ci: S.ci, si: S.si, feathers: S.feathers, stars: S.stars,
      finalChoice: S.finalChoice, finished: S.finished,
      chapterEarned: S.chapterEarned,
      chapterScores: S.chapterScores,
    }));
  } catch (e) { /* 隐私模式等情况下安静跳过 */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* 每章满分 100。旧存档没有分数时，用已经获得的羽毛/贴纸平滑迁移。 */
function normalizeChapterScores(save) {
  if (save && Array.isArray(save.chapterScores)) {
    return Array.from({ length: STORY.length }, (_, i) => {
      const value = Number(save.chapterScores[i]) || 0;
      return Math.max(0, Math.min(100, Math.round(value)));
    });
  }
  const scores = Array(STORY.length).fill(0);
  const feathers = Math.max(0, Math.min(STORY.length, Number(save && save.feathers) || 0));
  const stickers = Math.max(0, Math.min(STORY.length, Number(save && save.stars) || 0));
  for (let i = 0; i < stickers; i++) scores[i] = Math.max(scores[i], 60);
  for (let i = 0; i < feathers; i++) scores[i] = 100;
  return scores;
}

function syncCollectionsFromScores() {
  S.stars = S.chapterScores.filter(score => score >= 60).length;
  S.feathers = S.chapterScores.filter(score => score >= 100).length;
}

function restoreSavedProgress(save) {
  S.chapterScores = normalizeChapterScores(save);
  syncCollectionsFromScores();
  S.finalChoice = (save && save.finalChoice) || null;
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch (e) {}
  applySettings(settings);
}
function applySettings(v) {
  settings = v;
  A.setMusicVol(quickMuted ? 0 : v.music / 100);
  A.setSfxVol(quickMuted ? 0 : v.sfx / 100);
  UI.applySettings(quickMuted ? { ...v, narration: false } : v);
  try { localStorage.setItem(SET_KEY, JSON.stringify(v)); } catch (e) {}
}

/* 孩子可以直接静音；恢复声音时回到家长设置里的音量。 */
const quickMuteBtn = document.getElementById('btnQuickMute');
function setQuickMute(on) {
  quickMuted = on;
  A.setMusicVol(on ? 0 : settings.music / 100);
  A.setSfxVol(on ? 0 : settings.sfx / 100);
  quickMuteBtn.textContent = on ? 'Sound Off' : 'Sound On';
  quickMuteBtn.setAttribute('aria-pressed', String(on));
  quickMuteBtn.classList.toggle('is-muted', on);
  UI.applySettings(on ? { ...settings, narration: false } : settings);
  UI.setSoundMuted(on);
}
quickMuteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setQuickMute(!quickMuted);
});

/* ---------- 渲染循环 ---------- */
let last = performance.now(), T = 0, visualStartedAt = 0;
const frameDts = [];                          // 最近帧耗时（性能监测用）
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    if (!S.paused) {
      T += dt;
      if (S.game && S.game.update) S.game.update(dt);
      if (S.mode === 'challenge') CHAL.update(dt);
    }
    if (location.search.includes('preview=') && S.game?.debug) {
      canvas.dataset.gameDebug = JSON.stringify(S.game.debug());
    } else if (canvas.dataset.gameDebug) {
      delete canvas.dataset.gameDebug;
    }
    frameDts.push(dt);
    if (frameDts.length > 90) frameDts.shift();
    R.drawScene(ctx, W, H, T, S.paused ? 0 : dt);
    drawStoryVisual();
    drawChars();
    if (S.game && S.game.draw) S.game.draw(ctx);
  } catch (e) {
    // 单帧绘制异常不中断游戏（记录后继续下一帧）
    console.error('frame error:', e);
    if (window.__errs) window.__errs.push('frame: ' + e.message);
  }
  requestAnimationFrame(frame);
}

/** 关键剧情物件：在背景之上、角色之后轻微漂浮，保持绘本感。 */
function drawStoryVisual() {
  const img = STORY_VISUALS[S.visual];
  if (!img || !img.complete || !img.naturalWidth) return;
  const isPendant = S.visual === 'reedPendant' || S.visual === 'reedPendantUnlit';
  const h = isPendant
    ? Math.min(H * 0.54, W * 0.5, 450)
    : Math.min(H * 0.58, W * 0.72, 500);
  const w = h * img.naturalWidth / img.naturalHeight;
  const age = Math.max(0, T - visualStartedAt);
  const reveal = 1 - Math.pow(1 - Math.min(1, age / .9), 3);
  const bob = Math.sin(T * 1.35) * 4;
  const cx = W * 0.535;
  const cy = H * 0.72 - h / 2 + bob;
  ctx.save();
  ctx.globalAlpha = (.18 + .78 * reveal);
  ctx.shadowColor = 'rgba(255, 197, 82, .3)';
  ctx.shadowBlur = 18 + Math.sin(T * 1.8) * 4;
  ctx.translate(cx, cy);
  if (isPendant) {
    const breathe = 1 + Math.sin(T * 1.1) * .008;
    ctx.rotate(Math.sin(T * .72) * .012);
    ctx.scale((.84 + .16 * reveal) * breathe, (.84 + .16 * reveal) * breathe);
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** 画当前场景角色（说话的角色带表情和口型，全体轻微待机呼吸） */
function drawChars() {
  const k = H * 0.0034;
  const speakerId = S.speaker ? SPEAKER_CHAR[S.speaker] : null;
  const talking = UI.isTyping();
  S.chars.forEach((c, i) => {
    const isSpeaker = speakerId && c.id === speakerId;
    const bob = Math.sin(T * 1.8 + i * 1.3) * 1.6;      // 安静的呼吸感
    const cs = k * (c.s || 1);
    // 柔和的落地投影，让角色"站"在地面上
    ctx.fillStyle = 'rgba(60,42,25,0.15)';
    ctx.beginPath();
    ctx.ellipse(c.x * W, c.y * H + 4 * cs / k, 20 * cs, 5.5 * cs, 0, 0, 7);
    ctx.fill();
    CH.draw(ctx, c.id, c.x * W, c.y * H + bob, cs, {
      facing: c.facing || 1,
      em: isSpeaker && S.stepEm ? S.stepEm : (c.em || 'calm'),
      t: T,
      talk: isSpeaker && talking,
    });
  });
}

/* ---------- 水彩转场（纯视觉，不改变流程逻辑） ---------- */
const irisEl = document.getElementById('iris');
function withTransition(fn) {
  irisEl.classList.add('on');
  A.sfx.whoosh();
  setTimeout(() => {
    fn();
    setTimeout(() => irisEl.classList.remove('on'), 90);
  }, 450);
}

/* ---------- 按钮统一反馈音（大按钮与选择卡） ---------- */
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('.btn, .choice-card, .chapter-card')) A.sfx.tap();
}, true);

/* ---------- 剧情推进 ---------- */
const chapter = () => STORY[S.ci];

function setBg(name) {
  if (!name || name === S.scene) return;
  S.scene = name;
  R.setScene(name);
  A.setMood(R.sceneMood(name) || chapter().mood);
}

function runStep(i) {
  const ch = chapter();
  if (i >= ch.steps.length) { chapterEnd(); return; }
  S.si = i;
  saveGame();                                  // 存档点：重新进入就是这一步
  const step = ch.steps[i];
  if (step.bg) setBg(step.bg);
  if (step.chars) S.chars = step.chars;
  if (Object.prototype.hasOwnProperty.call(step, 'visual')) {
    S.visual = step.visual;
    visualStartedAt = T;
  }

  if (step.ending) { showEnding(); return; }

  if (step.progress) {
    const changed = setChapterProgress(step.progress.score, step.progress.label);
    if (!changed) runStep(i + 1);
    else {
      const chapterAtAward = S.ci;
      setTimeout(() => {
        if (S.ci === chapterAtAward && S.si === i) runStep(i + 1);
      }, 1050);
    }
    return;
  }

  if (step.reward) {
    const type = step.reward.feather ? 'feather' : 'star';
    grant(type, step.reward[type] || 1, step.reason);
    return;
  }
  if (step.say) {
    S.state = 'story';
    S.speaker = step.say[0]; S.stepEm = step.em || null;
    UI.dialogue(step.say[0], step.say[1], { voiceId: step.say[2], onDone: () => runStep(i + 1) });
    return;
  }
  if (step.game) { startGame(step); return; }
  runStep(i + 1);                              // 未知类型：跳过（容错）
}

/**
 * 羽光轨迹：小游戏中的关键动作把本章进度推到指定刻度。
 * 使用“到达目标值”而不是简单累加，刷新或重玩都不会重复刷分。
 */
function setChapterProgress(target, label = 'A new light joined the trail') {
  if (S.mode === 'challenge') return false;
  const next = Math.max(0, Math.min(99, Math.round(Number(target) || 0)));
  const previous = S.chapterScores[S.ci] || 0;
  if (next <= previous) return false;
  S.chapterScores[S.ci] = next;
  syncCollectionsFromScores();
  saveGame();
  UI.badges(S.feathers, S.stars, 'points', next, S.ci);
  UI.pointsEarned(next - previous, next, label, S.ci);
  A.sfx.sparkle();
  return true;
}

/** 发放成长指标 + 奖励弹层 */
function grant(type, count, reason) {
  const nextStep = S.si + 1;
  UI.hideDialogue(); UI.gameHint(null); S.speaker = null;
  const targetScore = type === 'feather' ? 100 : 60;
  const previousScore = S.chapterScores[S.ci] || 0;
  const isNewReward = previousScore < targetScore;
  S.chapterScores[S.ci] = Math.max(previousScore, targetScore);
  syncCollectionsFromScores();
  S.chapterEarned.push({ type, reason, points: S.chapterScores[S.ci], replay: !isNewReward });
  S.si = nextStep;                              // 奖励出现时即记为已领取，刷新不会重复发放
  saveGame();
  UI.badges(S.feathers, S.stars, type, S.chapterScores[S.ci], S.ci);
  R.celebrate(type);                                    // 画布上的羽毛/星星绽放
  if (type === 'star') { A.sfx.star(); A.sfx.sparkle(); }
  else { A.sfx.feather(); A.sfx.chime(); }
  UI.reward(type, count, reason, () => runStep(nextStep), {
    points: S.chapterScores[S.ci], replay: !isNewReward, chapterIndex: S.ci,
  });
}

function startGame(step) {
  S.state = 'game';
  S.speaker = null; S.stepEm = null; S.visual = null;
  UI.hideDialogue();
  UI.gameHint(step.hint || step.title);
  S.charsBeforeGame = S.chars;         // 小游戏期间隐藏剧情角色，避免和游戏画面重叠混淆
  S.chars = [];
  const api = {
    W: () => W, H: () => H,
    audio: A, ui: UI, t: () => T,
    progress: (target, label) => setChapterProgress(target, label),
    finish: (result) => onGameDone(step, result),
  };
  S.gameStep = step;
  S.game = GAME_ENGINES[step.game](step.cfg || {}, api);
}

function onGameDone(step, result = {}) {
  if (S.state !== 'game') return;              // 防止重复 finish
  S.game = null; S.gameStep = null;
  S.state = 'story';
  S.chars = S.charsBeforeGame || [];           // 恢复剧情角色
  UI.gameHint(null);
  R.celebrate('game');                         // 任务完成的庆祝粒子
  if (step.whoami && result.kind) S.finalChoice = result.kind;
  const proceed = () => {
    const give = result.give || step.give;
    if (give) {
      const type = give.feather ? 'feather' : 'star';
      grant(type, give[type] || 1, result.reason || step.reason);
    } else runStep(S.si + 1);
  };
  if (result.outcome) {
    S.speaker = result.outcome[0]; S.stepEm = null;
    UI.dialogue(result.outcome[0], result.outcome[1], { voiceId: result.outcome[2], onDone: proceed });
  } else proceed();
}

function chapterEnd() {
  S.state = 'chapterEnd';
  UI.hideDialogue(); UI.gameHint(null); S.speaker = null;
  const ch = chapter();
  UI.chapterEnd(ch, S.chapterEarned, () => {
    S.chapterEarned = [];
    withTransition(() => {                     // 水彩转场进入下一章
      if (S.ci + 1 < STORY.length) openCover(S.ci + 1, false);
      else showEnding();
    });
  });
}

function openCover(ci, resume) {
  S.ci = ci;
  const ch = chapter();
  if (!resume) S.si = 0;
  S.state = 'cover'; S.chars = []; S.charsBeforeGame = []; S.speaker = null; S.visual = null; S.game = null;
  UI.hideDialogue(); UI.gameHint(null);
  setBgForce(ch.bg);
  A.setMood(ch.mood);
  saveGame();
  UI.cover(ch, {
    resume,
    onStart: () => {
      withTransition(() => {                   // 水彩转场进入章节
        UI.hideScreens();
        UI.hud(true);
        UI.badges(S.feathers, S.stars, null, S.chapterScores[S.ci] || 0, S.ci);
        S.state = 'story';
        runStep(S.si);
      });
    },
  });
}
function setBgForce(name) {
  S.scene = name; R.setScene(name);
}

/* ---------- 结局 ---------- */
function showEnding() {
  S.state = 'ending'; S.finished = true;
  setBgForce('springDusk');
  S.chars = [
    { id: 'xiaoyu', x: .36, y: .8, s: .86, em: 'happy', facing: 1 },
    { id: 'swan', x: .68, y: .78, s: 1.02, em: 'happy', facing: -1 },
  ];
  S.speaker = null; S.visual = null; UI.hideDialogue(); UI.gameHint(null);
  UI.hud(false);
  saveGame();
  const data = getEnding({ feathers: S.feathers, stars: S.stars, finalChoice: S.finalChoice });
  data.feathers = S.feathers; data.stars = S.stars;
  data.lights = S.chapterScores.reduce((sum, score) => sum + Math.floor(Math.max(0, Math.min(100, score)) / 20), 0);
  A.setMood('spring');
  withTransition(() => {
    R.celebrate('festival');                   // 春日庆典：花瓣雨与星光
    A.sfx.chime();
    UI.ending(data, { onReplay: resetGame, onTitle: gotoTitle });
  });
}
function resetGame() {
  S.feathers = 0; S.stars = 0; S.finalChoice = null;
  S.finished = false; S.chapterEarned = []; S.chapterScores = [0, 0, 0, 0];
  UI.badges(0, 0, null, 0, 0);
  openCover(0, false);
}

/* ---------- 挑战模式 ---------- */
const CHAL = createChallengeController({
  mount(name, cfg) {
    withTransition(() => {
      UI.hideScreens();
      UI.hud(false);                       // 挑战模式用自己的 HUD
      setBgForce(cfg.diff.scene);
      A.setMood(R.sceneMood(cfg.diff.scene) || 'travel');
      const api = {
        W: () => W, H: () => H, audio: A, ui: UI, t: () => T,
        progress: () => {},
        finish: (result) => { S.game = null; UI.gameHint(null); CHAL.handleResult(result || {}); },
      };
      S.state = 'game';
      S.game = GAME_ENGINES[name](cfg.gameCfg || { diff: cfg.diff }, api);
      UI.gameHint(cfg.diff.hint || cfg.title);
    });
  },
  unmount() { S.game = null; UI.gameHint(null); },
  ui: UI, audio: A,
  onExit() { S.mode = 'story'; gotoTitle(); },
});
function enterChallenge() {
  S.mode = 'challenge';
  S.paused = false;
  UI.hideScreens();
  CHAL.begin();
}
document.getElementById('btnChallenge').addEventListener('click', () => { A.ensure(); enterChallenge(); });

/* ---------- 标题 ---------- */
function gotoTitle() {
  if (S.mode === 'challenge' && CHAL.active) { CHAL.exit(); return; }   // 挑战中回标题先走退出流程
  S.state = 'title'; S.chars = []; S.speaker = null; S.visual = null; S.game = null; S.paused = false;
  S.mode = 'story';
  UI.hideDialogue(); UI.gameHint(null); UI.hud(false);
  setBgForce('springDusk');
  A.setMood('title');
  showTitle();
}
function showTitle() {
  const sv = loadSave();
  const hasSave = !!sv && !sv.finished;
  const chapterScores = normalizeChapterScores(sv);
  const hasProgress = chapterScores.some(score => score > 0);
  UI.title({
    hasSave,
    chapterScores,
    onChapterSelect: startChapter,
    onStartNew: () => {
      if (hasSave || hasProgress) {             // 有旧进度时温和确认，避免误触清档
        UI.hideScreens();                       // 先收起标题层，避免遮挡确认卡片
        UI.choice({
          question: 'Start fresh? Your saved chapter points and current place will be cleared.',
          options: [
            { icon: '📖', label: 'Keep My Points', sub: 'Return to the chapter menu' },
            { icon: '🌱', label: 'Start Fresh', sub: 'Clear points and begin Chapter One' },
          ],
        }, (opt) => {
          UI.hideChoice();
          if (opt.label === 'Start Fresh') resetGame();
          else gotoTitle();
        });
      } else resetGame();
    },
    onContinue: continueGame,
    onSettings: () => openSettings('title'),
  });
}

function startChapter(ci) {
  const sv = loadSave();
  restoreSavedProgress(sv);
  S.finished = false;
  S.chapterEarned = [];
  S.si = 0;
  UI.hideChoice();
  openCover(clampIdx(ci), false);
}

function continueGame() {
  const sv = loadSave();
  if (!sv) { resetGame(); return; }
  restoreSavedProgress(sv);
  S.chapterEarned = Array.isArray(sv.chapterEarned) ? sv.chapterEarned : [];
  S.finished = false;
  S.si = Math.max(0, sv.si | 0);              // 恢复到保存的步骤
  UI.hideChoice();
  openCover(clampIdx(sv.ci), true);
}
function clampIdx(ci) { return Math.max(0, Math.min(STORY.length - 1, ci)); }

/* ---------- 暂停 ---------- */
function pauseHandlers() {
  return {
    onResume: closePause,
    onReplayChapter: () => {
      closePause(true);
      if (S.mode === 'challenge') { CHAL.exit(); return; }
      S.chapterEarned = [];
      S.game = null; UI.gameHint(null);
      S.state = 'story';
      runStep(0);
    },
    onSettings: () => openSettings('pause'),
    onTitle: () => {
      S.paused = false; A.duckMusic(false);
      if (S.mode === 'challenge') CHAL.exit();
      else { saveGame(); gotoTitle(); }
    },
  };
}
function showPausePanel() { UI.pause(pauseHandlers()); }
function doPause() {
  if (S.state !== 'story' && S.state !== 'game') return;
  if (S.paused) return;
  S.paused = true;
  A.duckMusic(true);
  if (S.mode === 'challenge') {                  // 挑战模式：沙漏随暂停一起停
    document.getElementById('btnReplayChapter').classList.add('hidden');
  } else {
    document.getElementById('btnReplayChapter').classList.remove('hidden');
  }
  showPausePanel();
}
function closePause(silent) {
  S.paused = false;
  A.duckMusic(false);
  UI.hideScreens();
}
document.getElementById('btnPause').addEventListener('click', () => { A.ensure(); doPause(); });

/* ---------- 设置入口 ---------- */
function openSettings(from, approved = false) {
  const returnToSource = from === 'pause' ? showPausePanel : showScreenTitle;
  if (!approved) {
    UI.parentGate(() => openSettings(from, true), returnToSource);
    return;
  }
  UI.openSettings(settings, applySettings, returnToSource);
}
function showScreenTitle() { UI.showScreen('screenTitle'); }

/* ---------- 输入 ---------- */
document.addEventListener('pointerdown', () => {
  A.ensure();
  UI.unlockNarration();
}, { capture: true });

canvas.addEventListener('pointerdown', (e) => {
  A.ensure();
  if (S.paused) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (S.state === 'story' && UI.dialogueActive()) {
    UI.advance();
  } else if (S.state === 'game' && S.game && S.game.pointerDown) {
    R.ripple(x, y);
    S.game.pointerDown(x, y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (S.state === 'game' && S.game && S.game.pointerMove) {
    const rect = canvas.getBoundingClientRect();
    S.game.pointerMove(e.clientX - rect.left, e.clientY - rect.top);
  }
});
/* pointerup / pointercancel 挂在 window 上：即使手指拖出画布边缘松手，
   也能正确「放下物品」，避免拿起状态卡死（触屏常见手势） */
window.addEventListener('pointerup', (e) => {
  if (S.state === 'game' && S.game && S.game.pointerUp) {
    const rect = canvas.getBoundingClientRect();
    S.game.pointerUp(e.clientX - rect.left, e.clientY - rect.top);
  }
});
window.addEventListener('pointercancel', (e) => {
  if (S.state === 'game' && S.game && S.game.pointerUp) {
    const rect = canvas.getBoundingClientRect();
    S.game.pointerUp(e.clientX - rect.left, e.clientY - rect.top);
  }
});

window.addEventListener('keydown', (e) => {
  // 键盘也是有效的儿童交互：用它拼字时同步解锁/唤醒朗读，
  // 避免只用键盘进入关卡的孩子看得到单词却听不到发音。
  A.ensure();
  UI.unlockNarration();
  if (e.key === 'Escape') { doPause(); return; }
  if (/^[1-6]$/.test(e.key) && !S.paused && S.state === 'game' && S.game && S.game.key) {
    e.preventDefault();
    S.game.key(e.key);
    return;
  }
  if (/^[a-z]$/i.test(e.key) && !S.paused && S.state === 'game' && S.game && S.game.key) {
    e.preventDefault();
    S.game.key(e.key);
    return;
  }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (S.paused) return;
    if (S.state === 'story' && UI.dialogueActive()) UI.advance();
    else if (S.state === 'game' && S.game && S.game.key) S.game.key(e.key);
  }
});

/* 页面切后台时自动暂停（不打断也不丢失进度） */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !location.search.includes('preview=')) {
    UI.stopSpeak();
    if ((S.state === 'story' || S.state === 'game') && !S.paused) doPause();
  }
});

/* ---------- 启动 ---------- */
loadSettings();
R.setScene('springDusk');
A.setMood('title');
CH.loadSprites();          // 正式立绘（加载失败自动回退程序化角色）
requestAnimationFrame(frame);
gotoTitle();

/* 只读调试钩子：测试与排查用，不影响游戏逻辑 */
window.__XY__ = {
  get state() { return S.state; },
  get ci() { return S.ci; },
  get si() { return S.si; },
  get feathers() { return S.feathers; },
  get stars() { return S.stars; },
  get chapterScores() { return [...S.chapterScores]; },
  get paused() { return S.paused; },
  get finalChoice() { return S.finalChoice; },
  get chars() { return S.chars.map(c => c.id); },
  get gameName() { return S.gameStep ? S.gameStep.game : null; },
  get game() { return (S.game && S.game.debug) ? S.game.debug() : null; },
  get music() { return A.musicInfo(); },   // 背景音乐走文件还是合成器
  setMood: (m) => A.setMood(m),            // 测试钩子：手动切音乐情绪
  setScene: (n) => R.setScene(n),          // 测试钩子：手动切场景
  get chal() { return CHAL.debug(); },     // 测试钩子：挑战模式状态
  probe: () => ({ mode: S.mode, paused: S.paused, state: S.state, hasGame: !!S.game,
                  chalActive: CHAL.active, upd: typeof CHAL.update }),
  chalStart: () => enterChallenge(),       // 测试钩子：进入挑战模式
  chalResult: (r) => CHAL.handleResult(r || {}),   // 测试钩子：模拟关卡结果
  /** 测试钩子：直接跳到某章某步（绕过存档，供自动化验收用） */
  jump(ci, si) {
    if (S.mode === 'challenge') CHAL.exit();   // 先退出冒险，避免模式串扰
    withTransition(() => {
      S.ci = ci; S.si = si; S.state = 'story';
      S.chars = []; S.speaker = null; S.visual = null; S.game = null; S.gameStep = null;
      setBgForce(STORY[ci].bg);
      A.setMood(STORY[ci].mood);
      UI.hideDialogue(); UI.gameHint(null); UI.hideScreens(); UI.hud(true);
      runStep(si);
    });
  },
  get fps() { return frameDts.length ? Math.round(1 / (frameDts.reduce((a, b) => a + b, 0) / frameDts.length)) : 0; },
  /** 性能基准：同步渲染 n 帧，返回平均每帧毫秒数（60fps 预算为 16.7ms） */
  bench(n = 30) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) R.drawScene(ctx, W, H, T + i * 0.016, 0.016);
    return Math.round((performance.now() - t0) / n * 1000) / 1000;
  },
};

// 只在显式预览参数下启用，方便逐幕视觉验收，不影响正常游戏与存档。
const previewScene = new URLSearchParams(location.search).get('preview');
const previewSteps = {
  chapter1Farm: [0, 5],
  reedPendantOrigin: [0, 3],
  reedPendantFirstLight: [0, 9],
  reedPendant: [3, 7],
  chapter2Rhythm: [1, 3],
  chapter2Spelling: [1, 3],
  chapter3Path: [2, 2],
  chapter3Sudoku: [2, 7],
  chapter4Puzzle: [3, 4],
  chapter4Choice: [3, 6],
};
if (previewSteps[previewScene]) {
  const [ci, si] = previewSteps[previewScene];
  setTimeout(() => window.__XY__.jump(ci, si), 80);
}
