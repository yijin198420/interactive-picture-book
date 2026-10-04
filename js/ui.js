/**
 * ============================================================
 * 《小羽的春天》UI 层（DOM 覆盖层）
 * ------------------------------------------------------------
 * 负责：对话框（打字机 + 字幕 + 旁白朗读）、选择卡片、
 * 奖励弹层、章节封面/完成页、结局页、暂停菜单、设置。
 * 旁白朗读优先使用随游戏打包的英文录音，系统 TTS 作为兜底。
 * ============================================================
 */
import { clamp } from './util.js';
import { sfx as SFX, playVoice, stopVoice, duckMusic } from './audio.js?v=17';

const $ = (id) => document.getElementById(id);

const TRAIL_MILESTONES = [
  ['Notice', 'Listen', 'Help', 'Kindness', 'Grow'],
  ['Listen', 'Spell', 'Courage', 'Believe', 'Grow'],
  ['Step', 'Seek', 'Solve', 'Together', 'Grow'],
  ['Remember', 'Call', 'Belong', 'Home', 'Grow'],
];
const TRAIL_THRESHOLDS = [20, 40, 60, 80, 100];

function trailInfo(points, chapterIndex = 0) {
  const score = Math.max(0, Math.min(100, Number(points) || 0));
  const names = TRAIL_MILESTONES[chapterIndex] || TRAIL_MILESTONES[0];
  const lit = TRAIL_THRESHOLDS.filter(threshold => score >= threshold).length;
  const nextIndex = Math.min(4, lit);
  return {
    score, names, lit, nextIndex,
    nextName: score >= 100 ? null : names[nextIndex],
    nextAt: score >= 100 ? 100 : TRAIL_THRESHOLDS[nextIndex],
  };
}

/* 对白角色 → 绘本头像。旁白不显示头像，保持画面安静。 */
const PORTRAITS = {
  'Feather': 'xiaoyu_calm', 'Little Duck': 'duckling', 'Mama Duck': 'duckMom', 'Ducklings': 'duckling',
  'Acorn': 'squirrel', 'Moss': 'frog', 'Daisy': 'deer', 'Mama Deer': 'deerMom',
  'Grandpa Owl': 'owl', 'Swan': 'swan', 'Swan Mother': 'swan', 'Friends': 'xiaoyu_happy',
};

function setDialoguePortrait(who) {
  const dlg = $('dialogue'), wrap = $('dlgPortraitWrap'), portrait = $('dlgPortrait');
  const file = PORTRAITS[who];
  dlg.classList.toggle('has-portrait', !!file);
  wrap.classList.toggle('hidden', !file);
  if (!file) { portrait.removeAttribute('src'); return; }
  portrait.onerror = () => {
    portrait.onerror = () => {
      wrap.classList.add('hidden');
      dlg.classList.remove('has-portrait');
    };
    portrait.src = `assets/characters/optimized/${file}.png`;
  };
  portrait.src = `assets/scenes/enhanced-scenes/characters-web/${file}.webp`;
}

/* ---------- 模块状态 ---------- */
const S = {
  typing: false, fullText: '', typeTimer: null,
  onDialogueDone: null, narration: true, subtitle: true,
  settingsReturn: null, currentVoiceId: null, soundMuted: false,
};

/* ---------- 屏幕显示 ---------- */
const SCREENS = ['screenTitle', 'screenCover', 'screenReward', 'screenChapterEnd', 'screenEnding', 'screenPause', 'screenParentGate', 'screenSettings'];
export function showScreen(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
export function hideScreens() { SCREENS.forEach(s => $(s).classList.add('hidden')); }

/* ---------- 旁白朗读 ----------
   优先播放录音（assets/voice/<id>.mp3，可选）；没有录音的句子
   回退到系统 TTS；两者都不可用时只显示字幕。 */
let enVoice = null;
const narrAudio = $('narrAudio') || new Audio();
narrAudio.preload = 'auto';
let narrUnlocked = false;
let voiceProgressTimer = null;

function setAudioState(state, error = '') {
  narrAudio.dataset.state = state;
  narrAudio.dataset.currentTime = Number.isFinite(narrAudio.currentTime) ? narrAudio.currentTime.toFixed(2) : '0.00';
  narrAudio.dataset.duration = Number.isFinite(narrAudio.duration) ? narrAudio.duration.toFixed(2) : '';
  narrAudio.dataset.error = error;
}

function stopVoiceProgress() {
  clearInterval(voiceProgressTimer);
  voiceProgressTimer = null;
}

function startVoiceProgress(duration) {
  stopVoiceProgress();
  const started = performance.now();
  narrAudio.dataset.transport = 'webaudio';
  narrAudio.dataset.duration = duration.toFixed(2);
  voiceProgressTimer = setInterval(() => {
    narrAudio.dataset.currentTime = Math.min(duration, (performance.now() - started) / 1000).toFixed(2);
  }, 100);
}

function setReadState(reading) {
  const b = $('btnReadAloud');
  if (!b) return;
  b.classList.toggle('is-speaking', reading);
  b.querySelector('.read-label').textContent = reading ? 'Reading…' : 'Read Aloud';
  b.setAttribute('aria-label', reading ? 'Reading subtitle aloud' : 'Read this subtitle aloud');
}

// Mobile browsers may block delayed audio. Prime the same audio element on the
// first real tap so later story narration can begin after scene transitions.
export function unlockNarration() {
  if (narrUnlocked) return;
  narrUnlocked = true;
  setAudioState('priming');
  narrAudio.src = 'assets/voice/en/silence.mp3';
  narrAudio.volume = 0;
  const primed = narrAudio.play();
  if (primed) primed.then(() => {
    if (!/silence\.mp3(?:$|\?)/.test(narrAudio.currentSrc)) return;
    narrAudio.pause();
    narrAudio.currentTime = 0;
    narrAudio.volume = 1;
    setAudioState('ready');
  }).catch(() => { narrAudio.volume = 1; });
}
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    enVoice = vs.find(v => /en[-_]US/i.test(v.lang)) ||
      vs.find(v => /en[-_]GB/i.test(v.lang)) ||
      vs.find(v => /^en/i.test(v.lang)) || null;
  } catch (e) { enVoice = null; }
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speakTTS(text) {
  if (!('speechSynthesis' in window)) { setReadState(false); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (enVoice) u.voice = enVoice;
    u.lang = 'en-US'; u.rate = 0.9; u.pitch = 1.04; u.volume = 1;
    u.onstart = () => { duckMusic(true); setAudioState('tts-playing'); setReadState(true); };
    u.onend = () => { duckMusic(false); setAudioState('tts-ended'); setReadState(false); };
    u.onerror = e => { duckMusic(false); setAudioState('tts-error', e.error || 'speech synthesis error'); setReadState(false); };
    speechSynthesis.speak(u);
  } catch (e) { setReadState(false); }
}
function speak(text, voiceId, force = false) {
  if (!force && !S.narration) { setReadState(false); return; }
  try {
    stopVoice(); stopVoiceProgress(); duckMusic(false);
    narrAudio.onplay = narrAudio.onended = narrAudio.onerror = narrAudio.ontimeupdate = narrAudio.onloadedmetadata = null;
    narrAudio.pause(); narrAudio.currentTime = 0; narrAudio.volume = 1;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  } catch (e) { /* 下一种朗读方式仍可继续 */ }
  if (voiceId) {
    narrAudio.dataset.voiceId = voiceId;
    narrAudio.dataset.transport = 'webaudio';
    setAudioState('loading');
    const url = `assets/voice/${voiceId}.mp3`;
    playVoice(url, {
      onStart: ({ duration, contextState }) => {
        narrAudio.dataset.contextState = contextState;
        startVoiceProgress(duration);
        duckMusic(true);
        setAudioState('playing');
        // setAudioState reads the dormant fallback element, so restore Web Audio values.
        narrAudio.dataset.duration = duration.toFixed(2);
        narrAudio.dataset.currentTime = '0.00';
        setReadState(true);
      },
      onEnded: () => {
        stopVoiceProgress(); duckMusic(false);
        narrAudio.dataset.currentTime = narrAudio.dataset.duration || '';
        narrAudio.dataset.state = 'ended';
        setReadState(false);
      },
    }).catch(e => {
      stopVoiceProgress(); duckMusic(false);
      setAudioState('webaudio-error', e?.message || 'Web Audio playback failed');
      // Web Audio 不可用时，回退到媒体播放器，再不行才使用系统 TTS。
      narrAudio.dataset.transport = 'media-fallback';
      narrAudio.src = url;
      narrAudio.onplay = () => { duckMusic(true); setAudioState('playing'); setReadState(true); };
      narrAudio.onended = () => { duckMusic(false); setAudioState('ended'); setReadState(false); };
      narrAudio.onerror = () => speakTTS(text);
      narrAudio.play().catch(() => speakTTS(text));
    });
    return;
  }
  speakTTS(text);
}
export function stopSpeak() {
  try {
    stopVoice(); stopVoiceProgress(); duckMusic(false);
    narrAudio.onplay = narrAudio.onended = narrAudio.onerror = narrAudio.ontimeupdate = narrAudio.onloadedmetadata = null;
    narrAudio.pause(); narrAudio.currentTime = 0;
  } catch (e) {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  setReadState(false);
  setAudioState('stopped');
}

export function replayNarration() {
  if (!S.fullText || S.soundMuted) return;
  speak(S.fullText, S.currentVoiceId, true);
}

/** 小游戏中的单词或短句朗读；沿用旁白开关、静音和本地音频通道。 */
export function speakGameLine(text, voiceId) {
  speak(text, voiceId);
}

export function setSoundMuted(muted) {
  S.soundMuted = !!muted;
  const b = $('btnReadAloud');
  if (b) {
    b.disabled = S.soundMuted;
    b.title = S.soundMuted ? 'Turn sound on to hear this subtitle' : 'Read this subtitle aloud';
  }
  if (S.soundMuted) stopSpeak();
}

const readAloudButton = $('btnReadAloud');
if (readAloudButton) {
  readAloudButton.addEventListener('pointerdown', e => e.stopPropagation());
  readAloudButton.addEventListener('click', e => {
    e.stopPropagation();
    replayNarration();
  });
}

/* ---------- 对话框 ---------- */
export function dialogue(who, text, { voiceId, onDone } = {}) {
  S.onDialogueDone = onDone || null;
  S.fullText = text; S.currentVoiceId = voiceId || null; S.typing = true;
  const dlg = $('dialogue'), whoEl = $('dlgWho'), txtEl = $('dlgText');
  dlg.classList.remove('hidden');
  setDialoguePortrait(who);
  const canHideSubtitle = S.narration && (!!voiceId || 'speechSynthesis' in window);
  if (who === 'Narrator') { whoEl.classList.add('hidden'); txtEl.style.fontStyle = 'italic'; }
  else { whoEl.classList.remove('hidden'); whoEl.textContent = who; txtEl.style.fontStyle = 'normal'; }
  txtEl.textContent = '';
  // 字幕开关：关闭且设备能朗读时才隐藏文字
  if (!S.subtitle && canHideSubtitle) txtEl.textContent = '🔊';
  speak(text, voiceId);
  if (!S.subtitle && canHideSubtitle) {
    S.typing = false; $('dlgNext').style.visibility = 'visible'; return;
  }
  $('dlgNext').style.visibility = 'hidden';
  let i = 0;
  clearInterval(S.typeTimer);
  S.typeTimer = setInterval(() => {
    i++; txtEl.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(S.typeTimer); S.typing = false;
      $('dlgNext').style.visibility = 'visible';
    }
  }, 26);
}

/** 点击推进：打字中→先补全；已完成→进入下一条 */
export function advance() {
  if ($('dialogue').classList.contains('hidden')) return false;
  if (S.typing) {
    clearInterval(S.typeTimer); S.typing = false;
    $('dlgText').textContent = S.fullText;
    $('dlgNext').style.visibility = 'visible';
    return true;
  }
  if (S.onDialogueDone) {
    const cb = S.onDialogueDone; S.onDialogueDone = null;
    cb();
  }
  return true;
}
export function hideDialogue() {
  clearInterval(S.typeTimer); S.typing = false;
  $('dialogue').classList.add('hidden');
  $('dialogue').classList.remove('has-portrait');
  $('dlgPortraitWrap').classList.add('hidden');
  stopSpeak();
}
export function dialogueActive() { return !$('dialogue').classList.contains('hidden'); }
/** 打字机是否还在逐字显示（用于角色口型动画） */
export function isTyping() { return S.typing; }

/* ---------- 提示气泡 ---------- */
let toastTimer = null;
export function toast(text, who, dur = 3200, opts = {}) {
  const el = $('toast');
  el.innerHTML = who ? `<span class="toast-who">${who}: </span>` : '';
  el.innerHTML += text;
  el.classList.remove('hidden');
  if (opts.voiceId || opts.narrate) speak(text, opts.voiceId);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), dur);
}

/* ---------- 选择卡片 ---------- */
export function choice(cfg, onPick) {
  const wrap = $('choiceWrap'), q = $('choiceQuestion'), cards = $('choiceCards');
  // 防止“推进上一句对白”的同一次触摸，在选项刚出现时又误点中卡片。
  // 保护时间很短，不影响正常作答，但要求孩子做一次明确的新点击。
  let choicesReady = false;
  q.textContent = cfg.question;
  cards.innerHTML = '';
  cfg.options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'choice-card';
    b.setAttribute('aria-disabled', 'true');
    b.innerHTML = `<span class="c-icon">${opt.icon}</span><span class="c-label">${opt.label}</span><span class="c-sub">${opt.sub || ''}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!choicesReady) { e.preventDefault(); return; }
      if (opt.retry) {                      // 温和提示 + 可重试，绝不惩罚
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        toast(opt.mentorLine, opt.mentor);
        if (onPick.gentle) onPick.gentle();
      } else {
        onPick(opt);
      }
    });
    cards.appendChild(b);
  });
  wrap.classList.remove('hidden');
  setTimeout(() => {
    choicesReady = true;
    cards.querySelectorAll('.choice-card').forEach(card => card.setAttribute('aria-disabled', 'false'));
  }, 320);
}
export function hideChoice() { $('choiceWrap').classList.add('hidden'); }

/* ---------- 奖励弹层 ---------- */
export function reward(type, count, reason, onOk, meta = {}) {
  const icon = type === 'feather' ? '🪶' : '▣';
  const pendant = $('rewardPendant');
  const iconNode = $('rewardIcon');
  const showPendant = type === 'feather';
  pendant.classList.toggle('hidden', !showPendant);
  iconNode.classList.toggle('hidden', showPendant);
  if (showPendant) {
    const lights = Math.max(1, Math.min(4, (meta.chapterIndex ?? 0) + 1));
    pendant.dataset.lights = String(lights);
    pendant.setAttribute('aria-label', `Mama Duck’s reed-nest pendant with ${lights} of 4 Growth Feather lights glowing`);
    pendant.querySelectorAll('.reward-pendant-light').forEach((light, index) => {
      light.classList.remove('is-lit');
      if (index < lights) { void light.offsetWidth; light.classList.add('is-lit'); }
    });
  }
  const name = meta.replay
    ? (type === 'feather' ? 'Your Growth Feather is safe!' : 'Your Story Sticker is safe!')
    : (type === 'feather'
      ? `You found ${count > 1 ? count + ' ' : 'a '}Growth Feather${count > 1 ? 's' : ''}!`
      : `You earned ${count > 1 ? count + ' ' : 'a '}Story Sticker${count > 1 ? 's' : ''}!`);
  iconNode.textContent = icon;
  $('rewardName').textContent = name;
  const trail = trailInfo(meta.points, meta.chapterIndex);
  $('rewardReason').textContent = meta.points == null
    ? reason
    : `${reason} · Feather Trail ${meta.points}/100 · ${trail.lit}/5 Feather Lights`;
  showScreen('screenReward');
  $('btnRewardOk').onclick = () => { hideScreens(); onOk(); };
}

/* ---------- 徽章 ---------- */
function paintTrail(root, points, chapterIndex = 0) {
  if (!root) return;
  const trail = trailInfo(points, chapterIndex);
  root.querySelectorAll('i, .trail-light').forEach((light, index) => {
    const start = index * 20;
    const fill = Math.max(0, Math.min(100, (trail.score - start) / 20 * 100));
    light.style.setProperty('--light-fill', `${Math.round(fill)}%`);
    light.classList.toggle('is-lit', fill >= 100);
    light.classList.toggle('is-partial', fill > 0 && fill < 100);
    light.title = `${trail.names[index]} · ${Math.round(fill)}% lit`;
  });
  root.style.setProperty('--trail-progress', `${trail.score}%`);
  root.dataset.lit = String(trail.lit);
}

let pointBurstTimer = null;
export function pointsEarned(delta, total, label, chapterIndex = 0) {
  if (!(delta > 0)) return;
  const burst = $('pointBurst');
  const trail = trailInfo(total, chapterIndex);
  const crossed = TRAIL_THRESHOLDS
    .map((threshold, index) => ({ threshold, index }))
    .filter(item => item.threshold > total - delta && item.threshold <= total);
  $('pointBurstValue').textContent = `✦ +${delta}`;
  $('pointBurstLabel').textContent = label;
  $('pointBurstMilestone').textContent = crossed.length
    ? `${trail.names[crossed[crossed.length - 1].index]} Light awakened · ${trail.lit}/5 glowing`
    : `Next: ${trail.nextName} Light · ${Math.max(0, trail.nextAt - trail.score)} to go`;
  burst.classList.toggle('is-milestone', crossed.length > 0);
  burst.classList.remove('hidden', 'show');
  void burst.offsetWidth;
  burst.classList.add('show');
  clearTimeout(pointBurstTimer);
  pointBurstTimer = setTimeout(() => burst.classList.add('hidden'), 2100);
  paintTrail($('badgeTrailPips'), total, chapterIndex);
  const lights = [...$('badgeTrailPips').querySelectorAll('i')];
  if (crossed.length) {
    const newest = lights[crossed[crossed.length - 1].index];
    newest.classList.remove('just-lit');
    void newest.offsetWidth;
    newest.classList.add('just-lit');
    setTimeout(() => newest.classList.remove('just-lit'), 900);
  }
}

export function badges(f, s, bump, points = 0, chapterIndex = 0) {
  const bf = $('badgeFeather'), bs = $('badgeStar'), bp = $('badgePoints');
  bf.querySelector('b').textContent = f;
  bs.querySelector('b').textContent = s;
  bp.querySelector('b').textContent = points;
  const trail = trailInfo(points, chapterIndex);
  paintTrail($('badgeTrailPips'), points, chapterIndex);
  bp.title = trail.nextName
    ? `Feather Trail ${trail.score}/100 · Next: ${trail.nextName} Light at ${trail.nextAt}`
    : 'Feather Trail complete · Five lights glowing';
  bp.setAttribute('aria-label', bp.title);
  if (bump) {
    bf.classList.remove('bump'); bs.classList.remove('bump'); bp.classList.remove('bump');
    void bf.offsetWidth;
    if (bump === 'feather') bf.classList.add('bump');
    else if (bump === 'star') bs.classList.add('bump');
    bp.classList.add('bump');
  }
}
export function hud(show) { $('hud').classList.toggle('hidden', !show); }

/* ---------- 小游戏提示条 ---------- */
export function gameHint(text) {
  const el = $('gameHint');
  if (!text) { el.classList.add('hidden'); return; }
  $('gameHintText').textContent = text;
  el.classList.remove('hidden');
  SFX.blip();                       // 提示出现时轻轻一声，引起注意
}

/* ---------- 标题页 / 封面 / 章节完成 / 结局 ---------- */
export function title({ hasSave, chapterScores = [], onChapterSelect, onStartNew, onContinue, onSettings }) {
  $('btnContinue').classList.toggle('hidden', !hasSave);
  document.querySelectorAll('#chapterDirectory .chapter-card').forEach((card, index) => {
    const score = Math.max(0, Math.min(100, Number(chapterScores[index]) || 0));
    const trail = trailInfo(score, index);
    card.querySelector('.chapter-score b').textContent = score;
    const state = score >= 100 ? '5/5 Complete' : score > 0 ? `${trail.lit}/5 · Next ${trail.nextName}` : `First: ${trail.nextName}`;
    card.querySelector('.chapter-score i').textContent = state;
    let lights = card.querySelector('.chapter-lights');
    if (!lights) {
      lights = document.createElement('span');
      lights.className = 'chapter-lights';
      for (let i = 0; i < 5; i++) {
        const light = document.createElement('span');
        light.className = 'trail-light';
        lights.appendChild(light);
      }
      card.querySelector('.chapter-score').appendChild(lights);
    }
    paintTrail(lights, score, index);
    card.classList.toggle('is-complete', score >= 100);
    card.classList.toggle('is-progress', score > 0 && score < 100);
    card.setAttribute('aria-label', `${card.querySelector('strong').textContent}, Feather Trail ${score} of 100, ${state}`);
    card.onclick = () => onChapterSelect(index);
  });
  $('btnStartNew').onclick = () => onStartNew();
  $('btnContinue').onclick = () => onContinue();
  $('btnTitleSettings').onclick = () => onSettings();
  showScreen('screenTitle');
}

export function cover(ch, { resume = false, onStart }) {
  $('coverChip').textContent = `Chapter ${['One', 'Two', 'Three', 'Four'][ch.num - 1]}`;
  $('coverTitle').textContent = ch.title;
  $('coverSub').textContent = ch.subtitle;
  $('btnCoverStart').textContent = resume ? 'Continue ▸' : 'Begin ▸';
  const dots = $('coverDots');
  dots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('span');
    if (i === ch.num - 1) d.className = 'now';
    dots.appendChild(d);
  }
  $('btnCoverStart').onclick = () => onStart();
  showScreen('screenCover');
}

export function chapterEnd(ch, earned, onNext) {
  $('chapterEndTitle').textContent = `Chapter ${['One', 'Two', 'Three', 'Four'][ch.num - 1]} Complete!`;
  const list = $('chapterEndEarned');
  list.innerHTML = '';
  earned.forEach(e => {
    const div = document.createElement('div');
    div.className = 'earned';
    const kind = document.createElement('span');
    kind.className = 'earned-kind';
    kind.textContent = e.type === 'feather' ? '🪶 Growth Feather' : '▣ Story Sticker';
    const detail = document.createElement('span');
    detail.className = 'earned-detail';
    const trail = trailInfo(e.points, ch.num - 1);
    detail.textContent = e.points == null
      ? e.reason
      : `${e.reason} · Feather Trail ${e.points}/100 · ${trail.lit}/5 lights${e.replay ? ' (kept)' : ''}`;
    div.append(kind, detail);
    list.appendChild(div);
  });
  if (!earned.length) {
    const div = document.createElement('div');
    div.className = 'earned earned-empty';
    div.textContent = '🌷 You grew a little more';
    list.appendChild(div);
  }
  $('btnNextChapter').onclick = () => onNext();
  showScreen('screenChapterEnd');
}

export function ending(data, { onReplay, onTitle }) {
  $('endingTitle').textContent = data.title;
  $('endingStats').innerHTML =
    `<span>🪶 Growth Feathers ${data.feathers} / 4</span><span>▣ Story Stickers × ${data.stars}</span><span>✦ Feather Lights ${data.lights || 0} / 20</span>`;
  const lines = $('endingLines');
  lines.innerHTML = '';
  data.lines.forEach(t => {
    const p = document.createElement('p');
    p.textContent = t;
    lines.appendChild(p);
  });
  $('btnReplay').onclick = () => onReplay();
  $('btnEndTitle').onclick = () => onTitle();
  showScreen('screenEnding');
}

/* ---------- 暂停菜单 ---------- */
export function pause({ onResume, onReplayChapter, onSettings, onTitle }) {
  $('btnResume').onclick = () => onResume();
  $('btnReplayChapter').onclick = () => onReplayChapter();
  $('btnPauseSettings').onclick = () => onSettings();
  $('btnGoTitle').onclick = () => onTitle();
  showScreen('screenPause');
}

/* ---------- 家长入口 ---------- */
export function parentGate(onPass, onCancel) {
  const a = 2 + ((Math.random() * 4) | 0);
  const b = 1 + ((Math.random() * 5) | 0);
  const answer = a + b;
  const values = [...new Set([answer, Math.max(1, answer - 2), answer + 2])].sort(() => Math.random() - .5);
  $('parentGateQuestion').textContent = `${a} + ${b} = ?`;
  $('parentGateHint').textContent = '';
  const wrap = $('parentGateChoices');
  wrap.innerHTML = '';
  values.forEach(value => {
    const button = document.createElement('button');
    button.className = 'parent-answer';
    button.textContent = value;
    button.onclick = () => {
      if (value === answer) { SFX.ok(); onPass(); }
      else { SFX.gentle(); $('parentGateHint').textContent = 'Take your time and try the sum again.'; }
    };
    wrap.appendChild(button);
  });
  $('btnParentGateCancel').onclick = () => onCancel();
  showScreen('screenParentGate');
}

/* ---------- 设置 ---------- */
export function openSettings(values, onChange, returnTo) {
  S.settingsReturn = returnTo;
  $('setMusic').value = values.music;
  $('setSfx').value = values.sfx;
  $('setNarration').checked = values.narration;
  $('setSubtitle').checked = values.subtitle;
  const read = () => ({
    music: clamp(+$('setMusic').value, 0, 100),
    sfx: clamp(+$('setSfx').value, 0, 100),
    narration: $('setNarration').checked,
    subtitle: $('setSubtitle').checked,
  });
  $('setMusic').oninput = $('setSfx').oninput = $('setNarration').onchange = $('setSubtitle').onchange =
    () => onChange(read());
  $('btnSettingsOk').onclick = () => { onChange(read()); returnTo ? returnTo() : hideScreens(); };
  showScreen('screenSettings');
}

/* ---------- 设置值应用 ---------- */
export function applySettings(v) {
  S.narration = v.narration; S.subtitle = v.subtitle;
  if (!v.narration) stopSpeak();
}
