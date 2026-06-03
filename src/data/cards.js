export const GRADES = {
  n:    { label: 'N',      className: 'grade-n',    dropRate: 0.55 },
  r:    { label: 'R',      className: 'grade-r',    dropRate: 0.30 },
  sr:   { label: 'SR',     className: 'grade-sr',   dropRate: 0.10 },
  ur:   { label: 'UR',     className: 'grade-ur',   dropRate: 0.04 },
  lg:   { label: 'LEGEND', className: 'grade-lg',   dropRate: 0.01 },
  raid: { label: 'RAID',   className: 'grade-raid', dropRate: 0    },
};

export const CHARACTERS = [
  { id: 'rumi',    name: '루미',    species: '여우' },
  { id: 'toto',    name: '토토리',  species: '햄스터' },
  { id: 'pin',     name: '핀초코',  species: '펭귄' },
  { id: 'luka',    name: '루카뇽',  species: '공룡' },
  { id: 'misti',   name: '미스티',  species: '귀신' },
  { id: 'daitron', name: '다이트론', species: '악마기사' },
];

// condition 1-5: normal | 6-8: hologram | 9-10: gold shimmer
export const CARDS = [
  { id: 'rumi_n',      name: '루미',    grade: 'n',  img: '노말여우.png',         slogan: '"으쌰으쌰!"' },
  { id: 'rumi_r',      name: '루미',    grade: 'r',  img: '레어여우.png',         slogan: '"야호~!"' },
  { id: 'rumi_sr',     name: '루미',    grade: 'sr', img: '슈퍼레어여우.png',     slogan: '"세상은 내가 지킨다!"' },
  { id: 'rumi_ur',     name: '루미',    grade: 'ur', img: '울트라레어여우.png',   slogan: '"내가 최고야 다 비켜~!"' },
  { id: 'rumi_lg',     name: '루미',    grade: 'lg', img: '레전드여우.png',       slogan: '"이 밤이 끝나지 않았으면!"' },

  { id: 'toto_n',      name: '토토리',  grade: 'n',  img: '노말햄스터.png',       slogan: '"흠냐...zzz"' },
  { id: 'toto_r',      name: '토토리',  grade: 'r',  img: '레어햄스터.png',       slogan: '"이것만 뛰면 만두 10개..!"' },
  { id: 'toto_sr',     name: '토토리',  grade: 'sr', img: '슈퍼레어햄스터.png',   slogan: '"잡았다! 오늘 저녁은 생선이다!"' },
  { id: 'toto_ur',     name: '토토리',  grade: 'ur', img: '울트라레어햄스터.png', slogan: '"해바라기씨는 너한테 줄 건 없으ㄹ으어어.."' },
  { id: 'toto_lg',     name: '토토리',  grade: 'lg', img: '레전드햄스터.png',     slogan: '"짠— 놀랐지?"' },

  { id: 'pin_n',       name: '핀초코',  grade: 'n',  img: '노말펭귄.png',         slogan: '"첨벙첨벙~ 물이 최고야!"' },
  { id: 'pin_r',       name: '핀초코',  grade: 'r',  img: '레어펭귄.png',         slogan: '"아! 머리깨져-!"' },
  { id: 'pin_sr',      name: '핀초코',  grade: 'sr', img: '슈퍼레어펭귄.png',     slogan: '"호이야 후이야..."' },
  { id: 'pin_ur',      name: '핀초코',  grade: 'ur', img: '울트라레어펭귄.png',   slogan: '"데 데... 대머리야..!"' },
  { id: 'pin_lg',      name: '핀초코',  grade: 'lg', img: '레전드펭귄.png',       slogan: '"눈을 뜨니.. 여기가 어딩교"' },

  { id: 'luka_n',      name: '루카뇽',  grade: 'n',  img: '노말공룡.png',         slogan: '"엄마?? 엄마?!!!"' },
  { id: 'luka_r',      name: '루카뇽',  grade: 'r',  img: '레어공룡.png',         slogan: '"이렇게 하면..! 후흡!!"' },
  { id: 'luka_sr',     name: '루카뇽',  grade: 'sr', img: '슈퍼레어공룡.png',     slogan: '"냠냠 으앗 다 녹잖아??"' },
  { id: 'luka_ur',     name: '루카뇽',  grade: 'ur', img: '울트라레어공룡.png',   slogan: '"네~ 뇽랏샤이마세~"' },
  { id: 'luka_lg',     name: '루카뇽',  grade: 'lg', img: '레전드공룡.png',       slogan: '"내가 왕이다! 얼른 아이스크림을 가져오너라!"' },

  { id: 'misti_n',     name: '미스티',  grade: 'n',  img: '노말귀신.png',         slogan: '"숨바꼭질 재밌다... 나 못찾겠지?"' },
  { id: 'misti_r',     name: '미스티',  grade: 'r',  img: '레어귀신.png',         slogan: '"해파리야~ 나도 흐느적댄다?"' },
  { id: 'misti_sr',    name: '미스티',  grade: 'sr', img: '슈퍼레어귀신.png',     slogan: '"이건?? 나잖아!!"' },
  { id: 'misti_ur',    name: '미스티',  grade: 'ur', img: '울트라레어귀신.png',   slogan: '"시원하다~ 칠~!"' },
  { id: 'misti_lg',    name: '미스티',  grade: 'lg', img: '레전드귀신.png',       slogan: '"울면 사탕 안준다??!!"' },

  { id: 'daitron_n',   name: '다이트론', grade: 'n', img: '노말악마기사.png',      slogan: '앞이 안보여...' },
  { id: 'daitron_r',   name: '다이트론', grade: 'r', img: '레어악마기사.png',      slogan: '으아악!' },
  { id: 'daitron_sr',  name: '다이트론', grade: 'sr',img: '슈퍼레어악마기사.png',  slogan: '악마의 성...zzz' },
  { id: 'daitron_ur',  name: '다이트론', grade: 'ur',img: '울트라레어악마기사.png', slogan: '물..들어와..ㅅ..ㅏ.ㄹ..' },
  { id: 'daitron_lg',  name: '다이트론', grade: 'lg',img: '레전드악마기사.png',    slogan: '끝이다.' },

  // ── 서부 시리즈 SR (일반 뽑기 제외, 상점 전용) ──
  { id: 'rumi_sr2',     name: '루미',    grade: 'sr', img: '서부여우.png',     slogan: '"서부의 바람이 불어온다!"',  special: 'western' },
  { id: 'totori_sr2',   name: '토토리',  grade: 'sr', img: '서부햄스터.png',   slogan: '"이 땅은 내가 지킨다!"',    special: 'western' },
  { id: 'pinchoco_sr2', name: '핀초코',  grade: 'sr', img: '서부펭귄.png',     slogan: '"빵야! 빵야!"',             special: 'western' },
  { id: 'lukanyong_sr2',name: '루카뇽',  grade: 'sr', img: '서부공룡.png',     slogan: '"으아아 먼지가 날린다!"',   special: 'western' },
  { id: 'misti_sr2',    name: '미스티',  grade: 'sr', img: '서부유령.png',     slogan: '"유령 마을에 오신 걸 환영해요..."', special: 'western' },
  { id: 'daitron_sr2',  name: '다이트론', grade: 'sr', img: '서부악마기사.png', slogan: '"서부엔 법이 없다."',       special: 'western' },

  // ── RAID 한정 카드 (일반 뽑기/합성 제외) ──
  { id: 'raid_cursed_doll', name: '저주받은 인형의 왕', grade: 'raid', img: 'boss_cursed_doll.png', slogan: '"공허의 심연에서 깨어났다"', raid: true },
];

export const CARD_MAP = Object.fromEntries(CARDS.map(c => [c.id, c]));

export function getConditionEffect(condition) {
  if (condition >= 9) return 'gold';
  if (condition >= 6) return 'hologram';
  return 'normal';
}
