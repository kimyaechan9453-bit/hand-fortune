(function () {
'use strict';
var SUITS = ['s', 'h', 'd', 'c'];
var SUIT_CH = { s: '♠', h: '♥', d: '♦', c: '♣' };
var RANK_CH = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 10: '10' };
var HAND_NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 플러시'];

/* ---------- seeded PRNG ---------- */
function hashStr(str) { var h = 1779033703 ^ str.length; for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// target odds by hand rank (1 원페어 ... 9 로열 플러시); boosted vs real hold'em, never 하이카드
var RANK_WEIGHTS = [0, 30, 28, 13, 10, 8, 7, 3, 0.8, 0.2];
function pickRank(rnd) {
  var tot = RANK_WEIGHTS.reduce(function (x, y) { return x + y; }, 0), x = rnd() * tot;
  for (var i = 1; i < RANK_WEIGHTS.length; i++) { x -= RANK_WEIGHTS[i]; if (x < 0) return i; }
  return 1;
}
function dealHand(rnd) {
  var c = dealRaw(rnd);
  if (c[1].r > c[0].r) { var t = c[0]; c[0] = c[1]; c[1] = t; } // higher hole card on the left
  return c;
}
function dealRaw(rnd) {
  var target = pickRank(rnd), best = null, bestRank = -1;
  var deck = []; SUITS.forEach(function (s) { for (var r = 2; r <= 14; r++) deck.push({ r: r, s: s }); });
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  if (target >= 8) { // straight / royal flush are too rare to find by reshuffling, so build them
    for (var q = 0; q < 200; q++) {
      shuffle(deck);
      var su = deck[0].s, high = target === 9 ? 14 : 6 + Math.floor(rnd() * 8); // SF high 6..13
      var sf = []; for (var r = high - 4; r <= high; r++) sf.push({ r: r, s: su });
      var p = 1 + Math.floor(rnd() * 3); // hole = two adjacent SF cards, not the lowest pair
      var hole = [sf[p], sf[p + 1]];
      var rest = sf.filter(function (c, i) { return i !== p && i !== p + 1; });
      var others = deck.filter(function (c) { return !sf.some(function (x) { return x.r === c.r && x.s === c.s; }); });
      var board = shuffle(rest.concat(others.slice(0, 2)));
      var built = shuffle(hole).concat(board);
      if (preflopTier(built[0], built[1]) >= 2 && evaluate(built).rank === target) return built;
    }
  }
  // shuffle like a real deal (hole 2, flop 3, turn, river) until the hand fits: playable hole cards (tier 2+) and the target rank
  for (var k = 0; k < 300000; k++) {
    shuffle(deck);
    if (preflopTier(deck[0], deck[1]) < 2) continue;
    var cards = deck.slice(0, 7), rk = evaluate(cards).rank;
    if (rk === target) return cards;
    if (rk >= 1 && (bestRank < 1 || Math.abs(rk - target) < Math.abs(bestRank - target))) { best = cards; bestRank = rk; }
  }
  return best || deck.slice(0, 7);
}

/* ---------- evaluator: returns {rank 0-9, name, score[] for tiebreak, used[] indices} ---------- */
function evaluate5(cards) {
  var ranks = cards.map(function (c) { return c.r; });
  var counts = {}; ranks.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
  var groups = Object.keys(counts).map(Number).sort(function (a, b) { return counts[b] - counts[a] || b - a; });
  var flush = cards.every(function (c) { return c.s === cards[0].s; });
  var uniq = ranks.slice().sort(function (a, b) { return b - a; }).filter(function (r, i, a) { return a.indexOf(r) === i; });
  var straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join() === '14,5,4,3,2') straightHigh = 5;
  }
  var pattern = groups.map(function (g) { return counts[g]; }).join('');
  var rank;
  if (straightHigh && flush) rank = straightHigh === 14 ? 9 : 8;
  else if (pattern === '41') rank = 7;
  else if (pattern === '32') rank = 6;
  else if (flush) rank = 5;
  else if (straightHigh) rank = 4;
  else if (pattern === '311') rank = 3;
  else if (pattern === '221') rank = 2;
  else if (pattern === '2111') rank = 1;
  else rank = 0;
  var used = [];
  if (rank === 0) used = [ranks.indexOf(uniq[0])];
  else if ([1, 2, 3, 6, 7].indexOf(rank) >= 0) {
    ranks.forEach(function (r, i) { if (counts[r] >= 2) used.push(i); });
  } else used = [0, 1, 2, 3, 4];
  return { rank: rank, name: HAND_NAMES[rank], tiebreak: straightHigh ? [straightHigh] : groups, used: used };
}
function cmp(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (var i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) { var d = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0); if (d) return d; }
  return 0;
}
/* best 5 of 5-7 cards; best5 = indices of the 5 chosen cards, used = indices of the cards that form the rank */
function evaluate(cards) {
  if (cards.length <= 5) { var r = evaluate5(cards); r.best5 = cards.map(function (_, i) { return i; }); return r; }
  var best = null, n = cards.length;
  (function rec(start, idx) {
    if (idx.length === 5) {
      var e = evaluate5(idx.map(function (i) { return cards[i]; }));
      if (!best || cmp(e, best) > 0) { e.best5 = idx.slice(); e.used = e.used.map(function (k) { return idx[k]; }); best = e; }
      return;
    }
    for (var i = start; i < n; i++) rec(i + 1, idx.concat(i));
  })(0, []);
  return best;
}

/* ---------- copy library ---------- */
var MSG = [
  ['큰 핸드는 아니어도 하이카드로 이기는 날도 있어요. 무리하지 않고 차분하게 흐름을 보면 충분합니다.', '오늘은 폴드도 좋은 선택이에요. 아낀 에너지는 꼭 필요한 순간에 쓰면 됩니다.', '조용한 핸드일수록 읽을 게 많아요. 주변을 천천히 관찰하는 하루가 되면 좋겠어요.', '평범한 하루가 가장 편안할 때도 있어요. 작은 루틴 하나를 잘 지켜보세요.'],
  ['작은 페어 하나가 하루를 든든하게 받쳐 줘요. 익숙한 것에서 좋은 기회가 보일 거예요.', '한 가지에 집중하면 결과가 따라오는 날이에요. 할 일을 하나만 골라 끝까지 해 보세요.', '오늘은 짝이 잘 맞는 날이에요. 함께하는 사람과 생각이 잘 통할 수 있어요.', '무난하지만 탄탄한 출발이에요. 서두르지 않으면 충분히 좋은 하루가 됩니다.'],
  ['두 가지 일이 나란히 잘 풀리는 흐름이에요. 미뤄 둔 일과 새 일을 같이 챙겨 보세요.', '균형 감각이 빛나는 날이에요. 일과 쉼 사이를 잘 나누면 만족도가 높아져요.', '선택지가 두 개라면 둘 다 괜찮아요. 마음이 조금 더 가는 쪽을 골라 보세요.', '차곡차곡 쌓아 온 것들이 보이기 시작해요. 스스로를 한 번 칭찬해 주세요.'],
  ['세 장이 모인 만큼 존재감이 확실한 날이에요. 내 의견을 편하게 이야기해 보세요.', '준비해 온 일이 힘을 얻는 흐름이에요. 자신감을 가져도 좋아요.', '오늘은 꾸준함이 통하는 날이에요. 한 번 더 해 보는 끈기가 좋은 결과로 이어져요.', '주변의 도움이 자연스럽게 모여요. 고마운 마음은 바로 표현해 보세요.'],
  ['하나씩 이어지는 연결이 좋은 날이에요. 계획한 순서대로 움직이면 술술 풀려요.', '흐름을 타는 하루예요. 막혔던 일이 의외의 계기로 이어질 수 있어요.', '차근차근 단계를 밟는 힘이 빛나요. 오늘 정한 목표는 생각보다 가까이 있어요.', '앞뒤가 딱 맞아떨어지는 날이에요. 미뤄 둔 정리를 해 두면 마음이 가벼워져요.'],
  ['다섯 장이 한 색으로 모였어요. 내가 좋아하는 것에 시간을 쓰면 에너지가 차오르는 날이에요.', '분위기가 한 방향으로 잘 모이는 하루예요. 팀 작업이나 모임이 즐거울 거예요.', '취향과 감각이 살아나는 날이에요. 작은 것 하나라도 나답게 골라 보세요.', '일관된 태도가 좋은 인상을 남겨요. 오늘은 내 스타일대로 가도 괜찮아요.'],
  ['든든함과 즐거움이 함께하는 날이에요. 사람들과 보내는 시간이 특히 좋겠어요.', '꽉 찬 하루가 될 것 같아요. 바쁜 와중에도 잠깐 숨 고를 틈은 꼭 챙겨 주세요.', '안정감 속에 좋은 기회가 들어와요. 반가운 연락이 올 수도 있어요.', '해 온 만큼 돌아오는 날이에요. 오늘의 성과를 기록해 두면 좋아요.'],
  ['보기 드문 강한 핸드예요. 마음먹었던 일을 시작하기에 좋은 하루예요.', '네 장이 모인 만큼 집중력이 좋아요. 어려워 보였던 일도 한 번 도전해 보세요.', '오늘은 어디서든 존재감이 돋보여요. 그만큼 여유 있는 태도가 더 멋져 보여요.', '기분 좋은 일이 겹치는 날이에요. 좋은 기운을 주변에도 나눠 주세요.'],
  ['아주 드문 핸드가 들어왔어요. 흐름도 방향도 모두 잘 맞는 하루예요.', '오늘은 하는 일마다 손발이 척척 맞아요. 평소 미뤄 둔 도전을 꺼내 봐도 좋아요.', '이런 날은 자주 오지 않아요. 오늘의 기분 좋은 순간을 사진으로 남겨 두세요.'],
  ['로열 플러시, 정말 보기 드문 핸드예요. 오늘 하루는 마음껏 웃으셔도 좋아요.', '최고의 핸드가 들어왔어요. 좋은 일이 생기면 고마운 사람에게 먼저 소식을 전해 보세요.', '오늘의 주인공은 바로 나예요. 이 기분 그대로 하루를 즐겨 보세요.']
];
var ONE = ['좋은 폴드는 다음 핸드를 위한 준비예요.', '조급할 땐 한 템포 쉬어 가도 괜찮아요.', '오늘의 리뷰가 내일의 실력이 됩니다.', '포지션처럼, 타이밍이 전부일 때가 있어요.', '작은 선택이 모여 좋은 하루를 만들어요.', '내 페이스를 지키는 사람이 결국 웃어요.', '보드는 바뀌어도 내 기본기는 그대로예요.', '가끔은 체크하고 지켜보는 게 정답이에요.', '좋은 핸드는 좋은 기분에서 시작돼요.', '오늘의 나에게 BB 하나만큼의 여유를 주세요.', '오늘 만나는 사람이 좋은 테이블 메이트가 될지도 몰라요.', '정리된 머릿속이 가장 강한 무기예요.'];
var AREAS = [
  { s: 's', name: '일 · 집중', hi: ['집중력이 좋은 날이에요. 중요한 일은 오전에 먼저 끝내 보세요.', '머리가 맑은 날이에요. 미뤄 둔 기획이나 공부를 꺼내 보세요.', '판단이 빠르고 정확해요. 결정할 일이 있다면 오늘이 좋아요.'], lo: ['집중이 잘 안 되면 25분 일하고 5분 쉬는 식으로 나눠 보세요.', '할 일 목록을 세 개로 줄이면 훨씬 가벼워져요.', '알림을 잠깐 꺼 두면 생각보다 많은 걸 끝낼 수 있어요.'] },
  { s: 'h', name: '관계 · 감정', hi: ['마음이 잘 통하는 날이에요. 오랜만에 안부를 전해 보세요.', '따뜻한 말 한마디가 크게 돌아오는 날이에요.', '함께하는 시간이 즐거워요. 가벼운 약속을 잡아 보세요.'], lo: ['감정이 오르내리면 잠깐 산책하며 숨을 골라 보세요.', '오늘은 듣는 쪽에 조금 더 서 보면 좋아요.', '서운한 일이 있어도 하루만 지나고 이야기해 보세요.'] },
  { s: 'd', name: '성과 · 기회', hi: ['노력한 만큼 인정받기 좋은 날이에요. 결과물을 자신 있게 보여 주세요.', '새로운 제안이나 기회가 눈에 띌 수 있어요. 가볍게 메모해 두세요.', '작은 성과가 이어지는 흐름이에요. 오늘 한 일을 기록해 보세요.'], lo: ['오늘은 새로 벌이기보다 하던 일을 마무리하는 게 좋아요.', '큰 결정은 하루 미뤄도 괜찮아요. 정보를 더 모아 보세요.', '서두르지 않아도 기회는 다시 와요. 준비에 집중해 보세요.'] },
  { s: 'c', name: '건강 · 활력', hi: ['몸이 가벼운 날이에요. 가볍게 걷거나 스트레칭해 보세요.', '에너지가 넉넉해요. 미뤄 둔 운동을 시작하기 좋아요.', '컨디션이 좋은 만큼 수면 리듬도 잘 챙겨 주세요.'], lo: ['물을 자주 마시고 화면에서 눈을 자주 떼 주세요.', '오늘은 일찍 잠자리에 드는 것만으로도 충분해요.', '긴 세션은 잠시 쉬어 가요. 몸이 먼저입니다.'] }
];

var CONTRIB = {
  both: ['내 핸드 두 장이 모두 족보에 들어갔어요.', '내 핸드 두 장이 다 제 몫을 했어요.', '오늘은 내 카드가 핸드의 중심이에요.'],
  one: ['내 핸드 한 장이 보드와 잘 어울렸어요.', '한 장은 내가, 나머지는 보드가 채웠어요.', '내 카드 한 장이 결정적이었어요.'],
  none: ['오늘은 보드가 다 해줬어요.', '보드만으로 핸드가 완성됐어요.', '내 카드는 쉬고 보드가 힘을 냈어요.']
};
function contribLine(rnd, ev) {
  var key = ev.rank === 0 ? ev.used : ev.best5;
  var n = key.filter(function (i) { return i < 2; }).length;
  if (ev.rank > 0 && ev.rank !== 4 && ev.rank !== 5 && ev.rank < 8) n = ev.used.filter(function (i) { return i < 2; }).length;
  return pick(rnd, CONTRIB[n === 2 ? 'both' : n === 1 ? 'one' : 'none']);
}
/* ---------- 핸드 해설: preflop tier + how the made hand formed ---------- */
var SH = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function sh(r) { return SH[r] || String(r); }
var TIER_LABEL = ['', 'C급', 'B급', 'A급', 'S급', 'R급'];
var TIER_TEXT = ['', '시작은 조금 약한 편이에요.', '무난한 시작 핸드예요. 보드가 조금 도와주면 충분히 해볼 만해요.', '괜찮은 시작 핸드예요. 보드와 잘 맞으면 크게 갈 수 있어요.', '탄탄한 시작 핸드예요. 높은 카드끼리라 페어만 맞아도 든든해요.', '누구나 받고 싶어 하는 최상급 시작 핸드예요.'];
function playable(a, b) {
  var hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r), s = a.s === b.s, gap = hi - lo;
  if (hi === lo) return hi >= 12 ? 5 : hi >= 10 ? 4 : hi >= 7 ? 3 : 2;      // AA-QQ / JJ-TT / 99-77 / 66-22
  if (hi === 14 && lo === 13) return s ? 5 : 4;                                // AKs / AKo
  if (s && ((hi === 14 && lo >= 11) || (hi === 13 && lo === 12))) return 4;    // AQs AJs KQs
  if (lo >= 10) return (s || (hi === 14 && lo >= 11) || (hi === 13 && lo === 12)) ? 3 : 2; // suited/strong broadways vs other offsuit broadways
  if (s && gap === 1 && lo >= 4) return 3;                                     // 54s-T9s
  if (s && (hi === 14 || (gap === 2 && lo >= 5))) return 2;                    // suited Ax, suited one-gappers
  return 1;
}
// R급 5, S급 4, A급 3, B급 2 (only the 52 playable hands are dealt; anything else is 1 and never shown)
var TIER_R = ['AA', 'KK', 'QQ', 'JJ', 'AKs'];
var TIER_S = ['TT', '99', 'AKo', 'AQs', 'AJs', 'KQs', 'AQo', 'ATs', 'KJs'];
var TIER_A = ['88', '77', 'AJo', 'KQo', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', 'A9s', 'A8s', 'A5s'];
function handKey(a, b) {
  var hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
  return sh(hi) + sh(lo) + (hi === lo ? '' : a.s === b.s ? 's' : 'o');
}
function preflopTier(a, b) {
  var k = handKey(a, b);
  if (TIER_R.indexOf(k) >= 0) return 5;
  if (TIER_S.indexOf(k) >= 0) return 4;
  if (TIER_A.indexOf(k) >= 0) return 3;
  return playable(a, b) >= 2 ? 2 : 1;
}
function preflopInfo(a, b) {
  var hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r), s = a.s === b.s, tier = preflopTier(a, b);
  var name = hi === lo ? '포켓 페어 ' + sh(hi) + sh(hi) : sh(hi) + sh(lo) + (s ? ' 수딧' : ' 옵숫');
  var gap = hi - lo, extra = '';
  if (hi === lo) {
    var PT = hi === 14 ? '홀덤에서 가장 강한 시작 핸드예요. 받는 순간부터 기분 좋은 카드죠.'
      : hi >= 12 ? '최상위권 포켓 페어예요. 웬만한 상황에서는 자신 있게 밀고 갈 수 있어요.'
      : hi >= 10 ? '충분히 강한 포켓 페어예요. 다만 보드에 더 높은 카드가 깔리면 조심해야 해요.'
      : hi >= 7 ? '중간 크기의 포켓 페어예요. 보드에서 같은 숫자가 하나 더 나오면 셋이 돼요.'
      : '작은 포켓 페어예요. 셋을 맞히면 단번에 판이 뒤집혀요.';
    return { tier: tier, label: TIER_LABEL[tier], name: name, text: PT };
  }
  if (s && gap === 1) extra = '같은 무늬에 숫자까지 이어져 있어서 플러시와 스트레이트를 둘 다 노려볼 수 있어요.';
  else if (s) extra = '같은 무늬라 플러시를 노려볼 수 있어요.';
  else if (gap === 1) extra = '숫자가 이어져 있어서 스트레이트를 노려볼 수 있어요.';
  else if (hi === 14 && tier <= 3) extra = '에이스가 있어서 에이스 페어가 맞으면 든든해요.';
  if (tier === 1) extra = extra ? '그래도 ' + extra.replace('든든해요.', '해볼 만해요.') : '그래도 보드가 어떻게 깔리느냐에 따라 얼마든지 달라질 수 있어요.';
  return { tier: tier, label: TIER_LABEL[tier], name: name, text: TIER_TEXT[tier] + (extra ? ' ' + extra : '') };
}
function hasFlushDraw(cards) { // 4 of a suit, at least one from my hand
  return SUITS.some(function (su) { var n = cards.filter(function (c) { return c.s === su; }).length; return n === 4 && (cards[0].s === su || cards[1].s === su); });
}
function hasStraightDraw(cards) {
  var set = {}; cards.forEach(function (c) { set[c.r] = 1; if (c.r === 14) set[1] = 1; });
  for (var lo = 1; lo <= 10; lo++) { var n = 0; for (var r = lo; r < lo + 5; r++) if (set[r]) n++; if (n >= 4) return true; }
  return false;
}
var STREETS = ['플랍', '턴', '리버'];
function cardTxt(c) { return (RANK_CH[c.r] || String(c.r)) + SUIT_CH[c.s]; }
function describe(cards) {
  var ev = evaluate(cards), hole = cards.slice(0, 2), board = cards.slice(2);
  var bU = board.map(function (c) { return c.r; }).sort(function (x, y) { return y - x; }).filter(function (r, i, a) { return a.indexOf(r) === i; });
  var hc = function (r) { return hole.filter(function (c) { return c.r === r; }).length; };
  var t = ev.tiebreak, desc, kind = '';
  if (ev.rank === 0) { desc = sh(Math.max.apply(null, ev.best5.map(function (i) { return cards[i].r; }))) + ' 하이카드'; }
  else if (ev.rank === 1) {
    var p = t[0], n = hc(p);
    if (n === 2) kind = p > bU[0] ? '오버페어' : '포켓 페어';
    else if (n === 1) kind = p === bU[0] ? '탑 페어' : p === bU[1] ? '세컨드 페어' : '로우 페어';
    else kind = '보드 페어';
    var kk = n === 1 ? ', 키커 ' + sh((hole[0].r === p ? hole[1] : hole[0]).r) : '';
    desc = kind + '(' + sh(p) + sh(p) + kk + ')';
  } else if (ev.rank === 2) desc = '투페어(' + sh(t[0]) + sh(t[0]) + sh(t[1]) + sh(t[1]) + ')';
  else if (ev.rank === 3) { var n3 = hc(t[0]); kind = n3 === 2 ? '셋' : n3 === 1 ? '트립스' : '보드 트리플'; desc = kind + '(' + sh(t[0]) + sh(t[0]) + sh(t[0]) + ')'; }
  else if (ev.rank === 4) desc = '스트레이트(' + (t[0] === 5 ? 'A' : sh(t[0] - 4)) + '~' + sh(t[0]) + ')';
  else if (ev.rank === 5) {
    var su = cards[ev.best5[0]].s, nut = 14;
    while (board.some(function (c) { return c.s === su && c.r === nut; })) nut--;
    kind = hole.some(function (c) { return c.s === su && c.r === nut; }) ? '넛 플러시' : '플러시';
    desc = kind + '(' + SUIT_CH[su] + ')';
  } else if (ev.rank === 6) desc = '풀하우스(' + sh(t[0]) + sh(t[0]) + sh(t[0]) + sh(t[1]) + sh(t[1]) + ')';
  else if (ev.rank === 7) desc = '포카드(' + sh(t[0]) + sh(t[0]) + sh(t[0]) + sh(t[0]) + ')';
  else desc = ev.name;
  return { ev: ev, kind: kind || ev.name, desc: desc };
}
function madeInfo(cards) {
  var D = describe(cards), ev = D.ev, desc = D.desc;
  var st = [5, 6, 7].map(function (n) { return evaluate(cards.slice(0, n)); });
  var at = 0; while (st[at].rank !== ev.rank) at++;
  var holeUsed = ev.best5.filter(function (i) { return i < 2; }).length;
  var before = at > 0 && st[at - 1].rank > 0 ? STREETS[at - 1] + '까지는 ' + describe(cards.slice(0, at + 4)).desc + '. ' : '';
  var where = at === 0 ? '플랍에서 ' : STREETS[at] + '(' + cardTxt(cards[at + 4]) + ')에서 ';
  var verb = D.kind.indexOf('보드') === 0 ? '가 깔렸어요.' : ' 완성이에요.';
  var drawNote = '';
  if (at > 0 && ev.rank === 5 && hasFlushDraw(cards.slice(0, at + 4))) drawNote = ' 플러시 드로우가 완성됐어요.';
  if (at > 0 && ev.rank === 4 && hasStraightDraw(cards.slice(0, at + 4))) drawNote = ' 스트레이트 드로우가 완성됐어요.';
  var use = holeUsed === 2 ? '내 카드 2장을 모두 썼어요.' : holeUsed === 1 ? '내 카드 1장을 썼어요.' : '보드 플레이예요. 보드 5장이 그대로 족보예요.';
  return { kind: D.kind, at: at, holeUsed: holeUsed, boardPlay: holeUsed === 0,
    text: before + where + desc + verb + drawNote + ' ' + use,
    steps: st.map(function (e) { return e.name; }), progress: st.map(function (e, i) { return STREETS[i] + ' ' + e.name; }).join(' → ') };
}
// final hand grade on the same R/S/A/B scale as preflop, split by how strong the hand is within its rank
// true nuts: no possible opponent hole cards beat this hand on this board
function isNuts(cards) {
  var board = cards.slice(2), me = evaluate(cards), taken = {};
  cards.forEach(function (c) { taken[c.r + c.s] = 1; });
  var rest = []; SUITS.forEach(function (s) { for (var r = 2; r <= 14; r++) if (!taken[r + s]) rest.push({ r: r, s: s }); });
  for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++)
    if (cmp(evaluate([rest[i], rest[j]].concat(board)), me) > 0) return false;
  return true;
}
function madeGrade(cards) {
  var g = madeGradeBase(cards), ev = evaluate(cards);
  var used = ev.best5.filter(function (i) { return i < 2; }).length;
  if (used > 0 && isNuts(cards)) {
    var nm = describe(cards).kind.replace(/^넛 /, '');
    return [Math.max(g[0], ev.rank >= 7 ? 5 : ev.rank >= 3 ? 4 : 3), '넛 ' + nm + '예요. 이 보드에서 만들 수 있는 가장 강한 족보라 누구에게도 지지 않아요.'];
  }
  return g;
}
function madeGradeBase(cards) {
  var D = describe(cards), ev = D.ev, t = ev.tiebreak, hole = cards.slice(0, 2), board = cards.slice(2);
  var bU = board.map(function (c) { return c.r; }).sort(function (x, y) { return y - x; }).filter(function (r, i, a) { return a.indexOf(r) === i; });
  var used = ev.best5.filter(function (i) { return i < 2; }).length;
  var hc = function (r) { return hole.filter(function (c) { return c.r === r; }).length; };
  var made = ev.rank === 2 ? [t[0], t[1]] : [t[0]];
  var kickers = hole.filter(function (c, i) { return ev.best5.indexOf(i) >= 0 && made.indexOf(c.r) < 0; });
  var kr = kickers.length ? Math.max.apply(null, kickers.map(function (c) { return c.r; })) : 0;
  var kickTxt = kr ? '키커 ' + sh(kr) + (kr === 3 || kr === 6 ? '으로' : '로') + ' 승부가 갈려요.' : '';
  if (used === 0) return [ev.rank >= 7 ? 4 : 2, '보드 다섯 장이 그대로 족보라 상대도 같은 족보를 갖고 있어요.'];
  switch (ev.rank) {
    case 1:
      if (D.kind === '오버페어') return [3, '보드의 어떤 카드보다 높은 페어예요. 원페어 중에서 가장 강해요.'];
      if (D.kind === '탑 페어') {
        var kick = hole[0].r === t[0] ? hole[1].r : hole[0].r;
        return kick >= 11 ? [3, '보드에서 가장 높은 카드와 맞은 데다 키커까지 좋아요.'] : [3, '보드에서 가장 높은 카드와 맞았어요. 키커가 조금 아쉽지만 충분히 강해요.'];
      }
      if (D.kind === '세컨드 페어') return [2, '두 번째로 높은 카드와 맞았어요. 더 높은 페어를 조심해야 해요.'];
      if (D.kind === '보드 페어') return [2, '보드에 깔린 페어라 상대도 같은 페어를 갖고 있어요. ' + kickTxt];
      if (D.kind === '포켓 페어') return [2, '포켓 ' + sh(t[0]) + sh(t[0]) + '보다 높은 카드가 보드에 있어서 상대의 더 높은 페어를 조심해야 해요.'];
      return [2, '보드에서 낮은 카드와 맞은 페어라 더 높은 페어를 조심해야 해요.'];
    case 2:
      if (hc(t[0]) && hc(t[1])) return [3, '내 카드 두 장이 모두 페어로 맞았어요. 투페어 중에서 탄탄한 편이에요.'];
      if (t[0] === bU[0] && hc(t[0])) return [3, '가장 높은 카드로 페어를 만들어서 투페어 중에서도 강해요.'];
      var mine = hc(t[0]) ? t[0] : t[1];
      if (hc(mine) && mine >= bU[1]) return [3, '보드 페어에 높은 페어를 더해서 투페어 중에서도 괜찮은 편이에요.'];
      if (!hc(t[0]) && !hc(t[1])) return [2, '두 페어가 모두 보드에 깔려서 상대도 같은 투페어예요. ' + kickTxt];
      var bp = mine === t[0] ? t[1] : t[0];
      if (mine > bp) return [2, '내 페어(' + sh(mine) + sh(mine) + ')보다 높은 카드가 보드에 있어서 상대가 더 높은 투페어를 만들 수 있어요.'];
      return [2, '내 페어(' + sh(mine) + sh(mine) + ')가 보드 페어(' + sh(bp) + sh(bp) + ')보다 낮아서 상대가 더 높은 투페어를 만들기 쉬워요.'];
    case 3:
      if (D.kind === '셋') return [4, '포켓 페어로 셋을 맞혔어요. 상대가 눈치채기 어려운 강한 트리플이에요.'];
      if (D.kind === '보드 트리플') return [2, '보드에 깔린 트리플이라 상대도 같은 트리플이에요. ' + kickTxt];
      return [3, '보드에 같은 숫자가 두 장 깔린 트리플이에요. 상대도 같은 숫자를 들고 있을 수 있어요.'];
    case 4: {
      var top = t[0], nut = top === 14 || (used === 2 && top >= 12);
      return nut ? [4, '높은 쪽 스트레이트라 웬만해선 지지 않아요.'] : top >= 10 ? [4, '꽤 높은 스트레이트예요. 든든하게 밀고 갈 수 있어요.'] : [3, '스트레이트는 맞았지만 더 높은 스트레이트를 조심해야 해요.'];
    }
    case 5:
      if (D.kind === '넛 플러시') return [4, '그 무늬로 만들 수 있는 가장 높은 플러시예요.'];
      var fh = Math.max.apply(null, hole.filter(function (c) { return c.s === cards[ev.best5[0]].s; }).map(function (c) { return c.r; }));
      return fh >= 12 ? [4, '높은 카드로 만든 플러시라 꽤 든든해요.'] : [3, '플러시는 맞았지만 더 높은 플러시를 조심해야 해요.'];
    case 6:
      return hc(t[0]) ? [4, '트리플 쪽에 내 카드가 들어간 풀하우스라 아주 강해요.'] : [4, '풀하우스예요. 웬만한 족보는 다 이겨요.'];
    case 7:
      return hc(t[0]) ? [5, '내 카드로 만든 포카드예요. 평생 몇 번 보기 힘든 족보예요.'] : [4, '보드에 깔린 포카드예요. 승부는 남은 한 장에서 갈려요.'];
    case 8: return [5, '스트레이트에 플러시까지 겹친 정말 귀한 족보예요.'];
    case 9: return [5, '홀덤 최고의 족보예요. 오늘은 기념해야 할 날이에요.'];
  }
  return [2, ''];
}
function finalInfo(cards) {
  var D = describe(cards), g = madeGrade(cards), m = madeInfo(cards);
  var where = m.at === 0 ? '플랍에서 완성됐어요.' : STREETS[m.at] + '에서 완성됐어요.';
  return { tier: g[0], label: TIER_LABEL[g[0]], name: D.desc, text: where + ' ' + g[1] };
}
function explain(cards) { var h = preflopInfo(cards[0], cards[1]); return { hole: h, made: madeInfo(cards), fin: finalInfo(cards) }; }
/* ---------- fortune ---------- */
function todayKey() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
}
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function makeFortune(dateKey, nick, reroll, dev) {
  reroll = reroll || 0;
  var rnd = mulberry32(hashStr(dateKey + '|' + (nick || '').trim().toLowerCase() + (dev ? '|d' + dev : '') + (reroll ? '|r' + reroll : '')));
  var cards = dealHand(rnd);
  var ev = evaluate(cards);
  var bal = AREAS.map(function (a) {
    var e = 22;
    cards.forEach(function (c) { if (c.s === a.s) e += 8 + (c.r - 2) * 1.1; });
    e += Math.floor(rnd() * 12);
    e = Math.max(15, Math.min(98, Math.round(e)));
    return { area: a, value: e, hi: e >= 55, tip: pick(rnd, e >= 55 ? a.hi : a.lo) };
  });
  var avg = bal.reduce(function (s, b) { return s + b.value; }, 0) / 4;
  var high = Math.max.apply(null, ev.best5.map(function (i) { return cards[i]; }).map(function (c) { return c.r; }));
  // score band follows the final hand grade: B 60-70, A 70-80, S 80-90, R 90-100
  var xp = explain(cards), ft = xp.fin.tier, lo = ft >= 5 ? 90 : ft === 4 ? 80 : ft === 3 ? 70 : 60;
  var frac = Math.max(0, Math.min(1, rnd() * 0.65 + ((avg - 25) / 50) * 0.35));
  var score = lo + Math.round(frac * 10);
  if (ev.rank === 9) score = 100;
  return { date: dateKey, nick: nick, reroll: reroll, cards: cards, ev: ev, bal: bal, score: score,
    message: pick(rnd, MSG[ev.rank]), contrib: contribLine(rnd, ev), oneLine: pick(rnd, ONE), explain: xp };
}

/* ---------- share text ---------- */
function shareText(f, url) { return '오늘 내 핸드는 ' + f.ev.name + ' (' + f.score + '점)! 너도 뽑아 봐 👉 ' + url; }
function fmtDate(key) { var k = key.split('-'); return k[0] + '년 ' + Number(k[1]) + '월 ' + Number(k[2]) + '일'; }

/* ---------- Node export for tests ---------- */
if (typeof module !== 'undefined' && module.exports) { module.exports = { isNuts: isNuts, explain: explain, preflopTier: preflopTier, evaluate: evaluate, makeFortune: makeFortune, HAND_NAMES: HAND_NAMES, shareText: shareText, fmtDate: fmtDate }; }
if (typeof document === 'undefined') return;

/* ---------- UI ---------- */
var $ = function (id) { return document.getElementById(id); };
var KEY = 'handtalk.fortune.nick';
var DKEY = 'handtalk.fortune.device';
var DEV = (function () {
  var d = '';
  try { d = localStorage.getItem(DKEY) || ''; } catch (e) {}
  if (!d) {
    try { var a = new Uint32Array(2); crypto.getRandomValues(a); d = a[0].toString(36) + a[1].toString(36); }
    catch (e) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); }
    try { localStorage.setItem(DKEY, d); } catch (e) {}
  }
  return d;
})();
var timers = [];
function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var current = null;

function cardLabel(c) { var n = { 11: '잭', 12: '퀸', 13: '킹', 14: '에이스' }[c.r] || String(c.r); var s = { s: '스페이드', h: '하트', d: '다이아몬드', c: '클로버' }[c.s]; return s + ' ' + n; }
function cardEl(c, win) {
  var rk = RANK_CH[c.r] || String(c.r), su = SUIT_CH[c.s], red = c.s === 'h' || c.s === 'd';
  var d = document.createElement('div'); d.className = 'slot' + (win ? ' win' : ' dim'); d.setAttribute('role', 'listitem'); d.setAttribute('aria-label', cardLabel(c) + (win ? ' (족보 카드)' : ''));
  return d;
}
function faceHTML(c) { return '<div class="face k-' + c.s + '" aria-hidden="true"><span class="r">' + (RANK_CH[c.r] || String(c.r)) + '</span><span class="su">' + SUIT_CH[c.s] + '</span></div>'; }
// state-driven: a slot holds nothing until dealt; the face DOM exists only after its flip
function dealCard(slot) {
  var cd = document.createElement('div'); cd.className = 'cd'; cd.innerHTML = '<div class="bk"></div>'; slot.appendChild(cd);
  if (reduce || !cd.animate) return;
  var h = $('hand').getBoundingClientRect(), r = slot.getBoundingClientRect();
  var dx = (h.left + h.width / 2) - (r.left + r.width / 2), dy = (h.top - 30) - r.top;
  cd.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(-18deg) scale(.85)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 }], { duration: 430, easing: 'cubic-bezier(.15,.8,.25,1)' });
}
function flipCard(slot, c) {
  var cd = slot.querySelector('.cd'); if (!cd) { dealCard(slot); cd = slot.querySelector('.cd'); }
  if (reduce || !cd.animate) { cd.innerHTML = faceHTML(c); return; }
  var out = cd.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
  out.onfinish = function () {
    cd.innerHTML = faceHTML(c); out.cancel();
    cd.animate([{ transform: 'scaleX(0) translateY(-3px)' }, { transform: 'scaleX(1)' }], { duration: 170, easing: 'ease-out' });
  };
}
function render(f) {
  clearTimers();
  $('hand').classList.remove('done'); clearCelebrate();
  var hole = $('hole'), board = $('board'); hole.innerHTML = ''; board.innerHTML = '';
  var slots = f.cards.map(function (c, i) {
    var el = cardEl(c, f.ev.best5.indexOf(i) >= 0);
    if (i >= 2) { var w = document.createElement('div'); w.className = 'bslot'; w.appendChild(el); var cue = i === 3 ? '플랍' : i === 5 ? '턴' : i === 6 ? '리버' : ''; var t = document.createElement('span'); t.className = 'cue' + (i < 5 ? ' flop' : ''); t.textContent = cue; t.setAttribute('aria-hidden', 'true'); w.appendChild(t); board.appendChild(w); }
    else hole.appendChild(el);
    return el;
  });
  var x = f.explain, ex = $('explain'); ex.classList.remove('show');
  $('exTier').textContent = x.hole.label; $('exTier').className = 'ex-pill t' + x.hole.tier;
  $('exBars').className = 'ex-bars t' + x.hole.tier;
  [].forEach.call($('exBars').children, function (b, i) { b.className = i < x.hole.tier ? 'on' : ''; });
  $('exName').textContent = x.hole.name; $('exHole').textContent = x.hole.text;
  $('exTier2').textContent = x.fin.label; $('exTier2').className = 'ex-pill t' + x.fin.tier;
  $('exBars2').className = 'ex-bars t' + x.fin.tier;
  [].forEach.call($('exBars2').children, function (b, i) { b.className = i < x.fin.tier ? 'on' : ''; });
  $('exName2').textContent = x.fin.name; $('exMade').textContent = x.fin.text;
  var rn = $('rerollNote'); rn.hidden = !f.reroll; rn.textContent = f.reroll ? '다시 뽑은 핸드예요 (' + (f.reroll + 1) + '번째)' : '';
  var res = $('result'); res.classList.add('dealing'); $('shareBtn').disabled = true;
  $('handName').textContent = '카드를 받는 중…'; $('oneLine').textContent = '“' + f.oneLine + '”';
  $('message').textContent = f.message;
  var ring = $('ring'); ring.setAttribute('aria-label', '운세 점수 ' + f.score + '점');
  var m = $('meters'); m.innerHTML = '';
  f.bal.forEach(function (b) {
    var li = document.createElement('li'); if (b.hi) li.className = 'hi';
    li.tabIndex = 0; li.setAttribute('aria-expanded', 'false');
    li.onclick = li.onkeydown = function (e) { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; if (e.type === 'keydown') e.preventDefault();
      var open = !li.classList.contains('open'); [].forEach.call(m.children, function (o) { o.classList.remove('open'); o.setAttribute('aria-expanded', 'false'); });
      if (open) { li.classList.add('open'); li.setAttribute('aria-expanded', 'true'); } };
    var red = b.area.s === 'h' || b.area.s === 'd';
    li.innerHTML = '<div class="mh"><strong><span class="s k-' + b.area.s + '" aria-hidden="true">' + SUIT_CH[b.area.s] + '</span>' + b.area.name + '</strong><em>' + b.value + '</em></div>' +
      '<div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + b.value + '" aria-label="' + b.area.name + '"><span></span></div><p class="tip">' + b.tip + '</p>';
    m.appendChild(li);
  });
  // hole cards, then flop (3 together-ish), turn, river
  // [deal, flip] ms: hole 1, hole 2, flop x3 (slide together, flip L->R), turn, river
  var T = [[0, 450], [250, 700], [1300, 1950], [1420, 2200], [1540, 2450], [3050, 3450], [4050, 4450]];
  slots.forEach(function (s, i) {
    if (reduce) { flipCard(s, f.cards[i]); return; }
    later(function () { dealCard(s); }, T[i][0]); later(function () { flipCard(s, f.cards[i]); }, T[i][1]);
  });
  var END = reduce ? 0 : 4950, ended = false;
  function finish() { if (ended) return; ended = true; skipFn = null; $('handName').textContent = f.ev.name; res.classList.remove('dealing'); $('shareBtn').disabled = false; $('hand').classList.add('done'); $('explain').classList.add('show'); celebrate(f.ev.rank); }
  function fill() {
    m.querySelectorAll('.bar span').forEach(function (sp, i) { sp.style.width = f.bal[i].value + '%'; });
    var start = null, dur = reduce ? 1 : 900;
    function tick(t) { if (!start) start = t; var p = Math.min(1, (t - start) / dur); var v = Math.round(f.score * p); $('score').textContent = v; ring.style.setProperty('--p', v); if (p < 1) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }
  skipFn = function () {
    if (ended) return; clearTimers();
    slots.forEach(function (s, i) { var cd = s.querySelector('.cd'); if (!cd) { cd = document.createElement('div'); cd.className = 'cd'; s.appendChild(cd); } cd.getAnimations && cd.getAnimations().forEach(function (a) { a.cancel(); }); cd.innerHTML = faceHTML(f.cards[i]); });
    finish(); later(fill, 120);
  };
  later(finish, END);
  later(fill, END + 120);
}
var skipFn = null;
function skipDeal() { if (skipFn) skipFn(); }
var RKEY = 'handtalk.fortune.reroll';
function getReroll(nick) { try { var o = JSON.parse(localStorage.getItem(RKEY) || '{}'); return (o.date === todayKey() && o.nick === nick) ? (o.n || 0) : 0; } catch (e) { return 0; } }
function setReroll(nick, n) { try { localStorage.setItem(RKEY, JSON.stringify({ date: todayKey(), nick: nick, n: n })); } catch (e) {} }
var rerollMem = 0;
function reroll() {
  if (!current) return;
  var n = Math.max(getReroll(current.nick), rerollMem) + 1; rerollMem = n; setReroll(current.nick, n);
  current = makeFortune(todayKey(), current.nick, n, DEV);
  $('result').classList.remove('fade'); void $('result').offsetWidth; $('result').classList.add('fade');
  render(current); window.scrollTo(0, 0);
  $('handName').focus({ preventScroll: true });
}
function showResult() {
  var nick = $('nick').value.trim();
  try { localStorage.setItem(KEY, nick); } catch (e) {}
  if (!current || current.nick !== nick) rerollMem = 0;
  current = makeFortune(todayKey(), nick, 0, DEV);
  $('start').hidden = true; $('result').hidden = false; $('result').classList.add('fade');
  render(current);
  $('handName').setAttribute('tabindex', '-1'); $('handName').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 1800); }
function summary(f) {
  var cc = function (c) { return (RANK_CH[c.r] || c.r) + SUIT_CH[c.s]; }; var cs = '내 핸드 ' + f.cards.slice(0, 2).map(cc).join(' ') + ' | 보드 ' + f.cards.slice(2).map(cc).join(' ');
  return '[핸드톡] 오늘의 핸드 운세 ' + f.date + (f.nick ? ' · ' + f.nick : '') + (f.reroll ? ' (다시 뽑기 ' + f.reroll + '회)' : '') + '\n' + cs + ' → ' + f.ev.name + ' (' + f.score + '점)\n' +
    f.bal.map(function (b) { return SUIT_CH[b.area.s] + b.area.name + ' ' + b.value; }).join(' / ') + '\n“' + f.oneLine + '”';
}
function copy(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise(function (res, rej) { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } document.body.removeChild(ta); });
}
/* ---------- share image (canvas) ---------- */
var SUIT_COL = { s: '#191F28', h: '#E74C3C', d: '#3182F6', c: '#00A65A' };
var FONT = '"Pretendard","Noto Sans KR",system-ui,sans-serif';
function shareUrl() { return location.origin + location.pathname; }
function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function loadLogo() { return new Promise(function (res) { if (location.protocol === 'file:') return res(null); var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = 'logo.svg'; setTimeout(function () { res(null); }, 1500); }); }
function wrapLines(x, text, maxW) { var out = [], line = ''; text.split(' ').forEach(function (w) { var t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }
function drawCard(x, c, cx, cy, w, h, win) {
  x.save(); x.globalAlpha = win ? 1 : .45;
  x.shadowColor = 'rgba(25,31,40,.14)'; x.shadowBlur = w * .18; x.shadowOffsetY = w * .06;
  rrect(x, cx, cy, w, h, w * .12); x.fillStyle = '#fff'; x.fill(); x.shadowColor = 'transparent';
  x.lineWidth = w * .055; x.strokeStyle = SUIT_COL[c.s]; rrect(x, cx + x.lineWidth / 2, cy + x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth, w * .1); x.stroke();
  x.fillStyle = SUIT_COL[c.s]; x.textBaseline = 'top'; x.textAlign = 'left';
  x.font = '800 ' + Math.round(w * .48) + 'px ' + FONT; x.fillText(RANK_CH[c.r] || String(c.r), cx + w * .09, cy + h * .06);
  x.textBaseline = 'alphabetic'; x.textAlign = 'right'; x.font = Math.round(w * .55) + 'px ' + FONT; x.fillText(SUIT_CH[c.s], cx + w * .92, cy + h * .93);
  x.restore();
}
function buildShareImage(f) {
  var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  return ready.then(loadLogo).then(function (logo) {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
    x.fillStyle = '#F2F4F6'; x.fillRect(0, 0, W, H);
    rrect(x, 60, 60, W - 120, H - 120, 48); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#E5E8EB'; x.lineWidth = 2; x.stroke();
    var L = 120;
    if (logo) x.drawImage(logo, L, 120, 64, 64);
    x.fillStyle = '#191F28'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = '800 40px ' + FONT; x.fillText('핸드톡', L + (logo ? 82 : 0), 152);
    x.textAlign = 'right'; x.fillStyle = '#8B95A1'; x.font = '500 32px ' + FONT; x.fillText(fmtDate(f.date), W - 120, 152);
    x.textAlign = 'left'; x.fillStyle = '#191F28'; x.font = '700 56px ' + FONT; x.fillText('오늘의 핸드 운세', L, 250);
    if (f.nick) { x.fillStyle = '#3182F6'; x.font = '600 34px ' + FONT; x.fillText(f.nick + ' 님의 핸드', L, 312); }
    rrect(x, 100, 360, W - 200, 560, 32); x.fillStyle = '#F9FAFB'; x.fill(); x.strokeStyle = '#E5E8EB'; x.stroke();
    x.fillStyle = '#3182F6'; x.font = '700 30px ' + FONT; x.textAlign = 'center'; x.fillText('내 핸드', W / 2, 410);
    var hw = 150, hh = 214, gap = 20; f.cards.slice(0, 2).forEach(function (c, i) { drawCard(x, c, W / 2 - hw - gap / 2 + i * (hw + gap), 440, hw, hh, f.ev.best5.indexOf(i) >= 0); });
    x.fillStyle = '#3182F6'; x.fillText('보드', W / 2, 692);
    var bw = 140, bh = 200 * .78, bg = 16, bwid = 5 * (bw * .78) + 4 * bg; bw = bw * .78; bh = bw * 78 / 54;
    f.cards.slice(2).forEach(function (c, i) { drawCard(x, c, W / 2 - bwid / 2 + i * (bw + bg), 720, bw, bh, f.ev.best5.indexOf(i + 2) >= 0); });
    x.fillStyle = '#8B95A1'; x.font = '500 30px ' + FONT; x.fillText('오늘의 핸드', W / 2, 985);
    x.fillStyle = '#3182F6'; x.font = '800 84px ' + FONT; x.fillText(f.ev.name, W / 2, 1060);
    var TC = { 5: ['#7C4DFF', '#fff'], 4: ['#3182F6', '#fff'], 3: ['#00C471', '#fff'], 2: ['#FFB800', '#191F28'] };
    var pills = [['프리플랍 ' + f.explain.hole.label, f.explain.hole.tier], ['최종 ' + f.explain.fin.label, f.explain.fin.tier]];
    x.font = '800 52px ' + FONT; var sw = x.measureText(f.score + '점').width;
    x.font = '700 30px ' + FONT; var pw = pills.map(function (p) { return x.measureText(p[0]).width + 44; });
    var gx = 24, tot = sw + gx + pw[0] + 12 + pw[1], cx0 = W / 2 - tot / 2;
    x.textAlign = 'left'; x.fillStyle = '#191F28'; x.font = '800 52px ' + FONT; x.fillText(f.score + '점', cx0, 1135);
    var px = cx0 + sw + gx;
    pills.forEach(function (p, i) { var c = TC[Math.max(2, p[1])]; rrect(x, px, 1135 - 26, pw[i], 52, 26); x.fillStyle = c[0]; x.fill();
      x.fillStyle = c[1]; x.font = '700 30px ' + FONT; x.textAlign = 'center'; x.fillText(p[0], px + pw[i] / 2, 1136); px += pw[i] + 12; });
    x.textAlign = 'center';
    x.fillStyle = '#4E5968'; x.font = '500 34px ' + FONT;
    wrapLines(x, '“' + f.oneLine + '”', W - 280).slice(0, 2).forEach(function (l, i) { x.fillText(l, W / 2, 1195 + i * 46); });
    x.fillStyle = '#8B95A1'; x.font = '500 28px ' + FONT; x.fillText(shareUrl().replace(/^https?:\/\//, ''), W / 2, 1262);
    return new Promise(function (res) { cv.toBlob(function (b) { res({ canvas: cv, blob: b }); }, 'image/png'); });
  });
}
window.__buildShareImage = function () { return current ? buildShareImage(current).then(function (r) { return r.canvas.toDataURL('image/png'); }) : Promise.resolve(null); };
function showSheet(url) {
  var sh = $('sheet'); $('sheetImg').src = url; var a = $('saveImg'); a.href = url; a.download = 'handtalk-' + (current ? current.date : 'today') + '.png';
  sh.hidden = false; $('sheetClose').focus();
}
var sharing = false;
function shareResult() {
  if (!current || sharing) return; sharing = true;
  var f = current, url = shareUrl(), text = shareText(f, url);
  buildShareImage(f).then(function (r) {
    var file = null;
    try { if (r.blob && typeof File === 'function') file = new File([r.blob], 'handtalk-' + f.date + '.png', { type: 'image/png' }); } catch (e) {}
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: text, url: url });
    if (navigator.share) return navigator.share({ text: text, url: url });
    showSheet(r.canvas.toDataURL('image/png'));
    return copy(text).then(function () { toast('링크를 복사했어요'); }, function () { toast('이미지를 저장해 공유해 보세요'); });
  }).catch(function (e) { if (!e || e.name !== 'AbortError') toast('공유하지 못했어요. 다시 시도해 주세요.'); })
    .then(function () { sharing = false; });
}
document.addEventListener('DOMContentLoaded', function () {
  var k = todayKey().split('-'); $('date').textContent = k[0] + '년 ' + Number(k[1]) + '월 ' + Number(k[2]) + '일';
  try { $('nick').value = localStorage.getItem(KEY) || ''; } catch (e) {}
  $('dealBtn').addEventListener('click', showResult);
  $('nick').addEventListener('keydown', function (e) { if (e.key === 'Enter') showResult(); });
  $('skipBtn').addEventListener('click', skipDeal);
  $('shareBtn').addEventListener('click', function () { try { shareResult(); } catch (e) { sharing = false; toast('공유하지 못했어요. 다시 시도해 주세요.'); } });
  $('sheetClose').addEventListener('click', function () { $('sheet').hidden = true; $('shareBtn').focus(); });
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) $('sheet').hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('sheet').hidden = true; });
  $('rerollBtn').addEventListener('click', reroll);
  $('resetBtn').addEventListener('click', function () { clearTimers(); $('result').hidden = true; $('start').hidden = false; $('dealBtn').focus(); window.scrollTo(0, 0); });
});
})();

// rare-hand effects: 포카드 sparkles, 스트레이트 플러시 confetti, 로열 플러시 gold confetti + flash
var fxRaf = 0;
function clearCelebrate() {
  cancelAnimationFrame(fxRaf);
  var c = document.getElementById('fx'); if (c) c.remove();
  document.body.classList.remove('fx-flash');
  var n = document.getElementById('handName'); if (n) n.classList.remove('rare', 'r7', 'r8', 'r9');
  var h = document.getElementById('hand'); if (h) h.classList.remove('shake');
}
function celebrate(rank) {
  if (rank < 7) return;
  var name = document.getElementById('handName'); name.classList.add('rare', 'r' + rank);
  if (rank === 9) { document.body.classList.add('fx-flash'); document.getElementById('hand').classList.add('shake'); }
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cv = document.createElement('canvas'); cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
  var dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
  var x = cv.getContext('2d'); x.scale(dpr, dpr);
  var nb = name.getBoundingClientRect(), ox = nb.left + nb.width / 2, oy = nb.top + nb.height / 2;
  var COLORS = rank === 9 ? ['#FFD54F', '#FFC107', '#FFB300', '#FFF3C4', '#F9A825']
    : rank === 8 ? ['#7C4DFF', '#3182F6', '#00C471', '#FFB800', '#F04452']
    : ['#FFFFFF', '#FFE082', '#B39DDB', '#90CAF9'];
  var P = [], n = rank === 9 ? 220 : rank === 8 ? 140 : 46;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = (rank === 7 ? 2 : 4) + Math.random() * (rank === 7 ? 4 : 8);
    var fromTop = rank >= 8 && i % 2 === 0;
    P.push({ x: fromTop ? Math.random() * W : ox, y: fromTop ? -20 - Math.random() * H * 0.4 : oy,
      vx: fromTop ? (Math.random() - 0.5) * 2 : Math.cos(a) * sp, vy: fromTop ? 2 + Math.random() * 3 : Math.sin(a) * sp - 3,
      s: rank === 7 ? 2 + Math.random() * 3 : 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: COLORS[i % COLORS.length], star: rank === 7 || (rank === 9 && i % 5 === 0) });
  }
  var t0 = performance.now(), LIFE = rank === 9 ? 3600 : rank === 8 ? 3000 : 1800;
  (function step(now) {
    var t = now - t0; x.clearRect(0, 0, W, H); x.globalAlpha = Math.max(0, 1 - Math.max(0, t - LIFE * 0.6) / (LIFE * 0.4));
    P.forEach(function (p) {
      p.vy += rank === 7 ? 0.06 : 0.12; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c;
      if (p.star) { x.beginPath(); for (var k = 0; k < 8; k++) { var r = k % 2 ? p.s * 0.35 : p.s; x.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); } x.fill(); }
      else x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      x.restore();
    });
    if (t < LIFE) fxRaf = requestAnimationFrame(step); else cv.remove();
  })(t0);
  if (navigator.vibrate) try { navigator.vibrate(rank === 9 ? [60, 40, 60, 40, 120] : rank === 8 ? [50, 40, 80] : 40); } catch (e) {}
}
