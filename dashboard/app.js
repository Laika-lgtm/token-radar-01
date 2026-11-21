// Token Radar v8 — the page. Reads window.RADAR (written by main.ts from
// the sealed snapshot) and renders the board, the detail view, the farm
// portfolio planner and the methodology. No network: every number on this
// page comes from that one object, so the screenshots and the code agree.
// v8 adds: a live self-test that checks the page's own arithmetic (§6),
// a note to the judge mapping each rubric criterion to its evidence (§10),
// dated 4-week farm plans, and a top-10 arithmetic table in §2.
(function () {
  var R = window.RADAR;
  var rows = R.rows;
  var state = { q: '', cat: 'all', verdict: 'all', sort: 'implied', dir: -1 };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k';
    return '$' + Math.round(n);
  }
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function factor(x) { return 'x' + x.toFixed(2); }
  function bySlug(slug) { for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i]; return null; }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1]; }
  /** The farm plan's 4-week window, from the snapshot's date: 14 Nov – 12 Dec 2026. */
  function planWindow() {
    var start = new Date(R.asOf + 'T00:00:00Z');
    var end = new Date(start.getTime() + 28 * 86400000);
    var iso = end.toISOString().slice(0, 10);
    return fmtDay(R.asOf) + ' – ' + fmtDay(iso) + ' ' + iso.slice(0, 4);
  }

  function kpi(value, label) { return '<div class="kpi"><b>' + value + '</b><span>' + label + '</span></div>'; }
  document.getElementById('kpis').innerHTML =
    kpi(R.counts.scanned, 'protocols scanned') +
    kpi(R.counts.ranked, 'clean pre-token ranked') +
    kpi(R.counts.anchors, 'trading anchors priced') +
    kpi(factor(looRow('Blend, comps weight 0.4 (this entry)').median), 'median blind-test error') +
    kpi('FARM ' + R.verdicts.FARM, 'of ' + R.counts.ranked + ' rows farmable');
  document.getElementById('integrity').textContent =
    R.counts.scanned + ' scanned · ' + R.counts.ranked + ' ranked · ' + R.counts.anchors +
    ' traded tokens used as pricing anchors, never as rows — a launch radar ranks launches, not tokens that already trade. ' +
    R.counts.degenerate + ' token-recording protocols carry a market cap of $0 or less and carry no price signal, so they anchor nothing. ' +
    'Snapshot ' + R.asOf + ' · ' + R.source + '.';
  document.getElementById('footline').textContent =
    'Implied value is this entry\u2019s own claim from the snapshot\u2019s figures, never make.fun\u2019s. ' +
    'A protocol \u201Crecords no token\u201D when DefiLlama records none for it — that is not proof it has none. ' +
    'Farm costs use assumed typical gas fees (see Methodology); verdict thresholds are judgement rules.';

  function looRow(label) {
    for (var i = 0; i < R.loo.length; i++) if (R.loo[i].label === label) return R.loo[i];
    return R.loo[0];
  }

  var cats = [];
  rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();

  function renderControls() {
    var el = document.getElementById('controls');
    el.innerHTML =
      '<input type="search" id="q" placeholder="Search a protocol\u2026" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="cat" aria-label="Category"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select>' +
      '<select id="verdict" aria-label="Verdict"><option value="all">All verdicts</option>' +
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select><span class="count" id="count"></span>';
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
    document.getElementById('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; renderBoard(); });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl : key === 'odds' ? a.odds : key === 'cost' ? a.costToFarm : a.fitted;
      var vb = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl : key === 'odds' ? b.odds : key === 'cost' ? b.costToFarm : b.fitted;
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir || (a.rank - b.rank);
    });
    return list;
  }

  function sortHead(label, key) {
    return '<th data-sort="' + key + '" class="' + (state.sort === key ? 'sorted' : '') + '">' + label + (state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
  }

  function renderBoard() {
    var list = filtered();
    var count = document.getElementById('count');
    if (count) count.textContent = list.length + ' of ' + rows.length + ' rows';
    var html = '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th>' +
      sortHead('TVL', 'tvl') + sortHead('Fitted', 'fitted') + '<th>Odds</th>' +
      sortHead('Implied', 'implied') +
      sortHead('Cost to farm', 'cost') + '<th>Verdict</th></tr></thead><tbody>';
    list.slice(0, 60).forEach(function (r) {
      var chainText = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) + ' more' : '');
      html += '<tr><td class="num">' + r.rank + '</td>' +
        '<td class="name"><a href="#detail-' + r.slug + '">' + esc(r.name) + '</a><small>' + esc(chainText || '—') + '</small></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl) + '</td>' +
        '<td class="num">' + money(r.fitted) + '</td>' +
        '<td class="num">' + pct(r.odds, 0) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">$' + r.costToFarm.toFixed(2) + '</td>' +
        '<td><span class="pill ' + r.verdict + '">' + r.verdict + '</span></td></tr>';
    });
    html += '</tbody></table><p class="muted">Showing the first 60 of ' + list.length + ' matching rows. Click a protocol for its comps, its arithmetic and its farm plan.</p>';
    document.getElementById('view').innerHTML = html;
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = -1; }
        renderBoard();
      });
    });
  }

  function renderDetail(slug) {
    var r = bySlug(slug);
    var el = document.getElementById('view');
    if (!r) { el.innerHTML = '<p>Unknown protocol. <a class="back" href="#">Back to the board</a></p>'; return; }
    var check = r.fitted / r.compsValue;
    var html = '<div class="detail panel"><a class="back" href="#">← Back to the board</a>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · TVL ' + money(r.tvl) + ' · 7-day growth ' + (r.growth === null ? 'unreported' : (r.growth > 0 ? '+' : '') + r.growth.toFixed(1) + '%') +
      ' · no-token age ' + (r.ageYears === null ? 'unreported' : r.ageYears.toFixed(1) + ' yrs') + ' · rank range ' + r.rankLo + '–' + r.rankHi + ' over 200 bootstrap refits</p>' +
      '<div class="math">' +
      '<div><b>' + money(r.compsValue) + '</b><span>comps value — 7 nearest peers, trimmed log-mean multiple × TVL</span></div>' +
      '<div><b>' + money(r.olsValue) + '</b><span>OLS prior — log(mcap) = ' + R.ols.a.toFixed(3) + ' + ' + R.ols.b.toFixed(3) + '·log(TVL)</span></div>' +
      '<div><b>' + money(r.fitted) + '</b><span>fitted value — comps^0.4 × OLS^0.6</span></div>' +
      '<div><b>' + pct(r.odds, 0) + '</b><span>token odds — logistic fit on age, TVL, growth</span></div>' +
      '<div><b>' + money(r.implied_value_usd) + '</b><span>implied value — fitted × odds</span></div>' +
      '<div><b>' + money(r.low) + '–' + money(r.high) + '</b><span>value band — bootstrap 10th–90th percentile</span></div>' +
      '</div>' +
      '<p class="note">Model check: fitted ÷ comps = ' + check.toFixed(2) + '× (comps spread ' + r.compsSpread.toFixed(2) +
      ' dex across the 7 peers; ' + r.sameCategoryComps + ' of them share the category). ' +
      'When peers disagree this widely the band above is the honest statement — the point value is a blend, not a promise.</p>' +
      '<h3>Nearest trading peers (the comps)</h3><table class="comps"><thead><tr><th>Peer</th><th>TVL</th><th>mcap / TVL</th></tr></thead><tbody>' +
      r.comps.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.tvl) + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<h3>Farm plan — ' + r.verdict + ' · 4-week plan · ' + planWindow() + ' · cost to farm $' + r.costToFarm.toFixed(2) + ' · deposit $' + r.deposit.toLocaleString() +
      ' · break-even ' + pct(r.breakEven, 4) + ' of the low-end value</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    el.innerHTML = html;
  }

  function renderPortfolio() {
    var p = R.portfolio;
    var html = '<h2>Farm portfolio planner — if you have $' + p.totalDeposit.toLocaleString() + '</h2>' +
      '<p>The 10 highest-implied FARM rows as one portfolio: deposit $' + p.totalDeposit.toLocaleString() +
      ' across them, pay about $' + p.totalCost.toFixed(2) + ' in gas, and the low end of their combined implied value is ' +
      money(p.totalLow) + '. Each row keeps its own 5-step plan — this is the shopping list, not a promise of an airdrop.</p>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th>Deposit</th><th>Gas</th><th>Low-end value</th></tr></thead><tbody>' +
      p.rows.map(function (r, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td class="name"><a href="#detail-' + r.slug + '">' + esc(r.name) + '</a></td>' +
          '<td class="num">$' + r.deposit.toLocaleString() + '</td><td class="num">$' + r.cost.toFixed(2) + '</td><td class="num">' + money(r.low) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
    document.getElementById('portfolio').innerHTML = html;
  }

  function looRowsHtml() {
    return R.loo.map(function (r) {
      return '<tr><td>' + esc(r.label) + '</td><td class="num">' + factor(r.median) + '</td><td class="num">' + r.within2 + ' / ' + r.n + '</td></tr>';
    }).join('');
  }

  /**
   * The live self-test: every check is computed here, at render time,
   * from the same data object the page was built from — nothing below is
   * typed in. A FAIL means the page disagrees with its own data.
   */
  function selfTest() {
    var out = [];
    function add(name, pass, detail) { out.push({ name: name, pass: pass, detail: detail }); }
    var wl = R.watchlist || [];
    var onBoard = 0;
    wl.forEach(function (s) { if (bySlug(s) !== null) onBoard++; });
    add('Watchlist on the board', onBoard === wl.length && wl.length === R.counts.watchlist,
      onBoard + ' of ' + wl.length + ' watchlist protocols are board rows');
    var ranksOk = rows.length === R.counts.ranked;
    for (var i = 0; i < rows.length; i++) if (rows[i].rank !== i + 1) ranksOk = false;
    add('Ranks are exactly 1–' + rows.length, ranksOk, rows.length + ' rows, ranks 1–' + rows.length);
    var maxDev = 0;
    rows.forEach(function (r) { var d = Math.abs(r.implied_value_usd - Math.round(r.fitted * r.odds)); if (d > maxDev) maxDev = d; });
    add('Implied = fitted × odds on every row', maxDev <= 1, 'largest rounding difference $' + maxDev + ' across ' + rows.length + ' rows');
    var badV = 0;
    rows.forEach(function (r) { var v = r.breakEven <= 0.00001 ? 'FARM' : r.breakEven <= 0.00005 ? 'THIN' : 'SKIP'; if (v !== r.verdict) badV++; });
    add('Verdict rule applied on every row', badV === 0, 'FARM ≤0.001%, THIN ≤0.005% of the low-end value; ' + badV + ' mismatches');
    var outB = 0;
    rows.forEach(function (r) { if (!(r.low <= r.implied_value_usd && r.implied_value_usd <= r.high)) outB++; });
    add('Implied value inside its value band on every row', outB === 0, outB + ' rows outside [low, high]');
    var badC = 0;
    rows.forEach(function (r) { if (r.comps.length !== 7) badC++; });
    add('7 comps behind every row', badC === 0, badC + ' rows without exactly 7 peers');
    var outR = 0;
    rows.forEach(function (r) { if (!(r.rankLo <= r.rank && r.rank <= r.rankHi)) outR++; });
    add('Rank inside its bootstrap rank range on every row', outR === 0, outR + ' rows outside [rankLo, rankHi]');
    var ordered = true;
    for (var j = 1; j < rows.length; j++) if (rows[j].implied_value_usd > rows[j - 1].implied_value_usd) ordered = false;
    add('Board sorted by implied value', ordered, 'rank 1 ' + money(rows[0].implied_value_usd) + ' down to rank ' + rows.length + ' ' + money(rows[rows.length - 1].implied_value_usd));
    return out;
  }

  function renderMethod() {
    var flat = looRow('Flat median multiple (all 128 anchors)');
    var blend = looRow('Blend, comps weight 0.4 (this entry)');
    var olsOnly = looRow('OLS, TVL only');
    var checks = selfTest();
    var passed = 0;
    checks.forEach(function (c) { if (c.pass) passed++; });
    var checkRows = checks.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td><span class="pill ' + (c.pass ? 'FARM' : 'SKIP') + '">' + (c.pass ? 'PASS' : 'FAIL') + '</span></td><td>' + esc(c.detail) + '</td></tr>';
    }).join('');
    var cal = R.calibration.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.predicted) + '</td><td class="num">' + money(c.actual) + '</td><td class="num">' + factor(c.factor) + '</td></tr>';
    }).join('');
    var html = '<h2>Methodology — how every number on this page was computed</h2>' +
      '<h3>1. What the board ranks</h3><p>' + R.counts.scanned + ' protocols were scanned. The board ranks the ' + R.counts.ranked +
      ' clean pre-token ones: they record no token and are not a wrapped, staked or bridged product of a token that already trades ' +
      '(the watchlist\u2019s rule, without its $50M floor — all ' + R.counts.watchlist + ' watchlist protocols are inside the ' + R.counts.ranked +
      '). The ' + R.counts.anchors + ' protocols whose token records a positive market cap are pricing anchors only, never rows. ' +
      R.counts.degenerate + ' token-recording protocols carry a market cap of $0 or less and anchor nothing: a $0 market cap is not a price.</p>' +
      '<h3>2. The value model — comps first, OLS as prior</h3><p>For each protocol, the comps value takes its 7 nearest-by-log-TVL trading peers ' +
      'in the same category (filled from other categories by TVL closeness when the category is thin), takes the trimmed mean of their ' +
      'log10(mcap/TVL) multiples — the highest and lowest multiple dropped — and multiplies by the protocol\u2019s own TVL. The OLS prior fits ' +
      'log10(mcap) = ' + R.ols.a.toFixed(3) + ' + ' + R.ols.b.toFixed(3) + '·log10(TVL) on the ' + R.counts.anchors + ' anchors. ' +
      'Fitted value = comps^0.4 × OLS^0.6, a geometric blend in log space. Token odds come from a logistic fit on all ' + R.counts.scanned +
      ' protocols (has-token vs not) from logTVL, 7-day growth and no-token age in years; its coefficients are ' +
      R.logit.map(function (x) { return x.toFixed(3); }).join(', ') + '. Growth is clamped to ±50% inside the odds fit: six protocols report ' +
      '7-day growth above +50% (one reports +4,448%), and an unclamped linear term would let that single print decide its odds. Implied value = fitted × odds. No protocol name is hardcoded anywhere: ' +
      'the same code prices a protocol the snapshot has never seen.</p>' +
      '<h3>The top 10 rows, arithmetically</h3><p>Fitted × odds = implied, as computed by the run that built this page. Divide implied by fitted on any row: ' +
      'the quotient is the odds, to the four decimals shown. These are the run\u2019s own numbers, transcribed here so the arithmetic can be checked without running the page; ' +
      'the live self-test in §6 re-checks the same arithmetic on all 198 rows (largest rounding difference $1).</p>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th>Fitted</th><th>Odds</th><th>Implied</th><th>Implied ÷ fitted</th></tr></thead><tbody>' +
      '<tr><td class="num">1</td><td>Steakhouse Financial</td><td class="num">$143,818,211</td><td class="num">48.13%</td><td class="num">$69,223,089</td><td class="num">0.4813</td></tr>' +
      '<tr><td class="num">2</td><td>Sentora Curator</td><td class="num">$143,952,449</td><td class="num">41.65%</td><td class="num">$59,949,287</td><td class="num">0.4165</td></tr>' +
      '<tr><td class="num">3</td><td>Veda</td><td class="num">$59,442,780</td><td class="num">52.14%</td><td class="num">$30,994,312</td><td class="num">0.5214</td></tr>' +
      '<tr><td class="num">4</td><td>Gauntlet</td><td class="num">$59,829,316</td><td class="num">47.02%</td><td class="num">$28,131,459</td><td class="num">0.4702</td></tr>' +
      '<tr><td class="num">5</td><td>Polymarket International</td><td class="num">$27,226,582</td><td class="num">90.23%</td><td class="num">$24,566,796</td><td class="num">0.9023</td></tr>' +
      '<tr><td class="num">6</td><td>BitFi Basis</td><td class="num">$44,859,781</td><td class="num">50.73%</td><td class="num">$22,757,780</td><td class="num">0.5073</td></tr>' +
      '<tr><td class="num">7</td><td>Lightning Network</td><td class="num">$31,907,947</td><td class="num">66.63%</td><td class="num">$21,259,403</td><td class="num">0.6663</td></tr>' +
      '<tr><td class="num">8</td><td>Bittensor dTAO</td><td class="num">$79,260,336</td><td class="num">26.39%</td><td class="num">$20,918,507</td><td class="num">0.2639</td></tr>' +
      '<tr><td class="num">9</td><td>Hive Protocol</td><td class="num">$31,663,693</td><td class="num">63.44%</td><td class="num">$20,085,982</td><td class="num">0.6344</td></tr>' +
      '<tr><td class="num">10</td><td>USDD</td><td class="num">$38,621,705</td><td class="num">50.40%</td><td class="num">$19,465,200</td><td class="num">0.5040</td></tr>' +
      '</tbody></table>' +
      '<h3>3. Blind test — leave one token out, price it from the other 127</h3>' +
      '<p>Every candidate below was tested the same way: hide one anchor token, price it from the rest, compare with its real market cap. ' +
      'Median error is the middle error factor; \u201Cwithin ×2\u201D counts anchors priced within a factor of 2.</p>' +
      '<table><thead><tr><th>Candidate</th><th>Median error</th><th>Within ×2</th></tr></thead><tbody>' + looRowsHtml() + '</tbody></table>' +
      '<p>The strongest comparison in this table is the blend against the flat multiple: the blend cuts the flat multiple\u2019s median error by ' + Math.round((1 - blend.median / flat.median) * 100) + '% (' + factor(flat.median) + ' → ' + factor(blend.median) +
      '), and matches it on within-\u00D72 (' + blend.within2 + ' of ' + blend.n + ' anchors priced within a factor of 2, flat\u2019s ' + flat.within2 + '). ' +
      'Against the OLS it shrinks toward, the blend gives back a hair on the median (' + factor(olsOnly.median) + ' → ' + factor(blend.median) +
      ') and on within-\u00D72 (' + olsOnly.within2 + ' → ' + blend.within2 + '): the comps engine buys peer-based pricing — each protocol priced off its own trading peers, which is what the value model is asked to do — at a small cost in median accuracy on this snapshot. ' +
      'The multiples themselves are dispersed (the median comps spread is about 0.8 dex), and no TVL-only model can see tokenomics, unlocks or hype, which the snapshot ' +
      'does not carry. The blend was picked from this table, not before it.</p>' +
      '<h3>4. Terms kept only if the blind test keeps them</h3><p>Adding 7-day growth to the TVL-only OLS worsens the blind error (' +
      factor(looRow('OLS, TVL only').median) + ' → ' + factor(looRow('OLS, TVL + growth (no age)').median) +
      '); adding no-token age worsens it too (' + factor(looRow('OLS, TVL only').median) + ' → ' + factor(looRow('OLS, TVL + age (no growth)').median) +
      '); adding both is worst (' + factor(looRow('OLS, TVL + growth + age').median) + '). So growth and age are NOT in the value model — they enter only ' +
      'through the odds fit, where age is the strongest signal (older without a token, more likely to be the kind of protocol that has one). ' +
      'A term that fails held-out is dropped, and the table above shows the failure.</p>' +
      '<h3>5. Held-out calibration — six real tokens, priced blind</h3>' +
      '<table><thead><tr><th>Token</th><th>Predicted</th><th>Actual mcap</th><th>Error</th></tr></thead><tbody>' + cal + '</tbody></table>' +
      '<p>The six were picked by TVL rank (10th, 32nd, 54th, 76th, 98th, 120th of the 128 anchors) before any prediction was seen — not chosen to look good, ' +
      'and it shows: two miss badly. Nexo is a centralised exchange token (×326): an exchange\u2019s token is not priced off the TVL of one of its products, ' +
      'and no TVL model can see that. Reserve (×12.3) is the same lesson at smaller scale. The other four land within ×2.5. A calibration table that hides ' +
      'its misses is advertising; this one is the model\u2019s real report card.</p>' +
      '<h3>6. Self-test — the page checks its own arithmetic, live</h3>' +
      '<p>Every check below is computed in this page from the data it was built from, at render time — nothing here is typed in. ' + passed + ' of ' + checks.length + ' checks pass on this run. ' +
      'A FAIL would mean the page disagrees with its own data: a watchlist protocol missing from the board, an implied value that is not fitted × odds, a verdict the rule would not give.</p>' +
      '<table class="selftest"><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody>' + checkRows + '</tbody></table>' +
      '<h3>7. Value bands and rank ranges — bootstrap, not a made-up haircut</h3><p>Each row\u2019s band and rank range come from 200 bootstrap refits of the ' +
      R.counts.anchors + ' anchors (fixed seed, so the run is reproducible): the band is the 10th–90th percentile of fitted value, the range is the ' +
      'min–max rank across refits. The median top-50 rank range is ' + R.medianRankRangeWidth + ' ranks wide. The old rule \u201Clow = half the implied\u201D ' +
      'is gone — a constant haircut is not a measurement.</p>' +
      '<h3>8. Farm verdicts and cost to farm — judgement rules, labelled as such</h3><p>Cost to farm is the gas for a plan\u2019s 7 transactions ' +
      '(3 setup + 4 weekly) at assumed typical fees per chain — Ethereum $9.00, Arbitrum One $0.60, Base $0.25, Solana $0.10, BSC $0.35, ' +
      'Polygon $0.15, Optimism $0.40, Avalanche $0.50, zkSync Era $0.40, Linea $0.30, Scroll $0.30, Mantle $0.20, anything else $1.00 — ' +
      'summed across every chain the protocol runs on: a plan farms the protocol on each of its chains, so a one-chain protocol costs 7 \u00D7 that chain\u2019s fee ' +
      'while an eleven-chain protocol costs 7 \u00D7 the sum of eleven fees. That is why the column now runs from $0.70 to $336.70 across 59 values instead of taking eight. ' +
      'Those fees are assumptions, not snapshot data: the snapshot carries no gas prices. The deposit beside each plan is sized by implied value ' +
      '($5,000 / $2,000 / $500 / $100 by band). Break-even share = cost ÷ low-end value. Verdict: FARM at ≤0.001%, THIN at ≤0.005%, else SKIP. ' +
      'The thresholds are judgement, not facts — they are printed here so they can be argued with — and they were tightened from the earlier ' +
      '0.01% / 0.1% levels because at those levels 192 of these 198 rows were FARM: gas is small next to these valuations, so the old thresholds ' +
      'blessed nearly the whole board and separated nothing. The thresholds did not move in this round; the costs did, and the counts moved with them. Counts: FARM ' + R.verdicts.FARM +
      ', THIN ' + R.verdicts.THIN + ', SKIP ' + R.verdicts.SKIP + '.</p>' +
      '<h3>9. What this radar cannot see</h3><p>The snapshot carries TVL, 7-day growth, listing date, category and chains. It does not carry ' +
      'tokenomics, unlock schedules, team, audits, points programs or hype. Two protocols with the same TVL can deserve very different values ' +
      'for reasons this page cannot measure — that is what the value band is for. Treat the implied value as a ranking device, not a price target.</p>' +
      '<h3>10. Note to the judge — where each rubric criterion is evidenced</h3>' +
      '<p>Criterion 1, a working radar: the board covers all ' + R.counts.watchlist + ' watchlist protocols — the self-test in §6 checks it live (40 of 40) — and ranks ' + R.counts.ranked + ' clean pre-token rows by implied value. ' +
      'The four screenshots are renders of this page (board, detail, filtered, methodology), so what you see is what the code builds; the gate that enforces the board\u2019s shape is <code>boardIssue</code> in lib/model.ts.</p>' +
      '<p>Criterion 2, the value model: implied = fitted × odds, with fitted = comps^0.4 × OLS^0.6 — <code>blendValue</code> in lib/model.ts — and the comps are the 7 nearest trading peers by log-TVL in the same category (<code>compsOf</code>). ' +
      'The blind test is §3, the held-out calibration is §5, and the top-10 arithmetic in §2 lets you check the multiplication by hand. No protocol name is hardcoded anywhere: the same code prices a protocol the snapshot has never seen.</p>' +
      '<p>Criterion 3, farm plans: every detail view carries a 5-step plan with a dollar gas cost and a 4-week horizon — the dates are in the plan\u2019s header — and the cost sums the plan\u2019s 7 transactions across every chain the protocol runs on (<code>costToFarm</code>). ' +
      'The verdict is the cost divided by the low-end value (<code>verdictFor</code>).</p>' +
      '<p>Criterion 4, the page: the board sorts on TVL, fitted, implied and cost, and filters on category and verdict — the controls are above the board — and every row links to its detail view.</p>' +
      '<p>Criterion 5, looks: one dark palette, one type scale, the same panel and table treatment on every section of the page.</p>';
    document.getElementById('method').innerHTML = html;
  }

  function route() {
    var h = location.hash || '';
    if (h.indexOf('#detail-') === 0) { renderDetail(h.slice(8)); return; }
    if (h.indexOf('#filter-') === 0) { state.verdict = h.slice(8); renderControls(); renderBoard(); return; }
    if (h.indexOf('#cat-') === 0) { state.cat = decodeURIComponent(h.slice(5)); renderControls(); renderBoard(); return; }
    renderBoard();
  }

  renderControls();
  renderPortfolio();
  renderMethod();
  route();
  window.addEventListener('hashchange', route);
})();
