(function () {
  var router = createRouter(SUBWAY_LINES);
  var $ = function (id) { return document.getElementById(id); };
  var inputs = { from: $('from'), to: $('to') };
  var lists = { from: $('from-list'), to: $('to-list') };
  var names = router.stationNames();

  // ---------- 저장(실패해도 앱은 동작) ----------
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- 글자 크기 ----------
  function setScale(s) {
    document.documentElement.style.setProperty('--scale', s);
    document.querySelectorAll('.size button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.scale === s)); });
    save('subway.scale', s);
  }
  document.querySelector('.size').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) setScale(+b.dataset.scale);
  });
  setScale(load('subway.scale', 1.25));

  // ---------- 역 검색 (이름 일부 / 초성) ----------
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function choseong(s) {
    return s.split('').map(function (ch) {
      var c = ch.charCodeAt(0) - 0xAC00;
      return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
    }).join('');
  }
  function isChoseongOnly(s) { return s.length > 0 && s.split('').every(function (c) { return CHO.indexOf(c) >= 0; }); }
  function search(q) {
    q = q.trim().replace(/역$/, '');
    if (!q) return [];
    var cho = isChoseongOnly(q);
    var hits = names.filter(function (n) { return cho ? choseong(n).indexOf(q) >= 0 : n.indexOf(q) >= 0; });
    hits.sort(function (a, b) {
      var sa = (cho ? choseong(a) : a).indexOf(q) === 0 ? 0 : 1, sb = (cho ? choseong(b) : b).indexOf(q) === 0 ? 0 : 1;
      return sa - sb || a.length - b.length || a.localeCompare(b, 'ko');
    });
    return hits;
  }
  function resolve(text) {
    var t = text.trim();
    if (router.hasStation(t)) return t;
    var stripped = t.replace(/역$/, '');
    if (router.hasStation(stripped)) return stripped;
    var hits = search(t);
    if (hits.length === 1) return hits[0];
    var exact = hits.filter(function (n) { return n.replace(/\(.*\)/, '') === stripped; });
    return exact.length === 1 ? exact[0] : null;
  }

  function badge(line, label) {
    return '<span class="badge" style="background:' + line.color + ';color:' + line.text + '">' + (label || line.name) + '</span>';
  }
  function yeok(n) { return n + '역'; }

  function renderSuggest(which) {
    var ul = lists[which], q = inputs[which].value;
    var hits = search(q).slice(0, 6);
    if (!q.trim()) { ul.hidden = true; return; }
    ul.innerHTML = hits.length
      ? hits.map(function (n) {
          return '<li><button type="button" data-name="' + n + '">' + yeok(n) + ' ' + router.linesOf(n).map(function (l) { return badge(l); }).join(' ') + '</button></li>';
        }).join('')
      : '<li class="noresult">찾는 역이 없어요. 다른 이름으로 써 보세요.</li>';
    ul.hidden = false;
  }
  ['from', 'to'].forEach(function (w) {
    inputs[w].addEventListener('input', function () { renderSuggest(w); showMsg(''); });
    inputs[w].addEventListener('focus', function () { renderSuggest(w); });
    inputs[w].addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var first = lists[w].querySelector('button');
      if (first && !lists[w].hidden) first.click();
      else if (w === 'from') inputs.to.focus();
      else find();
    });
    lists[w].addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      inputs[w].value = b.dataset.name;
      lists[w].hidden = true;
      if (w === 'from' && !resolve(inputs.to.value)) inputs.to.focus();
      else inputs[w].blur();
    });
  });
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.field')) { lists.from.hidden = true; lists.to.hidden = true; }
  });
  $('swap').addEventListener('click', function () {
    var t = inputs.from.value; inputs.from.value = inputs.to.value; inputs.to.value = t;
    if (!$('result').hidden) find();
  });

  function showMsg(t) { var m = $('msg'); m.textContent = t; m.hidden = !t; }

  // ---------- 최근 길 ----------
  function renderRecent() {
    var rec = load('subway.recent', []);
    $('recent').hidden = !rec.length;
    $('recent-list').innerHTML = rec.map(function (r, i) {
      return '<button type="button" data-i="' + i + '">' + yeok(r[0]) + ' → ' + yeok(r[1]) + '</button>';
    }).join('');
  }
  $('recent-list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var r = load('subway.recent', [])[+b.dataset.i];
    if (r) { inputs.from.value = r[0]; inputs.to.value = r[1]; find(); }
  });
  function remember(a, b) {
    var rec = load('subway.recent', []).filter(function (r) { return !(r[0] === a && r[1] === b); });
    rec.unshift([a, b]);
    save('subway.recent', rec.slice(0, 5));
    renderRecent();
  }

  // ---------- 길 찾기 ----------
  var speakText = '';

  function dirText(ride) {
    var s = '<em>' + yeok(ride.next) + '</em> 쪽으로 가는 열차';
    var sign = ride.labels.length ? '<small>표지판·안내방송에는 “' + ride.labels.join('” 또는 “') + '”이라고 나와요</small>' : '';
    return '<div class="dir">' + s + sign + '</div>';
  }

  function stepHtml(ride, no) {
    var l = ride.line, c = l.color;
    var h = '<div class="step"><div class="step-head" style="background:' + c + ';color:' + l.text + '"><span class="no">' + no + '</span>' +
      yeok(ride.from) + '에서 ' + l.name + ' 타기 (' + l.colorName + ')</div><div class="step-body">';
    h += '<p>이쪽으로 가는 열차를 타세요.</p>' + dirText(ride);
    h += '<p class="next">탄 뒤 <em>첫 번째로 서는 역</em>이 <em>' + yeok(ride.next) + '</em>이면 제대로 탄 거예요. 다르면 반대 방향이니, 내려서 건너편에서 다시 타세요.</p>';
    h += '<p class="alight"><em>' + ride.stops + '정거장</em> 가서 <em>' + yeok(ride.to) + '</em>에서 내리세요.' +
      (ride.beforeLast ? '<br><small>바로 전 역은 ' + yeok(ride.beforeLast) + '이에요.</small>' : '') + '</p>';
    h += '<details><summary>지나가는 역 모두 보기 (' + (ride.stops + 1) + '개)</summary><ul class="stops" style="--c:' + c + '">' +
      ride.stations.map(function (s, i) {
        var edge = i === 0 || i === ride.stations.length - 1;
        return '<li class="' + (edge ? 'edge' : '') + '">' + yeok(s) + (i === 0 ? ' (타는 곳)' : edge ? ' (내리는 곳)' : '') + '</li>';
      }).join('') + '</ul></details></div></div>';
    return h;
  }

  function transferHtml(prev, next) {
    return '<div class="transfer"><p><b>🔁 갈아타기</b></p>' +
      '<p>' + yeok(prev.to) + '에서 내린 뒤 ' + badge(next.line, next.line.name + ' (' + next.line.colorName + ')') + ' 표지판을 따라가세요.</p>' +
      '<p>걷는 길이 길 수 있어요. 천천히 가세요.</p></div>';
  }

  function find() {
    showMsg('');
    var a = resolve(inputs.from.value), b = resolve(inputs.to.value);
    if (!a) return showMsg(inputs.from.value.trim() ? '“' + inputs.from.value.trim() + '” 역을 못 찾았어요. 목록에서 골라 주세요.' : '타는 역을 써 주세요.');
    if (!b) return showMsg(inputs.to.value.trim() ? '“' + inputs.to.value.trim() + '” 역을 못 찾았어요. 목록에서 골라 주세요.' : '내릴 역을 써 주세요.');
    if (a === b) return showMsg('타는 역과 내리는 역이 같아요.');
    inputs.from.value = a; inputs.to.value = b;
    lists.from.hidden = lists.to.hidden = true;

    var route = router.findRoute(a, b);
    if (!route) return showMsg('이 두 역을 잇는 길을 못 찾았어요.');
    remember(a, b);

    var rides = route.rides;
    var chain = rides.map(function (r) { return badge(r.line); }).join(' → ');
    var html = '<div class="summary"><h2>' + yeok(a) + ' → ' + yeok(b) + '</h2>' +
      '<div class="chain">' + chain + '</div>' +
      '<p class="big">' + (route.transfers ? '갈아타는 곳 ' + route.transfers + '번' : '갈아타지 않아도 돼요') + ' · 약 ' + route.minutes + '분</p>' +
      '<button type="button" id="speak" class="ghost speak">🔊 소리로 듣기</button></div>';

    var say = [yeok(a) + '에서 ' + yeok(b) + '까지 가는 길이에요.'];
    rides.forEach(function (ride, i) {
      if (i > 0) {
        html += transferHtml(rides[i - 1], ride);
        say.push(yeok(rides[i - 1].to) + '에서 내려서 ' + ride.line.name + '으로 갈아타세요.');
      }
      html += stepHtml(ride, i + 1);
      say.push(yeok(ride.from) + '에서 ' + ride.line.name + '을 타세요. ' + yeok(ride.next) + ' 쪽으로 가는 열차예요. 탄 뒤 첫 번째 역이 ' + yeok(ride.next) + '이면 맞아요. ' +
        ride.stops + '정거장 가서 ' + yeok(ride.to) + '에서 내리세요.');
    });
    html += '<div class="arrive">🎉 ' + yeok(b) + '에 도착해요!</div>';
    speakText = say.join(' ');

    var res = $('result');
    res.innerHTML = html;
    res.hidden = false;
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('go').addEventListener('click', find);

  // ---------- 소리로 듣기 ----------
  $('result').addEventListener('click', function (e) {
    if (!e.target.closest('#speak')) return;
    var synth = window.speechSynthesis;
    if (!synth) return showMsg('이 기기에서는 소리 안내를 쓸 수 없어요.');
    if (synth.speaking) { synth.cancel(); return; }
    var u = new SpeechSynthesisUtterance(speakText);
    u.lang = 'ko-KR'; u.rate = 0.85;
    synth.speak(u);
  });

  renderRecent();
})();
