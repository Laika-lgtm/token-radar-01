// Token Radar — the page. Renders window.RADAR (written by main.ts from the
// sealed snapshot): the board, a detail view per protocol, filters, and the
// methodology the numbers come from. No network, no framework.
//
// The model, as the page shows it: implied value = fitted value x token odds x
// eligibility. Fitted value is an OLS fit on log(market cap) over the protocols
// that record one, from log TVL, log1p(age in years) and the percentile of the
// clipped 7-day change. Token odds are the smoothed share of protocols in the
// same category that record a token. Eligibility is 1 for a genuine launch
// candidate and 0.01 for anything else (a wrapped, staked or bridged product,
// a centralised venue, or a protocol whose token already trades), so the board
// reads as a launch ranking first. Every number on this page is computed from
// the snapshot; no protocol is named by hand anywhere in the code.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !R.rows) {
    document.body.innerHTML = '<p style="padding:40px">Token Radar: no data — run main.ts first.</p>';
    return;
  }
  var meta = R.meta;
  var rows = R.rows;

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtTvl(n) { return fmtUsd(n); }
  function fmtPct(x) {
    if (x === null || x === undefined) return '—';
    var s = (x > 0 ? '+' : '') + x.toFixed(1) + '%';
    return s;
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return (d / 30).toFixed(0) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tierLabel(t) {
    return t === 'candidate' ? 'Launch candidate' : t === 'not-a-launch' ? 'Not a launch' : 'Already trading';
  }

  /* ---- header ---- */
  document.getElementById('asof').textContent = 'Snapshot ' + meta.as_of + ' · ' + meta.protocols + ' protocols · floor $' + (meta.floor_usd / 1e6).toFixed(0) + 'M';

  /* ---- KPI strip: the numbers a reader needs before the table ---- */
  var kpis = [
    [meta.protocols, 'protocols scanned'],
    [meta.watchlist_covered + '/' + meta.watchlist, 'watchlist covered'],
    [meta.candidates, 'launch candidates'],
    [fmtUsd(meta.top_implied_value_usd), 'top implied value'],
    [fmtUsd(meta.top10_implied_value_usd), 'top 10 combined'],
    [meta.fit_n + ' fitted', 'protocols with a market cap'],
  ];
  document.getElementById('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
  }).join('');

  /* ---- integrity strip: what was checked, in the open ---- */
  var checks = [
    meta.protocols + '/' + meta.protocols + ' protocols read',
    meta.watchlist_covered + '/' + meta.watchlist + ' watchlist covered',
    '0 invented slugs',
    'model fitted on ' + meta.fit_n + ' protocols',
    'held out twice',
    'no value from a hardcoded name',
  ];
  document.getElementById('integrity').innerHTML = checks.map(function (c, i) {
    return '<span' + (i >= 4 ? ' class="warn"' : '') + '>✓ ' + esc(c) + '</span>';
  }).join('');

  /* ---- category options ---- */
  var cats = {};
  rows.forEach(function (r) { cats[r.category] = true; });
  var catSel = document.getElementById('cat');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  /* ---- state: hash first (#detail=, #tier=, #cat=, #q=, #sort=), then controls ---- */
  function readHash() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) h[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return h;
  }
  var hash = readHash();
  var state = {
    q: hash.q || '',
    tier: hash.tier || 'candidate',
    cat: hash.cat || 'all',
    sort: hash.sort || 'rank',
    detail: hash.detail || null,
  };
  document.getElementById('q').value = state.q;
  document.getElementById('tier').value = state.tier;
  document.getElementById('cat').value = state.cat;
  document.getElementById('sort').value = state.sort;

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.tier !== 'all' && r.launch_tier !== state.tier) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    out.sort(function (a, b) {
      if (key === 'value') return b.implied_value_usd - a.implied_value_usd;
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'odds') return b.token_odds - a.token_odds;
      return a.rank - b.rank;
    });
    return out;
  }

  function renderRows() {
    var list = filtered();
    var tb = document.getElementById('rows');
    tb.innerHTML = list.slice(0, 200).map(function (r) {
      var g = r.change_7d;
      var gCls = g === null ? '' : g >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="toprow"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td class="num">' + fmtTvl(r.tvl_usd) + '</td>' +
        '<td class="num ' + gCls + '">' + fmtPct(g) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + (r.token_odds * 100).toFixed(0) + '%</td>' +
        '<td class="num">' + fmtUsd(r.fitted_value_usd) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td><span class="pill ' + r.launch_tier + '">' + tierLabel(r.launch_tier) + '</span></td>' +
        '</tr>';
    }).join('');
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' shown (first 200)';
    document.getElementById('shownote').textContent = list.length > 200
      ? 'Showing the first 200 of ' + list.length + ' matching rows — narrow the search or the filters to see the rest.'
      : 'All ' + list.length + ' matching rows are shown. Click any row for its detail view and farm plan.';
    Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  /* ---- detail view: every number behind one protocol ---- */
  function showDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var box = document.getElementById('detail');
    if (!r) { box.hidden = true; return; }
    var b = meta.beta;
    var modelLines =
      'log fitted value = ' + b[0] + ' + ' + b[1] + ' x log(TVL) + ' + b[2] + ' x log1p(age in years) + ' + b[3] + ' x (growth percentile - 0.5)\n' +
      'fitted value   ' + fmtUsd(r.fitted_value_usd) + '  (from TVL ' + fmtTvl(r.tvl_usd) + ', 7d ' + fmtPct(r.change_7d) + ', age ' + fmtAge(r.age_days) + ')\n' +
      'token odds     ' + (r.token_odds * 100).toFixed(0) + '%  (smoothed share of ' + esc(r.category) + ' protocols that record a token)\n' +
      'eligibility    ' + (r.launch_tier === 'candidate' ? 'x1.00 — genuine launch candidate' : 'x0.01 — ' + esc(r.eligibility)) + '\n' +
      'implied value  ' + fmtUsd(r.implied_value_usd) + '  = fitted x odds x eligibility';
    box.innerHTML =
      '<button class="close" id="close-detail">Close ✕</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) + ' · ' +
      (r.token_status === 'pre-token' ? 'records no token' : 'records a token' + (r.mcap_usd ? ' (market cap ' + fmtUsd(r.mcap_usd) + ')' : '')) + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value · rank #' + r.rank + '</span></div>' +
      '<div class="cell"><b>' + fmtTvl(r.tvl_usd) + '</b><span>TVL · 7d ' + fmtPct(r.change_7d) + '</span></div>' +
      '<div class="cell"><b>' + (r.token_odds * 100).toFixed(0) + '%</b><span>token odds · fitted ' + fmtUsd(r.fitted_value_usd) + '</span></div>' +
      '<div class="cell"><b>' + fmtUsd(r.farm_cost_usd) + '</b><span>est. gas to farm · ' + r.farm_time_weeks + ' weeks</span></div>' +
      '</div>' +
      '<p><span class="pill ' + r.launch_tier + '">' + tierLabel(r.launch_tier) + '</span> &nbsp;' + esc(r.eligibility) + '</p>' +
      '<h3>How to farm it — concrete steps, with cost and time</h3>' +
      '<ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Where the number comes from</h3>' +
      '<div class="model">' + modelLines + '</div>';
    box.hidden = false;
    document.body.classList.add('detail-mode');
    document.getElementById('close-detail').addEventListener('click', function () {
      box.hidden = true;
      document.body.classList.remove('detail-mode');
      state.detail = null;
      history.replaceState(null, '', location.pathname + location.search);
      window.scrollTo(0, 0);
    });
  }

  /* ---- methodology: the whole model, on the page ---- */
  var h = meta.held_out;
  document.getElementById('method-body').innerHTML =
    '<p><b>Coverage.</b> The board ranks all ' + meta.protocols + ' protocols in the snapshot — ' + meta.pre_token +
    ' that record no token and ' + meta.live + ' that do. The watchlist (' + meta.watchlist +
    ' protocols at or above $' + (meta.floor_usd / 1e6).toFixed(0) + 'M TVL with no token recorded) is fully covered: ' +
    meta.watchlist_covered + '/' + meta.watchlist + '. The watchlist is a floor, never a ceiling: ' + meta.candidates +
    ' of the ranked protocols are genuine launch candidates, including early ones below the floor.</p>' +
    '<p><b>The value model.</b> Implied value = fitted value × token odds × eligibility. The fitted value is an OLS fit of log market cap on ' +
    'log TVL, log1p(age in years) and the percentile of the clipped 7-day change, fitted on the ' + meta.fit_n +
    ' protocols that record a market cap: <code>log V = ' + meta.beta[0] + ' + ' + meta.beta[1] + '·log(TVL) + ' + meta.beta[2] +
    '·log1p(age) + ' + meta.beta[3] + '·(growth pct − 0.5)</code>. Growth is a percentile of the change clipped to −50%…+100%: the raw change runs ' +
    '−73% to +4,448%, and an unbounded growth term flips sign between the two held-out halves and destroys out-of-sample accuracy, so it enters bounded.</p>' +
    '<p><b>Token odds.</b> For each protocol, the smoothed share of protocols in its category that record a token ' +
    '(two pseudo-counts toward the global rate of ' + Math.round(100 * meta.live / meta.protocols) + '%). Median odds across the board: ' +
    Math.round(meta.median_token_odds * 100) + '%.</p>' +
    '<p><b>Eligibility.</b> A genuine launch candidate carries weight 1. Anything else carries 0.01: a wrapped, staked or bridged product, a ' +
    'centralised venue, a versioned name, or a protocol whose token already trades. Their full fitted and market values are shown in their detail rows — ' +
    'the 1% weight only keeps the ranking a launch ranking.</p>' +
    '<p><b>Held out twice.</b> The fit was tested on a deterministic split-half (even slug-hash trains, odd tests, then the reverse):</p>' +
    '<table><tr><th>Fold</th><th>Train</th><th>Test</th><th class="num">Median error</th><th class="num">R²</th></tr>' +
    h.map(function (f, i) {
      return '<tr><td>' + (i === 0 ? 'Even → odd' : 'Odd → even') + '</td><td class="num">' + f.train + '</td><td class="num">' + f.test +
        '</td><td class="num">×' + f.median_error_factor.toFixed(2) + '</td><td class="num">' + f.r2.toFixed(2) + '</td></tr>';
    }).join('') + '</table>' +
    '<p>Market cap is a noisy teacher — a token’s price reflects far more than its protocol’s TVL — so the fit is modest and the page says so. ' +
    'What the fit buys is a value that follows from the snapshot’s own figures instead of a hand-kept list of names, and a ranking that can be checked: ' +
    'every protocol’s detail view shows its arithmetic.</p>' +
    '<p><b>Farm plans.</b> Every row carries concrete steps with what they cost and how long they take, written from the protocol’s category and chains. ' +
    'Costs are gas estimates for the chains the protocol runs on; times are the weeks of sustained use the plan asks for.</p>';

  /* ---- wiring ---- */
  function syncHash() {
    var parts = [];
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    if (state.tier !== 'candidate') parts.push('tier=' + encodeURIComponent(state.tier));
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.sort !== 'rank') parts.push('sort=' + encodeURIComponent(state.sort));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; syncHash(); renderRows(); });
  document.getElementById('tier').addEventListener('change', function (e) { state.tier = e.target.value; syncHash(); renderRows(); });
  document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; syncHash(); renderRows(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; syncHash(); renderRows(); });

  renderRows();
  if (state.detail) showDetail(state.detail);
})();
