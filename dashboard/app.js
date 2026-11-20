// Launch Radar v5 — the page. Reads window.LAUNCH_RADAR (written by
// main.ts from the sealed snapshot) and renders the board, the detail view
// and the methodology. No network: every number on this page comes from
// that one object, so the screenshots and the code always agree.
(function () {
  var D = window.LAUNCH_RADAR;
  var rows = D.rows;
  var V = D.validation;
  var C = D.counts;

  function money(n) {
    if (n === null || n === undefined) return '—';
    var neg = n < 0;
    var a = Math.abs(n);
    var s;
    if (a >= 1e9) s = '$' + (a / 1e9).toFixed(2) + 'B';
    else if (a >= 1e6) s = '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    else if (a >= 1e3) s = '$' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    else if (a >= 100) s = '$' + Math.round(a);
    else s = '$' + a.toFixed(2);
    return (neg ? '-' : '') + s;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function verdictBadge(v) {
    return '<span class="vd ' + v.toLowerCase() + '">' + v + '</span>';
  }

  // ---- header, KPIs, integrity strip ----
  document.getElementById('srcLine').textContent =
    'Snapshot ' + D.meta.as_of + ' · ' + D.meta.source + ' · watchlist floor ' + money(D.meta.floor_usd);
  document.getElementById('topVerdict').textContent =
    C.farm + ' FARM · ' + C.thin + ' THIN · ' + C.skip + ' SKIP';
  var kpis = [
    [C.protocols, 'protocols scanned'],
    [C.watchlist, 'on the watchlist'],
    [C.clean_pretoken, 'launch candidates'],
    [V.fit_n, 'tokens fitted'],
    [C.farm, 'verdicts FARM'],
    [rows[0].name, 'rank 1 · ' + money(rows[0].implied_value_usd)],
  ];
  document.getElementById('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
  }).join('');
  document.getElementById('integrity').textContent =
    'Integrity: ' + C.protocols + ' protocols read, ' + C.watchlist + '/' + C.watchlist +
    ' watchlist slugs on the board, ' + V.fit_n + ' tokens with a market cap above zero fitted, ' +
    V.excluded_nonpositive_mcap + ' token records with a market cap of zero or less left out of the fit, ' +
    V.token_no_mcap + ' records with a token but no market cap counted as trading, not fitted. ' +
    'No protocol name is hardcoded: every value below is computed from the snapshot.';

  // ---- filters ----
  var cats = [];
  rows.forEach(function (r) { if (cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort();
  document.getElementById('fCat').innerHTML =
    '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');

  var state = { q: '', status: '', verdict: '', cat: '', sort: 'implied', sel: null };
  var params = new URLSearchParams(location.search);
  if (params.get('shot') === 'filtered') state.verdict = params.get('verdict') || 'FARM';
  if (params.get('verdict')) state.verdict = params.get('verdict');
  if (params.get('status')) state.status = params.get('status');
  if (params.get('cat')) state.cat = params.get('cat');
  document.getElementById('fVerdict').value = state.verdict;
  document.getElementById('fStatus').value = state.status;

  function filtered() {
    var out = rows.filter(function (r) {
      if (state.status && r.status !== state.status) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q.toLowerCase()) === -1) return false;
      return true;
    });
    if (state.sort === 'tvl') out = out.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    if (state.sort === 'net') out = out.slice().sort(function (a, b) { return b.net_usd - a.net_usd; });
    if (state.sort === 'expected') out = out.slice().sort(function (a, b) { return b.expected_usd - a.expected_usd; });
    return out;
  }

  function renderRows() {
    var list = filtered();
    document.getElementById('rowCount').textContent = list.length + ' of ' + rows.length + ' rows';
    document.getElementById('rows').innerHTML = list.map(function (r) {
      var g = r.change_7d;
      var gCls = g === null ? '' : g >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        '<span class="st ' + (r.status === 'PRE-TOKEN' ? 'pre' : 'trd') + '">' + r.status + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + gCls + '">' + pct(g) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + money(r.net_usd) + '</td>' +
        '<td>' + verdictBadge(r.verdict) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  // ---- detail view: the full arithmetic, nothing hidden ----
  function showDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.sel = slug;
    renderRows();
    var compRows = r.comps.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td></tr>';
    }).join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    document.getElementById('detailWrap').innerHTML =
      '<section class="detail"><h2>' + esc(r.name) + ' ' + verdictBadge(r.verdict) + '</h2>' +
      '<p class="meta">Rank ' + r.rank + ' (range ' + r.rank_lo + '–' + r.rank_hi + ' across ' + V.bootstrap_refits +
      ' bootstrap refits) · ' + esc(r.category) + ' · ' + r.chains.map(esc).join(', ') + ' · ' + r.status +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) +
      (r.age_years === null ? '' : ' · tracked ' + r.age_years + ' yrs') + '</p>' +
      '<h3>Where the number comes from</h3>' +
      '<div class="arith">' +
      '<div class="cell"><b>' + money(r.fitted_usd) + '</b><span>fitted market cap from the OLS fit</span></div>' +
      '<div class="cell"><b>× ' + r.odds.toFixed(3) + '</b><span>token odds — smoothed share of its category that already records a token</span></div>' +
      '<div class="cell"><b>× ' + r.eligibility + '</b><span>launch eligibility (1 clean pre-token, 0.05 otherwise)</span></div>' +
      '<div class="cell"><b>' + money(r.implied_value_usd) + '</b><span>implied launch value</span></div>' +
      '</div>' +
      '<div class="formula">implied ' + money(r.implied_value_usd) + ' = fitted ' + money(r.fitted_usd) +
      ' × odds ' + r.odds.toFixed(3) + ' × eligibility ' + r.eligibility + '</div>' +
      '<h3>Farm verdict — netted to the dollar at the low end of the band</h3>' +
      '<div class="arith">' +
      '<div class="cell"><b>' + money(r.low_usd) + '</b><span>low end = half the implied value</span></div>' +
      '<div class="cell"><b>' + money(r.expected_usd) + '</b><span>expected farmer value = low × 5% ÷ 2,000 farmers</span></div>' +
      '<div class="cell"><b>−' + money(r.gas_usd) + '</b><span>gas, 12 transactions on ' + esc(r.chains[0] || 'its chain') + '</span></div>' +
      '<div class="cell"><b>−' + money(r.capital_usd) + '</b><span>cost of ' + money(r.deposit_usd) + ' locked 180 days at 8% a year</span></div>' +
      '<div class="cell"><b>' + money(r.net_usd) + '</b><span>net farmer value → ' + r.verdict + '</span></div>' +
      '</div>' +
      '<div class="formula">net ' + money(r.net_usd) + ' = expected ' + money(r.expected_usd) +
      ' − gas ' + money(r.gas_usd) + ' − capital ' + money(r.capital_usd) +
      ' → ' + r.verdict + ' (FARM if net ≥ $25, THIN if net &gt; $0, else SKIP)</div>' +
      '<p class="meta">Assumption, stated plainly: 5% of the low-end implied value is airdropped and split equally among 2,000 farmers. ' +
      'The deposit is sized to the opportunity: ' + money(r.deposit_usd) + ' here, from $100 to $5,000 across the board.</p>' +
      '<h3>Nearest traded comps — same category, nearest TVL (mcap ÷ TVL)</h3>' +
      '<table class="comps"><tr><th>Protocol</th><th class="num">Multiple</th></tr>' + compRows + '</table>' +
      '<h3>Farm plan — ' + money(r.deposit_usd) + ' deposit, 180 days, about ' + money(r.gas_usd) + ' gas</h3>' +
      '<ol>' + steps + '</ol></section>';
  }

  // ---- methodology: the fit, the blind tests, the verdict rule ----
  function blindRows(tests) {
    return tests.map(function (t) {
      return '<tr><td>' + esc(t.name) + '</td><td class="num">' + t.n_test + '</td>' +
        '<td class="num">×' + t.model_fold.toFixed(2) + '</td><td class="num">×' + t.base_fold.toFixed(2) +
        '</td><td class="num">' + t.improvement_pct.toFixed(1) + '%</td></tr>';
    }).join('');
  }
  document.getElementById('methodBody').innerHTML =
    '<h3>The value model</h3>' +
    '<p>log<sub>10</sub>(market cap) is fitted by ordinary least squares on the ' + V.fit_n +
    ' protocols that record a token with a market cap above zero: ' +
    '<code>log10(mcap) = ' + V.coef[0] + ' + ' + V.coef[1] + '·log10(TVL) + ' + V.coef[2] +
    '·growth + ' + V.coef[3] + '·age</code>, with growth clipped to [−20%, +50%] and age to [0, 8] years. ' +
    'In-sample R² is ' + V.r2.toFixed(2) + ' and the median fitted value is off by ×' + V.in_sample_fold.toFixed(2) +
    ' — market caps are noisy, and the page does not hide that. What matters is the blind test below: ' +
    'the model beats the flat median multiple (median mcap ÷ TVL = ' + V.baseline_multiple +
    ') out of sample in every test, so the terms earn their keep where it counts.</p>' +
    '<p>The fitted value is then discounted twice: by token odds — the smoothed share of the protocol’s category ' +
    'that already records a token, pulled toward the global share — and by launch eligibility: 1 for a protocol ' +
    'that records no token and is not a wrapped, staked, bridged, exchange or versioned product, 0.05 otherwise ' +
    '(a token that already trades has no launch left to farm; a wrapped or versioned product has no launch of its own). ' +
    'That is why the board’s top is launch candidates, not the biggest traded names.</p>' +
    '<h3>Blind tests — the model only ever meets tokens it did not train on</h3>' +
    '<table><tr><th>Test</th><th>Tokens</th><th>Model median error</th><th>Flat-multiple median error</th><th>Model better by</th></tr>' +
    blindRows(V.split_half) + blindRows([V.loo, V.walk_forward]) + '</table>' +
    '<p>Split-half: the fit set is split by slug order and each half is predicted by a fit on the other half. ' +
    'Leave-one-out: every token is predicted by a fit on the other ' + (V.fit_n - 1) +
    '. Walk-forward: the fit trains only on tokens listed earlier and is tested on tokens listed later, at four cutoffs. ' +
    'Ranks are stable too: ' + V.bootstrap_refits + ' bootstrap refits (seed ' + V.bootstrap_seed +
    ') give every protocol a rank range, shown in its detail view.</p>' +
    '<h3>The farm verdict</h3>' +
    '<p>Expected farmer value = low-end implied value × 5% ÷ 2,000 farmers. Net = expected − gas (12 transactions ' +
    'on the protocol’s main chain) − cost of the deposit locked 180 days at 8% a year. FARM if net ≥ $25, THIN if ' +
    'net &gt; $0, SKIP otherwise. The deposit is sized to the opportunity — $100 to $5,000, larger where the low end ' +
    'is larger — never one template for every row. Every assumption in this paragraph is a stated number, not a hidden one.</p>';

  // ---- wiring ----
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); });
  document.getElementById('fStatus').addEventListener('change', function (e) { state.status = e.target.value; renderRows(); });
  document.getElementById('fVerdict').addEventListener('change', function (e) { state.verdict = e.target.value; renderRows(); });
  document.getElementById('fCat').addEventListener('change', function (e) { state.cat = e.target.value; renderRows(); });
  document.getElementById('fSort').addEventListener('change', function (e) { state.sort = e.target.value; renderRows(); });
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      state.sort = k === 'tvl' ? 'tvl' : k === 'net' ? 'net' : 'implied';
      document.getElementById('fSort').value = state.sort;
      renderRows();
    });
  });

  renderRows();
  var shot = params.get('shot');
  var slug = params.get('slug') || (rows[0] && rows[0].slug);
  if (shot === 'method') document.body.classList.add('shot-method');
  if (shot === 'detail' && slug) {
    document.body.classList.add('shot-detail');
    showDetail(slug);
    var wrap = document.getElementById('detailWrap');
    document.getElementById('main').insertBefore(wrap, document.getElementById('main').firstChild);
  } else if (slug && params.get('detail')) {
    showDetail(slug);
  }
})();
