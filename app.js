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
      y10: '', y5: '', y1: '',
      goals: [],
      quarter: { key: '', text: '', prev: '' },
      month: { key: '', text: '', prev: '' },
      week: { key: '', items: ['', '', ''], prev: [] },
    },
    reviews: [],
  });

  function merge(base, data) {
    const out = { ...base, ...data };
    out.debt = { ...base.debt, ...(data.debt || {}) };
    out.vision = { ...base.vision, ...(data.vision || {}) };
    ['quarter', 'month', 'week'].forEach((k) => { out.vision[k] = { ...base.vision[k], ...(out.vision[k] || {}) }; });
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
      linked: done.filter((t) => t.goalId).length,
      slotDays,
    };
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
      const dim = cat !== 'now' && fireOpen > 0 && fireDoneToday === 0;
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

      ${now.getDay() === 0 ? `<section class="card accent"><div class="row between"><div><h2>📝 오늘은 주간 리뷰 날</h2><p class="muted">5분만 써도 다음 주가 달라져요.</p></div><button class="btn primary sm" data-act="go" data-to="review">리뷰하기</button></div></section>` : ''}

      ${(goals.length || weekItems.length) ? `<section class="card compass">
        <div class="card-head"><h2>🧭 나침반</h2><button class="btn sm ghost" data-act="go" data-to="vision">비전 보기</button></div>
        ${goals.length ? `<p class="muted small">1년 목표</p><ul>${goals.map((g) => `<li class="compass-goal">${esc(g.text)}</li>`).join('')}</ul>` : ''}
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

      <section class="card">
        <div class="card-head"><h2>✅ 오늘 할 일</h2><span class="muted">생계 일부터</span></div>
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

  function taskRow(x) {
    const t = today();
    const days = x.created && x.created < t ? Math.round((parseYmd(t) - parseYmd(x.created)) / 864e5) : 0;
    const g = x.goalId && goalName(x.goalId);
    return `<div class="task ${x.done ? 'done' : ''}">
      <input type="checkbox" data-act="toggle-task" data-id="${x.id}" ${x.done ? 'checked' : ''} aria-label="완료">
      <span class="t">${esc(x.text)}${g ? `<span class="tag">🎯 ${esc(g)}</span>` : ''}${days && !x.done ? `<span class="tag old">${days}일째</span>` : ''}</span>
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
    const horizon = (key, cls, label, ph) => `<section class="card horizon ${cls}">
      <span class="label">${label}</span>
      <textarea data-bind="vision.${key}" placeholder="${ph}">${esc(v[key])}</textarea>
    </section>`;

    return `<div class="stack">
      <p class="muted">멀리서부터 적고, 가까운 것부터 실행해요. 적는 즉시 저장돼요.</p>

      ${horizon('y10', 'h10', '10년 후 · ' + (Number(t.slice(0, 4)) + 10), '어디에 살고, 무슨 일을 하고, 누구와 하루를 보내나요? 이루고 싶은 모습을 편하게 적어 보세요.')}
      <div class="down">↓ 그러려면 5년 뒤엔</div>
      ${horizon('y5', 'h5', '5년 후 · ' + (Number(t.slice(0, 4)) + 5), '어떤 사업·작품·수입 구조가 자리 잡혀 있어야 할까요?')}
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
        </div>
      </section>

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

  function render(focusSel) {
    rollPeriods();
    const d = new Date();
    $('#today-label').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
    $('#app').innerHTML = TABS[tab]();
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
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
  const openDlg = (d) => { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
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
        break;
      }
      case 'del-task': state.tasks = state.tasks.filter((t) => t.id !== id); break;
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
    if (el.dataset.act === 'import') return importData(el.files[0]);
    if (el.dataset.bind && el.hasAttribute('data-rerender')) {
      setPath(el.dataset.bind, el.value);
      save();
      render();
    }
  });

  // 휴대폰 키보드가 뜨면 아래 고정 메뉴가 입력칸·버튼을 가리지 않게 숨김
  const isTyping = (el) => el && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select');
  document.addEventListener('focusin', (e) => {
    if (!isTyping(e.target) || !matchMedia('(pointer: coarse)').matches) return; // 터치 화면(폰)에서만
    document.body.classList.add('typing');
    setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* 무시 */ } }, 300);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isTyping(document.activeElement)) document.body.classList.remove('typing'); }, 100);
  });
  // 한글 조합이 끝난 뒤 금액 칸 정리
  document.addEventListener('compositionend', (e) => {
    if (e.target.hasAttribute?.('data-money')) { formatMoneyInput(e.target, false); updatePreview(e.target); }
  });

  let bindTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.hasAttribute('data-money')) { formatMoneyInput(el, e.isComposing); updatePreview(el); }
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
      state.tasks.push({ id: uid(), text, cat: newCat, goalId: newGoal || null, done: false, created: today(), doneDate: null });
      save();
      render('#task-input');
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
