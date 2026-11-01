"""나의 운영실 비서: data/state.json 을 읽어 슬랙으로 보낼 글을 만든다.
사용: python3 -I briefing.py <state.json 경로> morning|evening   (날짜를 바꿔 시험: TODAY=2026-11-02)
"""
import datetime as dt
import json
import os
import sys

KST = dt.timezone(dt.timedelta(hours=9))
DOW = ['월', '화', '수', '목', '금', '토', '일']
path, mode = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'morning')
raw = json.load(open(path, encoding='utf-8'))
S = raw['state']
now = dt.datetime.now(KST)
today = dt.date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else now.date()
iso = today.isoformat()


def D(x):
    return dt.date.fromisoformat(x) if x else None


def sd(d):  # 11/2(월)
    return f'{d.month}/{d.day}({DOW[d.weekday()]})'


cats = {c['id']: c.get('icon', '') for c in S.get('cats', [])}
tasks = S.get('tasks', [])
events = S.get('events', [])


def ev_end(e):
    return D(e.get('end')) if e.get('end') and e['end'] > e['start'] else D(e['start'])


def on_day(d):  # 그날에 걸친 일정
    return sorted([e for e in events if D(e['start']) <= d <= ev_end(e)], key=lambda e: (e.get('time') or '', e['start']))


def is_today_task(x, d):
    return x.get('day') == d.isoformat() or x.get('due') == d.isoformat()


def task_line(x, d):
    tail = ''
    if x.get('due') == d.isoformat():
        tail = ' · 오늘 마감'
    elif x.get('due') and D(x['due']) < d:
        tail = f' · {sd(D(x["due"]))} 마감이 지남'
    elif x.get('day') and D(x['day']) < d:
        tail = f' · {sd(D(x["day"]))}에 하려던 일'
    return f'• {cats.get(x.get("cat"), "")} {x["text"]}{tail}'.replace('•  ', '• ')


def cap(lines, n=8):
    return lines if len(lines) <= n else lines[:n] + [f'… 외 {len(lines) - n}개']


def rule_done(r, d):
    if r['id'] in (S.get('ruleLog', {}).get(d.isoformat()) or []):
        return True
    eps = [e for w in S.get('serials', []) for e in w.get('eps', [])]
    if r.get('kind') == 'reserve':
        return any(e.get('res') == d.isoformat() for e in eps)
    if r.get('kind') == 'out':
        return any(e.get('out') == d.isoformat() and (not r.get('work') or w_id(e) == r['work']) for e in eps)
    return False


def w_id(ep):  # 어느 작품의 화인지
    for w in S.get('serials', []):
        if ep in w.get('eps', []):
            return w['id']
    return None


def rules_of(d):
    return S.get('rules', {}).get(str((d.weekday() + 1) % 7), [])  # 앱은 일요일=0


def footer():
    try:
        u = dt.datetime.fromisoformat(raw['updated'].replace('Z', '+00:00')).astimezone(KST)
        age = (now - u).total_seconds() / 3600
        warn = f' ⚠️ {int(age)}시간 전 기록이에요. 앱을 한 번 열어 주세요.' if age >= 30 else ''
        return f'_앱 기록 기준 {u.month}/{u.day} {u.strftime("%H:%M")}{warn}_'
    except Exception:
        return ''


out = []
open_tasks = [x for x in tasks if not x.get('done')]

if mode == 'morning':
    out.append(f'☀️ **{sd(today)} 아침 브리핑**')
    evs = on_day(today)
    if evs:
        out.append('\n📅 **오늘 일정**')
        for e in evs:
            span = ''
            if ev_end(e) > D(e['start']):
                span = f' (~{sd(ev_end(e))}, {(today - D(e["start"])).days + 1}/{(ev_end(e) - D(e["start"])).days + 1}일째)'
            out.append(f'• {e.get("time") or "종일"} {e["title"]}{span}'.replace('• 종일 ', '• '))
    todays = [x for x in open_tasks if is_today_task(x, today)]
    out.append(f'\n✅ **오늘 할 일** ({len(todays)}개)' if todays else '\n✅ **오늘 할 일** 아직 없어요. 앱에서 정해 보세요.')
    out += cap([task_line(x, today) for x in todays])
    late = [x for x in open_tasks if not is_today_task(x, today) and ((x.get('day') and D(x['day']) < today) or (x.get('due') and D(x['due']) < today))]
    if late:
        out.append(f'\n⏰ **지난 날 못 한 일** ({len(late)}개)')
        out += cap([task_line(x, today) for x in sorted(late, key=lambda x: x.get('due') or x.get('day'))], 6)
    soon = [x for x in open_tasks if x.get('due') and today < D(x['due']) <= today + dt.timedelta(days=5)]
    if soon:
        out.append('\n📌 **곧 마감 (5일 안)**')
        out += cap([f'• {sd(D(x["due"]))} {cats.get(x.get("cat"), "")} {x["text"]}'.replace('  ', ' ') for x in sorted(soon, key=lambda x: x['due'])], 5)
    coming = [e for e in events if today < D(e['start']) <= today + dt.timedelta(days=3)]
    if coming:
        out.append('\n🔜 **다가오는 일정 (3일 안)**')
        out += cap([f'• {sd(D(e["start"]))} {e.get("time") or ""} {e["title"]}'.replace('  ', ' ') for e in sorted(coming, key=lambda e: e['start'])], 4)
    rules = rules_of(today)
    if rules:
        out.append('\n📋 **오늘의 규칙**')
        out += [f'• {"✅" if rule_done(r, today) else "☐"} {r["text"]}' for r in rules]
    month = (S.get('vision', {}).get('month', {}).get('text') or '').strip()
    week = [w for w in S.get('vision', {}).get('week', {}).get('items', []) if w and w.strip()]
    if month or week:
        out.append('')
        if month:
            out.append('🎯 **이번 달** ' + ' / '.join(l.strip('- ').strip() for l in month.splitlines() if l.strip()))
        if week:
            out.append('🎯 **이번 주** ' + ' · '.join(w.strip() for w in week))
    run = [x for x in S.get('experiments', []) if x.get('status') != 'done']
    for x in run[:2]:
        left = (D(x['end']) - today).days if x.get('end') else None
        tag = '' if left is None else (f' (D-{left})' if left > 0 else (' (오늘 끝)' if left == 0 else ' (기간이 지났어요 · 결과를 적어 볼까요?)'))
        out.append(f'🧪 **실험** {x.get("think", "")}{tag}')
else:  # evening
    out.append(f'🌙 **{sd(today)} 저녁 마감**')
    done = [x for x in tasks if x.get('done') and x.get('doneDate') == iso]
    out.append(f'\n✅ **오늘 끝낸 일** ({len(done)}개)' if done else '\n✅ **오늘 끝낸 일** 없음')
    out += cap([f'• {cats.get(x.get("cat"), "")} {x["text"]}'.replace('•  ', '• ') for x in done], 6)
    left = [x for x in open_tasks if is_today_task(x, today)]
    if left:
        out.append(f'\n🔁 **못 끝낸 오늘 일** ({len(left)}개) → 내일로 넘길 건 앱에서 `☀️ 이 날로`')
        out += cap([task_line(x, today) for x in left], 6)
    rules = rules_of(today)
    if rules:
        k = sum(1 for r in rules if rule_done(r, today))
        out.append(f'\n📋 **규칙** {k}/{len(rules)} 지킴' + ('' if k == len(rules) else ' · 못 한 것: ' + ', '.join(r['text'] for r in rules if not rule_done(r, today))))
    tom = today + dt.timedelta(days=1)
    nxt = on_day(tom)
    due_tom = [x for x in open_tasks if x.get('due') == tom.isoformat()]
    if nxt or due_tom:
        out.append(f'\n🔜 **내일 {sd(tom)}**')
        out += [f'• {e.get("time") or "종일"} {e["title"]}'.replace('• 종일 ', '• ') for e in nxt]
        out += [f'• 마감 {cats.get(x.get("cat"), "")} {x["text"]}'.replace('  ', ' ') for x in due_tom]

out.append('')
out.append(footer())
print('\n'.join(out))
