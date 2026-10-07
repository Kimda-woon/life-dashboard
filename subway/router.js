// 길찾기 엔진: 최소 시간(정거장 2분, 환승 5분) 기준 + 방향 안내 만들기
(function () {
  var STOP_MIN = 2;
  var TRANSFER_MIN = 5;      // 화면에 보여 줄 환승 시간
  var TRANSFER_WEIGHT = 12;  // 길 고를 때 환승 부담: 조금 더 걸려도 갈아타는 횟수가 적은 길을 우선

  function createRouter(lines) {
    var byId = {};
    var adj = {};           // 'lineId|역' -> [{ to, cost }]
    var stationLines = {};  // 역 -> [lineId]
    var key = function (l, s) { return l + '|' + s; };

    function addEdge(a, b, cost) {
      (adj[a] = adj[a] || []).push({ to: b, cost: cost });
    }
    function link(a, b, cost) { addEdge(a, b, cost); addEdge(b, a, cost); }

    lines.forEach(function (line) {
      byId[line.id] = line;
      line.paths.forEach(function (path) {
        var st = path.stations;
        st.forEach(function (s) {
          var arr = stationLines[s] = stationLines[s] || [];
          if (arr.indexOf(line.id) < 0) arr.push(line.id);
        });
        for (var i = 0; i < st.length - 1; i++) link(key(line.id, st[i]), key(line.id, st[i + 1]), line.stopMin || STOP_MIN);
        if (path.ring) link(key(line.id, st[st.length - 1]), key(line.id, st[0]), line.stopMin || STOP_MIN);
      });
    });
    Object.keys(stationLines).forEach(function (s) {
      var ids = stationLines[s];
      for (var i = 0; i < ids.length; i++)
        for (var j = i + 1; j < ids.length; j++)
          link(key(ids[i], s), key(ids[j], s), TRANSFER_WEIGHT);
    });

    function dijkstra(from, to) {
      var dist = {}, prev = {}, done = {}, open = [];
      (stationLines[from] || []).forEach(function (id) { var k = key(id, from); dist[k] = 0; open.push(k); });
      while (open.length) {
        var bi = 0;
        for (var i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
        var cur = open.splice(bi, 1)[0];
        if (done[cur]) continue;
        done[cur] = true;
        if (cur.slice(cur.indexOf('|') + 1) === to) {
          var seq = [cur];
          while (prev[seq[0]]) seq.unshift(prev[seq[0]]);
          return { seq: seq, cost: dist[cur] };
        }
        (adj[cur] || []).forEach(function (e) {
          var nd = dist[cur] + e.cost;
          if (dist[e.to] === undefined || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = cur; open.push(e.to); }
        });
      }
      return null;
    }

    // seq 가 path 안에서 연속으로 이어지면 'fwd'/'bwd', 아니면 null
    function matchWhole(path, seq) {
      var st = path.stations, n = st.length, i = st.indexOf(seq[0]);
      if (i < 0) return null;
      var dirs = [['fwd', 1], ['bwd', -1]];
      for (var d = 0; d < 2; d++) {
        var ok = true;
        for (var k = 0; k < seq.length && ok; k++) {
          var idx = i + dirs[d][1] * k;
          if (path.ring) idx = ((idx % n) + n) % n;
          else if (idx < 0 || idx >= n) { ok = false; break; }
          if (st[idx] !== seq[k]) ok = false;
        }
        if (ok) return dirs[d][0];
      }
      return null;
    }

    function labelFor(path, dir) {
      if (path.ring) return dir === 'fwd' ? (path.fwdLabel || null) : (path.bwdLabel || null);
      var st = path.stations;
      return (dir === 'fwd' ? st[st.length - 1] : st[0]) + ' 방면';
    }

    // 열차 방향 이름(표지판에 적힌 말). 못 정하면 빈 배열.
    function directionLabels(line, stations) {
      function collect(seq) {
        var out = [];
        line.paths.forEach(function (p) {
          var dir = matchWhole(p, seq);
          var l = dir && labelFor(p, dir);
          if (l && out.indexOf(l) < 0) out.push(l);
        });
        return out;
      }
      var whole = collect(stations);
      return whole.length ? whole : collect(stations.slice(0, 2));
    }

    function findRoute(from, to) {
      if (from === to || !stationLines[from] || !stationLines[to]) return null;
      var r = dijkstra(from, to);
      if (!r) return null;
      var rides = [];
      r.seq.forEach(function (k) {
        var bar = k.indexOf('|'), id = +k.slice(0, bar), st = k.slice(bar + 1);
        var last = rides[rides.length - 1];
        if (last && last.line.id === id) { if (last.stations[last.stations.length - 1] !== st) last.stations.push(st); }
        else rides.push({ line: byId[id], stations: [st] });
      });
      rides = rides.filter(function (r2) { return r2.stations.length > 1; });
      rides.forEach(function (ride) {
        var s = ride.stations;
        ride.from = s[0];
        ride.to = s[s.length - 1];
        ride.stops = s.length - 1;
        ride.next = s[1];
        ride.beforeLast = s.length >= 3 ? s[s.length - 2] : null;
        ride.labels = directionLabels(ride.line, s);
      });
      var ride_min = rides.reduce(function (n, x) { return n + x.stops * (x.line.stopMin || STOP_MIN); }, 0);
      return { from: from, to: to, rides: rides, transfers: rides.length - 1, minutes: ride_min + (rides.length - 1) * TRANSFER_MIN };
    }

    return {
      findRoute: findRoute,
      stationNames: function () { return Object.keys(stationLines); },
      linesOf: function (name) { return (stationLines[name] || []).map(function (id) { return byId[id]; }); },
      hasStation: function (name) { return !!stationLines[name]; }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createRouter: createRouter };
  else window.createRouter = createRouter;
})();
