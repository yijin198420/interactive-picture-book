/**
 * ============================================================
 * 《彩虹岛大冒险》控制器（由挑战模式升格，玩法骨架不变）
 * ------------------------------------------------------------
 * 冒险循环：冒险卡（阶段提示 + 目标）→ 小游戏 + 星光沙漏 →
 * 过关收集星光能量、闯入下一关 / 失败扣一颗守护之心（原因写清）
 * → 每 3 关彩虹祝福三选一 → 第三幕通关点亮彩虹（胜利画面）
 * → 无尽守护模式 → 心扣光结算（星光能量 / 最高纪录 / 到达关卡）。
 * 世界观与全部数值来自 data/challenge.js（ADVENTURE）。
 * 由 main.js 注入依赖：mount / unmount / ui / audio / onExit。
 * ============================================================
 */
import { ADVENTURE as CF } from '../data/challenge.js?v=9';
import { createGame as gMatch } from './games/match.js';
import { createGame as gSort } from './games/sort.js?v=3';
import { createGame as gPath } from './games/path.js';
import { createGame as gRhythm } from './games/rhythm.js';
import { createGame as gFly } from './games/fly.js';

const ENGINES = { match: gMatch, sort: gSort, path: gPath, rhythm: gRhythm, fly: gFly };
const MISSION_ICONS = { match: '🧩', sort: '✉️', path: '✨', rhythm: '♪', fly: '🍃' };

export function createChallengeController(deps) {
  const { mount, unmount, ui, audio, onExit } = deps;
  const $ = (id) => document.getElementById(id);

  const S = {
    level: 1, score: 0, hearts: CF.hearts,
    shield: false, doubleLeft: 0, honeyNext: false,
    timeLimit: 0, timeLeft: 0,
    playing: false, active: false,          // active：整个冒险进行中
    game: null, diff: null, lastFail: null,
    victoryShown: false,                    // 第三幕通关的彩虹是否已点亮
    history: [],                             // 每关 { level, game, ok }
  };

  /* ---------- 阶段 ---------- */
  function stageOf(l) {
    return CF.stages.find(s => l >= s.from && l <= s.to) || CF.stages[CF.stages.length - 1];
  }

  /* ---------- HUD ---------- */
  function hud() {
    $('chalHearts').textContent = '🍃'.repeat(S.hearts) + '▫️'.repeat(Math.max(0, CF.hearts - S.hearts));
    const st = stageOf(S.level);
    $('chalLevel').textContent = `${st.icon} ${st.short} · Level ${S.level}`;
    $('chalScore').textContent = `🧺 ${S.score}`;
    const best = +localStorage.getItem(CF.bestKey) || 0;
    $('chalBest').textContent = `Best ${best}`;
    timer();
  }
  function timer() {
    const bar = $('chalTimerFill');
    const p = Math.max(0, S.timeLeft / Math.max(1, S.timeLimit));
    bar.style.width = (p * 100) + '%';
    bar.classList.toggle('low', p < 0.25);
    $('chalTimerText').textContent = S.playing ? `🎐 ${Math.ceil(S.timeLeft)}` : '';
  }
  function show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  /* ---------- 关卡构造 ---------- */
  function pickGame(l) {
    const st = stageOf(l);
    return st.pool[(l - st.from) % st.pool.length];
  }
  function missionOptions(l) {
    const st = stageOf(l);
    const start = (l - st.from) % st.pool.length;
    if (st.pool.length === 1) return [st.pool[0]];
    return [st.pool[start], st.pool[(start + 1) % st.pool.length]];
  }
  function buildDiff(name, l) {
    const g = CF.games[name];
    const st = stageOf(l);
    const d = { scene: (st.scene && st.scene[name]) || g.scene || 'pondMorning', title: g.title };
    if (name === 'match') {
      d.pairs = g.pairsByLevel(l);
      d.decoys = l >= g.decoyFromLevel ? ['swan', 'owl'].slice(0, g.decoysByLevel(l)) : [];
    } else if (name === 'sort') {
      d.items = g.itemsByLevel(l);
      d.move = l >= g.moveFromLevel ? g.moveAmpByLevel(l) : 0;
      d.labels = g.labels;                      // 冒险皮肤：阳光屋 / 月光篮
      d.sunny = !!g.sunny;                      // 阳光果 / 月光叶配色
    } else if (name === 'path') {
      d.rows = g.rowsByLevel(l);
      d.sink = l >= g.sinkFromLevel;
      d.sinkSeconds = g.sinkSeconds;
      d.cloud = true;                           // 冒险皮肤：软软的云朵桥
    } else if (name === 'rhythm') {
      d.need = g.needByLevel(l);
      d.speed = g.speedByLevel(l);
      d.missPenalty = g.missPenalty;
      d.onMiss = () => penalty(g.missPenalty);
      d.gameCfg = { diff: d, memories: g.memories };
    } else if (name === 'fly') {
      d.need = g.needByLevel(l);
      d.clouds = l >= g.cloudFromLevel ? g.cloudsByLevel(l) : 0;
      d.speed = g.speedByLevel(l);
    }
    return d;
  }

  /* ---------- 流程 ---------- */
  function begin() {
    Object.assign(S, {
      level: 1, score: 0, hearts: CF.hearts,
      shield: false, doubleLeft: 0, honeyNext: false,
      playing: false, active: true, game: null, lastFail: null,
      victoryShown: false, history: [],
    });
    show('chalHud', true);
    nextLevel();
  }

  function nextLevel() {
    unmount();
    S.playing = false;
    const st = stageOf(S.level);
    S.game = null;
    S.diff = null;
    const honey = S.honeyNext; S.honeyNext = false;
    S.timeLimit = Math.round(CF.timeByLevel(S.level) * (honey ? 1.4 : 1));
    S.timeLeft = S.timeLimit;
    // 每关给两个任务选项：让孩子决定“今天想帮谁”，而不是被线性流程推着走。
    $('chalLevelNum').textContent = `${st.icon} ${st.name}`;
    $('chalLevelIntro').textContent = S.level === 1 ? CF.tagline : st.tip;
    $('chalLevelIntro').classList.toggle('first', S.level === 1);
    $('chalLevelGame').textContent = 'Who would you like to help?';
    $('chalLevelGoal').textContent = 'Choose a little mission. A different path will appear next time.';
    $('chalLevelTime').textContent = `🍃 ${CF.timerName}: ${S.timeLimit} sec`;
    const wrap = $('chalMissionChoices');
    wrap.innerHTML = '';
    missionOptions(S.level).forEach(name => {
      const diff = buildDiff(name, S.level);
      const card = document.createElement('button');
      card.className = 'mission-card';
      card.innerHTML = `<span class="mission-icon">${MISSION_ICONS[name]}</span>
        <span class="mission-copy"><strong>${CF.games[name].title}</strong><small>${CF.games[name].goal(diff)}</small></span>
        <span class="mission-go">Choose this path&nbsp;→</span>`;
      card.onclick = () => {
        if (S.game) return;
        S.game = name; S.diff = diff;
        wrap.querySelectorAll('.mission-card').forEach(el => { el.disabled = true; });
        card.classList.add('chosen');
        $('chalLevelGame').textContent = CF.games[name].title;
        $('chalLevelGoal').textContent = CF.games[name].goal(diff);
        audio.sfx.ok();
        setTimeout(startLevel, 320);
      };
      wrap.appendChild(card);
    });
    hud();
    show('screenChalLevel', true);
  }

  function startLevel() {
    if (!S.game || !S.diff) return;
    show('screenChalLevel', false);
    const name = S.game;
    mount(name, { diff: S.diff, title: CF.games[name].title });
    S.playing = true;
    S.timeLeft = S.timeLimit;
    hud();
    audio.sfx.ok();
  }

  function penalty(sec) {                     // 游戏内失误扣沙漏（漏接星光等）
    if (!S.playing) return;
    S.timeLeft = Math.max(0.4, S.timeLeft - sec);
    ui.toast(`The wind carried a note away. ${CF.timerName} −${sec} sec`, 'Meadow');
    audio.sfx.gentle();
    timer();
  }

  /** 每帧：星光沙漏 */
  let updN = 0;
  function update(dt) {
    updN++;
    if (!S.active || !S.playing) return;
    S.timeLeft -= dt;
    timer();
    if (S.timeLeft <= 0) handleResult({ fail: 'timeout', reason: 'Wind-Chime Time ran out' });
  }

  /** 游戏结束（成功或失败）统一入口 */
  function handleResult(result = {}) {
    if (!S.active || !S.playing) return;
    S.playing = false;
    unmount();
    S.history.push({ level: S.level, game: S.game, ok: !result.fail });

    if (result.fail) { fail(result); return; }

    // ---- 过关：收集星光能量 ----
    const gain = Math.round(
      (CF.score.base(S.level)
        + Math.ceil(S.timeLeft) * CF.score.perSecondLeft
        + (result.bonus || 0))
      * (S.doubleLeft > 0 ? 2 : 1));
    if (S.doubleLeft > 0) S.doubleLeft--;
    S.score += gain;
    S.lastFail = null;
    audio.sfx.chime();
    ui.toast(`Mission complete! 🧺 +${gain}${result.bonus ? ' (smooth sailing)' : ''}`, 'Travel Journal', 1800);
    S.level++;
    hud();
    if (!S.victoryShown && stageOf(S.level).key === 'heart') { showVictory(); return; }
    if (S.level > 1 && (S.level - 1) % CF.blessingEvery === 0) showBlessing();
    else setTimeout(nextLevel, 900);
  }

  function fail(result) {
    const key = result.fail === 'timeout' ? 'timeout'
              : result.fail === 'cloud' ? 'cloud'
              : result.fail === 'sink' ? 'sink' : 'match';
    S.lastFail = CF.failReasons[key] || 'This mission is not complete yet';
    audio.sfx.gentle();
    if (S.shield) {
      S.shield = false;
      ui.toast('🍀 Your clover saved a Courage Leaf. Try the path again.', 'Travel Journal', 2000);
      hud();
      setTimeout(startLevel, 1200);            // 同关重试
      return;
    }
    S.hearts--;
    hud();
    const banner = $('chalBanner');
    $('chalBannerText').textContent = S.lastFail + ` (${S.hearts} Courage Leaves left)`;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1800);
    if (S.hearts > 0) setTimeout(startLevel, 2100);   // 同关重试
    else setTimeout(endGame, 2100);
  }

  /* ---------- 彩虹祝福三选一 ---------- */
  function showBlessing() {
    const wrap = $('blessingCards');
    wrap.innerHTML = '';
    CF.blessings.forEach(b => {
      const el = document.createElement('button');
      el.className = 'choice-card blessing-card';
      el.innerHTML = `<div class="blessing-icon">${b.icon}</div>
        <div class="blessing-name">${b.name}</div>
        <div class="blessing-desc">${b.desc}</div>`;
      el.onclick = () => {
        if (b.id === 'honey') S.honeyNext = true;
        if (b.id === 'shield') S.shield = true;
        if (b.id === 'double') S.doubleLeft = 2;
        audio.sfx.ok();
        show('screenBlessing', false);
        nextLevel();
      };
      wrap.appendChild(el);
    });
    show('screenBlessing', true);
  }

  /* ---------- 胜利：彩虹点亮（第三幕通关） ---------- */
  function showVictory() {
    S.victoryShown = true;
    $('chalEndTitle').textContent = CF.victory.title;
    $('chalEndScore').textContent = `🧺 Travel Marks ${S.score}`;
    $('chalEndLevel').textContent = `All three acts complete · Level ${S.level}`;
    const okN = S.history.filter(h => h.ok).length;
    $('chalEndStats').textContent = `${okN} complete · ${S.history.length - okN} gentle retries`;
    const best = +localStorage.getItem(CF.bestKey) || 0;
    $('chalEndBest').textContent = `Travel Journal best: ${Math.max(best, S.score)} marks`;
    $('chalEndReason').textContent = CF.victory.text;
    $('btnChalRetry').textContent = CF.victory.continueBtn;
    show('screenChalEnd', true);
    show('chalHud', false);
  }

  /* ---------- 结算 ---------- */
  function recordBest() {
    const best = +localStorage.getItem(CF.bestKey) || 0;
    if (S.score > best) { try { localStorage.setItem(CF.bestKey, String(S.score)); } catch (e) {} }
    return Math.max(best, S.score);
  }
  function endGame() {
    S.active = false;
    const best = recordBest();
    const isBest = S.score >= best && S.score > 0;
    $('chalEndTitle').textContent = isBest ? CF.endTitleBest : CF.endTitle;
    $('chalEndScore').textContent = `🧺 Travel Marks ${S.score}`;
    $('chalEndLevel').textContent = `Reached ${stageOf(S.level).short} · Level ${S.level}`;
    const okN = S.history.filter(h => h.ok).length;
    $('chalEndStats').textContent = `${okN} complete · ${S.history.length - okN} gentle retries`;
    $('chalEndBest').textContent = `Travel Journal best: ${best} marks`;
    $('chalEndReason').textContent = S.lastFail
      ? `${S.lastFail}—Feather can rest now. Rainbow Island will be here when you return!` : '';
    $('btnChalRetry').textContent = '🔄 Another Adventure';
    show('screenChalEnd', true);
    show('chalHud', false);
  }

  function exit() {                            // 回标题（暂停菜单里也用）
    S.active = false; S.playing = false;
    unmount();
    recordBest();
    show('chalHud', false);
    show('screenChalLevel', false);
    show('screenBlessing', false);
    show('screenChalEnd', false);
    onExit();
  }

  /* ---------- 按钮 ---------- */
  $('btnChalStart').addEventListener('click', startLevel);
  $('btnChalRetry').addEventListener('click', () => {
    show('screenChalEnd', false);
    if (S.victoryShown && S.active) {          // 胜利画面 → 继续无尽守护
      show('chalHud', true);
      if ((S.level - 1) % CF.blessingEvery === 0) showBlessing();
      else nextLevel();
    } else begin();
  });
  $('btnChalExit').addEventListener('click', exit);

  return {
    begin, exit, update, handleResult,
    get active() { return S.active; },
    debug: () => ({ ...S, stage: stageOf(S.level).key, updN }),
  };
}
