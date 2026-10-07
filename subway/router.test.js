// 실행: node subway/router.test.js
const assert = require('assert');
const lines = require('./data.js');
const { createRouter } = require('./router.js');
const r = createRouter(lines);

// 데이터 점검: 한 노선 안에서 역 이름이 겹치면 안 된다
lines.forEach(l => l.paths.forEach(p => assert.strictEqual(new Set(p.stations).size, p.stations.length, l.name + ' 중복 역')));

// 사용자 예시: 왕십리 → 돌곶이
let route = r.findRoute('왕십리', '돌곶이');
assert.strictEqual(route.transfers, 1);
const [a, b] = route.rides;
assert.strictEqual(a.line.id, 2); assert.strictEqual(a.next, '상왕십리'); assert.strictEqual(a.to, '신당'); assert.deepStrictEqual(a.labels, ['외선순환']);
assert.strictEqual(b.line.id, 6); assert.strictEqual(b.next, '동묘앞'); assert.strictEqual(b.to, '돌곶이'); assert.deepStrictEqual(b.labels, ['신내 방면']);
assert.strictEqual(b.stops, 8);

// 환승 없이 가는 길, 반대 방향
route = r.findRoute('돌곶이', '왕십리');
assert.strictEqual(route.rides[0].next, '상월곡'); assert.deepStrictEqual(route.rides[0].labels, ['응암 방면']);
assert.deepStrictEqual(route.rides[1].labels, ['내선순환']);

// 같은 노선 끝에서 끝
route = r.findRoute('강남', '잠실'); assert.strictEqual(route.transfers, 0); assert.deepStrictEqual(route.rides[0].labels, ['외선순환']);
route = r.findRoute('잠실', '강남'); assert.deepStrictEqual(route.rides[0].labels, ['내선순환']);
// 5호선 갈래: 마천 가는 열차만 안내
route = r.findRoute('천호', '올림픽공원'); assert.strictEqual(route.rides[0].line.id, 5); assert.deepStrictEqual(route.rides[0].labels, ['마천 방면']);
// 갈래 공통 구간은 두 방면 모두
route = r.findRoute('왕십리', '천호'); assert.deepStrictEqual(route.rides[0].labels, ['하남검단산 방면', '마천 방면']);
// 성수지선
route = r.findRoute('성수', '신설동'); assert.deepStrictEqual(route.rides[0].labels, ['신설동 방면']);
// 새 노선: 1호선·경의중앙·수인분당·신분당
route = r.findRoute('서울역', '인천'); assert.strictEqual(route.transfers, 0); assert.deepStrictEqual(route.rides[0].labels, ['인천 방면']);
route = r.findRoute('강남', '판교'); assert.strictEqual(route.rides[0].line.id, 13); assert.strictEqual(route.rides[0].next, '양재');
route = r.findRoute('서울숲', '선릉'); assert.strictEqual(route.rides[0].line.id, 12);
route = r.findRoute('용산', '양평(경기)'); assert.ok(route.rides.some(x => x.line.id === 11 && x.to === '양평(경기)'));
// 환승이 적은 길을 우선 (시간이 조금 더 걸려도)
assert.strictEqual(r.findRoute('왕십리', '돌곶이').transfers, 1);
// 같은 역, 없는 역
assert.strictEqual(r.findRoute('강남', '강남'), null);
assert.strictEqual(r.findRoute('강남', '없는역'), null);

// 모든 역 쌍이 연결되는지 (2~9호선이 하나의 망)
const names = r.stationNames();
names.forEach(n => assert.ok(r.findRoute('시청', n) || n === '시청', '연결 안 됨: ' + n));
console.log('OK —', names.length, '개 역,', lines.length, '개 노선');
