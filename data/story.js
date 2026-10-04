/**
 * 《小羽的春天》四个短章
 * 面向 5–8 岁；每章约 2–3 分钟；每章获得一根成长羽毛。
 * 操作失误只给温柔提示，不死亡、不扣分。
 */
export const STORY = [
  {
    id: 'hatch', num: 1, title: 'Hatching', subtitle: 'Noticing and Kindness',
    bg: 'springJourney', mood: 'warm',
    steps: [
      {
        bg: 'springJourney',
        chars: [
          { id: 'duckMom', x: .72, y: .75, facing: -1 },
          { id: 'egg', x: .56, y: .77 },
          { id: 'duckling', x: .34, y: .78, s: .62 },
        ],
        say: ['Narrator', 'The farm was waking in the early morning. The last speckled egg gave a tiny wiggle.', 'en/c1_01'],
      },
      { say: ['Narrator', 'Mama Duck had found the speckled egg caught in the reeds after the spring flood. When a little gray bird hatched, she named her Feather and cared for her warmly.', 'en-v2/c1_02'],
        chars: [
          { id: 'duckMom', x: .72, y: .75, facing: -1 },
          { id: 'xiaoyu', x: .54, y: .79, s: .8 },
          { id: 'duckling', x: .34, y: .78, s: .62 },
        ] },
      { say: ['Feather', 'Mama Duck, thank you for keeping me safe. But who left the long black feather beside my shell?', 'en-v2/c1_03'], em: 'wow' },
      {
        chars: [
          { id: 'xiaoyu', x: .27, y: .79, s: .8, facing: 1 },
          { id: 'duckMom', x: .79, y: .75, facing: -1 },
        ],
        visual: 'reedPendantUnlit',
        say: ['Mama Duck', 'I do not know, little one. I wove this tiny nest pendant from the reeds that caught your egg. It will keep the black feather close until its owner—your first mother—finds you.', 'en-v2/c1_04_pendant'], em: 'calm',
      },
      { visual: null, say: ['Narrator', 'Three animals near the farm need a hand. Find them, then bring each one what they need.', 'en/c1_05'] },
      {
        game: 'farm', title: 'Farmyard Helper',
        hint: 'Follow one clue at a time and look carefully near reeds, grass, and lily pads',
        give: { star: 1 }, reason: 'Farmyard Helper',
      },
      { say: ['Feather', 'When I look carefully, I can help a friend—and perhaps notice clues that lead to my mother.', 'en-v2/c1_06'], em: 'happy' },
      { say: ['Mama Duck', 'Go when you are ready. I will always be part of your family, and this farm will always welcome you home.', 'en-v2/c1_07'], em: 'happy' },
      { progress: { score: 80, label: 'Mama Duck’s loving promise became a guiding light' } },
      { reward: { feather: 1 }, reason: 'Feather of Noticing: I look closely and lend a helping wing.' },
    ],
  },

  {
    id: 'depart', num: 2, title: 'Setting Out', subtitle: 'Spelling and Courage',
    bg: 'springForest', mood: 'travel',
    steps: [
      {
        bg: 'springForest',
        chars: [{ id: 'xiaoyu', x: .38, y: .79, s: .9 }],
        say: ['Narrator', 'Feather followed the stream wearing Mama Duck’s little reed-nest pendant. The long black feather rested safely inside while the wind drew round ripples on the water.', 'en-v2/c2_01_pendant'],
      },
      { say: ['Feather', 'The trail may lead to my mother, but this strong wind makes me nervous. Maybe I can learn its rhythm.', 'en-v2/c2_02'], em: 'sad' },
      { say: ['Narrator', 'The breeze scattered black-feather letters across the stream. Look at each easy word, listen carefully, and tap its letters in order.', 'en-v2/c2_spell_01'] },
      {
        game: 'spelling', title: 'Black Feather Word Trail',
        hint: 'Look, listen, and tap the black-feather letters in the right order',
        give: { star: 1 }, reason: 'Black Feather Word Trail',
      },
      { say: ['Feather', 'WIND, LAKE, NEST, HOME—I found every word one letter at a time. I can follow the black-feather trail.', 'en-v2/c2_spell_02'], em: 'happy' },
      { say: ['Narrator', 'Courage is not never feeling afraid. It is trying one small step while you are afraid.', 'en/c2_05'] },
      { progress: { score: 80, label: 'Feather remembered what courage means' } },
      { reward: { feather: 1 }, reason: 'Feather of Courage: I try one letter, one word, and one brave step at a time.' },
    ],
  },

  {
    id: 'winter', num: 3, title: 'Winter Light', subtitle: 'Paths and Helping Hands',
    bg: 'snowfield', mood: 'snow',
    steps: [
      {
        bg: 'snowfield',
        chars: [{ id: 'xiaoyu', x: .42, y: .79, s: .9, em: 'sad' }],
        say: ['Narrator', 'Winter arrived while Feather followed the black-feather trail north. Thin ice covered the lake, but warm lights marked a safe little path.', 'en-v2/c3_01'],
      },
      { say: ['Feather', 'I will check each step. If one wobbles, I can choose another way.', 'en/c3_02'], em: 'calm' },
      {
        game: 'path', title: 'Path of Warm Lights',
        hint: 'Connect the warm lights from near to far. Tap each one or hold and drag',
        cfg: { diff: { rows: 4, winter: true } },
      },
      {
        chars: [
          { id: 'xiaoyu', x: .34, y: .79, s: .9 },
          { id: 'owl', x: .72, y: .62, facing: -1 },
        ],
        say: ['Grandpa Owl', 'Snow has covered the road ahead. Shall we read the stars and find the way together?', 'en/c3_03'],
      },
      { say: ['Feather', 'Yes, please help me. When I do not know something, a friend and I can think together.', 'en/c3_04'], em: 'calm' },
      { say: ['Grandpa Owl', 'Of course. Asking for help is one of the ways we grow.', 'en/c3_05'], em: 'happy' },
      {
        say: ['Grandpa Owl', 'These snowflake squares follow a pattern. Each number belongs once in every row, column, and little box. Choose the puzzle that feels right for you.', 'en-v2/c3_06'],
        em: 'happy',
      },
      {
        game: 'sudoku', title: 'Snowflake Sudoku',
        hint: 'Choose Beginner, Intermediate, or Advanced Snowflake Sudoku',
        give: { star: 1 }, reason: 'Winter Star Map',
      },
      {
        say: ['Grandpa Owl', 'The finished star map points to the lake beyond the snowy ridge. A black swan has returned there every spring, searching for a lost egg.', 'en-v2/c3_07'],
        em: 'happy',
      },
      { progress: { score: 80, label: 'The star map revealed a path toward Feather’s mother' } },
      { reward: { feather: 1 }, reason: 'Feather of Teamwork: I can help others, and I can ask for help too.' },
    ],
  },

  {
    id: 'glow', num: 4, title: 'Homeward Light', subtitle: 'Belonging and Growth',
    bg: 'springDusk', mood: 'spring',
    steps: [
      {
        bg: 'springDusk',
        chars: [
          { id: 'xiaoyu', x: .35, y: .79, s: .95 },
          { id: 'swan', x: .72, y: .78, s: .94, facing: -1, em: 'sad' },
        ],
        say: ['Narrator', 'Beyond the snowy ridge, Feather reached a quiet lake. A black swan stood at the shore, holding a feather that matched the one found beside Feather’s shell.', 'en-v2/c4_01'],
      },
      { say: ['Swan Mother', 'That little gray bird… and that black feather. Could it truly be my lost child?', 'en-v2/c4_02'], em: 'sad' },
      { say: ['Feather', 'My heart knows her, but I still feel nervous. How can I let her know I am here?', 'en-v2/c4_03'], em: 'calm' },
      {
        say: ['Narrator', 'Six pieces of a wind-tossed memory picture shimmered along the shore. Feather followed the black feather through the picture, one piece at a time.', 'en-v2/c4_puzzle_01'],
      },
      {
        game: 'puzzle', title: 'Black Feather Memory Puzzle',
        hint: 'Complete the black-feather lake picture by matching its colors and lines',
      },
      {
        say: ['Feather', 'The picture is whole. The black feather leads to the swan by the lake. I am ready to speak.', 'en-v2/c4_puzzle_02'], em: 'happy',
      },
      {
        game: 'choice', title: 'A Voice Across the Lake', whoami: true,
        cfg: {
          question: 'How should Feather greet the swan by the lake?',
          options: [
            {
              icon: '🗣️', label: 'Call softly: “Mother, is that you?”', sub: 'Use a brave and gentle voice', kind: 'courage',
              outcome: ['Swan Mother', 'My little one! I have listened for your call beside every lake.', 'en-v2/c4_04a'],
              give: { star: 1 }, reason: 'A Brave Call Across the Lake',
            },
            {
              icon: '🪶', label: 'Show the feather from my shell', sub: 'Share the clue Mama Duck kept safe', kind: 'together',
              outcome: ['Swan Mother', 'That feather came from my wing. My little one—I have finally found you.', 'en-v2/c4_04b'],
              give: { star: 1 }, reason: 'The Matching Feather',
            },
            {
              icon: '🌫️', label: 'Hide until I look like a swan', sub: 'Feather does not need to change before being loved',
              retry: true, mentor: 'Mama Duck’s Memory', mentorLine: 'You already deserve to be found and loved. Let your mother see the child you are today.',
            },
          ],
        },
      },
      {
        chars: [
          { id: 'xiaoyu', x: .3, y: .8, s: .86, facing: 1, em: 'happy' },
          { id: 'swan', x: .73, y: .78, s: .98, facing: -1, em: 'happy' },
        ],
        visual: 'reedPendant',
        say: ['Narrator', 'Swan Mother opened her wings, and Feather ran into their warmth. The reed-nest pendant opened; four Growth Feather lights circled the black feather and glowed between them.', 'en-v2/c4_05_pendant'],
      },
      { say: ['Swan Mother', 'A spring flood carried your egg away. Mama Duck kept you safe, and I searched every spring. I knew you by the feather and by the brave heart in your voice.', 'en-v2/c4_06'], em: 'happy' },
      { say: ['Feather', 'Mama Duck named me Feather. Now I have found you—and I know both homes are part of my story.', 'en-v2/c4_07'], em: 'happy' },
      { progress: { score: 80, label: 'Two loving homes became one complete story' } },
      { reward: { feather: 1 }, reason: 'Feather of Belonging: I found my mother and learned that I was always worthy of love.' },
      { ending: true },
    ],
  },
];
