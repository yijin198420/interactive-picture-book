/**
 * ============================================================
 * 《小羽的春天》声音系统（占位素材：全部由 Web Audio 实时合成）
 * ------------------------------------------------------------
 * 本轮精修：
 *  · 背景音乐加入简单的和弦进行（I–vi–IV–V）与低音铺底，
 *    旋律从当前和弦音中挑选，更像"一首曲子"而不是随机音符
 *  · 音乐总线加入轻柔回声（delay），营造童话空间感
 *  · 新增柔和反馈音：气泡(pop)、星光(sparkle)、转场(whoosh)、
 *    提示(blip)——依旧没有任何刺耳的失败音
 *  · 音乐与音效音量分开控制，可分别调到 0（开关不变）
 * ============================================================
 */

let ctx = null;          // AudioContext（首次用户操作时创建）
let musicGain, sfxGain, voiceGain;  // 音乐、音效、英语朗读三条总线
let musicTimer = null;   // 音乐调度器
let mood = null;         // 当前情绪
let nextNoteAt = 0;      // 下一个音符时间
let noteCount = 0;       // 和弦进行的小节计数
let musicVol = 0.7, sfxVol = 0.8;
let voiceSource = null;
let voiceToken = 0;
const voiceBuffers = new Map();

/* 各情绪配方：五声音阶 + 和弦低音 + 节奏 + 音色 */
const MOODS = {
  title:  { scale: [523.25, 587.33, 659.25, 783.99, 880.0], chords: [130.81, 110.0, 87.31, 98.0],  gap: 1.15, type: 'sine',     soft: .5 },
  warm:   { scale: [523.25, 587.33, 659.25, 783.99, 880.0], chords: [130.81, 110.0, 87.31, 98.0],  gap: 0.95, type: 'sine',     soft: .6 },
  travel: { scale: [440.0, 493.88, 587.33, 659.25, 783.99], chords: [110.0, 87.31, 98.0, 116.54],  gap: 0.72, type: 'triangle', soft: .55 },
  snow:   { scale: [392.0, 440.0, 523.25, 587.33, 698.46],  chords: [98.0, 77.78, 87.31, 103.83],  gap: 1.7,  type: 'triangle', soft: .5 },
  spring: { scale: [587.33, 659.25, 783.99, 880.0, 1046.5], chords: [130.81, 110.0, 87.31, 98.0],  gap: 0.55, type: 'sine',     soft: .6, arp: true },
};
/* 每个和弦（低音）对应的旋律音（和弦音，取自音阶附近） */
const CHORD_TONES = {
  130.81: [523.25, 659.25, 783.99], 110.0: [440.0, 523.25, 659.25],
  87.31: [440.0, 523.25, 587.33], 98.0: [493.88, 587.33, 783.99],
  116.54: [440.0, 587.33, 659.25], 77.78: [392.0, 466.16, 587.33], 103.83: [523.25, 622.25, 783.99],
};

/** 初始化 / 唤醒音频（必须在用户手势里调用一次） */
export function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain(); musicGain.gain.value = musicVol * 0.5;
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol;
    voiceGain = ctx.createGain(); voiceGain.gain.value = 1.15;
    // 音乐总线的轻柔回声（童话空间感）
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    musicGain.connect(ctx.destination);
    musicGain.connect(delay); delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(ctx.destination);
    sfxGain.connect(ctx.destination);
    // 朗读使用与游戏音效相同的 Web Audio 输出，避开部分浏览器
    // “媒体时间在走、扬声器却无声”的 HTMLMediaElement 路由问题。
    voiceGain.connect(ctx.destination);
    // 音频解锁前 setMood() 只记录了情绪，这里把音乐真正启动起来
    const pending = mood; mood = null;
    if (pending) setMood(pending);
  } catch (e) { ctx = null; }
}

export function setMusicVol(v) { musicVol = v; if (musicGain) musicGain.gain.value = v * 0.5; }
export function setSfxVol(v) { sfxVol = v; if (sfxGain) sfxGain.gain.value = v; }
export function duckMusic(on) { if (musicGain) musicGain.gain.value = musicVol * 0.5 * (on ? 0.35 : 1); }

/* ---------- 英文朗读（Web Audio 主通道） ---------- */
async function loadVoice(url) {
  let task = voiceBuffers.get(url);
  if (!task) {
    task = fetch(url, { cache: 'force-cache' })
      .then(r => {
        if (!r.ok) throw new Error(`Voice request failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(bytes => ctx.decodeAudioData(bytes));
    voiceBuffers.set(url, task);
    task.catch(() => voiceBuffers.delete(url));
  }
  return task;
}

export function stopVoice() {
  voiceToken++;
  const src = voiceSource;
  voiceSource = null;
  if (src) {
    try { src.onended = null; src.stop(); } catch (e) {}
    try { src.disconnect(); } catch (e) {}
  }
}

export async function playVoice(url, { onStart, onEnded } = {}) {
  ensure();
  if (!ctx || !voiceGain) throw new Error('Web Audio is unavailable');
  if (ctx.state === 'suspended') await ctx.resume();
  stopVoice();
  const token = voiceToken;
  const buffer = await loadVoice(url);
  if (token !== voiceToken) return { cancelled: true };

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(voiceGain);
  voiceSource = src;
  src.onended = () => {
    if (voiceSource !== src) return;
    voiceSource = null;
    try { src.disconnect(); } catch (e) {}
    if (onEnded) onEnded();
  };
  src.start();
  if (onStart) onStart({ duration: buffer.duration, contextState: ctx.state });
  return { duration: buffer.duration, contextState: ctx.state };
}

export function voiceInfo() {
  return { contextState: ctx?.state || 'unavailable', playing: !!voiceSource, cached: voiceBuffers.size };
}

/* ---------- 基础发音 ---------- */
function tone({ freq, dur = 0.3, type = 'sine', vol = 0.5, attack = 0.02, when = 0, dest, slideTo }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur * 0.9);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(dest || sfxGain);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

/** 轻噪声（羽毛 / 水花 / 转场风声等柔和音效） */
function noise({ dur = 0.4, vol = 0.2, when = 0, from = 1200, to = null }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, (dur * ctx.sampleRate) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(from, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t0);
}

/* ---------- 音效（全部柔和不刺耳） ---------- */
export const sfx = {
  tap:     () => tone({ freq: 620, dur: 0.1, vol: 0.22, slideTo: 720 }),          // 按钮按下的小气泡音
  ok:      () => { tone({ freq: 659.25, dur: 0.22, vol: 0.3 }); tone({ freq: 830.6, dur: 0.3, vol: 0.28, when: 0.09 }); },
  match:   () => { tone({ freq: 587.33, dur: 0.18, vol: 0.3 }); tone({ freq: 880.0, dur: 0.3, vol: 0.26, when: 0.1 }); },
  chime:   () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.5, vol: 0.24, when: i * 0.09 })); },
  star:    () => { tone({ freq: 1318.5, dur: 0.35, vol: 0.2 }); tone({ freq: 1760, dur: 0.4, vol: 0.16, when: 0.08 }); tone({ freq: 2093, dur: 0.45, vol: 0.1, when: 0.16 }); },
  sparkle: () => { [1568, 1976, 2637].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.12, when: i * 0.05, type: 'triangle' })); },
  pop:     () => tone({ freq: 480, dur: 0.12, vol: 0.2, slideTo: 300, type: 'sine' }),
  blip:    () => tone({ freq: 740, dur: 0.09, vol: 0.14, type: 'triangle' }),
  whoosh:  () => noise({ dur: 0.55, vol: 0.35, from: 400, to: 1600 }),            // 章节转场的柔风
  feather: () => { noise({ dur: 0.5, vol: 0.5 }); tone({ freq: 880, dur: 0.4, vol: 0.12, when: 0.05, slideTo: 1174.7 }); },
  hop:     () => tone({ freq: 440, dur: 0.14, vol: 0.22, type: 'triangle' }),
  /* 温和的「再试一次」提示：两个下行软音，绝不是刺耳的错误音 */
  gentle:  () => { tone({ freq: 392, dur: 0.18, vol: 0.22, type: 'sine' }); tone({ freq: 330, dur: 0.26, vol: 0.2, type: 'sine', when: 0.14 }); },
  splash:  () => noise({ dur: 0.25, vol: 0.3 }),
  flap:    () => noise({ dur: 0.12, vol: 0.22 }),
};

/* ---------- 生成式背景音乐（带和弦进行） ---------- */
function scheduleMusic() {
  if (!ctx || !mood) return;
  const cfg = MOODS[mood];
  while (nextNoteAt < ctx.currentTime + 0.8) {
    const when = Math.max(0, nextNoteAt - ctx.currentTime);
    const bass = cfg.chords[(noteCount / 8 | 0) % cfg.chords.length];
    const tones = CHORD_TONES[bass] || cfg.scale;

    if (noteCount % 8 === 0) {
      // 每 8 个音符换一次和弦：低音铺底 + 五度长音（柔和的"和声床"）
      tone({ freq: bass, dur: cfg.gap * 8, type: 'sine', vol: 0.1, attack: 0.4, when, dest: musicGain });
      tone({ freq: bass * 1.5, dur: cfg.gap * 8, type: 'sine', vol: 0.06, attack: 0.6, when, dest: musicGain });
    }
    // 旋律：七成从当前和弦音里挑，三成在音阶上游走（像哼歌）
    const f = (Math.random() < 0.7 ? tones[(Math.random() * tones.length) | 0]
                                   : cfg.scale[(Math.random() * cfg.scale.length) | 0])
              * (Math.random() < 0.22 ? 0.5 : 1);
    tone({ freq: f, dur: cfg.gap * 1.8, type: cfg.type, vol: 0.3 * cfg.soft, attack: 0.04, when, dest: musicGain });
    // 春天：加一个轻快的八度琶音
    if (cfg.arp) tone({ freq: f * 2, dur: cfg.gap, type: 'sine', vol: 0.1 * cfg.soft, attack: 0.02, when: when + 0.07, dest: musicGain });

    noteCount++;
    nextNoteAt += cfg.gap * (Math.random() < 0.2 ? 2 : 1);
  }
}

/* ---------- 背景音乐音轨文件（assets/music/） ----------
   优先播放离线渲染好的完整乐曲；文件缺失或解码失败时
   自动回退到下面的实时合成，两条路径互不干扰。 */
const TRACK_FILES = {
  title: 'warm.mp3', warm: 'warm.mp3', travel: 'travel.mp3',
  snow: 'snow.mp3', spring: 'spring.mp3',
};
const tracks = {};       // name -> { el, gain, ok }
let synthMode = false;   // 音轨失败后置 true，走实时合成

function stopSynth() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

function getTrack(name) {
  if (!TRACK_FILES[name] || !ctx) return null;
  let tr = tracks[name];
  if (!tr) {
    const el = new Audio('assets/music/' + TRACK_FILES[name]);
    el.loop = true; el.preload = 'auto';
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    try {
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(musicGain);
    } catch (e) { return null; }
    tr = tracks[name] = { el, gain, ok: null };
    // 404 / 解码失败：安静地回到合成器
    el.addEventListener('error', () => {
      tr.ok = false;
      if (mood === name) switchToSynth();
    });
  }
  return tr;
}

function playTrack(name) {
  const tr = getTrack(name);
  if (!tr || tr.ok === false) return switchToSynth();
  const now = ctx.currentTime;
  for (const [k, t] of Object.entries(tracks)) {          // 旧曲 1.4 秒淡出
    if (k !== name && !t.el.paused) {
      const g = t.gain.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + 1.4);
      setTimeout(() => t.el.pause(), 1500);
    }
  }
  const g = tr.gain.gain;                                  // 新曲 1.4 秒淡入
  g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now);
  g.linearRampToValueAtTime(1, now + 1.4);
  tr.el.play().then(() => { tr.ok = true; }).catch(() => { tr.ok = false; switchToSynth(); });
}

function switchToSynth() {
  synthMode = true;
  stopSynth();
  if (!ctx) return;
  noteCount = 0; nextNoteAt = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 300);
  scheduleMusic();
}

/** 调试用：当前音乐走文件还是合成器 */
export function musicInfo() {
  const tr = tracks[mood];
  return { mode: synthMode ? 'synth' : 'file', mood,
    playing: tr ? { paused: tr.el.paused, t: Math.round(tr.el.currentTime * 10) / 10, ok: tr.ok } : null };
}

export function setMood(name) {
  if (!MOODS[name]) return;
  if (mood === name) return;
  mood = name;
  if (!ctx) return;                 // 音频解锁前只记录，ensure() 会补启动
  stopSynth();
  if (!synthMode) { playTrack(name); return; }
  switchToSynth();
}
