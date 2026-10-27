(() => {
  'use strict';

  /* ---------- 기본 도구 ---------- */
  const KEY = 'life-dashboard-v1';
  const APP_VERSION = '2026.10.27.2'; // 올릴 때마다 version.json 과 index.html 의 ?v= 도 같이 바꿈
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const weekStart = (s = today()) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
  const monthKey = (s = today()) => s.slice(0, 7);
  const quarterKey = (s = today()) => `${s.slice(0, 4)}-Q${Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1}`;
  const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`; };

  // 할 일 종류 (설정에서 추가·삭제). '기타'는 지운 종류의 일이 모이는 곳이라 지울 수 없음
  const DEFAULT_CATS = () => [
    { id: 'drama', icon: '🎬', label: '드라마' },
    { id: 'footprint', icon: '👣', label: '발자취' },
    { id: 'serial', icon: '📚', label: '연재' },
    { id: 'etc', icon: '📦', label: '기타' },
  ];
  // 요일별 규칙 (0=일 … 6=토). kind가 있으면 연재 보드에서 한 일로 자동 체크
  const DEFAULT_RULES = () => ({
    1: [{ id: 'r-mon', text: '💰 경제' }],
    2: [{ id: 'r-tue', text: '🏃 운동' }],
    3: [{ id: 'r-wed', text: '🗣️ 영어' }],
    4: [{ id: 'r-thu', text: '🏃 운동' }],
    5: [{ id: 'r-fri', text: '🗣️ 영어' }],
    6: [{ id: 'r-sat1', text: '🎬 드라마' }, { id: 'r-sat2', text: '👣 발자취 1회 발행' }],
    0: [{ id: 'r-sun1', text: '🎬 드라마' }, { id: 'r-sun2', text: '📅 지난주 검수분 예약', kind: 'reserve' },
      { id: 'r-sun3', text: '📤 웹소설 5화 출력', kind: 'out', work: 'wn' }, { id: 'r-sun4', text: '📤 숏노블 5화 출력', kind: 'out', work: 'sn' }],
  });
  const DEFAULT_SERIALS = () => [
    { id: 'wn', name: '웹소설', batch: 5, next: 1, eps: [] },
    { id: 'sn', name: '숏노블', batch: 5, next: 1, eps: [] },
  ];
  // 올해의 큰 구조 (비전 탭 맨 위, 고치기 가능)
  const DEFAULT_STRUCTURE = () => ({
    title: '회사와 드라마를 중심에 두고, 나머지는 최소 규칙으로 유지하는 1년',
    areas: [
      ['회사', '생계 + AI/이러닝 경력', '주 5일'],
      ['드라마', '필요한 목돈 확보', '1년 한정 집중'],
      ['발자취', '퍼스널 브랜딩 + 워크숍 고객 유입', '주 1회, 약 4시간'],
      ['웹소설', '반자동 수익 + 실전 사례', '주 5화'],
      ['숏노블', '반자동 수익 + 실전 사례', '주 5화'],
      ['영어', '회화·커리어·자료 접근', '주 2회'],
      ['운동', '건강·체력', '주 2회'],
      ['경제', '돈 관리 역량', '주 1회'],
    ].map(([name, role, cadence], i) => ({ id: 'a' + i, name, role, cadence })),
    dropped: [
      ['AI 공부', '실제 업무하면서 익히기'],
      ['마케팅 공부', '발자취 운영에 흡수'],
      ['웹소설·숏드라마 보기', '출퇴근 input'],
      ['디지털 템플릿', '취미, 필수 일정 아님'],
      ['커뮤니티', '당분간 우선순위 밖'],
      ['사업 준비', '당분간 우선순위 밖'],
    ].map(([text, note], i) => ({ id: 'd' + i, text, note })),
    principle: '새로운 공부나 프로젝트를 이 틀 위에 계속 추가하지 않는다.',
  });
  const catList = () => state.cats;
  const catOf = (id) => state.cats.find((c) => c.id === id) || state.cats.find((c) => c.id === 'etc');

  /* ---------- 상태 ---------- */
  const defaultState = () => ({
    v: 1,
    onboardDismissed: false,
    tasks: [],
    slots: {},
    experiments: [],                              // 성장 실험 [{id, think, test, start, end, status:'run'|'done', result, what, learn, change, from, doneDate}]
    vision: {
      y10: '', y5: '', y3: '', y1: '',
      why: { y10: '', y5: '', y3: '', y1: '' },   // 목표마다 목적(왜)
      peaks: { y10: [], y5: [], y3: [], y1: [] }, // 작은 산(이정표) · 산마다 작은 목표(steps)
      checkins: [],                               // 한 달 점검 [{month, score, note, y1, y3, y5, y10}]
      goals: [],
      quarter: { key: '', text: '', prev: '' },
      month: { key: '', text: '', prev: '' },
      week: { key: '', items: ['', '', ''], prev: [] },
    },
    cats: DEFAULT_CATS(),                         // 할 일 종류
    rules: DEFAULT_RULES(),                       // 요일별 규칙
    ruleLog: {},                                  // 규칙 체크 {날짜: [규칙 id]}
    serials: DEFAULT_SERIALS(),                   // 연재 작품과 화별 상태 (out 출력 완료 → checked 검수 완료 → reserved 예약 완료)
    structure: DEFAULT_STRUCTURE(),               // 올해의 큰 구조
    parked: [],                                   // 보류함 [{id, text, note, created}]
    reviews: [],
  });

  function merge(base, data) {
    const out = { ...base, ...data };
    out.vision = { ...base.vision, ...(data.vision || {}) };
    ['quarter', 'month', 'week', 'why', 'peaks'].forEach((k) => { out.vision[k] = { ...base.vision[k], ...(out.vision[k] || {}) }; });
    if (out.vision.y3 == null) out.vision.y3 = '';
    delete out.routines; // 매주 루틴 기능은 없앰
    // 가계부(빚·수입·고정비)는 화면에서 뺐지만, 적어 둔 기록은 지우지 않고 백업에 그대로 남김
    if (!Array.isArray(out.experiments)) out.experiments = [];
    // 회사 생활 규칙으로 바뀌기 전 기록: 옛 할 일 종류를 새 종류로 옮김 (보너스 → 드라마, 나머지 → 기타)
    if (!Array.isArray(data.cats) || !data.cats.length) {
      out.cats = DEFAULT_CATS();
      (out.tasks || []).forEach((t) => { t.cat = t.cat === 'bonus' ? 'drama' : 'etc'; });
    }
    if (!out.cats.some((c) => c.id === 'etc')) out.cats.push({ id: 'etc', icon: '📦', label: '기타' });
    (out.tasks || []).forEach((t) => { if (!out.cats.some((c) => c.id === t.cat)) t.cat = 'etc'; });
    if (!out.rules || typeof out.rules !== 'object') out.rules = DEFAULT_RULES();
    for (let d = 0; d < 7; d++) if (!Array.isArray(out.rules[d])) out.rules[d] = [];
    if (!out.ruleLog || typeof out.ruleLog !== 'object') out.ruleLog = {};
    if (!Array.isArray(out.serials)) out.serials = DEFAULT_SERIALS();
    if (!out.structure || !Array.isArray(out.structure.areas)) out.structure = DEFAULT_STRUCTURE();
    if (!Array.isArray(out.structure.dropped)) out.structure.dropped = [];
    if (!Array.isArray(out.parked)) out.parked = [];
    if (!out.vision.climbInit) {
      Object.values(out.vision.peaks).forEach((list) => { const first = (list || []).find((pk) => !pk.done); if (first) first.climbing = true; });
      out.vision.climbInit = true;
    }
    // 예전 '다음 한 걸음'은 그 산의 첫 작은 목표로 옮김
    Object.values(out.vision.peaks).forEach((list) => (list || []).forEach((pk) => {
      if (!Array.isArray(pk.steps)) pk.steps = pk.next ? [{ id: uid(), text: pk.next, done: false, doneDate: '' }] : [];
      delete pk.next;
    }));
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return merge(defaultState(), JSON.parse(raw));
    } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    return defaultState();
  }

  let state = load();
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!saveWarned) { toast('저장이 안 돼요. 설정 → 내보내기로 백업해 주세요.'); saveWarned = true; } }
  }

  // 기간이 바뀌면(새 분기·새 달·새 주) 지난 내용을 참고용으로 넘기고 비움
  function rollPeriods() {
    const v = state.vision;
    const q = quarterKey(), m = monthKey(), w = weekStart();
    if (v.quarter.key !== q) { if (v.quarter.key) v.quarter.prev = v.quarter.text; v.quarter.key = q; v.quarter.text = ''; }
    if (v.month.key !== m) { if (v.month.key) v.month.prev = v.month.text; v.month.key = m; v.month.text = ''; }
    if (v.week.key !== w) {
      if (v.week.key && v.week.key < w) { v.week.prev = v.week.items.filter(Boolean); v.week.key = w; v.week.items = ['', '', '']; }
      else if (!v.week.key) { v.week.key = w; }
    }
  }

  /* ---------- 계산 ---------- */
  function weekStats(ws) {
    const we = addDays(ws, 6);
    const inWeek = (d) => d && d >= ws && d <= we;
    const done = state.tasks.filter((t) => t.done && inWeek(t.doneDate));
    let ruleDoneN = 0, ruleTotal = 0;
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d > today()) break; const k = dayScore(d); ruleDoneN += k.done; ruleTotal += k.total; }
    const eps = state.serials.flatMap((w) => w.eps);
    return {
      expRun: state.experiments.filter((x) => x.start && x.start <= we && (x.status !== 'done' || x.doneDate >= ws)).length,
      expDone: state.experiments.filter((x) => x.status === 'done' && inWeek(x.doneDate)).length,
      done: done.length,
      rules: `${ruleDoneN}/${ruleTotal}`,
      checked: eps.filter((e) => inWeek(e.chk)).length,
      reserved: eps.filter((e) => inWeek(e.res)).length,
      linked: done.filter((t) => t.goalId || t.peakId).length,
      peaks: allPeaks().filter((pk) => pk.done && inWeek(pk.doneDate)).length,
      steps: allPeaks().reduce((a, pk) => a + (pk.steps || []).filter((st) => st.done && inWeek(st.doneDate)).length, 0),
    };
  }

  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isEmptyState = () => !state.tasks.length && !state.experiments.length
    && !state.vision.goals.length && !state.vision.y10 && !state.vision.y5 && !state.vision.y3 && !state.vision.y1;
  const TRANSFER_TAG = '나의운영실기록:';

  /* ---------- 작은 산(이정표) ---------- */
  const HORIZONS = [['y10', '10년'], ['y5', '5년'], ['y3', '3년'], ['y1', '1년']];
  const allPeaks = () => HORIZONS.flatMap(([h, label]) => (state.vision.peaks[h] || []).map((pk) => ({ ...pk, h, hLabel: label })));
  const findPeak = (id) => { for (const [h] of HORIZONS) { const pk = (state.vision.peaks[h] || []).find((x) => x.id === id); if (pk) return pk; } return null; };
  const peakListOf = (id) => HORIZONS.map(([h]) => state.vision.peaks[h] || []).find((l) => l.some((x) => x.id === id));
  const findStep = (pk, sid) => (pk && pk.steps || []).find((s) => s.id === sid);
  const curStep = (pk) => (pk.steps || []).find((s) => !s.done);
  // 목록 안에서 한 칸 위/아래로 옮기기
  const moveIn = (list, id, d) => {
    const i = list.findIndex((x) => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    return true;
  };
  // 작은 목표를 다 이루면 산 정상에 도착한 것으로 처리
  function syncPeakDone(pk, undo) {
    const st = pk.steps || [];
    if (!st.length) return;
    const all = st.every((s) => s.done);
    if (all && !pk.done) { pk.done = true; pk.doneDate = today(); toast('🏔️ 정상 도착! 작은 산 하나를 넘었어요'); }
    else if (undo && !all && pk.done) { pk.done = false; pk.doneDate = ''; }
  }
  // 지금 오르는 산: 산마다 켜고 끔 (여러 개 가능). 넘은 산은 빠짐
  const climbingIn = (h) => (state.vision.peaks[h] || []).filter((pk) => pk.climbing && !pk.done);
  const climbingAll = () => HORIZONS.flatMap(([h, label]) => climbingIn(h).map((pk) => ({ pk, h, label })));
  const ym = (s) => (s ? `${s.slice(0, 4)}.${s.slice(5, 7)}` : '');

  // 산 하나 = 1점. 작은 목표가 있으면 이룬 만큼 부분 점수
  const peakScore = (pk) => (pk.done ? 1 : pk.steps && pk.steps.length ? pk.steps.filter((s) => s.done).length / pk.steps.length : 0);
  const peakPct = (h) => { const l = state.vision.peaks[h] || []; return l.length ? Math.round((l.reduce((a, pk) => a + peakScore(pk), 0) / l.length) * 100) : null; };
  const latePeaks = () => allPeaks().filter((pk) => !pk.done && pk.due && pk.due < today().slice(0, 7));
  const addMonths = (ymStr, n) => { const [y, m] = ymStr.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  // 점검할 달: 월말 3일 전부터는 이번 달, 새 달 첫 5일은 지난달
  function checkMonth() {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() >= last - 2) return monthKey();
    if (d.getDate() <= 5) return addMonths(monthKey(), -1);
    return null;
  }
  const checkinFor = (mk) => (state.vision.checkins || []).find((c) => c.month === mk);

  // 산 하나의 길: 🏁 ━ 작은 목표들 ━ 🏔️ (작은 목표를 이룰수록 정상에 가까워짐)
  function trail(pk) {
    const steps = pk.steps || [];
    if (!steps.length) return '';
    const cur = pk.done ? -1 : steps.findIndex((s) => !s.done);
    const dots = steps.map((s, i) => {
      const cls = s.done ? 'done' : i === cur ? 'here' : '';
      const icon = s.done ? '✓' : i === cur ? '🚶' : i + 1;
      return `<span class="tr-seg ${s.done ? 'done' : ''}"></span><span class="tr-dot ${cls}" title="${esc(s.text)}">${icon}</span>`;
    }).join('');
    return `<div class="trail" aria-hidden="true"><span class="tr-end">🏁</span>${dots}<span class="tr-seg ${pk.done ? 'done' : ''}"></span><span class="tr-end summit-end ${pk.done ? 'reached' : ''}">${pk.done ? '🚩' : '🏔️'}</span></div>`;
  }

  /* ---------- 📈 한 달 점검 ---------- */
  const SCORES = [[0, '제자리'], [25, '조금'], [50, '절반쯤'], [75, '많이'], [100, '훌쩍']];
  let ckDraft = null;   // 점검 입력 중인 값
  let ckPick = null;    // 그래프에서 고른 달

  function checkinChart(list) {
    const W = 320, H = 170, L = 30, R = 10, T = 12, B = 24;
    const n = list.length;
    const band = (W - L - R) / n;
    const bw = Math.min(22, band * 0.5);
    const y = (v) => T + (1 - v / 100) * (H - T - B);
    const base = y(0);
    const grid = [0, 50, 100].map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" class="ck-grid"/><text x="${L - 6}" y="${y(g) + 4}" class="ck-axis" text-anchor="end">${g}</text>`).join('');
    const bars = list.map((c, i) => {
      const x = L + band * i + (band - bw) / 2;
      const top = y(c.score);
      const r = Math.min(4, base - top);
      return r > 0.5 ? `<path class="ck-bar" d="M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z"/>` : `<rect class="ck-bar" x="${x}" y="${base - 1}" width="${bw}" height="1"/>`;
    }).join('');
    const pts = list.map((c, i) => (c.y1 == null ? null : [L + band * i + band / 2, y(c.y1), c.y1])).filter(Boolean);
    const line = pts.length > 1 ? `<polyline class="ck-line" points="${pts.map((q) => `${q[0]},${q[1]}`).join(' ')}"/>` : '';
    const dots = pts.map((q) => `<circle class="ck-dot" cx="${q[0]}" cy="${q[1]}" r="4"/>`).join('');
    const last = pts[pts.length - 1];
    const lastLabel = last ? `<text x="${Math.min(last[0] + 6, W - R)}" y="${Math.max(last[1] - 8, T + 8)}" class="ck-label" text-anchor="${last[0] + 30 > W ? 'end' : 'start'}">${last[2]}%</text>` : '';
    const every = n > 6 ? 2 : 1;
    const xl = list.map((c, i) => ((n - 1 - i) % every === 0 ? `<text x="${L + band * i + band / 2}" y="${H - 6}" class="ck-axis" text-anchor="middle">${Number(c.month.slice(5))}월</text>` : '')).join('');
    const hits = list.map((c, i) => `<rect class="ck-hit ${ckPick === i ? 'on' : ''}" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-act="ck-pick" data-i="${i}"><title>${Number(c.month.slice(5))}월 · 체감 ${c.score} · 1년 진행 ${c.y1 ?? '-'}%</title></rect>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="ck-chart" role="img" aria-label="한 달 점검 그래프">${grid}${bars}${line}${dots}${lastLabel}${xl}${hits}</svg>`;
  }

  function checkinCard() {
    const cm = checkMonth() || monthKey();
    const done = checkinFor(cm);
    const list = [...(state.vision.checkins || [])].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    const editing = !!ckDraft;
    const mLabel = `${Number(cm.slice(5))}월`;
    let form;
    if (editing) {
      form = `<p style="font-weight:700;margin-top:4px">${mLabel}에 산을 얼마나 올랐다고 느끼나요?</p>
        <div class="ck-scores">${SCORES.map(([v, l]) => `<button class="chip ${ckDraft.score === v ? 'on' : ''}" data-act="ck-score" data-v="${v}">${l}<small>${v}</small></button>`).join('')}</div>
        <input id="ck-note" value="${esc(ckDraft.note)}" placeholder="한 줄 기록 (예: 첫 워크숍 공지 올림)" autocomplete="off" style="margin-top:8px">
        <div class="row" style="margin-top:8px"><button class="btn primary" data-act="ck-save" ${ckDraft.score == null ? 'disabled' : ''}>점검 저장</button><button class="btn ghost" data-act="ck-cancel">취소</button></div>
        <p class="hint">저장하면 지금 1년·3년·5년·10년 작은 산 진행률도 함께 기록돼요.</p>`;
    } else if (done) {
      form = `<div class="row between"><p>✓ <b>${mLabel} 점검 완료</b> · 체감 ${SCORES.find(([v]) => v === done.score)?.[1] || done.score}</p><button class="btn sm" data-act="ck-edit">고치기</button></div>`;
    } else {
      form = `<button class="btn primary block" data-act="ck-edit">📈 ${mLabel} 점검하기</button>`;
    }
    const pick = list.length ? list[ckPick != null && list[ckPick] ? ckPick : list.length - 1] : null;
    return `<section class="card" id="checkin">
      <div class="card-head"><h2>📈 한 달 점검</h2><span class="muted">${list.length}달 기록</span></div>
      ${form}
      ${list.length ? `<div class="ck-legend"><span><i class="sw-bar"></i>체감 오름 (0~100)</span><span><i class="sw-dot"></i>1년 작은 산 진행률 %</span></div>
        ${checkinChart(list)}
        <p class="ck-detail">${pick ? `<b>${pick.month.slice(0, 4)}년 ${Number(pick.month.slice(5))}월</b> · 체감 ${pick.score} · 1년 ${pick.y1 ?? '-'}% · 3년 ${pick.y3 ?? '-'}% · 5년 ${pick.y5 ?? '-'}%${pick.note ? `<br>📝 ${esc(pick.note)}` : ''}` : ''}</p>
        <details><summary class="muted small">표로 보기</summary>
          <table class="ck-table"><thead><tr><th>달</th><th>체감</th><th>1년</th><th>3년</th><th>5년</th><th>10년</th><th>기록</th></tr></thead><tbody>
          ${[...list].reverse().map((c) => `<tr><td>${ym(c.month)}</td><td>${c.score}</td><td>${c.y1 ?? '-'}%</td><td>${c.y3 ?? '-'}%</td><td>${c.y5 ?? '-'}%</td><td>${c.y10 ?? '-'}%</td><td>${esc(c.note)}</td></tr>`).join('')}
          </tbody></table></details>` : '<p class="hint">매달 말에 한 번씩 점검하면, 막대(체감)와 선(실제 진행률)으로 내가 오른 길이 쌓여요.</p>'}
    </section>`;
  }

  function stepsBlock(pk) {
    const steps = pk.steps || [];
    const n = steps.filter((x) => x.done).length;
    const cs = curStep(pk);
    return `<div class="steps-box">
      <div class="row between"><span class="small"><b>🪜 작은 목표</b>${steps.length ? ` · ${n}/${steps.length}` : ''}</span>${steps.length && !pk.done ? `<span class="muted small">다 이루면 정상 🏔️</span>` : ''}</div>
      ${trail(pk)}
      ${steps.map((st, i) => `<div class="step ${st.done ? 'done' : ''} ${cs && st.id === cs.id ? 'here' : ''}">
        <input type="checkbox" data-act="step-toggle" data-id="${pk.id}" data-sid="${st.id}" ${st.done ? 'checked' : ''} aria-label="이뤘어요">
        <textarea class="step-text grow-text" rows="1" data-peak="${pk.id}" data-step="${st.id}" aria-label="작은 목표">${esc(st.text)}</textarea>
        <span class="mv-pair"><button class="mv" data-act="step-move" data-id="${pk.id}" data-sid="${st.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="step-move" data-id="${pk.id}" data-sid="${st.id}" data-n="1" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
        <button class="icon-btn" data-act="step-del" data-id="${pk.id}" data-sid="${st.id}" aria-label="삭제">✕</button>
      </div>`).join('')}
      <form class="add-step" data-form="step" data-id="${pk.id}">
        <input name="step" placeholder="${steps.length ? '작은 목표 더하기' : '예: 공모전 원고 완성 → 투고 → 계약'}" autocomplete="off">
        <button class="btn sm">추가</button>
      </form>
    </div>`;
  }

  function peaksBlock(h) {
    const list = state.vision.peaks[h] || [];
    const done = list.filter((pk) => pk.done).length;
    const pct = peakPct(h) || 0;
    const late = (pk) => !pk.done && pk.due && pk.due < today().slice(0, 7);
    return `<div class="peaks">
      <div class="row between"><h3>⛰️ 작은 산</h3>${list.length ? `<span class="muted small">${done}/${list.length} 넘음 · ${pct}%</span>` : ''}</div>
      ${list.length ? `<div class="bar thin" style="margin-top:6px"><i style="width:${pct}%"></i></div>` : ''}
      ${list.length ? '<p class="hint" style="margin-top:4px">🚶 버튼으로 지금 오르는 산을 여러 개 고를 수 있어요. ▲▼로 순서를 바꿔요.</p>' : ''}
      ${list.map((pk, i) => `<div class="peak ${pk.done ? 'done' : ''} ${pk.climbing && !pk.done ? 'here' : ''}">
        <div class="peak-top">
          <input type="checkbox" data-act="peak-toggle" data-id="${pk.id}" ${pk.done ? 'checked' : ''} aria-label="넘었어요">
          <textarea class="peak-text grow-text" rows="1" data-peak="${pk.id}" data-field="text" aria-label="작은 산">${esc(pk.text)}</textarea>
          <span class="mv-pair"><button class="mv" data-act="peak-move" data-id="${pk.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="peak-move" data-id="${pk.id}" data-n="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
          <button class="icon-btn" data-act="peak-del" data-id="${pk.id}" aria-label="삭제">✕</button>
        </div>
        <div class="peak-meta">
          ${pk.done ? '' : `<button type="button" class="climb-btn ${pk.climbing ? 'on' : ''}" data-act="peak-climb" data-id="${pk.id}" aria-pressed="${pk.climbing ? 'true' : 'false'}">${pk.climbing ? '🚶 지금 오르는 중' : '＋ 지금 오르기'}</button>`}
          ${pk.done ? `<span class="tag done-tag">🚩 ${ym(pk.doneDate)} 정상 도착</span>` : `<label class="due ${late(pk) ? 'late' : ''}">목표 <input type="month" data-peak="${pk.id}" data-field="due" value="${esc(pk.due || '')}"></label>`}
        </div>
        ${stepsBlock(pk)}
      </div>`).join('')}
      <form class="add-task" data-form="peak" data-h="${h}" style="margin-top:10px">
        <input name="peak" placeholder="${list.length ? '다음 작은 산 추가' : '목표까지 가는 중간 지점 (예: 웹소설 영상화 되기)'}" autocomplete="off">
        <button class="btn">추가</button>
      </form>
    </div>`;
  }

  /* ---------- 공통 조각 ---------- */
  const goalName = (id) => (state.vision.goals.find((g) => g.id === id) || {}).text;

  /* ---------- 오늘 ---------- */
  let newCat = null;
  let pendingPeak = null; // '오늘 할 일로' 누른 작은 산
  let pendingStep = null; // 그 산의 작은 목표
  let newGoal = '';

  function renderToday() {
    const t = today();
    const now = new Date();
    const v = state.vision;
    if (!catList().some((c) => c.id === newCat)) newCat = catList()[0].id;
    const goals = v.goals.filter((g) => !g.done);
    const weekItems = v.week.items.filter(Boolean);

    const steps = [
      { ok: state.experiments.length > 0, text: '첫 실험 하나 시작하기', to: 'grow' },
      { ok: v.goals.length > 0, text: '1년 목표 하나 적기', to: 'vision' },
    ];
    const showOnboard = !state.onboardDismissed && steps.some((s) => !s.ok);

    const visible = state.tasks.filter((x) => !x.done); // 끝낸 일은 주간 리뷰 '끝낸 일'로

    const lane = (c) => {
      const items = visible.filter((x) => catOf(x.cat).id === c.id)
        .sort((a, b) => a.done - b.done || (a.due || '9999').localeCompare(b.due || '9999'));
      return `<div class="lane">
        <div class="lane-head"><h3>${esc(c.icon)} ${esc(c.label)}</h3>${items.length ? `<span class="muted">${items.filter((x) => !x.done).length}개</span>` : ''}</div>
        ${items.length ? items.map((x) => taskRow(x)).join('') : '<div class="lane-empty">비어 있어요</div>'}
      </div>`;
    };

    return `<div class="stack">
      ${showOnboard ? `<section class="card accent">
        <div class="card-head"><h2>👋 처음 시작하기</h2><button class="icon-btn" data-act="dismiss-onboard" aria-label="닫기">✕</button></div>
        <p class="muted">두 가지만 하면 준비 끝이에요. 5분이면 돼요.</p>
        <ol class="steps">${steps.map((s, i) => `<li class="${s.ok ? 'ok' : ''}"><span class="dot">${s.ok ? '✓' : i + 1}</span><span class="grow">${s.text}</span>${s.ok ? '' : `<button class="btn sm" data-act="go" data-to="${s.to}">하기</button>`}</li>`).join('')}</ol>
      </section>` : ''}

      ${isStandalone() && isEmptyState() ? `<section class="card accent"><h2>사파리에서 쓰던 기록이 안 보이나요?</h2>
        <p class="muted" style="margin-top:4px">아이폰은 홈 화면 앱과 사파리가 기록을 따로 저장해요. 지워진 게 아니에요. 사파리에서 <b>설정 → 📋 기록 복사하기</b>를 누른 뒤, 여기서 붙여넣으면 옮겨져요.</p>
        <button class="btn primary sm" style="margin-top:8px" data-act="go-transfer">옮기는 방법 보기</button></section>` : ''}
      ${checkMonth() && !checkinFor(checkMonth()) && allPeaks().length ? `<section class="card accent"><div class="row between"><div><h2>📈 ${Number(checkMonth().slice(5))}월 점검할 때예요</h2><p class="muted">한 달 동안 산을 얼마나 올랐는지 1분만.</p></div><button class="btn primary sm" data-act="go-checkin">점검하기</button></div></section>` : ''}
      ${now.getDay() === 0 ? `<section class="card accent"><div class="row between"><div><h2>📝 오늘은 주간 리뷰 날</h2><p class="muted">5분만 써도 다음 주가 달라져요.</p></div><button class="btn primary sm" data-act="go" data-to="review">리뷰하기</button></div></section>` : ''}

      ${(goals.length || weekItems.length || climbingAll().length) ? `<section class="card compass">
        <div class="card-head"><h2>🧭 나침반</h2><button class="btn sm ghost" data-act="go" data-to="vision">비전 보기</button></div>
        ${goals.length ? `<p class="muted small">1년 목표</p><ul>${goals.map((g) => `<li class="compass-goal">${esc(g.text)}</li>`).join('')}</ul>` : ''}
        ${climbingAll().length ? `<p class="muted small" style="margin-top:8px">⛰️ 지금 오르는 산</p><ul>${climbingAll().map(({ pk, label }) => `<li class="compass-goal"><span class="tag" style="margin:0 6px 0 0">${label}</span>${esc(pk.text)}${curStep(pk) ? ` <span class="muted small">→ ${esc(curStep(pk).text)}</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${weekItems.length ? `<p class="muted small" style="margin-top:8px">이번 주 핵심</p><ul>${weekItems.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      </section>` : ''}

      ${rulesCard()}

      ${serialCard()}

      ${expTodayCard()}

      <section class="card">
        <div class="card-head"><h2>✅ 오늘 할 일</h2><button class="btn sm ghost" data-act="go-cats">종류 바꾸기</button></div>
        ${(() => { const n = state.tasks.filter((x) => !x.done && x.due && x.due <= t).length; return n ? `<p class="due-count">🔴 오늘까지 해야 할 일 ${n}개</p>` : ''; })()}
        ${pendingPeak && findPeak(pendingPeak) ? `<div class="peak-link">⛰️ <b>${esc(findPeak(pendingPeak).text)}</b>${pendingStep && findStep(findPeak(pendingPeak), pendingStep) ? ` › ${esc(findStep(findPeak(pendingPeak), pendingStep).text)}` : ''}을(를) 위한 일로 넣어요. 끝내면 작은 목표도 함께 체크돼요. 종류를 고르고 <b>추가</b>를 누르세요. <button class="btn sm ghost" data-act="peak-unlink">연결 빼기</button></div>` : ''}
        <form class="add-task" data-form="task">
          <input name="task" placeholder="예: 치과 예약 10/7까지" autocomplete="off" id="task-input">
          <button class="btn primary">추가</button>
        </form>
        <div class="due-chips" role="radiogroup" aria-label="마감">
          <span class="muted small">마감</span>
          ${[['', '없음'], [today(), '오늘'], [addDays(today(), 1), '내일']].map(([v, l]) => `<button type="button" class="chip ${newDue === v ? 'on' : ''}" data-act="pick-due" data-v="${v}">${l}</button>`).join('')}
          <button type="button" class="chip ${newDue && ![today(), addDays(today(), 1)].includes(newDue) ? 'on' : ''}" data-act="open-cal" data-id="new">📅 ${newDue && ![today(), addDays(today(), 1)].includes(newDue) ? shortDate(newDue) : '날짜'}</button>
        </div>
        <div class="row between" style="margin-top:6px"><span class="hint" style="margin:0">"10/7까지"라고 적으면 마감이 자동으로 들어가요</span><button type="button" class="btn sm ghost" data-act="park-input" title="틀 밖의 새 일은 일정 대신 보류함에">🅿️ 보류</button></div>
        <div class="chips" style="margin-top:10px" role="radiogroup" aria-label="종류">
          ${catList().map((c) => `<label class="chip-radio"><input type="radio" name="cat" value="${esc(c.id)}" data-act="pick-cat" ${newCat === c.id ? 'checked' : ''}><span>${esc(c.icon)} ${esc(c.label)}</span></label>`).join('')}
        </div>
        ${goals.length ? `<div class="row" style="margin-top:10px">
          <span class="muted small">어느 1년 목표를 위한 일?</span>
          <select data-act="pick-goal" style="flex:1;min-width:160px">
            <option value="">선택 안 함</option>
            ${goals.map((g) => `<option value="${g.id}" ${newGoal === g.id ? 'selected' : ''}>${esc(g.text)}</option>`).join('')}
          </select>
        </div>` : ''}
        ${catList().map(lane).join('')}
      </section>

      ${parkedCard()}
    </div>`;
  }

  /* ---------- 📅 오늘의 규칙 ---------- */
  const rulesOf = (d) => state.rules[d] || [];
  // 규칙을 지켰는지: 직접 체크했거나, 연재 보드에서 그날 그 일을 했으면 자동으로 지킨 것
  function ruleDone(r, date) {
    if ((state.ruleLog[date] || []).includes(r.id)) return true;
    if (r.kind === 'reserve') return state.serials.some((w) => w.eps.some((e) => e.res === date));
    if (r.kind === 'out') return state.serials.some((w) => (!r.work || w.id === r.work) && w.eps.some((e) => e.out === date));
    return false;
  }
  const weekDays = (ws = weekStart()) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const dayScore = (date) => { const l = rulesOf(parseYmd(date).getDay()); return { done: l.filter((r) => ruleDone(r, date)).length, total: l.length }; };

  let ruleDay = null; // 규칙 카드에서 보고 있는 날 (null = 오늘)
  function rulesCard() {
    const today_ = today();
    if (ruleDay && (ruleDay > today_ || ruleDay < weekStart())) ruleDay = null;
    const t = ruleDay || today_;
    const isToday = t === today_;
    const dow = parseYmd(t).getDay();
    const list = rulesOf(dow);
    const sc = dayScore(t);
    const weekday = dow >= 1 && dow <= 5;
    const ws = weekStart();
    return `<section class="card rules ${isToday ? '' : 'past-day'}">
      <div class="card-head"><h2>📅 ${isToday ? `오늘의 규칙 · ${DAYS[dow]}요일` : `${shortDate(t)} 규칙`}</h2>${list.length ? `<span class="muted">${sc.done}/${sc.total}</span>` : ''}</div>
      ${isToday ? '' : `<div class="past-note">지난 날 기록을 보고 있어요. 체크를 고칠 수도 있어요. <button class="btn sm" data-act="rule-day" data-d="">오늘로 ↩︎</button></div>`}
      ${weekday && isToday ? '<p class="rule-base">🏢 회사 · 🚇 이동시간은 검수 또는 input</p>' : ''}
      ${list.map((r) => { const d = ruleDone(r, t); const auto = d && !(state.ruleLog[t] || []).includes(r.id); return `<div class="task ${d ? 'done' : ''}">
        <input type="checkbox" data-act="rule-tick" data-id="${r.id}" data-d="${t}" ${d ? 'checked' : ''} ${auto ? 'disabled' : ''} aria-label="지켰어요">
        <span class="t">${esc(r.text)}${auto ? '<span class="tag">연재 보드에서 자동</span>' : ''}</span>
      </div>`; }).join('')}
      ${!list.length ? `<p class="muted small">${isToday ? '오늘은' : '이날은'} 정해 둔 규칙이 없어요.</p>` : ''}
      ${dow === 0 && isToday ? `<p class="hint">${sc.total && sc.done === sc.total ? '🛋️ 다 했어요! 남은 반나절은 푹 쉬어요.' : '반나절 안에 끝내고, 나머지 반나절은 쉬어요.'}</p>` : ''}
      <div class="rule-week">${weekDays(ws).map((d) => { const k = dayScore(d); const full = k.total && k.done === k.total; return `<button type="button" class="${d === today_ ? 'today' : ''} ${d === t ? 'sel' : ''} ${full ? 'full' : k.done ? 'part' : ''} ${d > today_ ? 'future' : ''}" data-act="rule-day" data-d="${d}" ${d > today_ ? 'disabled' : ''} aria-label="${shortDate(d)} 규칙 보기"><b>${DAYS[parseYmd(d).getDay()]}</b><i>${d > today_ ? '' : full ? '✓' : k.total ? `${k.done}/${k.total}` : '-'}</i></button>`; }).join('')}</div>
      <p class="hint" style="margin-top:6px">요일을 누르면 그날 지켰는지 볼 수 있어요.</p>
      <button class="btn sm ghost" style="margin-top:8px" data-act="go-rules">✎ 요일별 규칙 고치기</button>
    </section>`;
  }

  /* ---------- 📚 연재 보드 ---------- */
  const findWork = (id) => state.serials.find((w) => w.id === id);
  const epsBy = (w, st) => w.eps.filter((e) => e.st === st).sort((a, b) => a.n - b.n);

  function serialCard() {
    if (!state.serials.length) return '';
    const dow = new Date().getDay();
    return `<section class="card serial">
      <div class="card-head"><h2>📚 연재</h2></div>
      <p class="muted small" style="margin:-4px 0 6px">일요일 출력 → 평일 검수 → 다음 일요일 예약</p>
      <div class="sr-legend"><span><i class="ep-sw out"></i>출력 완료 · 누르면 검수 완료</span><span><i class="ep-sw checked"></i>검수 완료</span></div>
      ${state.serials.map((w) => {
        const out = epsBy(w, 'out'), chk = epsBy(w, 'checked'), res = epsBy(w, 'reserved');
        const lastRes = res.length ? res[res.length - 1].n : null;
        const from = w.next, to = w.next + w.batch - 1;
        return `<div class="sr-work">
          <div class="row between"><b>${esc(w.name)}</b><span class="muted small">검수 대기 <b>${out.length}</b> · 검수 완료 <b>${chk.length}</b></span></div>
          ${out.length || chk.length ? `<div class="sr-eps">${[...out, ...chk].sort((a, b) => a.n - b.n).map((e) => `<button class="ep ${e.st}" data-act="ep-tick" data-w="${w.id}" data-n="${e.n}" aria-label="${e.n}화 ${e.st === 'out' ? '검수 완료로' : '검수 대기로 되돌리기'}">${e.st === 'checked' ? '✓ ' : ''}${e.n}화</button>`).join('')}</div>` : '<p class="muted small" style="margin-top:6px">검수할 화가 없어요.</p>'}
          <div class="sr-actions">
            <button class="btn sm ${dow === 0 ? 'primary' : ''}" data-act="sr-out" data-w="${w.id}">📤 ${from}~${to}화 출력</button>
            <button class="btn sm ${dow === 0 && chk.length ? 'good' : ''}" data-act="sr-reserve" data-w="${w.id}" ${chk.length ? '' : 'disabled'}>📅 검수분 예약${chk.length ? ` (${chk.length}화)` : ''}</button>
          </div>
          ${lastRes ? `<p class="hint">예약 완료: ${lastRes}화까지 · 누적 ${res.length}화</p>` : ''}
        </div>`;
      }).join('')}
    </section>`;
  }

  /* ---------- 🅿️ 보류함 ---------- */
  let parkEditing = false;
  let parkOpen = false; // 보류함을 펼쳐 둔 상태 (다시 그려도 유지)
  document.addEventListener('toggle', (e) => { if (e.target.dataset?.keep === 'parked') parkOpen = e.target.open; }, true);
  function parkedCard() {
    const list = state.parked;
    return `<section class="card parked" id="parked">
      <details ${parkOpen ? 'open' : ''} data-keep="parked">
        <summary><h2 style="display:inline">🅿️ 보류함</h2> <span class="muted">${list.length ? `${list.length}개` : '비어 있어요'}</span></summary>
        <p class="muted small" style="margin-top:6px">하고 싶지만 지금 틀에는 안 넣는 것들이에요. 버리지 않고 여기 모아 두고, 틀이 여유로워지면 꺼내요.</p>
        ${list.map((x) => `<div class="pk-item">
          ${parkEditing
            ? `<input data-parked="${x.id}" data-field="text" value="${esc(x.text)}" aria-label="보류한 일">
               <input data-parked="${x.id}" data-field="note" value="${esc(x.note || '')}" placeholder="메모 (예: 드라마 끝나면)" aria-label="메모" class="pk-note-in">`
            : `<div class="pk-text"><b>${esc(x.text)}</b>${x.note ? `<span class="muted small">${esc(x.note)}</span>` : ''}<span class="muted small">${shortDate(x.created)} 보류</span></div>`}
          <div class="pk-acts">
            <button class="btn sm ghost" data-act="park-out" data-id="${x.id}">↩︎ 할 일로</button>
            <button class="icon-btn" data-act="park-del" data-id="${x.id}" aria-label="삭제">✕</button>
          </div>
        </div>`).join('')}
        <form class="set-add" data-form="park" style="margin-top:10px"><input name="park" placeholder="보류할 일 (예: 디지털 템플릿 만들기)" autocomplete="off"><button class="btn sm">보류</button></form>
        ${list.length ? `<button class="btn sm ghost" style="margin-top:8px" data-act="park-edit">${parkEditing ? '✓ 고치기 끝' : '✎ 고치기'}</button>` : ''}
      </details>
    </section>`;
  }

  /* ---------- 🧭 올해의 큰 구조 ---------- */
  let structEditing = false;
  function structureCard() {
    const S = state.structure;
    if (!structEditing) {
      return `<section class="card structure">
        <div class="card-head"><h2>🗺️ 올해의 큰 구조</h2><button class="btn sm ghost" data-act="struct-edit">✎ 고치기 · 순서</button></div>
        ${S.title ? `<p class="st-title">${esc(S.title)}</p>` : ''}
        <div class="st-areas">${S.areas.map((a) => `<div class="st-area"><div class="row between"><b>${esc(a.name)}</b><span class="st-cad">${esc(a.cadence)}</span></div>${a.role ? `<span class="muted small">${esc(a.role)}</span>` : ''}</div>`).join('')}</div>
        ${S.dropped.length ? `<details class="st-drop"><summary class="muted small">일정에서 뺀 것 ${S.dropped.length}개</summary>
          <ul>${S.dropped.map((d) => `<li><b>${esc(d.text)}</b>${d.note ? ` → <span class="muted">${esc(d.note)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
        ${S.principle ? `<p class="st-principle">📌 ${esc(S.principle)}</p>` : ''}
      </section>`;
    }
    const row = (kind, x, i, len, fields) => `<div class="st-edit-row">
      <div class="st-edit-fields">${fields}</div>
      <span class="mv-pair"><button class="mv" data-act="struct-move" data-kind="${kind}" data-id="${x.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="struct-move" data-kind="${kind}" data-id="${x.id}" data-n="1" ${i === len - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
      <button class="icon-btn" data-act="struct-del" data-kind="${kind}" data-id="${x.id}" aria-label="삭제">✕</button>
    </div>`;
    return `<section class="card structure editing">
      <div class="card-head"><h2>🗺️ 올해의 큰 구조</h2><button class="btn sm primary" data-act="struct-edit">✓ 고치기 끝</button></div>
      <label class="why"><span>한 줄 요약</span><textarea class="grow-text st-long" rows="1" data-struct="title">${esc(S.title)}</textarea></label>
      <h3 style="margin-top:14px">영역 · 역할 · 운영</h3>
      ${S.areas.map((a, i) => row('areas', a, i, S.areas.length, `
        <div class="row"><input data-struct="areas" data-id="${a.id}" data-field="name" value="${esc(a.name)}" placeholder="영역" style="flex:1;min-width:0"><input data-struct="areas" data-id="${a.id}" data-field="cadence" value="${esc(a.cadence)}" placeholder="운영 (예: 주 2회)" style="flex:1;min-width:0"></div>
        <input data-struct="areas" data-id="${a.id}" data-field="role" value="${esc(a.role)}" placeholder="역할" style="margin-top:4px">`)).join('')}
      <button class="btn sm" data-act="struct-add" data-kind="areas" style="margin-top:8px">+ 영역 더하기</button>
      <h3 style="margin-top:16px">일정에서 뺀 것</h3>
      ${S.dropped.map((d, i) => row('dropped', d, i, S.dropped.length, `
        <input data-struct="dropped" data-id="${d.id}" data-field="text" value="${esc(d.text)}" placeholder="뺀 것 (예: AI 공부)">
        <input data-struct="dropped" data-id="${d.id}" data-field="note" value="${esc(d.note)}" placeholder="대신 어떻게 (예: 일하면서 익히기)" style="margin-top:4px">`)).join('')}
      <button class="btn sm" data-act="struct-add" data-kind="dropped" style="margin-top:8px">+ 뺀 것 더하기</button>
      <label class="why" style="margin-top:14px"><span>지킬 원칙</span><textarea class="grow-text st-long" rows="1" data-struct="principle">${esc(S.principle)}</textarea></label>
      <button class="btn sm ghost" data-act="struct-reset" style="margin-top:12px">처음 내용으로 되돌리기</button>
    </section>`;
  }

  /* ---------- 마감 ---------- */
  let newDue = ''; // 새 할 일에 붙일 마감 (YYYY-MM-DD)
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  // "치과 예약 10/7까지", "서류 10월 7일까지", "~10/7" → 마감 날짜를 읽고 글에서는 뺌
  function dueFromText(text) {
    const m = text.match(/(?:~\s*)?(\d{1,2})\s*(?:\/|월\s*)(\d{1,2})\s*일?\s*(?:까지)?/);
    if (!m || !(/까지|~/.test(m[0]))) return null;
    const mo = Number(m[1]), da = Number(m[2]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const t = today();
    let y = Number(t.slice(0, 4));
    let d = `${y}-${pad(mo)}-${pad(da)}`;
    if (daysBetween(t, d) < -30) d = `${y + 1}-${pad(mo)}-${pad(da)}`; // 한참 지난 날짜면 내년
    const rest = text.replace(m[0], ' ').replace(/\s{2,}/g, ' ').trim();
    return { due: d, text: rest || text };
  }
  // 📅 앱 안 달력 (폰 기본 날짜 선택기는 아이폰에서 저절로 닫히는 문제가 있어 직접 그림)
  let cal = null; // { target: 'new' | 할 일 id, month: 'YYYY-MM', cur: 'YYYY-MM-DD' }
  function setDue(target, v) {
    if (target === 'new') {
      newDue = v;
      const keep = $('#task-input')?.value || '';
      render(); const inp = $('#task-input'); if (inp) inp.value = keep;
      return;
    }
    const x = state.tasks.find((t) => t.id === target);
    if (!x) return;
    x.due = v;
    save(); render();
    toast(v ? `📅 마감 ${shortDate(v)}` : '마감 없음으로 바꿨어요');
  }
  function openCal(target) {
    const cur = target === 'new' ? newDue : (state.tasks.find((t) => t.id === target) || {}).due || '';
    cal = { target, cur, month: (cur || today()).slice(0, 7) };
    drawCal();
    openDlg($('#dlg'));
  }
  function drawCal() {
    const [y, m] = cal.month.split('-').map(Number);
    const startDow = new Date(y, m - 1, 1).getDay();
    const last = new Date(y, m, 0).getDate();
    const t = today();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<span></span>');
    for (let d = 1; d <= last; d++) {
      const v = `${y}-${pad(m)}-${pad(d)}`;
      const dow = (startDow + d - 1) % 7;
      cells.push(`<button type="button" class="cal-day ${v === t ? 'today' : ''} ${v === cal.cur ? 'sel' : ''} ${v < t ? 'past' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}" data-act="cal-pick" data-v="${v}">${d}</button>`);
    }
    $('#dlg').innerHTML = `<div class="dlg cal">
      <h2>📅 마감 날짜</h2>
      <div class="cal-quick">
        <button type="button" class="chip" data-act="cal-pick" data-v="${t}">오늘</button>
        <button type="button" class="chip" data-act="cal-pick" data-v="${addDays(t, 1)}">내일</button>
        <button type="button" class="chip" data-act="cal-pick" data-v="${addDays(t, 7)}">일주일 뒤</button>
        <button type="button" class="chip ${cal.cur ? '' : 'on'}" data-act="cal-pick" data-v="">마감 없음</button>
      </div>
      <div class="cal-head">
        <button type="button" class="btn sm ghost" data-act="cal-nav" data-n="-1" aria-label="이전 달">◀</button>
        <b>${y}년 ${m}월</b>
        <button type="button" class="btn sm ghost" data-act="cal-nav" data-n="1" aria-label="다음 달">▶</button>
      </div>
      <div class="cal-grid">${DAYS.map((d, i) => `<span class="cal-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('')}${cells.join('')}</div>
      <div class="row end" style="margin-top:12px"><button type="button" class="btn ghost" data-close>닫기</button></div>
    </div>`;
  }

  function dueTag(x) {
    const t = today();
    const n = daysBetween(t, x.due);
    const cls = x.done ? '' : n < 0 ? 'over' : n === 0 ? 'today' : n === 1 ? 'soon' : '';
    const left = x.done ? '' : n < 0 ? ` · ${-n}일 지남` : n === 0 ? ' · 오늘까지!' : n === 1 ? ' · 내일까지' : n <= 99 ? ` · D-${n}` : '';
    // 다른 해의 날짜는 연도까지 보여 줌 (예: 2027.1.1(금))
    const label = x.due.slice(0, 4) === t.slice(0, 4) ? shortDate(x.due) : `${x.due.slice(0, 4)}.${shortDate(x.due)}`;
    return `<span class="due-tag ${cls}">📅 ${label}${left}</span>`;
  }

  // extra: 지우기 버튼 앞에 붙일 버튼 (할 일 탭의 '오늘로'·'빼기')
  function taskRow(x, extra = '') {
    const t = today();
    const g = x.goalId && goalName(x.goalId);
    const pk = x.peakId && findPeak(x.peakId);
    const urgent = !x.done && x.due ? (x.due === t ? 'due-today' : x.due < t ? 'due-over' : '') : '';
    return `<div class="task ${x.done ? 'done' : ''} ${urgent}">
      <input type="checkbox" data-act="toggle-task" data-id="${x.id}" ${x.done ? 'checked' : ''} aria-label="완료">
      <span class="t"><textarea class="task-text grow-text" rows="1" data-task-text="${x.id}" aria-label="할 일 내용">${esc(x.text)}</textarea>${g ? `<span class="tag">🎯 ${esc(g)}</span>` : ''}${pk ? `<span class="tag">⛰️ ${esc(pk.text)}${findStep(pk, x.stepId) ? ` › ${esc(findStep(pk, x.stepId).text)}` : ''}</span>` : ''}${x.due ? `<span class="due-line">${x.done ? dueTag(x) : `<button type="button" class="due-pick" data-act="open-cal" data-id="${x.id}" aria-label="마감 날짜 바꾸기">${dueTag(x)}</button>`}</span>` : ''}${!x.done && x.day === t && !extra ? '<span class="tag today-tag">☀️ 오늘 할 일</span>' : ''}</span>
      ${!x.due && !x.done ? `<button type="button" class="due-pick" data-act="open-cal" data-id="${x.id}" aria-label="마감 날짜 넣기"><span class="due-add">📅</span></button>` : ''}
      ${extra}
      <button class="icon-btn" data-act="del-task" data-id="${x.id}" aria-label="삭제">✕</button>
    </div>`;
  }

  /* ---------- ✅ 할 일: 오늘 날짜에 할 일만 (위에 이번 달 목표 1개 · 이번 주 목표 3개) ---------- */
  // 오늘 할 일 = 오늘 하기로 넣은 일(day) + 마감이 오늘인 일
  const isTodayTask = (x, t = today()) => x.day === t || x.due === t;
  // 지난 날로 넣었거나 마감이 지났는데 아직 안 한 일
  const isLateTask = (x, t = today()) => !isTodayTask(x, t) && ((x.day && x.day < t) || (x.due && x.due < t));
  let pullOpen = false; // '다른 할 일에서 가져오기'를 펼쳐 둔 상태
  document.addEventListener('toggle', (e) => { if (e.target.dataset?.keep === 'pull') pullOpen = e.target.open; }, true);

  function renderTodo() {
    const t = today();
    const v = state.vision;
    if (!catList().some((c) => c.id === newCat)) newCat = catList()[0].id;
    const open = state.tasks.filter((x) => !x.done);
    const todays = open.filter((x) => isTodayTask(x, t));
    const late = open.filter((x) => isLateTask(x, t)).sort((a, b) => (a.day || a.due).localeCompare(b.day || b.due));
    const rest = open.filter((x) => !isTodayTask(x, t) && !isLateTask(x, t)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const doneToday = state.tasks.filter((x) => x.done && x.doneDate === t);
    const toToday = (x) => `<button type="button" class="btn sm" data-act="task-today" data-id="${x.id}">☀️ 오늘로</button>`;
    // 마감이 오늘인 일은 마감을 바꿔야 빠지므로 '빼기'는 오늘로 넣은 일에만
    const unToday = (x) => (x.day === t && x.due !== t ? `<button type="button" class="btn sm ghost" data-act="task-unday" data-id="${x.id}" title="오늘 할 일에서 빼기">빼기</button>` : ' ');
    return `<div class="stack">
      <section class="card focus-goals">
        <div class="fg-block">
          <span class="fg-label">📅 ${Number(t.slice(5, 7))}월 목표</span>
          <textarea class="grow-text fg-input fg-month" rows="1" data-bind="vision.month.text" placeholder="이번 달 목표 하나" aria-label="이번 달 목표">${esc(v.month.text)}</textarea>
        </div>
        <div class="fg-block">
          <span class="fg-label">📍 이번 주 목표</span>
          ${[0, 1, 2].map((i) => `<div class="fg-week"><b>${i + 1}</b><textarea class="grow-text fg-input" rows="1" data-bind="vision.week.items.${i}" placeholder="이번 주 목표 ${i + 1}" aria-label="이번 주 목표 ${i + 1}">${esc(v.week.items[i] || '')}</textarea></div>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>☀️ ${shortDate(t)} 할 일</h2><span class="muted">${todays.length ? `${todays.length}개 남음` : ''}</span></div>
        <form class="add-task" data-form="task" data-today="1">
          <input name="task" placeholder="오늘 할 일 (예: 은행 서류 내기)" autocomplete="off" id="task-input">
          <button class="btn primary">추가</button>
        </form>
        <div class="chips" style="margin-top:8px" role="radiogroup" aria-label="종류">
          ${catList().map((c) => `<label class="chip-radio"><input type="radio" name="cat" value="${esc(c.id)}" data-act="pick-cat" ${newCat === c.id ? 'checked' : ''}><span>${esc(c.icon)} ${esc(c.label)}</span></label>`).join('')}
        </div>
        <div style="margin-top:10px">${todays.length ? todays.map((x) => taskRow(x, unToday(x))).join('') : `<p class="empty">${doneToday.length ? '오늘 할 일을 다 끝냈어요 🎉' : '오늘 할 일이 아직 없어요.<br>위에 적거나, 아래 다른 할 일에서 가져와요.'}</p>`}</div>
      </section>

      ${late.length ? `<section class="card late-card">
        <div class="card-head"><h2>⏰ 지난 날 못 한 일</h2><span class="muted">${late.length}개</span></div>
        <p class="muted small" style="margin-bottom:6px">오늘 할 거면 ☀️ 오늘로 옮겨요.</p>
        ${late.map((x) => taskRow(x, toToday(x))).join('')}
      </section>` : ''}

      ${rest.length ? `<section class="card">
        <details ${pullOpen ? 'open' : ''} data-keep="pull" class="pull">
          <summary><b>📥 다른 할 일에서 가져오기</b><span class="muted small">${rest.length}개</span></summary>
          <div style="margin-top:8px">${rest.map((x) => taskRow(x, toToday(x))).join('')}</div>
        </details>
      </section>` : ''}

      ${doneToday.length ? `<section class="card">
        <div class="card-head"><h2>✓ 오늘 끝낸 일</h2><span class="muted">${doneToday.length}개</span></div>
        ${doneToday.map((x) => taskRow(x)).join('')}
      </section>` : ''}
    </div>`;
  }

  /* ---------- 🌱 성장 루틴: 생각 → 시험 → 결과 → 배움 → 수정 → 다시 생각 ---------- */
  const LOOP = [['think', '💡', '생각', 'think'], ['test', '📋', '시험', 'test'], ['fail', '❌', '결과', 'fail'], ['learn', '📖', '배움', 'learn'], ['change', '⚙️', '수정', 'change']];
  const RESULTS = { good: ['✓', '잘 됨'], meh: ['△', '애매'], bad: ['✕', '안 됨'] };
  const runningExps = () => state.experiments.filter((x) => x.status !== 'done');
  const pastExps = () => state.experiments.filter((x) => x.status === 'done').sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
  const findExp = (id) => id && state.experiments.find((x) => x.id === id);
  const newExp = (think, from = null) => ({ id: uid(), think, test: '', start: today(), end: addDays(today(), 13), status: 'run', result: '', what: '', learn: '', change: '', from, doneDate: '' });
  // 몇 번째로 이어진 실험인지 (1차, 2차 …)
  const expGen = (x) => { let n = 1; for (let p = findExp(x.from); p && n < 99; p = findExp(p.from)) n++; return n; };
  const expWriting = new Set(); // '결과 적기'를 누른 실험
  const expShowResult = (x) => expWriting.has(x.id) || !!(x.result || x.what || x.learn || x.change);
  function expStage(x) {
    if (!x.test) return 'think';
    if (!expShowResult(x)) return 'test';
    if (!x.result && !x.what) return 'fail';
    if (!x.learn) return 'learn';
    return 'change';
  }
  const expOver = (x) => !!x.end && x.end < today();
  const expDue = (x) => {
    if (!x.end) return '';
    const n = daysBetween(today(), x.end);
    return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : '기간 끝';
  };

  // 사진처럼 다섯 칸을 둥글게 잇는 고리. 진행 중인 실험이 있는 단계에 불이 들어옴
  function loopCard() {
    const run = runningExps();
    const at = (k) => run.filter((x) => expStage(x) === k).length;
    const pt = (deg, r = 38) => { const a = deg * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
    const arcs = LOOP.map((_, i) => {
      const [x1, y1] = pt(-90 + i * 72 + 21), [x2, y2] = pt(-90 + (i + 1) * 72 - 21);
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A38 38 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" marker-end="url(#lp-arrow)"/>`;
    }).join('');
    const first = run[0] && LOOP.find(([k]) => k === expStage(run[0]));
    return `<section class="card loop-card">
      <div class="card-head"><h2>🔄 성장 루프</h2>${run.length ? `<span class="muted">실험 ${run.length}개 진행 중</span>` : ''}</div>
      <div class="loop">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><marker id="lp-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 L8 5 L1 9"/></marker></defs>
          ${arcs}
        </svg>
        ${LOOP.map(([k, ic, label, en], i) => { const [x, y] = pt(-90 + i * 72); const n = at(k); return `<div class="lp-node ${n ? 'on' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"><span class="lp-ic">${ic}${n > 1 ? `<i>${n}</i>` : ''}</span><b>${label}</b><small>${en}</small></div>`; }).join('')}
        <p class="lp-center">${first ? `지금은<br><b>${first[2]}</b> 단계` : '실패도<br>한 칸이에요'}</p>
      </div>
      <p class="hint" style="text-align:center">해 보고, 실패해도 배우고, 바꿔서 다시</p>
    </section>`;
  }

  function expCard(x) {
    const idx = LOOP.findIndex(([k]) => k === expStage(x));
    const parent = findExp(x.from);
    const gen = expGen(x);
    const over = expOver(x);
    const ta = (field, ph) => `<textarea class="exp-text" rows="2" data-exp="${x.id}" data-field="${field}" placeholder="${ph}">${esc(x[field])}</textarea>`;
    return `<section class="card exp">
      <div class="card-head"><h2>🧪 현재 실험${gen > 1 ? ` <span class="tag">${gen}차</span>` : ''}</h2>${x.end ? `<span class="muted ${over ? 'exp-over' : ''}">${expDue(x)}</span>` : ''}</div>
      ${parent ? `<p class="exp-from">↪︎ "${esc(parent.think)}"의 수정 방향에서 이어졌어요</p>` : ''}
      <div class="exp-steps">${LOOP.map(([, ic, label], i) => `<span class="${i < idx ? 'done' : i === idx ? 'on' : ''}">${ic} ${label}</span>`).join('')}</div>
      <label class="field"><span>💡 생각 · 가설</span>${ta('think', '예: 출근 전 30분 쓰면 주 5화를 지킬 수 있다')}</label>
      <label class="field"><span>📋 어떻게 시험할까</span>${ta('test', '예: 2주 동안 평일 7:00~7:30엔 원고만 쓰기')}</label>
      <div class="field"><span>기간</span>
        <div class="exp-dates"><input type="date" data-exp="${x.id}" data-field="start" value="${esc(x.start)}" aria-label="시작하는 날"><span class="muted">~</span><input type="date" data-exp="${x.id}" data-field="end" value="${esc(x.end)}" min="${esc(x.start)}" aria-label="끝나는 날"></div>
        <div class="chips" style="margin-top:6px">${[[7, '1주'], [14, '2주'], [28, '4주']].map(([n, l]) => `<button type="button" class="chip ${x.start && x.end === addDays(x.start, n - 1) ? 'on' : ''}" data-act="exp-len" data-id="${x.id}" data-n="${n}">${l}</button>`).join('')}</div>
      </div>
      ${expShowResult(x) ? `<div class="exp-result">
        <h3>📊 실험 결과</h3>
        <div class="chips" role="radiogroup" aria-label="결과">${Object.entries(RESULTS).map(([k, [ic, l]]) => `<button type="button" class="chip ${x.result === k ? 'on' : ''}" role="radio" aria-checked="${x.result === k}" data-act="exp-result" data-id="${x.id}" data-v="${k}">${ic} ${l}</button>`).join('')}</div>
        <label class="field"><span>어떻게 됐나요</span>${ta('what', '예: 첫 주는 지켰는데, 야근한 다음 날은 두 번 빠짐')}</label>
        <label class="field"><span>📖 배운 점</span>${ta('learn', '예: 야근한 다음 날 아침엔 의지로 안 된다')}</label>
        <label class="field"><span>⚙️ 수정 방향</span>${ta('change', '예: 야근 다음 날은 출퇴근길 검수로 바꾸기')}</label>
        <button class="btn primary block" style="margin-top:14px" data-act="exp-next" data-id="${x.id}">⚙️ 이 방향으로 다음 실험 시작</button>
        <p class="hint">수정 방향이 다음 실험의 '생각'이 돼요. 고리가 한 바퀴 돌아요.</p>
      </div>` : `${over ? '<p class="exp-nudge">⏰ 기간이 끝났어요. 어떻게 됐는지 적어 볼까요?</p>' : ''}
      <button class="btn ${over ? 'primary' : ''} block" style="margin-top:12px" data-act="exp-write" data-id="${x.id}">📊 결과 적기</button>`}
      <div class="row end" style="margin-top:8px">
        ${expShowResult(x) ? `<button class="btn sm ghost" data-act="exp-end" data-id="${x.id}">여기서 끝내기</button>` : ''}
        <button class="btn sm ghost danger" data-act="exp-del" data-id="${x.id}">지우기</button>
      </div>
    </section>`;
  }

  function pastExpCard() {
    const list = pastExps();
    if (!list.length) return '';
    const part = (label, v) => (v ? `<p class="exp-part"><b>${label}</b>${esc(v)}</p>` : '');
    return `<section class="card">
      <div class="card-head"><h2>🗂️ 지난 실험</h2><span class="muted">${list.length}개</span></div>
      ${list.map((x) => {
        const r = RESULTS[x.result];
        const gen = expGen(x);
        const next = state.experiments.find((y) => y.from === x.id);
        return `<details class="exp-past">
          <summary><span class="exp-badge ${esc(x.result)}">${r ? r[0] : '·'}</span><span class="grow">${esc(x.think) || '(생각 없음)'}${gen > 1 ? ` <span class="tag">${gen}차</span>` : ''}</span><span class="muted small">${x.doneDate ? shortDate(x.doneDate) : ''}</span></summary>
          <div class="exp-body">
            <p class="muted small">${x.start ? shortDate(x.start) : ''} ~ ${x.doneDate ? shortDate(x.doneDate) : ''}</p>
            ${part('📋 시험', x.test)}
            ${r || x.what ? `<p class="exp-part"><b>📊 결과${r ? ` · ${r[0]} ${r[1]}` : ''}</b>${esc(x.what)}</p>` : ''}
            ${part('📖 배운 점', x.learn)}
            ${part('⚙️ 수정 방향', x.change)}
            ${next ? `<p class="exp-from">→ 다음 실험: ${esc(next.think)}</p>` : ''}
            <div class="row end" style="margin-top:8px">
              <button class="btn sm ghost" data-act="exp-reopen" data-id="${x.id}">↩︎ 다시 진행 중으로</button>
              <button class="btn sm ghost danger" data-act="exp-del" data-id="${x.id}">지우기</button>
            </div>
          </div>
        </details>`;
      }).join('')}
    </section>`;
  }

  function renderGrow() {
    const run = runningExps();
    return `<div class="stack">
      ${loopCard()}
      ${run.map(expCard).join('')}
      <form class="card" data-form="exp">
        <div class="card-head"><h2>${run.length ? '➕ 실험 하나 더' : '🧪 현재 실험'}</h2></div>
        ${run.length ? '' : '<p class="muted small" style="margin-bottom:8px">지금 하는 실험이 없어요. 작게 하나 시작해 볼까요? 실패해도 배운 게 남으면 한 바퀴 돈 거예요.</p>'}
        <div class="add-task"><input name="think" placeholder="💡 해 볼 생각 (예: 퇴근길에 검수 2화씩)" autocomplete="off"><button class="btn primary">시작</button></div>
        <p class="hint">시작하면 오늘부터 2주로 잡혀요. 기간은 언제든 바꿀 수 있어요.</p>
      </form>
      ${pastExpCard()}
    </div>`;
  }

  // 오늘 탭에 보이는 짧은 카드
  function expTodayCard() {
    const run = runningExps();
    return `<section class="card">
      <div class="card-head"><h2>🧪 현재 실험</h2><button class="btn sm ghost" data-act="go" data-to="grow">${run.length ? '성장 보기' : '시작하기'}</button></div>
      ${run.length ? run.map((x) => {
        const st = LOOP.find(([k]) => k === expStage(x));
        const late = expOver(x) && !expShowResult(x);
        return `<div class="exp-mini"><span class="exp-mini-ic" title="${st[2]} 단계">${st[1]}</span><span class="grow">${esc(x.think)}</span><span class="muted small ${expOver(x) ? 'exp-over' : ''}">${late ? '결과 적을 때' : expDue(x)}</span></div>`;
      }).join('') : '<p class="muted small">지금 하는 실험이 없어요. 생각 → 시험 → 결과 → 배움 → 수정, 작게 한 바퀴 돌려 봐요.</p>'}
    </section>`;
  }

  /* ---------- 비전 ---------- */
  function renderVision() {
    const v = state.vision;
    const t = today();
    const q = Number(quarterKey().slice(-1));
    const m = Number(t.slice(5, 7));
    const doneCount = (id) => state.tasks.filter((x) => x.goalId === id && x.done).length;
    const WHY_PH = { y10: '예: 내 글로 사람들을 돕는 사람이 되고 싶어서', y5: '예: 생계 걱정 없이 쓰는 일에 집중하려고', y3: '예: 내 작품이 꾸준히 돈이 되는 구조를 만들려고', y1: '예: 빚을 끝내고 숨 돌릴 여유를 만들려고' };
    const horizon = (key, cls, label, ph) => `<section class="card horizon ${cls}">
      <span class="label">${label}</span>
      <label class="why"><span>🎯 목적 · 왜 이걸 원하나요?</span><input data-bind="vision.why.${key}" value="${esc(v.why[key])}" placeholder="${WHY_PH[key]}" autocomplete="off"></label>
      <label class="why"><span>🌄 이루고 싶은 모습</span></label>
      <textarea data-bind="vision.${key}" placeholder="${ph}">${esc(v[key])}</textarea>
      ${peaksBlock(key)}
    </section>`;
    const conquered = allPeaks().filter((pk) => pk.done).sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
    const climbing = climbingAll().map(({ pk, label }) => [label, pk]);

    return `<div class="stack">
      ${structureCard()}

      <p class="muted">멀리서부터 적고, 가까운 것부터 실행해요. 적는 즉시 저장돼요.</p>

      <section class="card summit">
        <div class="card-head"><h2>🏆 내가 넘은 산</h2><span class="muted">${conquered.length}개</span></div>
        ${climbing.length ? `<p class="muted small">지금 오르는 산</p><ul class="climb">${climbing.map(([label, pk]) => `<li><span class="tag">${label}</span> ${esc(pk.text)}</li>`).join('')}</ul>` : ''}
        ${conquered.length ? `<details ${conquered.length <= 3 ? 'open' : ''}><summary class="muted small" style="margin-top:8px">넘은 산 모두 보기</summary>
          <ul class="list">${conquered.map((pk) => `<li><span class="when">${ym(pk.doneDate)}</span><span class="grow">✓ ${esc(pk.text)}</span><span class="tag">${pk.hLabel}</span></li>`).join('')}</ul></details>`
          : '<p class="muted small" style="margin-top:6px">아래 10년·5년·3년·1년 칸에 작은 산을 적고, 넘을 때마다 체크하세요. 넘은 산이 여기에 쌓여요.</p>'}
      </section>

      ${checkinCard()}

      ${horizon('y10', 'h10', '10년 후 · ' + (Number(t.slice(0, 4)) + 10), '어디에 살고, 무슨 일을 하고, 누구와 하루를 보내나요? 이루고 싶은 모습을 편하게 적어 보세요.')}
      <div class="down">↓ 그러려면 5년 뒤엔</div>
      ${horizon('y5', 'h5', '5년 후 · ' + (Number(t.slice(0, 4)) + 5), '어떤 사업·작품·수입 구조가 자리 잡혀 있어야 할까요?')}
      <div class="down">↓ 그러려면 3년 뒤엔</div>
      ${horizon('y3', 'h3', '3년 후 · ' + (Number(t.slice(0, 4)) + 3), '작품·수입·일하는 방식이 어디까지 와 있어야 할까요?')}
      <div class="down">↓ 그러려면 1년 뒤엔</div>
      ${horizon('y1', 'h1', '1년 후 · ' + (Number(t.slice(0, 4)) + 1), '1년 뒤의 나는 어떤 모습인가요?')}

      <section class="card">
        <div class="card-head"><h2>🎯 1년 목표</h2><span class="muted">숫자로, 3~5개</span></div>
        ${v.goals.length ? v.goals.map((g, i) => `<div class="goal ${g.done ? 'done' : ''}">
          <input type="checkbox" data-act="toggle-goal" data-id="${g.id}" ${g.done ? 'checked' : ''} aria-label="달성">
          <span class="t">${esc(g.text)}</span>
          <span class="meta">${doneCount(g.id) ? `연결된 일 ${doneCount(g.id)}개 완료` : ''}</span>
          <span class="mv-pair"><button class="mv" data-act="goal-move" data-id="${g.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="goal-move" data-id="${g.id}" data-n="1" ${i === v.goals.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
          <button class="icon-btn" data-act="del-goal" data-id="${g.id}" aria-label="삭제">✕</button>
        </div>`).join('') : '<p class="muted small">예: 빚 0원 만들기 · 월수입 300만원 · 워크숍 3회 열기 · 전자책 1권 출간</p>'}
        <form class="add-task" data-form="goal" style="margin-top:10px">
          <input name="goal" placeholder="목표를 적고 Enter" autocomplete="off">
          <button class="btn primary">추가</button>
        </form>
        <p class="hint">여기 적은 목표는 '오늘 할 일'을 추가할 때 연결할 수 있어요.</p>
      </section>

      <div class="down">↓ 거꾸로 쪼개기</div>

      <section class="card">
        <div class="card-head"><h2>🗓️ 이번 분기</h2><span class="muted">${t.slice(0, 4)}년 ${q}분기 · ${q * 3 - 2}~${q * 3}월</span></div>
        <textarea data-bind="vision.quarter.text" placeholder="3개월 안에 끝낼 큰 덩어리 1~3개">${esc(v.quarter.text)}</textarea>
        ${v.quarter.prev ? `<p class="prev">지난 분기: ${esc(v.quarter.prev)}</p>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h2>📅 이번 달</h2><span class="muted">${m}월</span></div>
        <textarea data-bind="vision.month.text" placeholder="이번 분기 목표를 위해 이번 달에 할 것">${esc(v.month.text)}</textarea>
        ${v.month.prev ? `<p class="prev">지난달: ${esc(v.month.prev)}</p>` : ''}
      </section>
      <section class="card week3">
        <div class="card-head"><h2>📍 이번 주 핵심 3개</h2><span class="muted">${shortDate(weekStart())}~</span></div>
        ${[0, 1, 2].map((i) => `<input data-bind="vision.week.items.${i}" value="${esc(v.week.items[i] || '')}" placeholder="${i + 1}." autocomplete="off">`).join('')}
        <p class="hint">일요일 주간 리뷰에서 다음 주 핵심 3개를 정하면 여기에 자동으로 들어와요.</p>
      </section>
    </div>`;
  }

  /* ---------- 주간 리뷰 ---------- */
  let reviewWeek = null;
  let statOpen = null; // 주간 리뷰에서 펼친 칸 ('done' | 'linked' | 'peaks' | 'steps' | 'exps')
  // 누르면 아래에 내용이 펼쳐지는 숫자 칸 (내용이 없으면 누를 수 없음)
  const statBtn = (key, big, label, n) => `<button type="button" class="stat stat-btn ${statOpen === key ? 'open' : ''}" data-act="stat-open" data-k="${key}" ${n ? '' : 'disabled'} aria-expanded="${statOpen === key}"><b>${big}</b><span>${label}</span></button>`;
  function statDetail(key, ws) {
    const we = addDays(ws, 6);
    const inWeek = (d) => d && d >= ws && d <= we;
    const empty = '<p class="muted small" style="padding:10px 0">이번 주에는 없어요.</p>';
    const wrap = (title, body) => `<div class="done-list"><p class="detail-title">${title}</p>${body || empty}</div>`;
    const tagsOf = (x) => { const g = x.goalId && goalName(x.goalId); const pk = x.peakId && findPeak(x.peakId); return `${g ? `<span class="tag">🎯 ${esc(g)}</span>` : ''}${pk ? `<span class="tag">⛰️ ${esc(pk.text)}</span>` : ''}`; };
    if (key === 'done') return wrap('✅ 끝낸 일', doneList(ws));
    if (key === 'exps') {
      const list = state.experiments.filter((x) => x.status === 'done' && inWeek(x.doneDate));
      return wrap('🔄 끝낸 실험', list.map((x) => `<div class="done-item"><span>${RESULTS[x.result]?.[0] || '·'} ${esc(x.think)}${x.learn ? `<br><span class="muted small">📖 ${esc(x.learn)}</span>` : ''}</span><span class="muted small">${shortDate(x.doneDate)}</span></div>`).join(''));
    }
    if (key === 'linked') {
      const list = state.tasks.filter((x) => x.done && inWeek(x.doneDate) && (x.goalId || x.peakId)).sort((a, b) => b.doneDate.localeCompare(a.doneDate));
      return wrap('🎯 목표와 연결된 일', list.map((x) => `<div class="done-item"><span>✓ ${esc(x.text)} ${tagsOf(x)}</span><span class="muted small">${shortDate(x.doneDate)}</span></div>`).join(''));
    }
    if (key === 'peaks') {
      const list = allPeaks().filter((pk) => pk.done && inWeek(pk.doneDate));
      return wrap('⛰️ 넘은 작은 산', list.map((pk) => `<div class="done-item"><span>🚩 ${esc(pk.text)} <span class="tag">${pk.hLabel}</span></span><span class="muted small">${shortDate(pk.doneDate)}</span></div>`).join(''));
    }
    if (key === 'steps') {
      const list = allPeaks().flatMap((pk) => (pk.steps || []).filter((x) => x.done && inWeek(x.doneDate)).map((x) => ({ x, pk })));
      return wrap('🪜 이룬 작은 목표', list.map(({ x, pk }) => `<div class="done-item"><span>✓ ${esc(x.text)} <span class="tag">⛰️ ${esc(pk.text)}</span></span><span class="muted small">${shortDate(x.doneDate)}</span></div>`).join(''));
    }
    return '';
  }
  function doneList(ws) {
    const we = addDays(ws, 6);
    const done = state.tasks.filter((x) => x.done && x.doneDate && x.doneDate >= ws && x.doneDate <= we).sort((a, b) => b.doneDate.localeCompare(a.doneDate));
    const days = [...new Set(done.map((x) => x.doneDate))];
    return `${days.map((d) => `<div class="done-day"><b>${shortDate(d)}</b>
      ${done.filter((x) => x.doneDate === d).map((x) => `<div class="done-item"><span>✓ ${esc(x.text)} <span class="muted small">${esc(catOf(x.cat).icon)}</span></span><button class="btn sm ghost" data-act="undo-done" data-id="${x.id}">↩︎ 되돌리기</button></div>`).join('')}
    </div>`).join('')}`;
  }

  function renderReview() {
    const cur = weekStart();
    // 월요일에 여는 경우엔 지난주를 리뷰하는 게 자연스러움
    if (!reviewWeek) reviewWeek = new Date().getDay() === 1 && !state.reviews.some((r) => r.week === addDays(cur, -7)) ? addDays(cur, -7) : cur;
    const ws = reviewWeek;
    const st = weekStats(ws);
    const r = state.reviews.find((x) => x.week === ws) || { wins: '', lesson: '', next: ['', '', ''] };
    const past = [...state.reviews].filter((x) => x.week !== ws).sort((a, b) => b.week.localeCompare(a.week));

    return `<div class="stack">
      <section class="card">
        <div class="card-head">
          <h2>📊 ${shortDate(ws)} ~ ${shortDate(addDays(ws, 6))}</h2>
          <span class="row" style="flex-wrap:nowrap;flex:none">
            <button class="btn sm ghost" data-act="week-shift" data-n="-7" aria-label="이전 주">←</button>
            <button class="btn sm ghost" data-act="week-shift" data-n="7" aria-label="다음 주" ${ws >= cur ? 'disabled' : ''}>→</button>
          </span>
        </div>
        <div class="grid2">
          <div class="stat"><b>${st.expRun}개</b><span>🧪 이번 주 실험</span></div>
          ${statBtn('exps', `${st.expDone}개`, '🔄 끝낸 실험', st.expDone)}
          <div class="stat"><b>${st.rules}</b><span>📅 지킨 규칙</span></div>
          <div class="stat"><b>${st.checked}화 · ${st.reserved}화</b><span>📚 검수 · 예약</span></div>
          ${statBtn('done', `${st.done}개`, '✅ 끝낸 일 전체', st.done)}
          ${statBtn('linked', `${st.done ? Math.round((st.linked / st.done) * 100) : 0}%`, '🎯 목표와 연결된 일', st.linked)}
          ${statBtn('peaks', `${st.peaks}개`, '⛰️ 넘은 작은 산', st.peaks)}
          ${statBtn('steps', `${st.steps ?? 0}개`, '🪜 이룬 작은 목표', st.steps)}
        </div>
        ${statOpen ? statDetail(statOpen, ws) : ''}
      </section>

      ${latePeaks().length ? `<section class="card late-card">
        <div class="card-head"><h2>⏰ 늦어진 작은 산</h2><span class="muted">${latePeaks().length}개</span></div>
        <p class="muted small">목표 달이 지났어요. 괜찮아요, 날짜를 다시 잡거나 넘었으면 체크해요.</p>
        ${latePeaks().map((pk) => `<div class="late-item">
          <div><b>${esc(pk.text)}</b> <span class="tag">${pk.hLabel}</span><div class="muted small">목표였던 달 ${ym(pk.due)}</div></div>
          <div class="row" style="margin-top:6px">
            <button class="btn sm" data-act="peak-push" data-id="${pk.id}" data-n="1">+1달</button>
            <button class="btn sm" data-act="peak-push" data-id="${pk.id}" data-n="3">+3달</button>
            <input type="month" data-peak="${pk.id}" data-field="due" value="${esc(pk.due)}" aria-label="새 목표 달" style="width:auto;min-height:36px;padding:4px 8px">
            <button class="btn sm" data-act="peak-toggle" data-id="${pk.id}">✓ 넘었어요</button>
          </div>
        </div>`).join('')}
      </section>` : ''}

      <form class="card" data-form="review">
        <div class="card-head"><h2>📝 5분 리뷰</h2></div>
        <label class="field"><span>이번 주 잘한 것 (작은 것도 OK)</span><textarea name="wins" placeholder="예: 외주 1건 따냄, 3일 동안 2~5시 지킴">${esc(r.wins)}</textarea></label>
        <label class="field"><span>아쉬운 점 · 배운 것</span><textarea name="lesson" placeholder="예: 오후에 SNS 보다가 1시간 날림 → 휴대폰을 다른 방에">${esc(r.lesson)}</textarea></label>
        <div class="field"><span>다음 주 핵심 3개</span>
          <div class="week3">${[0, 1, 2].map((i) => `<input name="next${i}" value="${esc(r.next[i] || '')}" placeholder="${i + 1}." autocomplete="off">`).join('')}</div>
        </div>
        <button class="btn primary block" style="margin-top:14px">${state.reviews.some((x) => x.week === ws) ? '고쳐서 저장' : '리뷰 저장하기'}</button>
        <p class="hint">저장하면 '다음 주 핵심 3개'가 비전 탭의 이번 주 칸으로 넘어가요.</p>
      </form>

      ${past.length ? `<section class="card">
        <div class="card-head"><h2>🗂️ 지난 리뷰</h2></div>
        ${past.map((p) => `<details class="review"><summary>${shortDate(p.week)} 주 · ${p.stats?.rules ? `📅 규칙 ${p.stats.rules}` : `🔥 ${p.stats?.fire || 0}개`}</summary>
          <div class="body">${p.wins ? `잘한 것\n${esc(p.wins)}\n\n` : ''}${p.lesson ? `배운 것\n${esc(p.lesson)}\n\n` : ''}${p.next.filter(Boolean).length ? `다음 주 핵심\n${p.next.filter(Boolean).map((n) => '· ' + esc(n)).join('\n')}` : ''}</div>
        </details>`).join('')}
      </section>` : ''}
    </div>`;
  }

  /* ---------- 설정 ---------- */
  function renderSettings() {
    return `<div class="stack">
      <section class="card guide">
        <div class="card-head"><h2>📖 사용법</h2></div>
        <ol>
          <li><b>처음 한 번</b>: 비전 탭에서 1년 목표를 적고, 🌱 성장 탭에서 첫 실험을 하나 시작해요. 요일별 규칙과 할 일 종류는 이 화면 아래에서 바꿀 수 있어요.</li>
          <li><b>매일</b>: 오늘 탭의 📅 오늘의 규칙을 체크해요. 출퇴근길에 검수한 화는 📚 연재에서 눌러 검수 완료로 옮겨요.</li>
          <li><b>일요일</b>: 📚 연재에서 검수분 예약 → 다음 5화 출력. 반나절 안에 끝내고 쉬어요.</li>
          <li><b>실험할 때</b>: 🌱 성장 탭에서 생각 → 시험 → 결과 → 배움 → 수정 순서로 적어요. 수정 방향은 다음 실험의 생각으로 이어져요.</li>
          <li><b>주말</b>: 주간 리뷰 5분. 지킨 규칙과 연재 화수가 자동으로 모여요.</li>
          <li><b>한 달에 한 번</b>: 비전 탭을 다시 읽고 이번 달 목표를 적어요.</li>
        </ol>
      </section>

      <section class="card" id="rules-set">
        <div class="card-head"><h2>📅 요일별 규칙</h2></div>
        <p class="muted small">오늘 탭의 '오늘의 규칙'에 요일마다 나오는 목록이에요. 평일엔 '회사 · 이동시간은 검수 또는 input'이 늘 함께 보여요.</p>
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<div class="set-day">
          <b class="set-day-name ${d === 0 || d === 6 ? 'we' : ''}">${DAYS[d]}</b>
          <div class="set-day-list">
            ${rulesOf(d).map((r, i, l) => `<div class="set-row">
              <input data-rule-day="${d}" data-rule="${r.id}" value="${esc(r.text)}" aria-label="${DAYS[d]}요일 규칙">
              ${r.kind ? '<span class="link-ic" title="연재 보드와 연결">🔗</span>' : ''}
              <span class="mv-pair"><button class="mv" data-act="rule-move" data-day="${d}" data-id="${r.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="rule-move" data-day="${d}" data-id="${r.id}" data-n="1" ${i === l.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
              <button class="icon-btn" data-act="rule-del" data-day="${d}" data-id="${r.id}" aria-label="삭제">✕</button>
            </div>`).join('')}
            <form class="set-add" data-form="rule" data-day="${d}"><input name="rule" placeholder="+ 규칙 더하기" autocomplete="off"><button class="btn sm">추가</button></form>
          </div>
        </div>`).join('')}
        <p class="hint">▲▼로 순서를 바꾸면 오늘 탭에도 그 순서대로 나와요. 🔗 표시는 연재 보드와 연결된 규칙이에요. 그날 예약·출력을 하면 저절로 체크돼요.</p>
      </section>

      <section class="card" id="cats-set">
        <div class="card-head"><h2>🏷️ 할 일 종류</h2></div>
        <p class="muted small">오늘 할 일을 나누는 칸이에요. 지운 종류의 일은 📦 기타로 옮겨져요.</p>
        ${catList().map((c, i) => `<div class="set-row">
          <input class="set-icon" data-cat="${esc(c.id)}" data-field="icon" value="${esc(c.icon)}" aria-label="아이콘" maxlength="4">
          <input data-cat="${esc(c.id)}" data-field="label" value="${esc(c.label)}" aria-label="이름">
          <span class="mv-pair"><button class="mv" data-act="cat-move" data-id="${esc(c.id)}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="cat-move" data-id="${esc(c.id)}" data-n="1" ${i === catList().length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
          ${c.id === 'etc' ? '<span class="icon-btn" aria-hidden="true"></span>' : `<button class="icon-btn" data-act="cat-del" data-id="${esc(c.id)}" aria-label="삭제">✕</button>`}
        </div>`).join('')}
        <form class="set-add" data-form="cat"><input class="set-icon" name="icon" placeholder="🏷️" maxlength="4" aria-label="아이콘"><input name="label" placeholder="새 종류 (예: 영어)" autocomplete="off"><button class="btn sm">추가</button></form>
      </section>

      <section class="card" id="serials-set">
        <div class="card-head"><h2>📚 연재 작품</h2></div>
        <p class="muted small">'다음 출력'은 다음에 출력할 화 번호예요. 처음 쓸 때 지금 연재 중인 화 번호로 맞춰 주세요.</p>
        ${state.serials.map((w) => `<div class="set-work">
          <div class="set-row"><input data-work="${w.id}" data-field="name" value="${esc(w.name)}" aria-label="작품 이름"><button class="icon-btn" data-act="work-del" data-id="${w.id}" aria-label="삭제">✕</button></div>
          <div class="row" style="margin-top:6px">
            <label class="small">다음 출력 <input data-work="${w.id}" data-field="next" value="${w.next}" inputmode="numeric" style="width:70px;min-height:36px;padding:4px 8px">화</label>
            <label class="small">한 번에 <select data-work="${w.id}" data-field="batch" style="width:auto;min-height:36px;padding:2px 8px">${[1, 2, 3, 4, 5, 6, 7, 10].map((n) => `<option value="${n}" ${w.batch === n ? 'selected' : ''}>${n}화</option>`).join('')}</select></label>
          </div>
        </div>`).join('')}
        <form class="set-add" data-form="work" style="margin-top:10px"><input name="work" placeholder="+ 작품 더하기" autocomplete="off"><button class="btn sm">추가</button></form>
      </section>

      <section class="card" id="transfer">
        <div class="card-head"><h2>📱 사파리 ↔ 홈 화면 앱 기록 옮기기</h2></div>
        <p class="muted small">아이폰은 <b>사파리</b>와 <b>홈 화면에 추가한 앱</b>이 기록을 따로 저장해요. 한쪽에 쓴 기록이 다른 쪽에서 안 보이면 이렇게 옮기세요.</p>
        <ol class="guide-steps">
          <li>기록이 <b>있는 쪽</b>(예: 사파리)에서 이 화면의 <b>📋 기록 복사하기</b>를 눌러요.</li>
          <li>기록이 <b>없는 쪽</b>(예: 홈 화면 앱)을 열고 설정 → <b>📥 복사한 기록 가져오기</b> → 뜨는 <b>붙여넣기</b>를 눌러요.</li>
        </ol>
        <button class="btn block" data-act="copy-state" style="margin-top:10px">📋 기록 복사하기</button>
        <button class="btn primary block" data-act="clip-import" style="margin-top:8px">📥 복사한 기록 가져오기</button>
        <p class="hint">누르면 위에 <b>붙여넣기</b> 말풍선이 떠요. 그걸 한 번 더 누르면 돼요.</p>
        <details style="margin-top:8px"><summary class="muted small">버튼이 안 되면: 직접 붙여넣기</summary>
          <textarea id="paste-state" placeholder="여기를 한 번 누르고, 한 번 더 누르면 뜨는 '붙여넣기'를 누르세요" style="margin-top:8px;min-height:90px"></textarea>
          <button class="btn block" data-act="paste-import" style="margin-top:8px">📥 붙여넣은 기록 가져오기</button>
        </details>
      </section>

      <section class="card">
        <div class="card-head"><h2>💾 백업</h2></div>
        <p class="muted small">버전 ${APP_VERSION}</p>
        <p class="muted small">기록은 이 브라우저에만 저장돼요. 폰과 컴퓨터를 옮기거나 브라우저 기록을 지우기 전에 꼭 내보내 두세요.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="export">⬇️ 내보내기</button>
          <label class="btn" style="display:inline-flex;align-items:center">⬆️ 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>🧹 초기화</h2></div>
        <p class="muted small">모든 기록을 지우고 처음부터 시작해요. 되돌릴 수 없어요.</p>
        <button class="btn danger" data-act="reset" style="margin-top:10px">전부 지우기</button>
      </section>
    </div>`;
  }

  /* ---------- 렌더 ---------- */
  const TABS = { today: renderToday, todo: renderTodo, grow: renderGrow, vision: renderVision, review: renderReview, settings: renderSettings };
  let tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'today';

  // 화면을 그리는 도중 입력칸이 사라지며 생기는 blur/change로 다시 그리기가 겹치지 않게 함
  let rendering = false, renderAgain = false;
  function render(focusSel) {
    if (rendering) { renderAgain = true; return; }
    rendering = true;
    try { drawScreen(focusSel); } finally { rendering = false; }
    if (renderAgain) { renderAgain = false; setTimeout(() => render(), 0); }
  }

  function drawScreen(focusSel) {
    rollPeriods();
    const d = new Date();
    $('#today-label').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
    $('#app').innerHTML = TABS[tab]();
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
    document.querySelectorAll('.grow-text, .exp-text').forEach(autoGrow);
    setTimeout(syncTyping, 0);
  }

  function go(t) {
    tab = t;
    if (t === 'review') reviewWeek = null;
    // 탭을 바꿀 때 주소(#)를 남겨서, 폰의 '뒤로' 버튼으로 이전 탭에 돌아가게 함
    if (location.hash !== '#' + t) { history.pushState(null, '', '#' + t); }
    render();
    window.scrollTo(0, 0);
  }

  // '뒤로' 버튼이나 주소 변경으로 탭이 바뀌면 그 탭을 보여 줌
  function syncFromHash() {
    const t = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'today';
    if (t === tab) return;
    tab = t;
    if (t === 'review') reviewWeek = null;
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', syncFromHash);
  window.addEventListener('hashchange', syncFromHash);

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function setPath(path, value) {
    const keys = path.split('.');
    let o = state;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  }

  // 숫자만 쳤을 때만 쉼표를 넣고, 커서 위치는 그대로 둠. "50만"처럼 한글을 쓰는 중이면 건드리지 않음
  const formatMoneyInput = (el, composing) => {
    const v = el.value;
    if (composing || /[^\d,\s]/.test(v)) return;
    const digits = v.replace(/\D/g, '');
    if (!digits) { el.value = ''; return; }
    const caret = el.selectionStart ?? v.length;
    const before = v.slice(0, caret).replace(/\D/g, '').length;
    const out = Number(digits).toLocaleString('ko-KR');
    if (out === v) return;
    el.value = out;
    let pos = 0, seen = 0;
    while (pos < out.length && seen < before) { if (/\d/.test(out[pos])) seen++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch (e) { /* 일부 입력칸은 커서 지정 불가 */ }
  };

  // 옛 아이폰 등 <dialog>를 지원하지 않는 브라우저 대비
  const openDlg = (d) => { if (typeof d.showModal === 'function') d.showModal(); else { d.classList.add('fallback'); d.setAttribute('open', ''); } };
  const closeDlg = () => { const d = $('#dlg'); if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); };

  /* ---------- 앱 안 확인창 ---------- */
  // 폰 기본 확인창(confirm)은 아이폰에서 '대화상자 차단'을 한 번 누르면 이후 늘 '취소'로 처리돼 삭제가 안 됨 → 직접 그림
  let askResolve = null;
  function ask(msg) {
    return new Promise((resolve) => {
      if (askResolve) askResolve(false);
      askResolve = resolve;
      const del = /지울|지워|되돌릴|바꿀까요/.test(msg);
      const dlg = $('#dlg');
      dlg.innerHTML = `<div class="dlg ask"><p class="ask-msg">${esc(msg)}</p>
        <div class="row end"><button type="button" class="btn ghost" data-ask="0">취소</button><button type="button" class="btn ${del ? 'danger' : 'primary'}" data-ask="1">${/지울|지워/.test(msg) ? '지우기' : '확인'}</button></div></div>`;
      openDlg(dlg);
      setTimeout(() => dlg.querySelector('[data-ask="1"]')?.focus(), 0);
    });
  }
  // 바깥을 누르거나 뒤로 가기·Esc로 닫으면 '취소'
  $('#dlg').addEventListener('close', () => { if (askResolve) { const r = askResolve; askResolve = null; r(false); } });

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', async (e) => {
    // 앱 안 확인창의 [취소]/[확인]
    const askBtn = e.target.closest('[data-ask]');
    if (askBtn) { const r = askResolve; askResolve = null; closeDlg(); if (r) r(askBtn.dataset.ask === '1'); return; }
    const tabBtn = e.target.closest('.tabs button');
    if (tabBtn) return go(tabBtn.dataset.tab);

    if (e.target.closest('[data-close]')) return closeDlg();

    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'go': return go(el.dataset.to);
      case 'dismiss-onboard': state.onboardDismissed = true; break;
      case 'toggle-task': {
        const x = state.tasks.find((t) => t.id === id);
        if (!x) return;
        x.done = !x.done;
        x.doneDate = x.done ? today() : null;
        if (x.done) toast('✅ 끝! 주간 리뷰의 끝낸 일로 옮겼어요');
        // 작은 목표에 연결된 일을 끝내면 그 작은 목표도 체크
        const pk = x.peakId && findPeak(x.peakId), st = findStep(pk, x.stepId);
        if (x.done && st && !st.done) { st.done = true; st.doneDate = today(); if (!pk.done) toast(`🪜 작은 목표 "${st.text}" 이뤘어요`); syncPeakDone(pk); }
        break;
      }
      case 'del-task': state.tasks = state.tasks.filter((t) => t.id !== id); break;
      case 'task-today': { const x = state.tasks.find((t) => t.id === id); if (!x) return; x.day = today(); toast('☀️ 오늘 할 일로 넣었어요'); break; }
      case 'task-unday': { const x = state.tasks.find((t) => t.id === id); if (!x) return; x.day = ''; toast('오늘 할 일에서 뺐어요'); break; }
      case 'peak-climb': {
        const pk = findPeak(id);
        if (!pk || pk.done) return;
        pk.climbing = !pk.climbing;
        toast(pk.climbing ? `🚶 '${pk.text}' 오르기 시작` : '지금 오르는 산에서 뺐어요');
        break;
      }
      case 'peak-toggle': {
        const pk = findPeak(id);
        if (!pk) return;
        pk.done = !pk.done;
        pk.doneDate = pk.done ? today() : '';
        if (pk.done) toast('🎉 작은 산 하나 넘었어요! 여기까지 왔어요');
        break;
      }
      case 'peak-del': {
        if (!await ask('이 작은 산을 지울까요?')) return;
        HORIZONS.forEach(([h]) => { state.vision.peaks[h] = (state.vision.peaks[h] || []).filter((x) => x.id !== id); });
        state.tasks.forEach((t) => { if (t.peakId === id) t.peakId = null; });
        break;
      }
      case 'peak-today': {
        const pk = findPeak(id);
        if (!pk) return;
        const st = findStep(pk, el.dataset.sid) || curStep(pk);
        pendingPeak = id;
        pendingStep = st ? st.id : null;
        go('today');
        const input = $('#task-input');
        if (input) { input.value = st ? st.text : pk.text; input.focus(); input.scrollIntoView({ block: 'center' }); }
        return;
      }
      case 'peak-unlink': pendingPeak = null; pendingStep = null; render('#task-input'); return;
      case 'peak-move': {
        const list = peakListOf(id);
        if (!list || !moveIn(list, id, Number(el.dataset.n))) return;
        save(); render();
        document.querySelector(`[data-act=peak-move][data-id="${id}"]:not([disabled])`)?.focus({ preventScroll: true });
        document.querySelector(`.peak-text[data-peak="${id}"]`)?.closest('.peak')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      case 'step-toggle': {
        const pk = findPeak(id), st = findStep(pk, el.dataset.sid);
        if (!st) return;
        st.done = !st.done;
        st.doneDate = st.done ? today() : '';
        const wasDone = pk.done;
        syncPeakDone(pk, !st.done);
        if (st.done && !pk.done && !wasDone) toast('🪜 한 걸음 올랐어요');
        break;
      }
      case 'step-move': {
        const pk = findPeak(id);
        if (!pk || !moveIn(pk.steps, el.dataset.sid, Number(el.dataset.n))) return;
        save(); render();
        document.querySelector(`.step-text[data-step="${el.dataset.sid}"]`)?.closest('.step')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      case 'step-del': {
        const pk = findPeak(id);
        if (!pk || !await ask('이 작은 목표를 지울까요?')) return;
        pk.steps = pk.steps.filter((x) => x.id !== el.dataset.sid);
        state.tasks.forEach((t) => { if (t.stepId === el.dataset.sid) t.stepId = null; });
        syncPeakDone(pk);
        break;
      }
      case 'peak-push': {
        const pk = findPeak(id);
        if (!pk) return;
        pk.due = addMonths(today().slice(0, 7) > pk.due ? today().slice(0, 7) : pk.due, Number(el.dataset.n));
        toast(`목표를 ${ym(pk.due)}로 다시 잡았어요`);
        break;
      }
      case 'open-cal': openCal(id); return;
      case 'cal-nav': cal.month = addMonths(cal.month, Number(el.dataset.n)); drawCal(); return;
      case 'cal-pick': { const target = cal.target; closeDlg(); cal = null; setDue(target, el.dataset.v); return; }
      case 'pick-due': {
        newDue = el.dataset.v;
        const keep = $('#task-input')?.value || '';
        render(); const inp = $('#task-input'); if (inp) inp.value = keep;
        return;
      }
      case 'park-input': {
        const input = $('#task-input');
        const text = (input?.value || '').trim();
        if (!text) { toast('보류할 일을 위 칸에 먼저 적어 주세요'); input?.focus(); return; }
        state.parked.unshift({ id: uid(), text, note: '', created: today() });
        input.value = '';
        toast('🅿️ 보류함에 넣었어요. 틀은 그대로!');
        break;
      }
      case 'park-out': {
        const x = state.parked.find((p) => p.id === id);
        if (!x || !await ask(`'${x.text}'을(를) 오늘 할 일로 꺼낼까요? 틀에 새 일을 더하는 거예요.`)) return;
        state.tasks.push({ id: uid(), text: x.text, cat: 'etc', goalId: null, peakId: null, stepId: null, done: false, created: today(), doneDate: null });
        state.parked = state.parked.filter((p) => p.id !== id);
        toast('↩︎ 할 일(기타)로 옮겼어요');
        break;
      }
      case 'park-del': if (!await ask('보류함에서 지울까요?')) return; state.parked = state.parked.filter((p) => p.id !== id); break;
      case 'park-edit': parkEditing = !parkEditing; parkOpen = true; render(); return;
      case 'struct-edit':
        structEditing = !structEditing;
        if (!structEditing) { // 비워 둔 줄은 정리
          state.structure.areas = state.structure.areas.filter((a) => a.name.trim() || a.role.trim() || a.cadence.trim());
          state.structure.dropped = state.structure.dropped.filter((d) => d.text.trim() || d.note.trim());
          save();
        }
        render(); if (structEditing) document.querySelector('.structure')?.scrollIntoView({ block: 'start' }); return;
      case 'struct-add': {
        const k = el.dataset.kind;
        const item = k === 'areas' ? { id: uid(), name: '', role: '', cadence: '' } : { id: uid(), text: '', note: '' };
        state.structure[k].push(item);
        save(); render();
        document.querySelector(`[data-struct="${k}"][data-id="${item.id}"]`)?.focus();
        return;
      }
      case 'struct-move': if (!moveIn(state.structure[el.dataset.kind], id, Number(el.dataset.n))) return; break;
      case 'struct-del': {
        const k = el.dataset.kind;
        const x = state.structure[k].find((y) => y.id === id);
        if (x && (x.name || x.text) && !await ask(`'${x.name || x.text}'을(를) 지울까요?`)) return;
        state.structure[k] = state.structure[k].filter((y) => y.id !== id);
        break;
      }
      case 'struct-reset': if (!await ask('올해의 큰 구조를 처음 내용으로 되돌릴까요? 고친 내용은 사라져요.')) return; state.structure = DEFAULT_STRUCTURE(); break;
      case 'rule-day': ruleDay = el.dataset.d || null; render(); $('.rules')?.scrollIntoView({ block: 'nearest' }); return;
      case 'rule-tick': {
        const t = el.dataset.d || today();
        const log = state.ruleLog[t] || [];
        state.ruleLog[t] = log.includes(id) ? log.filter((x) => x !== id) : [...log, id];
        // 오래된 기록은 반년 치만 보관
        const cut = addDays(t, -183);
        Object.keys(state.ruleLog).forEach((d) => { if (d < cut) delete state.ruleLog[d]; });
        const sc = dayScore(t);
        if (t === today() && !log.includes(id) && sc.total && sc.done === sc.total) toast(new Date().getDay() === 0 ? '🛋️ 오늘 규칙 끝! 이제 쉬어요' : '📅 오늘 규칙 다 지켰어요!');
        break;
      }
      case 'go-rules': go('settings'); $('#rules-set')?.scrollIntoView({ block: 'start' }); return;
      case 'go-cats': go('settings'); $('#cats-set')?.scrollIntoView({ block: 'start' }); return;
      case 'ep-tick': {
        const w = findWork(el.dataset.w);
        const e = w && w.eps.find((x) => x.n === Number(el.dataset.n));
        if (!e) return;
        if (e.st === 'out') { e.st = 'checked'; e.chk = today(); } else if (e.st === 'checked') { e.st = 'out'; e.chk = ''; }
        break;
      }
      case 'sr-out': {
        const w = findWork(el.dataset.w);
        if (!w) return;
        const from = w.next, to = w.next + w.batch - 1;
        if (!await ask(`${w.name} ${from}~${to}화를 출력했나요?`)) return;
        for (let n = from; n <= to; n++) if (!w.eps.some((x) => x.n === n)) w.eps.push({ n, st: 'out', out: today(), chk: '', res: '' });
        w.next = to + 1;
        toast(`📤 ${w.name} ${from}~${to}화 출력 완료 · 평일에 검수해요`);
        break;
      }
      case 'sr-reserve': {
        const w = findWork(el.dataset.w);
        const chk = w ? epsBy(w, 'checked') : [];
        if (!chk.length || !await ask(`${w.name} 검수 완료 ${chk.length}화(${chk[0].n}~${chk[chk.length - 1].n}화)를 예약했나요?`)) return;
        chk.forEach((e) => { e.st = 'reserved'; e.res = today(); });
        // 예약 끝난 화는 최근 50화만 보관
        const res = epsBy(w, 'reserved');
        if (res.length > 50) { const keep = new Set(res.slice(-50)); w.eps = w.eps.filter((e) => e.st !== 'reserved' || keep.has(e)); }
        toast(`📅 ${w.name} ${chk.length}화 예약 완료`);
        break;
      }
      case 'rule-del': {
        const d = el.dataset.day;
        if (!await ask('이 규칙을 지울까요?')) return;
        state.rules[d] = rulesOf(d).filter((r) => r.id !== id);
        break;
      }
      case 'rule-move': if (!moveIn(rulesOf(el.dataset.day), id, Number(el.dataset.n))) return; break;
      case 'cat-move': if (!moveIn(state.cats, id, Number(el.dataset.n))) return; break;
      case 'cat-del': {
        const c = state.cats.find((x) => x.id === id);
        if (!c || id === 'etc') return;
        const n = state.tasks.filter((t) => t.cat === id && !t.done).length;
        if (!await ask(`'${c.label}' 종류를 지울까요?${n ? ` 남은 할 일 ${n}개는 기타로 옮겨져요.` : ''}`)) return;
        state.tasks.forEach((t) => { if (t.cat === id) t.cat = 'etc'; });
        state.cats = state.cats.filter((x) => x.id !== id);
        break;
      }
      case 'work-del': {
        const w = findWork(id);
        if (!w || !await ask(`'${w.name}' 작품을 지울까요? 이 작품의 화별 기록도 지워져요.`)) return;
        state.serials = state.serials.filter((x) => x.id !== id);
        break;
      }
      case 'go-transfer': go('settings'); $('#transfer')?.scrollIntoView({ block: 'start' }); return;
      case 'copy-state': {
        const text = TRANSFER_TAG + JSON.stringify(state);
        const done = () => toast('📋 복사했어요. 다른 쪽 설정 화면에 붙여넣으세요');
        const fallback = () => {
          const ta = $('#paste-state');
          ta.closest('details').open = true;
          ta.value = text;
          ta.scrollIntoView({ block: 'center' });
          toast('아래 칸의 글을 꾹 눌러 전체 선택 → 복사해 주세요');
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        return;
      }
      case 'clip-import': {
        // 코드로 칸에 커서를 넣으면 아이폰은 키보드 없이 커서만 생겨서, 칸만 펼쳐 두고 직접 누르게 함
        const manual = () => { const ta = $('#paste-state'); ta.closest('details').open = true; ta.scrollIntoView({ block: 'center' }); toast('아래 칸을 눌러 직접 붙여넣어 주세요'); };
        if (!navigator.clipboard?.readText) { manual(); return; }
        navigator.clipboard.readText().then((raw) => {
          if (!raw || !raw.trim()) { toast('복사한 기록이 없어요. 먼저 📋 기록 복사하기를 눌러 주세요'); return; }
          importText(raw.trim());
        }, manual);
        return;
      }
      case 'paste-import': {
        const raw = ($('#paste-state')?.value || '').trim();
        if (!raw) { toast('먼저 복사한 기록을 붙여넣어 주세요'); return; }
        importText(raw);
        return;
      }
      case 'go-checkin':
        ckDraft = { score: null, note: '' };
        go('vision');
        $('#checkin')?.scrollIntoView({ block: 'start' });
        return;
      case 'ck-edit': {
        const c = checkinFor(checkMonth() || monthKey());
        ckDraft = { score: c ? c.score : null, note: c ? c.note : '' };
        render(); $('#checkin')?.scrollIntoView({ block: 'start' });
        return;
      }
      case 'ck-cancel': ckDraft = null; render(); return;
      case 'ck-score': ckDraft.note = $('#ck-note')?.value || ckDraft.note; ckDraft.score = Number(el.dataset.v); render(); $('#checkin')?.scrollIntoView({ block: 'start' }); return;
      case 'ck-save': {
        const month = checkMonth() || monthKey();
        const rec = { month, score: ckDraft.score, note: ($('#ck-note')?.value || '').trim(), y1: peakPct('y1'), y3: peakPct('y3'), y5: peakPct('y5'), y10: peakPct('y10'), at: today() };
        state.vision.checkins = (state.vision.checkins || []).filter((c) => c.month !== month).concat(rec);
        ckDraft = null; ckPick = null;
        toast('📈 점검을 기록했어요');
        break;
      }
      case 'ck-pick': ckPick = Number(el.dataset.i); render(); $('#checkin')?.scrollIntoView({ block: 'nearest' }); return;
      case 'exp-write': expWriting.add(id); render(`[data-exp="${id}"][data-field="what"]`); return;
      case 'exp-result': { const x = findExp(id); if (!x) return; x.result = x.result === el.dataset.v ? '' : el.dataset.v; break; }
      case 'exp-len': { const x = findExp(id); if (!x) return; x.start = x.start || today(); x.end = addDays(x.start, Number(el.dataset.n) - 1); break; }
      case 'exp-next': {
        const x = findExp(id);
        if (!x) return;
        if (!x.change.trim()) { toast('⚙️ 수정 방향을 먼저 적어 주세요'); $(`[data-exp="${id}"][data-field="change"]`)?.focus(); return; }
        x.status = 'done'; x.doneDate = today(); expWriting.delete(id);
        const n = newExp(x.change.trim(), x.id);
        state.experiments.splice(state.experiments.indexOf(x) + 1, 0, n);
        save();
        render(`[data-exp="${n.id}"][data-field="test"]`);
        toast('🔄 다음 실험 시작! 어떻게 시험할지 적어 주세요');
        return;
      }
      case 'exp-end': {
        const x = findExp(id);
        if (!x) return;
        if (!x.result && !x.what && !x.learn && !await ask('결과를 안 적고 끝낼까요?')) return;
        x.status = 'done'; x.doneDate = today(); expWriting.delete(id);
        toast('🗂️ 지난 실험으로 옮겼어요');
        break;
      }
      case 'exp-reopen': { const x = findExp(id); if (!x) return; x.status = 'run'; x.doneDate = ''; break; }
      case 'exp-del': if (!await ask('이 실험을 지울까요?')) return; state.experiments = state.experiments.filter((x) => x.id !== id); expWriting.delete(id); break;
      case 'stat-open': statOpen = statOpen === el.dataset.k ? null : el.dataset.k; render(); return;
      case 'undo-done': {
        const x = state.tasks.find((y) => y.id === id);
        if (!x) return;
        x.done = false; x.doneDate = null;
        toast('↩︎ 오늘 할 일로 되돌렸어요');
        break;
      }
      case 'goal-move': if (!moveIn(state.vision.goals, id, Number(el.dataset.n))) return; break;
      case 'toggle-goal': {
        const g = state.vision.goals.find((x) => x.id === id);
        if (g) { g.done = !g.done; if (g.done) toast('🎯 1년 목표 달성! 대단해요'); }
        break;
      }
      case 'del-goal': if (!await ask('이 목표를 지울까요?')) return; state.vision.goals = state.vision.goals.filter((g) => g.id !== id); break;
      case 'week-shift': statOpen = null; reviewWeek = addDays(reviewWeek, num(el.dataset.n)); render(); return;
      case 'export': return exportData();
      case 'reset':
        if (!await ask('정말 모든 기록을 지울까요? 되돌릴 수 없어요.')) return;
        state = defaultState();
        toast('처음 상태로 돌아왔어요');
        break;
      default: return;
    }
    save();
    render();
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'pick-cat') { newCat = el.value; return; }
    if (el.dataset.act === 'pick-goal') { newGoal = el.value; return; }
    if (el.dataset.peak && el.dataset.field === 'due') {
      const pk = findPeak(el.dataset.peak);
      if (pk) { pk.due = el.value; save(); renderAfterPicker(el); }
      return;
    }
    if (el.dataset.exp && (el.dataset.field === 'start' || el.dataset.field === 'end')) {
      const x = findExp(el.dataset.exp);
      if (x && el.value) { x[el.dataset.field] = el.value; if (x.end && x.end < x.start) x.end = x.start; save(); renderAfterPicker(el); }
      return;
    }
    if (el.dataset.work && el.dataset.field === 'batch') {
      const w = findWork(el.dataset.work);
      if (w) { w.batch = num(el.value) || 5; save(); }
      return;
    }
    if (el.dataset.cat && el.dataset.field === 'label' && !el.value.trim()) {
      const c = state.cats.find((x) => x.id === el.dataset.cat);
      if (c) { c.label = '이름 없음'; save(); render(); }
      toast('이름을 비워 둘 수 없어요');
      return;
    }
    if (el.dataset.act === 'import') return importData(el.files[0]);
    if (el.dataset.bind && el.hasAttribute('data-rerender')) {
      setPath(el.dataset.bind, el.value);
      save();
      renderAfterPicker(el);
    }
  });
  // 날짜·달 선택기가 열려 있는 동안 화면을 다시 그리면 아이폰에서 선택기가 저절로 닫힘 → 선택을 마친 뒤(칸을 떠날 때) 다시 그림
  function renderAfterPicker(el) {
    if (document.activeElement !== el) { render(); return; }
    el.addEventListener('blur', () => setTimeout(render, 0), { once: true });
  }

  // 휴대폰 키보드가 실제로 떠 있는 동안에만 아래 메뉴를 숨김.
  // (예전엔 입력칸에 커서만 남아 있어도 숨겨서, 키보드를 내린 뒤에도 메뉴가 사라진 채로 남았음)
  const isTyping = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=month]):not([type=date]), textarea');
  const vv = window.visualViewport;
  let fullH = 0;
  const viewH = () => (vv ? vv.height : window.innerHeight);
  // 입력 중이 아닐 때의 화면 높이를 기준으로 삼고, 입력 중에 그보다 눈에 띄게 줄면 키보드가 올라온 것
  function syncTyping() {
    const h = viewH();
    const typing = isTyping(document.activeElement);
    if (!typing || h > fullH) fullH = h;
    const on = typing && matchMedia('(pointer: coarse)').matches && h < fullH * 0.78;
    document.body.classList.toggle('typing', on);
  }
  // 손으로 누르지 않고 코드로 커서가 들어간 칸 (아이폰에서는 키보드가 안 뜰 수 있음)
  let lastTouch = 0;
  const noKb = new WeakSet();
  document.addEventListener('focusin', (e) => {
    if (!isTyping(e.target)) return;
    if (Date.now() - lastTouch > 1000 && !document.body.classList.contains('typing')) noKb.add(e.target); else noKb.delete(e.target);
    if (viewH() > fullH) fullH = viewH();
    setTimeout(syncTyping, 350);
    setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* 무시 */ } }, 300);
  });
  document.addEventListener('focusout', () => setTimeout(syncTyping, 100));
  if (vv) vv.addEventListener('resize', syncTyping);
  window.addEventListener('resize', syncTyping);
  window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(() => { fullH = 0; syncTyping(); }, 400); });
  // 혹시라도 메뉴가 숨겨진 채 남아 있으면, 화면을 만지거나 스크롤할 때 다시 확인
  document.addEventListener('touchstart', (e) => {
    // 커서는 있는데 키보드가 안 뜬 칸을 누르면, 커서를 뺐다가 다시 넣어 키보드가 뜨게 함
    const t = e.target;
    if (t === document.activeElement && noKb.has(t)) { noKb.delete(t); t.blur(); }
    lastTouch = Date.now();
    if (document.body.classList.contains('typing')) setTimeout(syncTyping, 50);
  }, { passive: true });
  document.addEventListener('scroll', () => { if (document.body.classList.contains('typing')) syncTyping(); }, { passive: true });
  document.addEventListener('visibilitychange', syncTyping);
  // 아이폰은 확대 금지 설정을 무시해서, 두 손가락 확대를 직접 막음
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  // 긴 제목도 잘리지 않게 글 길이만큼 칸 높이를 늘림
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
  // 제목 칸에서 Enter는 줄바꿈 대신 입력 끝내기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.classList?.contains('grow-text')) { e.preventDefault(); e.target.blur(); }
  });

  let bindTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    // 한글 조합 중에 칸 내용을 건드리면 아이폰에서 글자가 안 써지므로, 줄바꿈이 들어온 경우에만 고침
    if (el.classList.contains('grow-text')) { if (!e.isComposing && el.value.includes('\n')) el.value = el.value.replace(/\n/g, ' '); autoGrow(el); }
    if (el.dataset.exp) {
      const x = findExp(el.dataset.exp);
      if (x && el.classList.contains('exp-text')) { x[el.dataset.field] = el.value; autoGrow(el); clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.step) {
      const st = findStep(findPeak(el.dataset.peak), el.dataset.step);
      if (st) { st.text = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.taskText) {
      const x = state.tasks.find((y) => y.id === el.dataset.taskText);
      if (x) { x.text = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.struct) {
      const S = state.structure, k = el.dataset.struct;
      if (el.dataset.id) { const x = S[k].find((y) => y.id === el.dataset.id); if (x) x[el.dataset.field] = el.value; } else S[k] = el.value;
      clearTimeout(bindTimer); bindTimer = setTimeout(save, 300);
      return;
    }
    if (el.dataset.parked) {
      const x = state.parked.find((y) => y.id === el.dataset.parked);
      if (x) { x[el.dataset.field] = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.rule) {
      const r = rulesOf(el.dataset.ruleDay).find((x) => x.id === el.dataset.rule);
      if (r) { r.text = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.cat) {
      const c = state.cats.find((x) => x.id === el.dataset.cat);
      if (c) { c[el.dataset.field] = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.work && el.dataset.field !== 'batch') {
      const w = findWork(el.dataset.work);
      if (w) {
        if (el.dataset.field === 'next') { const n = Math.floor(num(el.value)); if (n >= 1) w.next = n; } else w.name = el.value;
        clearTimeout(bindTimer); bindTimer = setTimeout(save, 300);
      }
      return;
    }
    if (el.dataset.peak && el.dataset.field !== 'due') {
      const pk = findPeak(el.dataset.peak);
      if (pk) { pk[el.dataset.field] = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.bind && !el.hasAttribute('data-rerender')) {
      setPath(el.dataset.bind, el.dataset.type === 'num' ? num(el.value) : el.value);
      clearTimeout(bindTimer);
      bindTimer = setTimeout(save, 300);
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    const kind = f.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const val = (n) => (f.elements[n]?.value || '').trim();

    if (kind === 'task') {
      let text = val('task');
      if (!text) return;
      let due = newDue;
      const parsed = dueFromText(text);
      if (parsed) { text = parsed.text; due = due || parsed.due; }
      state.tasks.push({ id: uid(), text, cat: newCat, goalId: newGoal || null, peakId: pendingPeak || null, stepId: (pendingPeak && pendingStep) || null, done: false, created: today(), doneDate: null, due: due || '', day: f.dataset.today ? today() : '' });
      if (due) toast(`📅 ${shortDate(due)}까지로 넣었어요`);
      newDue = '';
      pendingPeak = null;
      pendingStep = null;
      save();
      render('#task-input');
      return;
    }
    if (kind === 'peak') {
      const text = val('peak');
      if (!text) return;
      const h = f.dataset.h;
      state.vision.peaks[h] = [...(state.vision.peaks[h] || []), { id: uid(), text, due: '', steps: [], done: false, doneDate: '', climbing: !climbingIn(h).length }];
      save();
      render();
      $(`form[data-form=peak][data-h=${h}] input`)?.focus();
      return;
    }
    if (kind === 'step') {
      const text = val('step');
      const pk = findPeak(f.dataset.id);
      if (!text || !pk) return;
      pk.steps = [...(pk.steps || []), { id: uid(), text, done: false, doneDate: '' }];
      if (pk.done) { pk.done = false; pk.doneDate = ''; }
      save();
      render();
      $(`form[data-form=step][data-id="${pk.id}"] input`)?.focus();
      return;
    }
    if (kind === 'park') {
      const text = val('park');
      if (!text) return;
      state.parked.unshift({ id: uid(), text, note: '', created: today() });
      parkOpen = true;
      save(); render('#parked [name=park]');
      toast('🅿️ 보류함에 넣었어요');
      return;
    }
    if (kind === 'rule') {
      const text = val('rule');
      if (!text) return;
      const d = f.dataset.day;
      state.rules[d] = [...rulesOf(d), { id: uid(), text }];
      save(); render(); $(`form[data-form=rule][data-day="${d}"] input`)?.focus();
      return;
    }
    if (kind === 'cat') {
      const label = val('label');
      if (!label) return;
      state.cats.push({ id: uid(), icon: val('icon') || '🏷️', label });
      save(); render('#cats-set [name=label]');
      return;
    }
    if (kind === 'work') {
      const name = val('work');
      if (!name) return;
      state.serials.push({ id: uid(), name, batch: 5, next: 1, eps: [] });
      save(); render('#serials-set [name=work]');
      return;
    }
    if (kind === 'goal') {
      const text = val('goal');
      if (!text) return;
      state.vision.goals.push({ id: uid(), text, done: false });
      save();
      render('[name=goal]');
      return;
    }
    if (kind === 'exp') {
      const think = val('think');
      if (!think) return;
      const x = newExp(think);
      state.experiments.push(x);
      save();
      render(`[data-exp="${x.id}"][data-field="test"]`);
      return;
    }
    if (kind === 'review') {
      const next = [0, 1, 2].map((i) => val('next' + i));
      const rec = { week: reviewWeek, wins: val('wins'), lesson: val('lesson'), next, stats: weekStats(reviewWeek), savedAt: today() };
      state.reviews = state.reviews.filter((r) => r.week !== reviewWeek).concat(rec);
      // 다음 주 핵심 → 비전 탭 '이번 주'
      const target = addDays(reviewWeek, 7);
      const w = state.vision.week;
      if (next.some(Boolean)) {
        if (target === weekStart()) { w.key = target; w.items = next; }
        else if (target > weekStart()) { w.pending = { key: target, items: next }; }
      }
      toast('📝 리뷰 저장! 다음 주 핵심이 비전 탭으로 넘어가요');
    }
    save();
    render();
  });

  // 일요일에 쓴 '다음 주 핵심'을 월요일이 되면 이번 주 칸에 넣기
  function applyPendingWeek() {
    const w = state.vision.week;
    if (w.pending && w.pending.key <= weekStart()) {
      if (w.pending.key === weekStart()) { if (w.key && w.key !== w.pending.key) w.prev = w.items.filter(Boolean); w.key = w.pending.key; w.items = w.pending.items; }
      delete w.pending;
      save();
    }
  }

  // 복사해 온 기록(글)을 읽어서 지금 기록과 바꿈
  async function importText(raw) {
    // 메모 앱을 거치며 앞뒤에 붙은 글자나 줄바꿈이 있어도 { … } 부분만 읽음
    const body = raw.includes(TRANSFER_TAG) ? raw.slice(raw.indexOf(TRANSFER_TAG) + TRANSFER_TAG.length) : raw;
    let data;
    try {
      data = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
      if (!data || typeof data !== 'object' || !('tasks' in data)) throw new Error('bad');
    } catch (err) { toast('기록을 읽을 수 없어요. 📋 기록 복사하기로 복사한 글 전체인지 확인해 주세요'); return; }
    if (!await ask('지금 이 화면의 기록을 복사해 온 기록으로 바꿀까요?')) return;
    state = merge(defaultState(), data);
    save();
    render();
    toast('📥 기록을 옮겼어요');
  }

  /* ---------- 백업 ---------- */
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `나의운영실-백업-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('⬇️ 백업 파일을 받았어요');
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !('tasks' in data)) throw new Error('bad');
        if (!await ask('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
        state = merge(defaultState(), data);
        save();
        render();
        toast('⬆️ 가져오기 완료');
      } catch (err) {
        toast('이 파일은 읽을 수 없어요');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 새 버전 확인 ---------- */
  // 홈 화면 앱은 예전 파일을 오래 붙잡고 있어서, 열 때마다 새 버전이 있는지 직접 확인하고 있으면 다시 불러옴
  async function checkUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { v } = await r.json();
      if (!v || v === APP_VERSION) return;
      const tried = sessionStorage.getItem('ld-update');
      if (tried === v) return; // 같은 버전으로 한 번만 시도 (무한 새로고침 방지)
      if ($('#dlg').hasAttribute('open') || document.activeElement?.matches('input, textarea, select')) return; // 입력 중이면 다음에
      sessionStorage.setItem('ld-update', v);
      location.replace(location.pathname + '?v=' + encodeURIComponent(v) + location.hash);
    } catch (e) { /* 인터넷이 없으면 그냥 지금 버전으로 */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

  /* ---------- 시작 ---------- */
  applyPendingWeek();
  rollPeriods();
  save();
  render();
  checkUpdate();

  // 탭을 켜둔 채 날짜·시간이 바뀌면 화면 갱신 (2~5시 알림 포함)
  let lastStamp = today() + new Date().getHours();
  setInterval(() => {
    const stamp = today() + new Date().getHours();
    if (stamp !== lastStamp && !$('#dlg').hasAttribute('open') && !document.activeElement?.matches('input, textarea, select')) {
      lastStamp = stamp;
      applyPendingWeek();
      render();
    }
  }, 60000);
})();
