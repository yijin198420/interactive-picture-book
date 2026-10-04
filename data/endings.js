/**
 * ============================================================
 * 《小羽的春天》结局寄语配置
 * ------------------------------------------------------------
 * 依据成长羽毛、故事贴纸与小羽和天鹅妈妈相认时的选择生成纪念卡寄语。
 * 生成三种不同类型的结尾寄语：
 *   courage  —— 勇气型（选择和天鹅群一起飞向远方）
 *   kindness —— 善意型（选择先留在朋友身边 / 一起做决定）
 *   together —— 均衡型（选择和大家一起做决定）
 * 三种寄语落点一致：成长有自己的节奏，与「变漂亮」无关。
 * ============================================================
 */

export function getEnding({ feathers, stars, finalChoice }) {
  const F = feathers, S = stars;

  let type;
  if (finalChoice === 'courage')      type = 'courage';
  else if (finalChoice === 'together') type = 'together';
  else                                 type = 'kindness';

  const statsLine = `On this journey, you and Feather collected ${F} Growth Feather${F === 1 ? '' : 's'} and ${S} Story Sticker${S === 1 ? '' : 's'}.`;

  const BODIES = {
    courage: [
      'You helped Feather call across the lake, even while her heart was fluttering.',
      'Swan Mother heard the brave little voice she had been searching for, and answered with open wings.',
    ],
    kindness: [
      'Every friend helped Feather follow the clues all the way to the lake.',
      'Swan Mother found her child, while Mama Duck remained the family who had kept Feather safe.',
    ],
    together: [
      'You helped Feather share the matching feather that Mama Duck had protected since the spring flood.',
      'Swan Mother recognized it at once, and mother and child finally found each other.',
    ],
  };

  const closing = 'Finding Swan Mother did not make Feather beautiful or worthy—Feather had always been herself, always growing, and always deserving of love.';

  return {
    type,
    title: 'Home at Last · Keepsake Card',
    lines: [statsLine, ...BODIES[type], closing],
  };
}
