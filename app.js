(() => {
  'use strict';

  /* ---------- 기본 도구 ---------- */
  const KEY = 'life-dashboard-v1';
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
  // 금액 읽기: "500,000", "50만", "50만원", "1억 2천만", "35만 5천" 모두 이해
  const parseSub = (t) => { // 만 아래 단위: "2천5백", "3500"
    let n = 0;
    t = t.replace(/(\d*(?:\.\d+)?)천/, (_, d) => { n += (d ? Number(d) : 1) * 1000; return ''; });
    t = t.replace(/(\d*(?:\.\d+)?)백/, (_, d) => { n += (d ? Number(d) : 1) * 100; return ''; });
    return n + num(t);
  };
  const parseMoney = (v) => {
    const t = String(v ?? '').replace(/[,\s원]/g, '');
    if (!/[억만천백]/.test(t)) return Math.max(0, Math.round(num(t)));
    const [eok, restE] = t.includes('억') ? t.split('억') : ['', t];
    const [man, rest] = restE.includes('만') ? restE.split('만') : ['', restE];
    const total = (t.includes('억') ? (parseSub(eok) || 1) * 1e8 : 0)
      + (restE.includes('만') ? (parseSub(man) || 1) * 1e4 : 0)
      + parseSub(rest);
    return Math.max(0, Math.round(total));
  };
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const man = (n) => {
    n = Math.round(n);
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 10000) { const m = n / 10000; return sign + (Number.isInteger(m) ? m : m.toFixed(1)) + '만원'; }
    return sign + n.toLocaleString('ko-KR') + '원';
  };
  const sum = (arr) => arr.reduce((a, x) => a + num(x.amount), 0);
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`; };

  const CATS = {
    now: { icon: '🔥', label: '오늘 돈 되는 일', hint: '이번 주 안에 입금으로 이어지는 일' },
    soon: { icon: '🌱', label: '3개월 뒤 돈 되는 일', hint: '워크숍 · 전자책 · 템플릿 · 자동연재' },
    bonus: { icon: '🎁', label: '보너스', hint: '드라마처럼 생계 밖의 큰 기회' },
    grow: { icon: '📚', label: '성장', hint: '영어 · 운동 · 공부' },
    etc: { icon: '📦', label: '기타', hint: '은행 · 병원 · 서류처럼 따로 처리할 일' },
  };
  const SOURCES = ['외주·알바', '웹소설·숏노블', '워크숍·강의', '전자책·템플릿', '드라마', '기타'];
  const FIXED_PRESETS = ['월세', '관리비', '통신비', '보험', '카드 할부', '식비', '교통비', '강아지 사료', '강아지 병원', '구독료'];

  /* ---------- 상태 ---------- */
  const defaultState = () => ({
    v: 1,
    onboardDismissed: false,
    tasks: [],
    slots: {},
    debt: { start: 5000000, targetDate: '', payments: [] },
    incomes: [],
    fixed: [],
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
    routines: [],                                 // 매주 루틴 [{id, text, perWeek, days:[날짜]}]
    reviews: [],
  });

  function merge(base, data) {
    const out = { ...base, ...data };
    out.debt = { ...base.debt, ...(data.debt || {}) };
    out.vision = { ...base.vision, ...(data.vision || {}) };
    ['quarter', 'month', 'week', 'why', 'peaks'].forEach((k) => { out.vision[k] = { ...base.vision[k], ...(out.vision[k] || {}) }; });
    if (out.vision.y3 == null) out.vision.y3 = '';
    if (!Array.isArray(out.routines)) out.routines = [];
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
  const debtPaid = () => sum(state.debt.payments);
  const debtLeft = () => Math.max(0, num(state.debt.start) - debtPaid());

  function debtPlan() {
    const mk = monthKey();
    const paidThisMonth = sum(state.debt.payments.filter((p) => monthKey(p.date) === mk));
    const left = debtLeft();
    if (!state.debt.targetDate || left <= 0) return { monthly: 0, paidThisMonth, months: 0 };
    const now = new Date();
    const t = parseYmd(state.debt.targetDate);
    const months = Math.max(1, (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()) + 1);
    const monthly = Math.ceil((left + paidThisMonth) / months / 1000) * 1000;
    return { monthly, paidThisMonth, months };
  }

  function survival() {
    const fixed = sum(state.fixed);
    const { monthly } = debtPlan();
    const need = fixed + monthly;
    const mk = monthKey();
    const earned = sum(state.incomes.filter((i) => monthKey(i.date) === mk));
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - now.getDate() + 1;
    const gap = Math.max(0, need - earned);
    return { fixed, debtMonthly: monthly, need, earned, gap, daysLeft, perDay: gap / daysLeft };
  }

  function weekStats(ws) {
    const we = addDays(ws, 6);
    const inWeek = (d) => d && d >= ws && d <= we;
    const done = state.tasks.filter((t) => t.done && inWeek(t.doneDate));
    let slotDays = 0;
    for (let i = 0; i < 7; i++) { const s = state.slots[addDays(ws, i)]; if (s && s.done) slotDays++; }
    return {
      income: sum(state.incomes.filter((i) => inWeek(i.date))),
      paid: sum(state.debt.payments.filter((p) => inWeek(p.date))),
      done: done.length,
      fire: done.filter((t) => t.cat === 'now').length,
      linked: done.filter((t) => t.goalId || t.peakId).length,
      peaks: allPeaks().filter((pk) => pk.done && inWeek(pk.doneDate)).length,
      steps: allPeaks().reduce((a, pk) => a + (pk.steps || []).filter((st) => st.done && inWeek(st.doneDate)).length, 0),
      routine: state.routines.length ? `${state.routines.filter((r) => routineCount(r, ws) >= r.perWeek).length}/${state.routines.length}` : '-',
      slotDays,
    };
  }

  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isEmptyState = () => !state.tasks.length && !state.fixed.length && !state.incomes.length && !state.debt.payments.length
    && !state.vision.goals.length && !state.vision.y10 && !state.vision.y5 && !state.vision.y3 && !state.vision.y1 && !state.routines.length;
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
  const currentPeak = (h) => (state.vision.peaks[h] || []).find((pk) => !pk.done);
  const ym = (s) => (s ? `${s.slice(0, 4)}.${s.slice(5, 7)}` : '');

  // 숫자로 재는 작은 산: 돈 기록과 자동 연결되거나 직접 적음
  const METRICS = {
    '': '숫자 없이',
    debt: '빚 갚기 (돈 탭에서 자동)',
    income_month: '이번 달 수입 (자동)',
    income_total: '이 산을 만든 뒤 번 돈 합계 (자동)',
    manual: '직접 적기 (예: 수강생 수)',
  };
  function metricValue(pk) {
    const m = pk.metric;
    if (!m || !m.type) return null;
    if (m.type === 'debt') return { cur: debtPaid(), target: num(state.debt.start), money: true, label: '갚은 빚' };
    if (m.type === 'income_month') { const mk = monthKey(); return { cur: sum(state.incomes.filter((i) => monthKey(i.date) === mk)), target: num(m.target), money: true, label: '이번 달 수입' }; }
    if (m.type === 'income_total') return { cur: sum(state.incomes.filter((i) => i.date >= (m.since || '0000'))), target: num(m.target), money: true, label: '모은 수입' };
    return { cur: num(m.current), target: num(m.target), money: false, unit: m.unit || '', label: '지금' };
  }
  const fmtMetric = (v, n) => (v.money ? man(n) : `${n.toLocaleString('ko-KR')}${v.unit}`);
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

  function metricBlock(pk) {
    const v = metricValue(pk);
    const m = pk.metric || {};
    const pct = v && v.target > 0 ? Math.min(100, Math.round((v.cur / v.target) * 100)) : null;
    const show = v ? `<div class="metric">
        <div class="row between"><span class="small">📊 ${v.label} <b>${fmtMetric(v, v.cur)}</b>${v.target ? ` / ${fmtMetric(v, v.target)}` : ''}</span>${pct !== null ? `<b class="small">${pct}%</b>` : ''}</div>
        ${pct !== null ? `<div class="bar thin" style="margin-top:4px"><i style="width:${pct}%"></i></div>` : '<p class="hint">목표 숫자를 적어 주세요.</p>'}
        ${pct === 100 && !pk.done ? `<button class="btn sm" style="margin-top:6px" data-act="peak-toggle" data-id="${pk.id}">🎉 목표 숫자 도달! 넘었다고 체크</button>` : ''}
      </div>` : '';
    if (pk.done) return show;
    return `${show}<details class="metric-set" data-peak-details="${pk.id}" ${openMetric === pk.id || (m.type && !(v && v.target) && m.type !== 'debt') ? 'open' : ''}><summary>📊 숫자로 재기${m.type ? ' · 바꾸기' : ''}</summary>
      <select data-peak="${pk.id}" data-field="metric.type">${Object.entries(METRICS).map(([k, l]) => `<option value="${k}" ${(m.type || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${m.type && m.type !== 'debt' ? `<div class="row" style="margin-top:6px">
        ${m.type === 'manual' ? `<input data-peak="${pk.id}" data-field="metric.current" value="${esc(m.current ?? '')}" inputmode="decimal" placeholder="지금 (예: 35)" style="flex:1;min-width:90px">` : ''}
        <input data-peak="${pk.id}" data-field="metric.target" value="${m.target ? (m.type === 'manual' ? m.target : num(m.target).toLocaleString('ko-KR')) : ''}" placeholder="${m.type === 'manual' ? '목표 (예: 100)' : '목표 금액 (예: 300만)'}" ${m.type === 'manual' ? 'inputmode="decimal"' : 'enterkeyhint="done"'} style="flex:1;min-width:110px">
        ${m.type === 'manual' ? `<input data-peak="${pk.id}" data-field="metric.unit" value="${esc(m.unit || '')}" placeholder="단위 (명)" style="width:84px;flex:none">` : ''}
      </div>` : ''}
      ${m.type === 'debt' ? '<p class="hint">돈 탭의 빚 챌린지 기록으로 자동 계산돼요.</p>' : ''}
    </details>`;
  }

  /* ---------- 📈 한 달 점검 ---------- */
  const SCORES = [[0, '제자리'], [25, '조금'], [50, '절반쯤'], [75, '많이'], [100, '훌쩍']];
  let ckDraft = null;   // 점검 입력 중인 값
  let openMetric = null; // 숫자 설정을 펼쳐 둔 작은 산
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
        ${cs && st.id === cs.id ? `<button class="icon-btn" data-act="peak-today" data-id="${pk.id}" data-sid="${st.id}" aria-label="오늘 할 일로" title="오늘 할 일로">📌</button>` : ''}
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
    const cur = currentPeak(h);
    const late = (pk) => !pk.done && pk.due && pk.due < today().slice(0, 7);
    return `<div class="peaks">
      <div class="row between"><h3>⛰️ 작은 산</h3>${list.length ? `<span class="muted small">${done}/${list.length} 넘음 · ${pct}%</span>` : ''}</div>
      ${list.length ? `<div class="bar thin" style="margin-top:6px"><i style="width:${pct}%"></i></div>` : ''}
      ${list.length > 1 ? '<p class="hint" style="margin-top:4px">▲▼ 로 오를 순서를 바꿀 수 있어요. 맨 위의 안 넘은 산이 \'지금 여기\'예요.</p>' : ''}
      ${list.map((pk, i) => `<div class="peak ${pk.done ? 'done' : ''} ${cur && pk.id === cur.id ? 'here' : ''}">
        <div class="peak-top">
          <input type="checkbox" data-act="peak-toggle" data-id="${pk.id}" ${pk.done ? 'checked' : ''} aria-label="넘었어요">
          <textarea class="peak-text grow-text" rows="1" data-peak="${pk.id}" data-field="text" aria-label="작은 산">${esc(pk.text)}</textarea>
          <span class="mv-pair"><button class="mv" data-act="peak-move" data-id="${pk.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="mv" data-act="peak-move" data-id="${pk.id}" data-n="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span>
          <button class="icon-btn" data-act="peak-del" data-id="${pk.id}" aria-label="삭제">✕</button>
        </div>
        <div class="peak-meta">
          ${cur && pk.id === cur.id ? '<span class="tag here-tag">🚶 지금 여기</span>' : ''}
          ${pk.done ? `<span class="tag done-tag">🚩 ${ym(pk.doneDate)} 정상 도착</span>` : `<label class="due ${late(pk) ? 'late' : ''}">목표 <input type="month" data-peak="${pk.id}" data-field="due" value="${esc(pk.due || '')}"></label>`}
        </div>
        ${stepsBlock(pk)}
        ${metricBlock(pk)}
      </div>`).join('')}
      <form class="add-task" data-form="peak" data-h="${h}" style="margin-top:10px">
        <input name="peak" placeholder="${list.length ? '다음 작은 산 추가' : '목표까지 가는 중간 지점 (예: 웹소설 영상화 되기)'}" autocomplete="off">
        <button class="btn">추가</button>
      </form>
    </div>`;
  }

  /* ---------- 공통 조각 ---------- */
  const goalName = (id) => (state.vision.goals.find((g) => g.id === id) || {}).text;

  function survivalCard(compact) {
    const s = survival();
    if (!s.need) {
      return `<section class="card">
        <div class="card-head"><h2>🛟 이번 달 생존선</h2></div>
        <p class="muted">고정비를 적으면 이번 달에 꼭 벌어야 할 돈이 나와요.</p>
        <button class="btn sm" data-act="go" data-to="money" style="margin-top:10px">고정비 적으러 가기 →</button>
      </section>`;
    }
    const ok = s.earned >= s.need;
    return `<section class="card">
      <div class="card-head"><h2>🛟 이번 달 생존선</h2><span class="muted">${s.daysLeft}일 남음</span></div>
      <div class="row between"><div><div class="mid">${man(s.earned)} <span class="muted">/ ${man(s.need)}</span></div></div></div>
      <div class="bar ${ok ? '' : 'fire'}" style="margin-top:8px"><i style="width:${pct(s.earned, s.need)}%"></i></div>
      <p class="hint">${ok ? '🎉 생존선 넘었어요! 이제부터 버는 돈은 빚과 미래에 쓸 수 있어요.' : `앞으로 <b>${man(s.gap)}</b> 더 필요해요 · 하루 평균 <b>${man(s.perDay)}</b>`}</p>
      ${compact ? '' : `<p class="hint">고정비 ${man(s.fixed)} + 이번 달 빚 상환 목표 ${man(s.debtMonthly)}</p>`}
    </section>`;
  }

  /* ---------- 오늘 ---------- */
  let newCat = 'now';
  let pendingPeak = null; // '오늘 할 일로' 누른 작은 산
  let pendingStep = null; // 그 산의 작은 목표
  let newGoal = '';

  function renderToday() {
    const t = today();
    const now = new Date();
    const hour = now.getHours();
    const inSlot = hour >= 14 && hour < 17;
    const slot = state.slots[t] || { text: '', done: false };
    const v = state.vision;
    const goals = v.goals.filter((g) => !g.done);
    const weekItems = v.week.items.filter(Boolean);

    const steps = [
      { ok: state.fixed.length > 0, text: '매달 나가는 고정비 적기', to: 'money' },
      { ok: !!state.debt.targetDate, text: '빚을 언제까지 0으로 만들지 정하기', to: 'money' },
      { ok: v.goals.length > 0, text: '1년 목표 하나 적기', to: 'vision' },
    ];
    const showOnboard = !state.onboardDismissed && steps.some((s) => !s.ok);

    const visible = state.tasks.filter((x) => !x.done || x.doneDate === t);
    const fireOpen = visible.filter((x) => x.cat === 'now' && !x.done).length;
    const fireDoneToday = visible.filter((x) => x.cat === 'now' && x.done).length;

    const lane = (cat) => {
      const items = visible.filter((x) => x.cat === cat).sort((a, b) => a.done - b.done);
      const dim = cat !== 'now' && cat !== 'etc' && fireOpen > 0 && fireDoneToday === 0;
      return `<div class="lane ${dim ? 'dim' : ''}">
        <div class="lane-head"><h3>${CATS[cat].icon} ${CATS[cat].label}</h3><span class="muted">${CATS[cat].hint}</span></div>
        ${items.length ? items.map(taskRow).join('') : `<div class="lane-empty">${cat === 'now' ? '오늘 돈으로 이어질 일을 하나 적어 보세요.' : '비어 있어요'}</div>`}
      </div>`;
    };

    return `<div class="stack">
      ${showOnboard ? `<section class="card accent">
        <div class="card-head"><h2>👋 처음 시작하기</h2><button class="icon-btn" data-act="dismiss-onboard" aria-label="닫기">✕</button></div>
        <p class="muted">세 가지만 하면 준비 끝이에요. 5분이면 돼요.</p>
        <ol class="steps">${steps.map((s, i) => `<li class="${s.ok ? 'ok' : ''}"><span class="dot">${s.ok ? '✓' : i + 1}</span><span class="grow">${s.text}</span>${s.ok ? '' : `<button class="btn sm" data-act="go" data-to="${s.to}">하기</button>`}</li>`).join('')}</ol>
      </section>` : ''}

      ${isStandalone() && isEmptyState() ? `<section class="card accent"><h2>사파리에서 쓰던 기록이 안 보이나요?</h2>
        <p class="muted" style="margin-top:4px">아이폰은 홈 화면 앱과 사파리가 기록을 따로 저장해요. 지워진 게 아니에요. 사파리에서 <b>설정 → 📋 기록 복사하기</b>를 누른 뒤, 여기서 붙여넣으면 옮겨져요.</p>
        <button class="btn primary sm" style="margin-top:8px" data-act="go-transfer">옮기는 방법 보기</button></section>` : ''}
      ${checkMonth() && !checkinFor(checkMonth()) && allPeaks().length ? `<section class="card accent"><div class="row between"><div><h2>📈 ${Number(checkMonth().slice(5))}월 점검할 때예요</h2><p class="muted">한 달 동안 산을 얼마나 올랐는지 1분만.</p></div><button class="btn primary sm" data-act="go-checkin">점검하기</button></div></section>` : ''}
      ${now.getDay() === 0 ? `<section class="card accent"><div class="row between"><div><h2>📝 오늘은 주간 리뷰 날</h2><p class="muted">5분만 써도 다음 주가 달라져요.</p></div><button class="btn primary sm" data-act="go" data-to="review">리뷰하기</button></div></section>` : ''}

      ${(goals.length || weekItems.length || currentPeak('y1')) ? `<section class="card compass">
        <div class="card-head"><h2>🧭 나침반</h2><button class="btn sm ghost" data-act="go" data-to="vision">비전 보기</button></div>
        ${goals.length ? `<p class="muted small">1년 목표</p><ul>${goals.map((g) => `<li class="compass-goal">${esc(g.text)}</li>`).join('')}</ul>` : ''}
        ${currentPeak('y1') ? `<p class="muted small" style="margin-top:8px">⛰️ 지금 오르는 산 (1년)</p><ul><li class="compass-goal">${esc(currentPeak('y1').text)}${curStep(currentPeak('y1')) ? ` <span class="muted small">→ ${esc(curStep(currentPeak('y1')).text)}</span>` : ''}</li></ul>` : ''}
        ${weekItems.length ? `<p class="muted small" style="margin-top:8px">이번 주 핵심</p><ul>${weekItems.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      </section>` : ''}

      <section class="card ${inSlot && !slot.done ? 'slot-live' : ''}">
        <div class="card-head"><h2>⏰ 2시~5시, 딱 한 가지</h2><span class="muted">${inSlot ? '<b style="color:var(--accent)">지금이 그 시간!</b>' : hour < 14 ? '미리 정해두기' : '오늘의 기록'}</span></div>
        ${slot.text && !slotEditing
          ? `<div class="task ${slot.done ? 'done' : ''}" style="margin-top:0">
              <input type="checkbox" data-act="slot-done" ${slot.done ? 'checked' : ''} aria-label="끝냈어요">
              <span class="t"><b>${esc(slot.text)}</b></span>
              <button class="icon-btn" data-act="slot-edit" aria-label="고치기">✎</button>
            </div>
            <p class="hint">${slot.done ? '👏 해냈어요. 오후를 지켜냈어요.' : '휴대폰은 멀리, 25분 타이머 켜고 이것만.'}</p>`
          : `<form class="add-task" data-form="slot">
              <input name="slot" value="${esc(slot.text)}" placeholder="예: 외주 원고 1편 초안 끝내기" autocomplete="off">
              <button class="btn fire">정하기</button>
            </form>
            <p class="hint">점심 먹고 늘어지기 쉬운 시간이에요. 아침에 미리 한 가지만 정해두세요.</p>`}
      </section>

      ${survivalCard(true)}

      ${routineCard()}

      <section class="card">
        <div class="card-head"><h2>✅ 오늘 할 일</h2><span class="muted">생계 일부터</span></div>
        ${pendingPeak && findPeak(pendingPeak) ? `<div class="peak-link">⛰️ <b>${esc(findPeak(pendingPeak).text)}</b>${pendingStep && findStep(findPeak(pendingPeak), pendingStep) ? ` › ${esc(findStep(findPeak(pendingPeak), pendingStep).text)}` : ''}을(를) 위한 일로 넣어요. 끝내면 작은 목표도 함께 체크돼요. 종류를 고르고 <b>추가</b>를 누르세요. <button class="btn sm ghost" data-act="peak-unlink">연결 빼기</button></div>` : ''}
        <form class="add-task" data-form="task">
          <input name="task" placeholder="할 일을 적고 Enter" autocomplete="off" id="task-input">
          <button class="btn primary">추가</button>
        </form>
        <div class="chips" style="margin-top:10px" role="radiogroup" aria-label="종류">
          ${Object.entries(CATS).map(([k, c]) => `<label class="chip-radio"><input type="radio" name="cat" value="${k}" data-act="pick-cat" ${newCat === k ? 'checked' : ''}><span>${c.icon} ${c.label}</span></label>`).join('')}
        </div>
        ${goals.length ? `<div class="row" style="margin-top:10px">
          <span class="muted small">어느 1년 목표를 위한 일?</span>
          <select data-act="pick-goal" style="flex:1;min-width:160px">
            <option value="">선택 안 함</option>
            ${goals.map((g) => `<option value="${g.id}" ${newGoal === g.id ? 'selected' : ''}>${esc(g.text)}</option>`).join('')}
          </select>
        </div>` : ''}
        ${fireOpen > 0 && fireDoneToday === 0 ? `<div class="lock-note">🔥 생계 일 하나를 먼저 끝내면 나머지 칸이 밝아져요.</div>` : ''}
        ${Object.keys(CATS).map(lane).join('')}
      </section>
    </div>`;
  }

  /* ---------- 🔁 매주 루틴 ---------- */
  const weekDays = (ws = weekStart()) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const routineCount = (r, ws = weekStart()) => { const w = weekDays(ws); return (r.days || []).filter((d) => w.includes(d)).length; };
  let routineEditing = false;

  function routineCard() {
    const list = state.routines;
    const t = today();
    const days = weekDays();
    const full = list.filter((r) => routineCount(r) >= r.perWeek).length;
    return `<section class="card routine">
      <div class="card-head"><h2>🔁 매주 루틴</h2><span class="muted">${list.length ? `이번 주 ${full}/${list.length} 채움` : '매주 하는 습관'}</span></div>
      ${list.length ? `<div class="rt-head">${days.map((d) => `<span class="${d === t ? 'today' : ''}">${DAYS[parseYmd(d).getDay()]}</span>`).join('')}</div>` : ''}
      ${list.map((r) => {
        const c = routineCount(r);
        const ok = c >= r.perWeek;
        return `<div class="rt-row ${ok ? 'ok' : ''}">
          <div class="rt-name">${routineEditing
            ? `<input data-routine="${r.id}" value="${esc(r.text)}" aria-label="루틴 이름">`
            : `<b>${esc(r.text)}</b>`}<span class="muted small rt-count">${ok ? '✓ ' : ''}${c}/${r.perWeek}회</span></div>
          ${days.map((d) => `<button class="rt-day ${(r.days || []).includes(d) ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="rt-tick" data-id="${r.id}" data-d="${d}" ${d > t ? 'disabled' : ''} aria-label="${shortDate(d)} ${esc(r.text)}">${(r.days || []).includes(d) ? '✓' : ''}</button>`).join('')}
          ${routineEditing ? `<span class="rt-tools">
            <select data-routine-per="${r.id}" aria-label="주 몇 회">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${r.perWeek === n ? 'selected' : ''}>주 ${n}회</option>`).join('')}</select>
            <button class="btn sm" data-act="rt-move" data-id="${r.id}" data-n="-1" aria-label="위로">▲ 위로</button>
            <button class="btn sm" data-act="rt-move" data-id="${r.id}" data-n="1" aria-label="아래로">▼ 아래로</button>
            <button class="btn sm ghost" data-act="rt-del" data-id="${r.id}" aria-label="삭제">✕ 지우기</button></span>` : ''}
        </div>`;
      }).join('')}
      ${!list.length ? '<p class="muted small">운동 주 3회, 블로그 주 1회, 강아지 목욕처럼 매주 챙길 습관을 넣어 두세요. 한 날을 누르면 ✓ 표시되고, 월요일마다 새로 시작해요.</p>' : ''}
      <form class="add-task" data-form="routine" style="margin-top:10px">
        <input name="routine" placeholder="루틴 (예: 운동)" autocomplete="off" style="flex:2">
        <select name="per" aria-label="주 몇 회" style="flex:1;min-width:84px">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === 3 ? 'selected' : ''}>주 ${n}회</option>`).join('')}</select>
        <button class="btn">추가</button>
      </form>
      ${list.length ? `<button class="btn sm ghost" style="margin-top:8px" data-act="rt-edit">${routineEditing ? '✓ 고치기 끝' : '✎ 루틴 고치기 · 순서 바꾸기'}</button>` : ''}
    </section>`;
  }

  function taskRow(x) {
    const t = today();
    const days = x.created && x.created < t ? Math.round((parseYmd(t) - parseYmd(x.created)) / 864e5) : 0;
    const g = x.goalId && goalName(x.goalId);
    const pk = x.peakId && findPeak(x.peakId);
    return `<div class="task ${x.done ? 'done' : ''}">
      <input type="checkbox" data-act="toggle-task" data-id="${x.id}" ${x.done ? 'checked' : ''} aria-label="완료">
      <span class="t">${esc(x.text)}${g ? `<span class="tag">🎯 ${esc(g)}</span>` : ''}${pk ? `<span class="tag">⛰️ ${esc(pk.text)}${findStep(pk, x.stepId) ? ` › ${esc(findStep(pk, x.stepId).text)}` : ''}</span>` : ''}${days && !x.done ? `<span class="tag old">${days}일째</span>` : ''}</span>
      <button class="icon-btn" data-act="del-task" data-id="${x.id}" aria-label="삭제">✕</button>
    </div>`;
  }
  let slotEditing = false;

  /* ---------- 돈 ---------- */
  function renderMoney() {
    const start = num(state.debt.start);
    const paid = debtPaid();
    const left = debtLeft();
    const plan = debtPlan();
    const unit = start / 10;
    const blocks = Array.from({ length: 10 }, (_, i) => {
      const f = unit > 0 ? Math.max(0, Math.min(1, (paid - i * unit) / unit)) : 0;
      return `<i style="--f:${f * 100}%"></i>`;
    }).join('');

    const mk = monthKey();
    const monthIncome = state.incomes.filter((i) => monthKey(i.date) === mk);
    const bySrc = SOURCES.map((s) => ({ s, v: sum(monthIncome.filter((i) => i.source === s)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const maxSrc = bySrc.length ? bySrc[0].v : 0;
    const recentIncome = [...state.incomes].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 8);
    const payments = [...state.debt.payments].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 8);
    const fixedTotal = sum(state.fixed);

    return `<div class="stack">
      <div class="big-actions">
        <button class="btn good" data-act="open-amount" data-kind="income">💰 돈 들어왔어요</button>
        <button class="btn fire" data-act="open-amount" data-kind="pay">✅ 빚 갚았어요</button>
      </div>

      <section class="card">
        <div class="card-head"><h2>🏔️ 빚 ${man(start)} → 0 챌린지</h2><span class="muted">${Math.round(pct(paid, start))}%</span></div>
        <p class="muted small">남은 빚</p>
        <div class="big">${left <= 0 ? '0원 🎉' : won(left)}</div>
        <div class="blocks" aria-label="칸 하나 = ${man(unit)}">${blocks}</div>
        <p class="hint">칸 하나 = ${man(unit)} · 지금까지 ${man(paid)} 갚았어요</p>

        <label class="field"><span>언제까지 0으로 만들까요?</span>
          <input type="date" data-bind="debt.targetDate" data-rerender value="${esc(state.debt.targetDate)}" min="${today()}">
        </label>
        ${state.debt.targetDate && left > 0 ? `<div class="stat" style="margin-top:10px">
          <b>매달 ${man(plan.monthly)}씩</b>
          <span>${plan.months}개월 동안 갚으면 ${shortDate(state.debt.targetDate)}에 0원이 돼요</span>
          <div class="bar thin" style="margin-top:8px"><i style="width:${pct(plan.paidThisMonth, plan.monthly)}%"></i></div>
          <span>이번 달 ${man(plan.paidThisMonth)} / ${man(plan.monthly)}</span>
        </div>` : ''}
        ${!state.debt.targetDate ? `<p class="hint">날짜를 정하면 매달 얼마씩 갚으면 되는지 계산해 드려요. 예: 1년 뒤</p>` : ''}
      </section>

      ${survivalCard(false)}

      <section class="card">
        <div class="card-head"><h2>💰 이번 달 들어온 돈</h2><span class="muted">${man(sum(monthIncome))}</span></div>
        ${bySrc.length ? bySrc.map((x) => `<div class="src-row"><span>${esc(x.s)}</span><div class="bar thin"><i style="width:${pct(x.v, maxSrc)}%"></i></div><b>${man(x.v)}</b></div>`).join('')
          : '<p class="empty">아직 기록이 없어요. 돈이 들어오면 위의 💰 버튼을 눌러 주세요.<br>어떤 일이 실제로 돈이 되는지 보이기 시작해요.</p>'}
        ${recentIncome.length ? `<h3 style="margin-top:16px">최근 기록</h3><ul class="list">${recentIncome.map((i) => `<li><span class="when">${shortDate(i.date)}</span><span class="grow">${esc(i.source)}${i.memo ? ` · <span class="muted">${esc(i.memo)}</span>` : ''}</span><span class="amt">${man(i.amount)}</span><button class="icon-btn" data-act="del-income" data-id="${i.id}" aria-label="삭제">✕</button></li>`).join('')}</ul>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>📌 매달 나가는 고정비</h2><span class="muted">합계 ${man(fixedTotal)}</span></div>
        ${state.fixed.length ? `<ul class="list">${state.fixed.map((f) => `<li><span class="grow">${esc(f.name)}</span><span class="amt">${won(num(f.amount))}</span><button class="icon-btn" data-act="del-fixed" data-id="${f.id}" aria-label="삭제">✕</button></li>`).join('')}</ul>` : '<p class="muted small">월세, 통신비, 강아지 사료처럼 매달 꼭 나가는 돈을 적어 주세요.</p>'}
        <form data-form="fixed" style="margin-top:12px">
          <div class="chips" style="margin-bottom:8px">${FIXED_PRESETS.filter((p) => !state.fixed.some((f) => f.name === p)).map((p) => `<button type="button" class="chip" data-act="preset" data-name="${esc(p)}">${esc(p)}</button>`).join('')}</div>
          <div class="row">
            <input name="name" placeholder="항목" autocomplete="off" style="flex:1;min-width:110px" id="fixed-name">
            <input name="amount" placeholder="금액 (예: 50만)" inputmode="text" enterkeyhint="done" autocomplete="off" data-money style="flex:1;min-width:110px">
            <button class="btn primary">추가</button>
          </div>
        </form>
      </section>

      ${payments.length ? `<section class="card">
        <div class="card-head"><h2>✅ 상환 기록</h2></div>
        <ul class="list">${payments.map((p) => `<li><span class="when">${shortDate(p.date)}</span><span class="grow muted">${esc(p.memo || '상환')}</span><span class="amt">${man(p.amount)}</span><button class="icon-btn" data-act="del-pay" data-id="${p.id}" aria-label="삭제">✕</button></li>`).join('')}</ul>
      </section>` : ''}
    </div>`;
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
    const climbing = HORIZONS.map(([h, label]) => [label, currentPeak(h)]).filter(([, pk]) => pk);

    return `<div class="stack">
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
        ${v.goals.length ? v.goals.map((g) => `<div class="goal ${g.done ? 'done' : ''}">
          <input type="checkbox" data-act="toggle-goal" data-id="${g.id}" ${g.done ? 'checked' : ''} aria-label="달성">
          <span class="t">${esc(g.text)}</span>
          <span class="meta">${doneCount(g.id) ? `연결된 일 ${doneCount(g.id)}개 완료` : ''}</span>
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
          <span class="row">
            <button class="btn sm ghost" data-act="week-shift" data-n="-7" aria-label="이전 주">←</button>
            <button class="btn sm ghost" data-act="week-shift" data-n="7" aria-label="다음 주" ${ws >= cur ? 'disabled' : ''}>→</button>
          </span>
        </div>
        <div class="grid2">
          <div class="stat"><b>${man(st.income)}</b><span>💰 들어온 돈</span></div>
          <div class="stat"><b>${man(st.paid)}</b><span>✅ 갚은 빚</span></div>
          <div class="stat"><b>${st.fire}개</b><span>🔥 끝낸 생계 일</span></div>
          <div class="stat"><b>${st.slotDays}/7일</b><span>⏰ 2~5시 지킨 날</span></div>
          <div class="stat"><b>${st.done}개</b><span>✅ 끝낸 일 전체</span></div>
          <div class="stat"><b>${st.done ? Math.round((st.linked / st.done) * 100) : 0}%</b><span>🎯 목표와 연결된 일</span></div>
          <div class="stat"><b>${st.peaks}개</b><span>⛰️ 넘은 작은 산</span></div>
          <div class="stat"><b>${st.steps ?? 0}개</b><span>🪜 이룬 작은 목표</span></div>
          <div class="stat"><b>${st.routine ?? '-'}</b><span>🔁 채운 루틴</span></div>
        </div>
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
        ${past.map((p) => `<details class="review"><summary>${shortDate(p.week)} 주 · 💰 ${man(p.stats?.income || 0)} · 🔥 ${p.stats?.fire || 0}개</summary>
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
          <li><b>처음 한 번</b>: 돈 탭에서 고정비와 빚 목표 날짜, 비전 탭에서 1년 목표를 적어요.</li>
          <li><b>매일 아침</b>: 오늘 탭에서 '2시~5시 한 가지'를 정하고, 🔥 생계 일부터 적어요.</li>
          <li><b>돈이 오가면</b>: 돈 탭의 💰 / ✅ 버튼을 눌러 기록해요. 생존선과 빚 게이지가 자동으로 움직여요.</li>
          <li><b>일요일</b>: 주간 리뷰 5분. 다음 주 핵심 3개가 비전 탭으로 넘어가요.</li>
          <li><b>한 달에 한 번</b>: 비전 탭을 다시 읽고 이번 달 목표를 적어요.</li>
        </ol>
      </section>

      <section class="card">
        <div class="card-head"><h2>🏔️ 빚 시작 금액</h2></div>
        <input data-bind="debt.start" data-type="money" data-money inputmode="text" enterkeyhint="done" value="${num(state.debt.start).toLocaleString('ko-KR')}">
        <p class="hint">숫자로 적거나 "500만"처럼 적어도 돼요.</p>
        <p class="hint">챌린지를 시작할 때의 총 빚이에요. 새로 생긴 빚이 있으면 여기서 늘려 주세요.</p>
      </section>

      <section class="card" id="transfer">
        <div class="card-head"><h2>📱 사파리 ↔ 홈 화면 앱 기록 옮기기</h2></div>
        <p class="muted small">아이폰은 <b>사파리</b>와 <b>홈 화면에 추가한 앱</b>이 기록을 따로 저장해요. 한쪽에 쓴 기록이 다른 쪽에서 안 보이면 이렇게 옮기세요.</p>
        <ol class="guide-steps">
          <li>기록이 <b>있는 쪽</b>(예: 사파리)에서 이 화면의 <b>📋 기록 복사하기</b>를 눌러요.</li>
          <li>기록이 <b>없는 쪽</b>(예: 홈 화면 앱)을 열고 설정 → 아래 칸을 꾹 눌러 <b>붙여넣기</b> → <b>📥 가져오기</b>.</li>
        </ol>
        <button class="btn primary block" data-act="copy-state" style="margin-top:10px">📋 기록 복사하기</button>
        <textarea id="paste-state" placeholder="여기를 꾹 눌러 붙여넣기" style="margin-top:10px;min-height:70px"></textarea>
        <button class="btn block" data-act="paste-import" style="margin-top:8px">📥 붙여넣은 기록 가져오기</button>
      </section>

      <section class="card">
        <div class="card-head"><h2>💾 백업</h2></div>
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
  const TABS = { today: renderToday, money: renderMoney, vision: renderVision, review: renderReview, settings: renderSettings };
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
    document.querySelectorAll('.grow-text').forEach(autoGrow);
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
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.dataset && d.dataset.peakDetails) openMetric = d.open ? d.dataset.peakDetails : (openMetric === d.dataset.peakDetails ? null : openMetric);
  }, true);
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

  /* ---------- 금액 입력 창 ---------- */
  function openAmount(kind) {
    const dlg = $('#dlg');
    const isIncome = kind === 'income';
    dlg.innerHTML = `<form class="dlg" data-form="amount" data-kind="${kind}">
      <h2>${isIncome ? '💰 돈 들어왔어요' : '✅ 빚 갚았어요'}</h2>
      <p class="muted small">${isIncome ? '작은 돈도 기록하면 어떤 일이 돈이 되는지 보여요.' : `남은 빚 ${won(debtLeft())}`}</p>
      <label class="field"><span>금액</span>
        <input name="amount" inputmode="text" enterkeyhint="done" autocomplete="off" placeholder="예: 300000 또는 30만" data-money required>
        <small class="amount-preview"></small>
      </label>
      <div class="chips quick">${[10000, 50000, 100000, 500000].map((v) => `<button type="button" class="chip" data-add="${v}">+${man(v)}</button>`).join('')}</div>
      ${isIncome ? `<div class="field"><span>어디서 들어온 돈인가요?</span><div class="chips">${SOURCES.map((s, i) => `<label class="chip-radio"><input type="radio" name="source" value="${esc(s)}" ${i === 0 ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div></div>` : ''}
      <label class="field"><span>날짜</span><input type="date" name="date" value="${today()}" max="${today()}"></label>
      <label class="field"><span>메모 (선택)</span><input name="memo" autocomplete="off" placeholder="${isIncome ? '예: 9월 원고료' : '예: 카드값 일부'}"></label>
      <div class="row end"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">저장</button></div>
    </form>`;
    openDlg(dlg);
    setTimeout(() => dlg.querySelector('[name=amount]').focus(), 30);
  }

  function updatePreview(input) {
    const p = input.closest('.field')?.querySelector('.amount-preview');
    const v = parseMoney(input.value);
    if (p) p.textContent = v ? `= ${won(v)} (${man(v)})` : '';
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tabs button');
    if (tabBtn) return go(tabBtn.dataset.tab);

    if (e.target.closest('[data-close]')) return closeDlg();
    const add = e.target.closest('[data-add]');
    if (add) {
      const input = $('#dlg [name=amount]');
      input.value = (parseMoney(input.value) + num(add.dataset.add)).toLocaleString('ko-KR');
      updatePreview(input);
      return;
    }

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
        if (x.done) toast(x.cat === 'now' ? '🔥 생계 일 하나 끝! 잘했어요' : '✅ 끝!');
        // 작은 목표에 연결된 일을 끝내면 그 작은 목표도 체크
        const pk = x.peakId && findPeak(x.peakId), st = findStep(pk, x.stepId);
        if (x.done && st && !st.done) { st.done = true; st.doneDate = today(); if (!pk.done) toast(`🪜 작은 목표 "${st.text}" 이뤘어요`); syncPeakDone(pk); }
        break;
      }
      case 'del-task': state.tasks = state.tasks.filter((t) => t.id !== id); break;
      case 'peak-toggle': {
        const pk = findPeak(id);
        if (!pk) return;
        pk.done = !pk.done;
        pk.doneDate = pk.done ? today() : '';
        if (pk.done) toast('🎉 작은 산 하나 넘었어요! 여기까지 왔어요');
        break;
      }
      case 'peak-del': {
        if (!confirm('이 작은 산을 지울까요?')) return;
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
        if (!pk || !confirm('이 작은 목표를 지울까요?')) return;
        pk.steps = pk.steps.filter((x) => x.id !== el.dataset.sid);
        state.tasks.forEach((t) => { if (t.stepId === el.dataset.sid) t.stepId = null; });
        syncPeakDone(pk);
        break;
      }
      case 'rt-tick': {
        const r = state.routines.find((x) => x.id === id);
        const d = el.dataset.d;
        if (!r || d > today()) return;
        const had = r.days.includes(d);
        r.days = had ? r.days.filter((x) => x !== d) : [...r.days, d];
        r.days = r.days.filter((x) => x >= addDays(weekStart(), -7 * 26)); // 반년 치만 보관
        if (!had && routineCount(r) === r.perWeek) toast(`🔁 "${r.text}" 이번 주 목표 채웠어요!`);
        break;
      }
      case 'rt-edit': routineEditing = !routineEditing; render(); return;
      case 'rt-move': if (!moveIn(state.routines, id, Number(el.dataset.n))) return; break;
      case 'rt-del': if (!confirm('이 루틴을 지울까요?')) return; state.routines = state.routines.filter((x) => x.id !== id); if (!state.routines.length) routineEditing = false; break;
      case 'peak-push': {
        const pk = findPeak(id);
        if (!pk) return;
        pk.due = addMonths(today().slice(0, 7) > pk.due ? today().slice(0, 7) : pk.due, Number(el.dataset.n));
        toast(`목표를 ${ym(pk.due)}로 다시 잡았어요`);
        break;
      }
      case 'go-transfer': go('settings'); $('#transfer')?.scrollIntoView({ block: 'start' }); return;
      case 'copy-state': {
        const text = TRANSFER_TAG + JSON.stringify(state);
        const done = () => toast('📋 복사했어요. 다른 쪽 설정 화면에 붙여넣으세요');
        const fallback = () => { const ta = $('#paste-state'); ta.value = text; ta.focus(); ta.select(); toast('글자가 선택됐어요. 복사를 눌러 주세요'); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        return;
      }
      case 'paste-import': {
        const raw = ($('#paste-state')?.value || '').trim();
        if (!raw) { toast('먼저 복사한 기록을 붙여넣어 주세요'); return; }
        try {
          const data = JSON.parse(raw.startsWith(TRANSFER_TAG) ? raw.slice(TRANSFER_TAG.length) : raw);
          if (!data || typeof data !== 'object' || !('debt' in data)) throw new Error('bad');
          if (!confirm('지금 이 화면의 기록을 붙여넣은 기록으로 바꿀까요?')) return;
          state = merge(defaultState(), data);
          toast('📥 기록을 옮겼어요');
        } catch (err) { toast('기록을 읽을 수 없어요. 복사한 글 전체를 붙여넣었는지 확인해 주세요'); return; }
        break;
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
      case 'slot-done': {
        const s = state.slots[today()];
        if (s) { s.done = !s.done; if (s.done) toast('⏰ 오후를 지켜냈어요!'); }
        break;
      }
      case 'slot-edit': slotEditing = true; render('[name=slot]'); return;
      case 'open-amount': return openAmount(el.dataset.kind);
      case 'del-income': if (!confirm('이 수입 기록을 지울까요?')) return; state.incomes = state.incomes.filter((i) => i.id !== id); break;
      case 'del-pay': if (!confirm('이 상환 기록을 지울까요?')) return; state.debt.payments = state.debt.payments.filter((p) => p.id !== id); break;
      case 'del-fixed': state.fixed = state.fixed.filter((f) => f.id !== id); break;
      case 'preset': { const n = $('#fixed-name'); n.value = el.dataset.name; n.nextElementSibling.focus(); return; }
      case 'toggle-goal': {
        const g = state.vision.goals.find((x) => x.id === id);
        if (g) { g.done = !g.done; if (g.done) toast('🎯 1년 목표 달성! 대단해요'); }
        break;
      }
      case 'del-goal': if (!confirm('이 목표를 지울까요?')) return; state.vision.goals = state.vision.goals.filter((g) => g.id !== id); break;
      case 'week-shift': reviewWeek = addDays(reviewWeek, num(el.dataset.n)); render(); return;
      case 'export': return exportData();
      case 'reset':
        if (!confirm('정말 모든 기록을 지울까요? 되돌릴 수 없어요.')) return;
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
    if (el.dataset.peak && el.dataset.field?.startsWith('metric.')) {
      const pk = findPeak(el.dataset.peak);
      if (!pk) return;
      const m = (pk.metric = pk.metric || {});
      const key = el.dataset.field.slice(7);
      openMetric = pk.id;
      if (key === 'type') { m.type = el.value; if (m.type === 'income_total' && !m.since) m.since = today(); }
      else if (key === 'target') m.target = m.type === 'manual' ? num(el.value) : parseMoney(el.value);
      else if (key === 'current') m.current = num(el.value);
      else m[key] = el.value.trim();
      save(); render();
      return;
    }
    if (el.dataset.peak && el.dataset.field === 'due') {
      const pk = findPeak(el.dataset.peak);
      if (pk) { pk.due = el.value; save(); render(); }
      return;
    }
    if (el.dataset.routinePer) {
      const r = state.routines.find((x) => x.id === el.dataset.routinePer);
      if (r) { r.perWeek = num(el.value) || 1; save(); render(); }
      return;
    }
    if (el.dataset.act === 'import') return importData(el.files[0]);
    if (el.dataset.bind && el.hasAttribute('data-rerender')) {
      setPath(el.dataset.bind, el.value);
      save();
      render();
    }
  });

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
  document.addEventListener('focusin', (e) => {
    if (!isTyping(e.target)) return;
    if (viewH() > fullH) fullH = viewH();
    setTimeout(syncTyping, 350);
    setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* 무시 */ } }, 300);
  });
  document.addEventListener('focusout', () => setTimeout(syncTyping, 100));
  if (vv) vv.addEventListener('resize', syncTyping);
  window.addEventListener('resize', syncTyping);
  window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(() => { fullH = 0; syncTyping(); }, 400); });
  // 혹시라도 메뉴가 숨겨진 채 남아 있으면, 화면을 만지거나 스크롤할 때 다시 확인
  document.addEventListener('touchstart', () => { if (document.body.classList.contains('typing')) setTimeout(syncTyping, 50); }, { passive: true });
  document.addEventListener('scroll', () => { if (document.body.classList.contains('typing')) syncTyping(); }, { passive: true });
  document.addEventListener('visibilitychange', syncTyping);
  // 한글 조합이 끝난 뒤 금액 칸 정리
  document.addEventListener('compositionend', (e) => {
    if (e.target.hasAttribute?.('data-money')) { formatMoneyInput(e.target, false); updatePreview(e.target); }
  });

  // 긴 제목도 잘리지 않게 글 길이만큼 칸 높이를 늘림
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
  // 제목 칸에서 Enter는 줄바꿈 대신 입력 끝내기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.classList?.contains('grow-text')) { e.preventDefault(); e.target.blur(); }
  });

  let bindTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList.contains('grow-text')) { el.value = el.value.replace(/\n/g, ' '); autoGrow(el); }
    if (el.hasAttribute('data-money')) { formatMoneyInput(el, e.isComposing); updatePreview(el); }
    if (el.dataset.step) {
      const st = findStep(findPeak(el.dataset.peak), el.dataset.step);
      if (st) { st.text = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.routine) {
      const r = state.routines.find((x) => x.id === el.dataset.routine);
      if (r) { r.text = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.peak && el.dataset.field?.startsWith('metric.')) return; // 칸을 떠날 때(change) 저장
    if (el.dataset.peak && el.dataset.field !== 'due') {
      const pk = findPeak(el.dataset.peak);
      if (pk) { pk[el.dataset.field] = el.value; clearTimeout(bindTimer); bindTimer = setTimeout(save, 300); }
      return;
    }
    if (el.dataset.bind && !el.hasAttribute('data-rerender')) {
      setPath(el.dataset.bind, el.dataset.type === 'money' ? parseMoney(el.value) : el.dataset.type === 'num' ? num(el.value) : el.value);
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
      const text = val('task');
      if (!text) return;
      state.tasks.push({ id: uid(), text, cat: newCat, goalId: newGoal || null, peakId: pendingPeak || null, stepId: (pendingPeak && pendingStep) || null, done: false, created: today(), doneDate: null });
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
      state.vision.peaks[h] = [...(state.vision.peaks[h] || []), { id: uid(), text, due: '', steps: [], done: false, doneDate: '' }];
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
    if (kind === 'routine') {
      const text = val('routine');
      if (!text) return;
      state.routines.push({ id: uid(), text, perWeek: Math.min(7, Math.max(1, num(val('per')) || 1)), days: [] });
      save();
      render('[name=routine]');
      return;
    }
    if (kind === 'slot') {
      const text = val('slot');
      if (!text) return;
      const cur = state.slots[today()];
      state.slots[today()] = { text, done: cur ? cur.done : false };
      slotEditing = false;
      toast('⏰ 정했어요. 2시에 이것만 하면 돼요');
    }
    if (kind === 'goal') {
      const text = val('goal');
      if (!text) return;
      state.vision.goals.push({ id: uid(), text, done: false });
      save();
      render('[name=goal]');
      return;
    }
    if (kind === 'fixed') {
      const name = val('name');
      const amount = parseMoney(val('amount'));
      if (!name || !amount) { toast('항목과 금액을 둘 다 적어 주세요'); return; }
      state.fixed.push({ id: uid(), name, amount });
      save();
      render('#fixed-name');
      return;
    }
    if (kind === 'amount') {
      const amount = parseMoney(val('amount'));
      if (amount <= 0) { toast('금액을 적어 주세요'); return; }
      const date = val('date') || today();
      const memo = val('memo');
      if (f.dataset.kind === 'income') {
        state.incomes.push({ id: uid(), amount, date, memo, source: val('source') || '기타' });
        toast(`💰 ${man(amount)} 기록했어요`);
      } else {
        const before = debtLeft();
        state.debt.payments.push({ id: uid(), amount, date, memo });
        toast(before > 0 && debtLeft() <= 0 ? '🎉🎉 빚 0원 달성! 정말 해냈어요!' : `✅ ${man(amount)} 갚았어요. 남은 빚 ${man(debtLeft())}`);
      }
      closeDlg();
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
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !('debt' in data)) throw new Error('bad');
        if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
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

  /* ---------- 시작 ---------- */
  applyPendingWeek();
  rollPeriods();
  save();
  render();

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
