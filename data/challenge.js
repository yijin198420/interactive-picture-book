/**
 * ============================================================
 * 《彩虹岛大冒险》主题与难度配置（改这里就能调，不用碰代码）
 * ------------------------------------------------------------
 * 世界观（明亮卡通 · 可爱轻松冒险治愈）：
 *   小羽旅行到彩虹岛时，一团爱捣蛋的乌云怪打了个大喷嚏，
 *   把岛上的颜色全吹散了。彩虹碎成了星光，掉得到处都是。
 *   小羽背起小星星袋，去把星光能量一颗颗捡回来——
 *   集齐能量，就能重新点亮彩虹之心，让小岛恢复色彩！
 * 玩法骨架与数值沿用挑战模式（数值含义见各注释），
 * 三幕阶段 + 无尽守护，越往后乌云能量越强。
 * ============================================================ */
export const ADVENTURE = {

  /* ---------- 冒险之书 ---------- */
  title: 'A Little Wind-Valley Journey',
  tagline: 'The spring wind scattered the animals’ travel letters. Follow Feather along the lakeshore and choose a friend to help.',
  hero: { name: 'Feather', role: 'A meadow traveler wearing Mama Duck’s reed-nest pendant' },

  /* ---------- UI 命名（与故事统一） ---------- */
  scoreName: 'Travel Marks',
  heartsName: 'Courage Leaves',
  timerName: 'Wind-Chime Time',

  /* ---------- 全局数值 ---------- */
  hearts: 3,                       // 守护之心：失败一次扣一颗
  timeByLevel: (l) => Math.max(32, 66 - l * 2),        // 低压力节奏：64s 起步，逐步加快
  score: {
    base: (l) => 100 + (l - 1) * 20,                   // 过关基础星光
    perSecondLeft: 2,                                  // 剩余沙漏奖励
    noMistakeBonus: 60,                                // 零失误奖励
  },
  blessingEvery: 3,                // 每 3 关送一次「彩虹祝福三选一」
  blessings: [
    { id: 'honey',  icon: '☕', name: 'Honey Tea', desc: '40% more Wind-Chime Time on the next road' },
    { id: 'shield', icon: '🍀', name: 'Lucky Clover', desc: 'The next mistake will not use a Courage Leaf' },
    { id: 'double', icon: '📮', name: 'Double Postmark', desc: 'Earn double Travel Marks on the next two missions' },
  ],

  /* ---------- 三幕阶段 + 无尽守护 ----------
     from/to：关卡范围；pool：该幕轮换的小游戏；
     scene：每个小游戏在本幕使用的背景（覆盖默认）；tip：入幕提示 */
  stages: [
    {
      key: 'plain', icon: 'Ⅰ', name: 'First Stop · Lakeside Meadow', short: 'Lakeside Meadow',
      from: 1, to: 4, pool: ['match', 'sort'],
      scene: { match: 'springJourney', sort: 'springJourney' },
      tip: 'Wind moves through the reeds and wildflowers. Nearby friends are waiting for a helping wing.',
    },
    {
      key: 'valley', icon: 'Ⅱ', name: 'Second Stop · Forest Stream', short: 'Forest Stream',
      from: 5, to: 8, pool: ['path', 'rhythm', 'match'],
      scene: { path: 'springForest', rhythm: 'springForest', match: 'springForest' },
      tip: 'Can you hear the stream and wind chimes? Look slowly and the path will appear.',
    },
    {
      key: 'forest', icon: 'Ⅲ', name: 'Third Stop · Windy Hill', short: 'Windy Hill',
      from: 9, to: 12, pool: ['fly', 'sort', 'path'],
      scene: { fly: 'springDusk', sort: 'springDusk', path: 'springDusk' },
      tip: 'The hilltop wind is strong. Ride the rising air and see what lies beyond.',
    },
    {
      key: 'heart', icon: '∞', name: 'Night Camp · Wander Freely', short: 'Night Camp',
      from: 13, to: Infinity, pool: ['match', 'sort', 'path', 'rhythm', 'fly'],
      scene: { match: 'springDusk', sort: 'springForest', path: 'springForest', rhythm: 'springDusk', fly: 'springDusk' },
      tip: 'The campfire is glowing. If you wish to continue, more undelivered letters wait in the meadow.',
    },
  ],

  /* ---------- 小游戏的冒险皮肤（标题 / 目标 / 难度曲线） ---------- */
  games: {
    match: {
      scene: 'pondMorning',
      title: 'Find the Separated Friends',
      goal: (d) => `Watch shapes and movements, then reunite ${d.pairs} pairs${d.decoys && d.decoys.length ? ' without being distracted by passing travelers' : ''}`,
      pairsByLevel: (l) => Math.min(2 + Math.floor(l / 2), 5),
      decoyFromLevel: 3,
      decoysByLevel: (l) => (l >= 6 ? 2 : 1),
    },
    sort: {
      scene: 'forestAutumn',
      title: 'Forest Post',
      goal: (d) => `Deliver ${d.items} acorn parcels and ${d.items} leaf letters to the right baskets${d.move ? ' while the wind gently moves them' : ''}`,
      itemsByLevel: (l) => Math.min(3 + Math.floor(l / 3), 6),
      moveFromLevel: 4,
      moveAmpByLevel: (l) => Math.min(30 + (l - 4) * 12, 110),
      labels: { acorn: '🧺 Acorn Parcels', leaf: '✉️ Leaf Letters' },   // 冒险皮肤的目标标签
      sunny: false,                                         // 使用自然橡果 / 树叶信的手绘配色
    },
    path: {
      scene: 'streamSide',
      title: 'Cross the Dewdrop Stones',
      goal: (d) => `Watch the ripples and cross ${d.rows} rows of dewdrop stones${d.sink ? ' before the ripples beneath you fade' : ''}`,
      rowsByLevel: (l) => Math.min(3 + Math.floor(l / 2), 7),
      sinkFromLevel: 3,
      sinkSeconds: 4.0,
    },
    rhythm: {
      scene: 'snowfield',
      title: 'Catch the Wind-Chime Notes',
      goal: (d) => `Follow the rhythm and catch ${d.need} notes (a missed note uses ${d.missPenalty} seconds)`,
      needByLevel: (l) => Math.min(4 + Math.floor(l / 2), 9),
      speedByLevel: (l) => 1 + Math.min(l * 0.08, 0.8),
      missPenalty: 3,
      memories: [
        ['Rainbow Meadow', 'The colors are returning, little by little!'],
        ['Wind Sprite', 'I just helped blow one rain cloud away!'],
        ['Little Deer', 'Thank you! I can see pink again!'],
        ['Squirrel', 'This pinecone—oh, I mean starlight—is for you!'],
        ['Star Friends', 'We are stars, and we are your friends too!'],
        ['Rainbow Heart', 'Collect a little more and I will glow!'],
      ],
    },
    fly: {
      scene: 'springLake',
      title: 'Fly with the Dandelions',
      goal: (d) => `Ride the rising air through ${d.need} dandelion rings${d.clouds ? ' and steer around thick rain clouds' : ''}`,
      needByLevel: (l) => Math.min(4 + Math.floor(l / 3), 7),
      cloudFromLevel: 2,
      cloudsByLevel: (l) => Math.min(1 + Math.floor((l - 2) / 3), 3),
      speedByLevel: (l) => 1 + Math.min(l * 0.05, 0.6),
    },
  },

  /* ---------- 失败原因文案（可爱不恐怖） ---------- */
  failReasons: {
    timeout: '🍃 The wind chimes grew quiet—return to camp, hear a clue, and try again',
    match: '💭 The friends are almost reunited',
    cloud: '☁️ A rain cloud blocked the way—ride the wind around it next time',
    sink: '💧 The ripples faded—remember the path that appeared',
  },

  /* ---------- 胜利（第三幕通关） ---------- */
  victory: {
    title: '🏕️ The Campfire Is Glowing!',
    text: 'The delivered letters became little lights along the road to camp. More stories are waiting in the meadow.',
    continueBtn: '🌙 Keep Wandering',
    exitBtn: '🏠 Title Screen',
  },

  /* ---------- 结算 ---------- */
  endTitle: '☕ Rest at Camp',
  endTitleBest: '🌟 A New Travel Record!',
  bestKey: 'xiaoyu-spring-challenge-best',
};
