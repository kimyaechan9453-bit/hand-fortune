const { evaluate, makeFortune } = require('./app.js');
const P = s => s.split(' ').map(t => ({ r: { A: 14, K: 13, Q: 12, J: 11, T: 10 }[t[0]] || +t[0], s: t[1] }));
const cases = [
  ['As Ks Qs Js Ts', '로열 플러시'], ['9h 8h 7h 6h 5h', '스트레이트 플러시'], ['5d 4d 3d 2d Ad', '스트레이트 플러시'],
  ['7c 7d 7h 7s 2c', '포카드'], ['Kc Kd Kh 3s 3c', '풀하우스'], ['2h 9h Jh 4h Kh', '플러시'],
  ['Ts 9h 8d 7c 6s', '스트레이트'], ['Ah 2d 3c 4s 5h', '스트레이트'], ['Ac Kd Qh Js Th', '스트레이트'],
  ['Qs Qh Qd 8c 2s', '트리플'], ['Js Jh 4d 4c As', '투페어'], ['9s 9d Ah 7c 3s', '원페어'],
  ['As Kd 9h 7c 3s', '하이카드'],
  // 7-card (2 hole + 5 board)
  ['2h 3h 4h 9h Kh 5c 6d', '플러시'],            // straight 2-6 exists, flush must win
  ['2c 7d As Ks Qs Js Ts', '로열 플러시'],         // board-only
  ['Ac 9d 2h 3s 4c 5d Kh', '스트레이트'],          // wheel from 7
  ['8c 8d 8h 4s 4c 4d Kh', '풀하우스'],            // two trips
  ['Kc Kd 9h 9s 4c 4d 2h', '투페어'],              // three pairs
  ['7h 8h 9h Th Jh 6c 6d', '스트레이트 플러시'],
  ['Qc Qd Qh Qs 2c 3d 5h', '포카드'],
  ['As 2d 7h 9c Jd 4s 6c', '하이카드'], ['Kh Ah 2h 3h 4d', '하이카드'], ['Qs Ks As 2s 3h', '하이카드']];
let fail = 0;
const chk = (name, ok) => { if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); };
{ const e = evaluate(P('Kc Kd 9h 9s 4c 4d 2h')); chk('three pairs -> KK99 kicker 4 chosen (tiebreak ' + e.tiebreak + ')', e.tiebreak.join() === '13,9,4'); }
{ const e = evaluate(P('2c 7d As Ks Qs Js Ts')); chk('board-only best5 excludes hole cards', e.best5.every(i => i >= 2)); }
{ const e = evaluate(P('Ac 9d 2h 3s 4c 5d Kh')); chk('wheel best5 uses A,2,3,4,5 (not 9/K)', !e.best5.includes(1) && !e.best5.includes(6) && e.tiebreak[0] === 5); }
{ const e = evaluate(P('8c 8d 8h 4s 4c 4d Kh')); chk('two trips -> 888 full of 44', e.tiebreak.join() === '8,4'); }
{ const f = makeFortune('2026-11-03', 'x'); chk('fortune deals 7 unique cards', f.cards.length === 7 && new Set(f.cards.map(c => c.r + c.s)).size === 7 && f.ev.best5.length === 5); }
for (const [h, exp] of cases) { const got = evaluate(P(h)).name; const ok = got === exp; if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + h.padEnd(16) + got + (ok ? '' : ' (expected ' + exp + ')')); }
const a = JSON.stringify(makeFortune('2026-11-03', '예찬')), b = JSON.stringify(makeFortune('2026-11-03', '예찬')), c = JSON.stringify(makeFortune('2026-11-04', '예찬'));
const det = a === b && a !== c; if (!det) fail++; console.log((det ? 'PASS' : 'FAIL') + '  determinism (same day+name equal, next day differs)');
{ const d = makeFortune('2026-11-03', '예찬'), z = makeFortune('2026-11-03', '예찬', 0), r1 = makeFortune('2026-11-03', '예찬', 1), r2 = makeFortune('2026-11-03', '예찬', 2);
  const k = f => f.cards.map(c => c.r + c.s).join();
  chk('reroll 0 equals daily result', JSON.stringify(d) === JSON.stringify(z));
  chk('reroll 1/2 give different deals', k(r1) !== k(d) && k(r2) !== k(r1) && k(r2) !== k(d));
  chk('reroll is deterministic', k(r1) === k(makeFortune('2026-11-03', '예찬', 1))); }

{ const { explain, preflopTier, makeFortune } = require('./app.js');
  chk('never deals weak (tier 1) hole cards', Array.from({length: 3000}, (_, i) => makeFortune('2026-11-04', 'n' + i, i % 5)).every(f => preflopTier(f.cards[0], f.cards[1]) >= 2));
  const tier = h => preflopTier(...P(h));
  chk('tier AA/KK/QQ/AKs = 5', ['Ah Ad','Kh Kd','Qs Qc','As Ks'].every(h => tier(h) === 5));
  chk('tier JJ/TT/AKo/AQs/KQs = 4', ['Jh Jd','Th Td','Ah Kd','Ah Qh','Kc Qc'].every(h => tier(h) === 4));
  chk('tier 77/KJs/AQo/76s = 3', ['7h 7d','Kh Jh','Ah Qd','7s 6s'].every(h => tier(h) === 3));
  chk('tier 22/A5s/KJo = 2, T9o = 1 (not dealt)', ['2h 2d','Ah 5h','Kh Jd'].every(h => tier(h) === 2) && tier('Th 9d') === 1);
  chk('tier 72o/J4o/93s = 1', ['7h 2d','Jh 4d','9s 3s'].every(h => tier(h) === 1));
  const M = h => explain(P(h)).made;
  chk('top pair + kicker', M('Kh Jd Ks 7c 2d 3h 9s').kind === '탑 페어' && M('Kh Jd Ks 7c 2d 3h 9s').text.includes('키커 J'));
  chk('second pair', M('9h Jd Ks 9c 2d 3h 5s').kind === '세컨드 페어');
  chk('overpair', M('Qh Qd 9s 7c 2d 3h 4s').kind === '오버페어');
  chk('underpair = 포켓 페어', M('5h 5d 9s 7c Kd 3h 2s').kind === '포켓 페어');
  chk('set vs trips', M('7h 7d 7s Kc 2d 3h 9s').kind === '셋' && M('7h Ad 7s 7c 2d 3h 9s').kind === '트립스');
  chk('board play (0 hole cards)', M('2c 3d As Ks Qs Js Ts').boardPlay && M('2c 3d As Ks Qs Js Ts').holeUsed === 0);
  chk('nut flush', M('Ah 3h Kh 9h 2h 7c 8d').kind === '넛 플러시' && M('Qh 3h Kh 9h 2h 7c 8d').kind === '플러시');
  const fd = M('Ah 3h Kh 9h 2c 5h 8d');
  chk('flush draw completed on turn', fd.at === 1 && fd.text.includes('턴(5♥)') && fd.text.includes('플러시 드로우가 완성'));
  const pr = M('Kh Jh Kd 2s 6d 4s 4h');
  chk('progression 원페어→원페어→투페어, made on river', pr.steps.join() === '원페어,원페어,투페어' && pr.at === 2 && pr.text.includes('KK44'));
  chk('straight draw completed on river', M('9h 8d 7s 6c 2d Kh Ts').text.includes('스트레이트 드로우가 완성'));
}
{ const { shareText, fmtDate, makeFortune } = require('./app.js'); const f = makeFortune('2026-11-03', '예찬'); const s = shareText(f, 'https://x.io/hf/');
  chk('shareText has hand+score+url', s === '오늘 내 핸드는 ' + f.ev.name + ' (' + f.score + '점)! 너도 뽑아 봐 👉 https://x.io/hf/');
  chk('shareText has no money words', !/돈|베팅|칩|머니|₩/.test(s));
  chk('fmtDate', fmtDate('2026-11-03') === '2026년 11월 3일'); }
console.log(`\n${cases.length + 27 - fail}/${cases.length + 27} passed`); process.exit(fail ? 1 : 0);
