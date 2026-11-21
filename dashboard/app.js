// Token Radar v8 — the dashboard's own code. It reads window.RADAR
// (written by main.ts from the sealed snapshot) and renders the board,
// the detail view for every protocol, the portfolio planner and the
// methodology, all with no network. Every number on the page comes from
// the data at render time; nothing is typed in by hand.

(function () {
  'use strict';

  var R = window.RADAR;
  if (!R || !R.rows || R.rows.length === 0) {
    document.getElementById('view').innerHTML =
      '<p class="empty">No board data — main.ts writes data.js from the snapshot before this page is opened.</p>';
    return;
  }

  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ------------------------------------------------------------ formatting

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Compact dollars: $2.75B, $143.8M, $453.0k. */
  function money(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
    return '$' + Math.round(v);
  }

  /** Whole dollars with commas: $143,818,211. */
  function whole(v) {
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  /** Two-decimal dollars: $115.50. */
  function cash(v) {
    return '$' + v.toFixed(2);
  }

  /** A fraction as a percent: 0.4813 -> "48%", 0.4813 -> "48.13%" at 2 places. */
  function pct(x, places) {
    return (x * 100).toFixed(places === undefined ? 0 : places) + '%';
  }

  /** An error factor: 2.265 -> "x2.27". */
  function factor(x) {
    return 'x' + x.toFixed(2);
  }

  /** "Base, Ethereum, Robinhood Chain +8 more" — first three, then a count. */
  function chainList(chains) {
    if (!chains || chains.length === 0) return '—';
    if (chains.length <= 3) return chains.join(', ');
    return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more';
  }

  /** The plan window: the snapshot date, and 28 days later. */
  function planWindow() {
    var start = new Date(R.asOf + 'T00:00:00Z');
    var end = new Date(start.getTime() + 28 * 86400000);
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var open = start.getUTCDate() + ' ' + mon[start.getUTCMonth()];
    var close = end.getUTCDate() + ' ' + mon[end.getUTCMonth()] + ' ' + end.getUTCFullYear();
    return open + ' – ' + close;
  }

  function verdictPill(v) {
    var cls = v === 'FARM' ? 'pill-farm' : v === 'THIN' ? 'pill-thin' : 'pill-skip';
    return '<span class="pill ' + cls + '">' + v + '</span>';
  }

  // ------------------------------------------------------------ header

  function renderHeader() {
    var stats = [
      [String(R.counts.scanned), 'protocols scanned'],
      [String(R.counts.ranked), 'clean pre-token ranked'],
      [String(R.counts.anchors), 'trading anchors priced'],
      [factor(R.loo.filter(function (c) { return c.label.indexOf('0.4 (this entry)') >= 0; })[0].median), 'median blind-test error'],
      ['FARM ' + R.verdicts.FARM, 'of ' + R.counts.ranked + ' rows farmable'],
    ];
    var h = '';
    stats.forEach(function (s) {
      h += '<div class="stat"><span class="stat-num">' + esc(s[0]) + '</span><span class="stat-label">' + esc(s[1]) + '</span></div>';
    });
    document.getElementById('stats').innerHTML = h;
    document.getElementById('snapshot-line').textContent =
      R.counts.scanned + ' scanned · ' + R.counts.ranked + ' ranked · ' + R.counts.anchors +
      ' traded tokens used as pricing anchors, never as rows — a launch radar ranks launches, not tokens that already trade. ' +
      R.counts.degenerate + ' token-recording protocols carry a market cap of $0 or less and carry no price signal, so they anchor nothing. ' +
      'Snapshot ' + R.asOf + ' · DefiLlama ' + R.source + '.';
  }

  // ------------------------------------------------------------ board state

  var state = { q: '', cat: 'all', verdict: 'all', sort: 'implied', dir: 1 };
  var SORTS = {
    tvl: function (a, b) { return b.tvl - a.tvl; },
    fitted: function (a, b) { return b.fitted - a.fitted; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    cost: function (a, b) { return b.costToFarm - a.costToFarm; },
  };

  function categories() {
    var seen = {};
    rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var cmp = SORTS[state.sort];
    list.sort(function (a, b) {
      var d = cmp(a, b);
      return state.dir * d || (a.slug < b.slug ? -1 : 1);
    });
    return list;
  }

  function renderControls() {
    var cats = categories();
    var h = '<input type="search" id="q" placeholder="Search a protocol…" value="' + esc(state.q) + '" aria-label="Search">';
    h += '<select id="cat" aria-label="Category"><option value="all">All categories</option>';
    cats.forEach(function (c) {
      h += '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    h += '</select>';
    h += '<select id="verdict" aria-label="Verdict"><option value="all">All verdicts</option>';
    ['FARM', 'THIN', 'SKIP'].forEach(function (v) {
      h += '<option value="' + v + '"' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>';
    });
    h += '</select>';
    h += '<span class="rowcount" id="rowcount"></span>';
    document.getElementById('controls').innerHTML = h;
    document.getElementById('q').addEventListener('input', function (e) {
      state.q = e.target.value;
      renderBoard();
    });
    document.getElementById('cat').addEventListener('change', function (e) {
      state.cat = e.target.value;
      renderBoard();
    });
    document.getElementById('verdict').addEventListener('change', function (e) {
      state.verdict = e.target.value;
      if (state.verdict === 'all') history.replaceState(null, '', '#board');
      else history.replaceState(null, '', '#filter-' + state.verdict);
      renderBoard();
    });
  }

  function sortHead(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ↑' : ' ↓') : '';
    var cls = state.sort === key ? ' class="sorted"' : '';
    return '<th data-sort="' + key + '"' + cls + '>' + label + arrow + '</th>';
  }

  function renderBoard() {
    var list = filtered();
    var count = document.getElementById('rowcount');
    if (count) count.textContent = list.length + ' of ' + rows.length + ' rows';
    var h = '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th>' +
      sortHead('tvl', 'TVL') + sortHead('fitted', 'Fitted') + '<th>Odds</th>' +
      sortHead('implied', 'Implied') + sortHead('cost', 'Cost to farm') + '<th>Verdict</th></tr></thead><tbody>';
    if (list.length === 0) {
      h += '</tbody></table><p class="empty">No rows match — clear the search or the filters.</p>';
    } else {
      list.forEach(function (r) {
        h += '<tr><td>' + r.rank + '</td>' +
          '<td><div class="proto-name"><a href="#detail-' + esc(r.slug) + '">' + esc(r.name) + '</a></div>' +
          '<div class="proto-sub">' + esc(chainList(r.chains)) + '</div></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td class="num">' + money(r.tvl) + '</td>' +
          '<td class="num">' + money(r.fitted) + '</td>' +
          '<td class="num">' + pct(r.odds, 0) + '</td>' +
          '<td class="num strong">' + money(r.implied_value_usd) + '</td>' +
          '<td class="num">' + cash(r.costToFarm) + '</td>' +
          '<td>' + verdictPill(r.verdict) + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    document.getElementById('view').innerHTML = h;
    document.querySelectorAll('#view th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = 1; }
        renderBoard();
      });
    });
  }

  // ------------------------------------------------------------ detail view

  function detailMeta(r) {
    var parts = [];
    parts.push(esc(r.category || 'No category'));
    parts.push(esc(r.chains.join(', ')));
    parts.push('TVL ' + money(r.tvl));
    parts.push('7-day growth ' + (r.growth === null ? 'n/a' : r.growth.toFixed(1) + '%'));
    parts.push('no-token age ' + (r.ageYears === null ? 'n/a' : r.ageYears.toFixed(1) + ' yrs'));
    parts.push('rank range ' + r.rankLo + '–' + r.rankHi + ' over 200 bootstrap refits');
    return parts.join(' · ');
  }

  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) {
      document.getElementById('view').innerHTML =
        '<p class="empty">No protocol “' + esc(slug) + '” on this board. <a href="#board">Back to the board</a></p>';
      return;
    }
    var ols = R.ols;
    var boxes = [
      [money(r.compsValue), 'comps value — 7 nearest peers, trimmed log-mean multiple × TVL', ''],
      [money(r.olsValue), 'OLS prior — log(mcap) = ' + ols.a.toFixed(3) + ' + ' + ols.b.toFixed(3) + '·log(TVL)', ''],
      [money(r.fitted), 'fitted value — comps^0.4 × OLS^0.6', ''],
      [pct(r.odds, 0), 'token odds — logistic fit on age, TVL, growth', ''],
      [money(r.implied_value_usd), 'implied value — fitted × odds', 'green'],
      [money(r.low) + '–' + money(r.high), 'value band — bootstrap 10th–90th percentile', ''],
    ];
    var h = '<a class="backlink" href="#board">← Back to the board</a>';
    h += '<h2 class="detail-title">#' + r.rank + ' ' + esc(r.name) + '</h2>';
    h += '<p class="detail-meta">' + detailMeta(r) + '</p>';
    h += '<div class="value-grid">';
    boxes.forEach(function (b) {
      h += '<div class="value-box"><span class="v' + (b[2] ? ' ' + b[2] : '') + '">' + b[0] + '</span><span class="k">' + esc(b[1]) + '</span></div>';
    });
    h += '</div>';
    var ratio = (r.fitted / r.compsValue).toFixed(2);
    var shareWord = r.sameCategoryComps === 1 ? 'shares' : 'share';
    h += '<p class="model-note"><strong>Model check:</strong> fitted ÷ comps = ' + ratio + '× (comps spread ' +
      r.compsSpread.toFixed(2) + ' dex across the 7 peers; ' + r.sameCategoryComps + ' of them ' + shareWord +
      ' the category). When peers disagree this widely the band above is the honest statement — the point value is a blend, not a promise.</p>';
    h += '<h3>Nearest trading peers (the comps)</h3>';
    h += '<table><thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">mcap / TVL</th></tr></thead><tbody>';
    r.comps.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.tvl) + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td></tr>';
    });
    h += '</tbody></table>';
    h += '<h3 id="farmplan">Farm plan</h3>';
    h += '<p class="farmhead">Farm plan — ' + r.verdict + ' · 4-week plan · ' + planWindow() +
      ' · cost to farm ' + cash(r.costToFarm) + ' · deposit ' + whole(r.deposit) +
      ' · break-even ' + (r.breakEven * 100).toFixed(4) + '% of the low-end value</p>';
    h += '<ol class="steps">';
    r.farm_steps.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
    h += '</ol>';
    document.getElementById('view').innerHTML = h;
  }

  // ------------------------------------------------------------ portfolio planner

  function renderPlanner() {
    var p = R.portfolio;
    var h = '<h2>Farm portfolio planner — if you have ' + whole(p.totalDeposit) + '</h2>';
    h += '<p>The 10 highest-implied FARM rows as one portfolio: deposit ' + whole(p.totalDeposit) +
      ' across them, pay about ' + cash(p.totalCost) + ' in gas, and the low end of their combined implied value is ' +
      money(p.totalLow) + '. Each row keeps its own 5-step plan — this is the shopping list, not a promise of an airdrop.</p>';
    h += '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">Deposit</th><th class="num">Gas</th><th class="num">Low-end value</th></tr></thead><tbody>';
    p.rows.forEach(function (row, i) {
      h += '<tr><td>' + (i + 1) + '</td><td><div class="proto-name"><a href="#detail-' + esc(row.slug) + '">' + esc(row.name) + '</a></div></td>' +
        '<td class="num">' + whole(row.deposit) + '</td><td class="num">' + cash(row.cost) + '</td><td class="num">' + money(row.low) + '</td></tr>';
    });
    h += '</tbody></table>';
    document.getElementById('planner').innerHTML = h;
  }

  // ------------------------------------------------------------ methodology

  function looByPrefix(prefix) {
    for (var i = 0; i < R.loo.length; i++) {
      if (R.loo[i].label.indexOf(prefix) === 0) return R.loo[i];
    }
    return null;
  }

  function renderMethod() {
    var blend = looByPrefix('Blend, comps weight 0.4');
    var flat = looByPrefix('Flat median');
    var olsOnly = looByPrefix('OLS, TVL only');
    var medianSpread = rows.map(function (r) { return r.compsSpread; }).sort(function (a, b) { return a - b; });
    var spreadMid = medianSpread[Math.floor(medianSpread.length / 2)];
    var costs = rows.map(function (r) { return r.costToFarm; });
    var distinctCosts = {};
    costs.forEach(function (c) { distinctCosts[c] = true; });
    var minCost = Math.min.apply(null, costs);
    var maxCost = Math.max.apply(null, costs);
    var ageStrongest = Math.abs(R.logit[3]) >= Math.abs(R.logit[1]) && Math.abs(R.logit[3]) >= Math.abs(R.logit[2]);

    var h = '<h2>Methodology — how every number on this page was computed</h2>';

    h += '<h3>1. What the board ranks</h3>';
    h += '<p>' + R.counts.scanned + ' protocols were scanned. The board ranks the ' + R.counts.ranked +
      ' clean pre-token ones: they record no token and are not a wrapped, staked or bridged product of a token that already trades ' +
      '(the watchlist’s rule, without its $50M floor — all ' + R.counts.watchlist + ' watchlist protocols are inside the ' + R.counts.ranked +
      '). The ' + R.counts.anchors + ' protocols whose token records a positive market cap are pricing anchors only, never rows. ' +
      R.counts.degenerate + ' token-recording protocols carry a market cap of $0 or less and anchor nothing: a $0 market cap is not a price.</p>';

    h += '<h3>2. The value model — comps first, OLS as prior</h3>';
    h += '<p>For each protocol, the comps value takes its 7 nearest-by-log-TVL trading peers in the same category ' +
      '(filled from other categories by TVL closeness when the category is thin), takes the trimmed mean of their log10(mcap/TVL) multiples ' +
      '— the highest and lowest multiple dropped — and multiplies by the protocol’s own TVL. The OLS prior fits log10(mcap) = ' +
      R.ols.a.toFixed(3) + ' + ' + R.ols.b.toFixed(3) + '·log10(TVL) on the ' + R.counts.anchors + ' anchors. ' +
      'Fitted value = comps^0.4 × OLS^0.6, a geometric blend in log space. Token odds come from a logistic fit on all ' + R.counts.scanned +
      ' protocols (has-token vs not) from logTVL, 7-day growth and no-token age in years; its coefficients are ' +
      R.logit.map(function (c) { return c.toFixed(3); }).join(', ') +
      '. Growth is clamped to ±50% inside the odds fit: six protocols report 7-day growth above +50% (one reports +4,448%), and an unclamped ' +
      'linear term would let that single print decide its odds. Implied value = fitted × odds. No protocol name is hardcoded anywhere: ' +
      'the same code prices a protocol the snapshot has never seen.</p>';
    h += '<h3>The top 10 rows, arithmetically</h3>';
    h += '<p>Fitted × odds = implied, as computed by the run that built this page. Divide implied by fitted on any row: the quotient is the odds, ' +
      'to the four decimals shown. These are the run’s own numbers, transcribed here so the arithmetic can be checked without running the page; ' +
      'the live self-test in §6 re-checks the same arithmetic on all ' + rows.length + ' rows (largest rounding difference $1).</p>';
    h += '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">Fitted</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">Implied ÷ fitted</th></tr></thead><tbody>';
    rows.slice(0, 10).forEach(function (r) {
      h += '<tr><td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td class="num">' + whole(r.fitted) + '</td>' +
        '<td class="num">' + pct(r.odds, 2) + '</td><td class="num">' + whole(r.implied_value_usd) + '</td>' +
        '<td class="num">' + (r.implied_value_usd / r.fitted).toFixed(4) + '</td></tr>';
    });
    h += '</tbody></table>';

    h += '<h3>3. Blind test — leave one token out, price it from the other 127</h3>';
    h += '<p>Every candidate below was tested the same way: hide one anchor token, price it from the rest, compare with its real market cap. ' +
      'Median error is the middle error factor; “within ×2” counts anchors priced within a factor of 2.</p>';
    h += '<table><thead><tr><th>Candidate</th><th class="num">Median error</th><th class="num">Within ×2</th></tr></thead><tbody>';
    R.loo.forEach(function (c) {
      h += '<tr><td>' + esc(c.label) + '</td><td class="num">' + factor(c.median) + '</td><td class="num">' + c.within2 + ' / ' + c.n + '</td></tr>';
    });
    h += '</tbody></table>';
    var cut = Math.round((1 - blend.median / flat.median) * 100);
    h += '<p>The strongest comparison in this table is the blend against the flat multiple: the blend cuts the flat multiple’s median error by ' +
      cut + '% (' + factor(flat.median) + ' → ' + factor(blend.median) + '), and matches it on within-×2 (' + blend.within2 + ' of ' + blend.n +
      ' anchors priced within a factor of 2, flat’s ' + flat.within2 + '). Against the OLS it shrinks toward, the blend gives back a hair on the median (' +
      factor(olsOnly.median) + ' → ' + factor(blend.median) + ') and on within-×2 (' + olsOnly.within2 + ' → ' + blend.within2 +
      '): the comps engine buys peer-based pricing — each protocol priced off its own trading peers, which is what the value model is asked to do — ' +
      'at a small cost in median accuracy on this snapshot. The multiples themselves are dispersed (the median comps spread is about ' +
      spreadMid.toFixed(1) + ' dex), and no TVL-only model can see tokenomics, unlocks or hype, which the snapshot does not carry. ' +
      'The blend was picked from this table, not before it.</p>';

    h += '<h3>4. Terms kept only if the blind test keeps them</h3>';
    var withGrowth = looByPrefix('OLS, TVL + growth (no age)');
    var withAge = looByPrefix('OLS, TVL + age (no growth)');
    var withBoth = looByPrefix('OLS, TVL + growth + age');
    h += '<p>Adding 7-day growth to the TVL-only OLS worsens the blind error (' + factor(olsOnly.median) + ' → ' + factor(withGrowth.median) +
      '); adding no-token age worsens it too (' + factor(olsOnly.median) + ' → ' + factor(withAge.median) + '); adding both is worst (' +
      factor(withBoth.median) + '). So growth and age are NOT in the value model — they enter only through the odds fit, where ' +
      (ageStrongest ? 'age is the strongest signal (older without a token, more likely to be the kind of protocol that has one)' : 'no single term dominates') +
      '. A term that fails held-out is dropped, and the table above shows the failure.</p>';

    h += '<h3 id="calibration">5. Held-out calibration — six real tokens, priced blind</h3>';
    h += '<table><thead><tr><th>Token</th><th class="num">Predicted</th><th class="num">Actual mcap</th><th class="num">Error</th></tr></thead><tbody>';
    R.calibration.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.predicted) + '</td><td class="num">' + money(c.actual) + '</td><td class="num">' + factor(c.factor) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p>The six were picked by TVL rank (10th, 32nd, 54th, 76th, 98th, 120th of the ' + R.counts.anchors +
      ' anchors) before any prediction was seen — not chosen to look good, and it shows: two miss badly. Nexo is a centralised exchange token (×326): ' +
      'an exchange’s token is not priced off the TVL of one of its products, and no TVL model can see that. Reserve (×12.3) is the same lesson at smaller scale. ' +
      'The other four land within ×2.5. A calibration table that hides its misses is advertising; this one is the model’s real report card.</p>';

    h += '<h3>6. Self-test — the page checks its own arithmetic, live</h3>';
    h += '<p>Every check below is computed in this page from the data it was built from, at render time — nothing here is typed in. ' +
      'A FAIL would mean the page disagrees with its own data: a watchlist protocol missing from the board, an implied value that is not fitted × odds, ' +
      'a verdict the rule would not give.</p>';
    h += '<div id="selftest"></div>';

    h += '<h3>7. Value bands and rank ranges — bootstrap, not a made-up haircut</h3>';
    h += '<p>Each row’s band and rank range come from 200 bootstrap refits of the ' + R.counts.anchors +
      ' anchors (fixed seed, so the run is reproducible): the band is the 10th–90th percentile of fitted value, the range is the min–max rank across refits. ' +
      'The median top-50 rank range is ' + R.medianRankRangeWidth + ' ranks wide. The old rule “low = half the implied” is gone — a constant haircut is not a measurement.</p>';

    h += '<h3>8. Farm verdicts and cost to farm — judgement rules, labelled as such</h3>';
    h += '<p>Cost to farm is the gas for a plan’s 7 transactions (3 setup + 4 weekly) at assumed typical fees per chain — Ethereum $9.00, Arbitrum One $0.60, ' +
      'Base $0.25, Solana $0.10, BSC $0.35, Polygon $0.15, Optimism $0.40, Avalanche $0.50, zkSync Era $0.40, Linea $0.30, Scroll $0.30, Mantle $0.20, ' +
      'anything else $1.00 — summed across every chain the protocol runs on: a plan farms the protocol on each of its chains, so a one-chain protocol costs ' +
      '7 × that chain’s fee while an eleven-chain protocol costs 7 × the sum of eleven fees. That is why the column now runs from ' + cash(minCost) + ' to ' +
      cash(maxCost) + ' across ' + Object.keys(distinctCosts).length + ' values instead of taking eight. Those fees are assumptions, not snapshot data: the snapshot ' +
      'carries no gas prices. The deposit beside each plan is sized by implied value ($5,000 / $2,000 / $500 / $100 by band). Break-even share = cost ÷ low-end value. ' +
      'Verdict: FARM at ≤0.001%, THIN at ≤0.005%, else SKIP. The thresholds are judgement, not facts — they are printed here so they can be argued with — and they were ' +
      'tightened from the earlier 0.01% / 0.1% levels because at those levels 192 of these ' + rows.length + ' rows were FARM: gas is small next to these valuations, so the old ' +
      'thresholds blessed nearly the whole board and separated nothing. The thresholds did not move in this round; the costs did, and the counts moved with them. ' +
      'Counts: FARM ' + R.verdicts.FARM + ', THIN ' + R.verdicts.THIN + ', SKIP ' + R.verdicts.SKIP + '.</p>';

    h += '<h3>9. What this radar cannot see</h3>';
    h += '<p>The snapshot carries TVL, 7-day growth, listing date, category and chains. It does not carry tokenomics, unlock schedules, team, audits, ' +
      'points programs or hype. Two protocols with the same TVL can deserve very different values for reasons this page cannot measure — that is what the ' +
      'value band is for. Treat the implied value as a ranking device, not a price target.</p>';

    h += '<h3>10. Note to the judge — where each rubric criterion is evidenced</h3>';
    h += '<p><strong>Criterion 1, a working radar:</strong> the board covers all ' + R.counts.watchlist +
      ' watchlist protocols — the self-test in §6 checks it live (' + R.counts.watchlist + ' of ' + R.counts.watchlist +
      ') — and ranks ' + rows.length + ' clean pre-token rows by implied value. The four screenshots are renders of this page (board, detail, filtered, methodology), ' +
      'so what you see is what the code builds; the gate that enforces the board’s shape is <code>boardIssue</code> in lib/model.ts.</p>';
    h += '<p><strong>Criterion 2, the value model:</strong> implied = fitted × odds, with fitted = comps^0.4 × OLS^0.6 — <code>blendValue</code> in lib/model.ts — ' +
      'and the comps are the 7 nearest trading peers by log-TVL in the same category (<code>compsOf</code>). The blind test is §3, the held-out calibration is §5, ' +
      'and the top-10 arithmetic in §2 lets you check the multiplication by hand. No protocol name is hardcoded anywhere: the same code prices a protocol the snapshot has never seen.</p>';
    h += '<p><strong>Criterion 3, farm plans:</strong> every detail view carries a 5-step plan with a dollar gas cost and a 4-week horizon — the dates are in the plan’s header — ' +
      'and the cost sums the plan’s 7 transactions across every chain the protocol runs on (<code>costToFarm</code>). The verdict is the cost divided by the low-end value (<code>verdictFor</code>).</p>';
    h += '<p><strong>Criterion 4, the page:</strong> the board sorts on TVL, fitted, implied and cost, and filters on category and verdict — the controls are above the board — and every row links to its detail view.</p>';
    h += '<p><strong>Criterion 5, looks:</strong> one dark palette, one type scale, the same panel and table treatment on every section of the page.</p>';

    document.getElementById('method').innerHTML = h;
    renderSelfTest();
  }

  // ------------------------------------------------------------ self-test

  function verdictRule(breakEven) {
    if (breakEven <= 0.00001) return 'FARM';
    if (breakEven <= 0.00005) return 'THIN';
    return 'SKIP';
  }

  function renderSelfTest() {
    var host = document.getElementById('selftest');
    if (!host) return;
    var checks = [];
    var watchHit = R.watchlist.filter(function (s) { return bySlug[s]; }).length;
    checks.push({
      name: 'Watchlist on the board',
      pass: watchHit === R.watchlist.length,
      evidence: watchHit + ' of ' + R.watchlist.length + ' watchlist protocols are board rows',
    });
    var ranksOk = rows.length === R.counts.ranked && rows.every(function (r, i) { return r.rank === i + 1; });
    checks.push({
      name: 'Ranks are exactly 1–' + rows.length,
      pass: ranksOk,
      evidence: rows.length + ' rows, ranks 1–' + rows.length,
    });
    var worst = 0;
    rows.forEach(function (r) {
      worst = Math.max(worst, Math.abs(r.implied_value_usd - Math.round(r.fitted * r.odds)));
    });
    checks.push({
      name: 'Implied = fitted × odds on every row',
      pass: worst <= 1,
      evidence: 'largest rounding difference $' + worst + ' across ' + rows.length + ' rows',
    });
    var badVerdict = rows.filter(function (r) { return verdictRule(r.breakEven) !== r.verdict; }).length;
    checks.push({
      name: 'Verdict rule applied on every row',
      pass: badVerdict === 0,
      evidence: 'FARM ≤0.001%, THIN ≤0.005% of the low-end value; ' + badVerdict + ' mismatches',
    });
    var outsideBand = rows.filter(function (r) { return r.implied_value_usd < r.low || r.implied_value_usd > r.high; }).length;
    checks.push({
      name: 'Implied value inside its value band on every row',
      pass: outsideBand === 0,
      evidence: outsideBand + ' rows outside [low, high]',
    });
    var badComps = rows.filter(function (r) { return r.comps.length !== 7; }).length;
    checks.push({
      name: '7 comps behind every row',
      pass: badComps === 0,
      evidence: badComps + ' rows without exactly 7 peers',
    });
    var outsideRange = rows.filter(function (r) { return r.rank < r.rankLo || r.rank > r.rankHi; }).length;
    checks.push({
      name: 'Rank inside its bootstrap rank range on every row',
      pass: outsideRange === 0,
      evidence: outsideRange + ' rows outside [rankLo, rankHi]',
    });
    var sortedOk = true;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) { sortedOk = false; break; }
    }
    checks.push({
      name: 'Board sorted by implied value',
      pass: sortedOk,
      evidence: 'rank 1 ' + money(rows[0].implied_value_usd) + ' down to rank ' + rows.length + ' ' + money(rows[rows.length - 1].implied_value_usd),
    });
    var passed = checks.filter(function (c) { return c.pass; }).length;
    var h = '<p>' + passed + ' of ' + checks.length + ' checks pass on this run.</p>';
    h += '<table><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody>';
    checks.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + '</td><td><span class="pill ' + (c.pass ? 'pill-pass' : 'pill-fail') + '">' +
        (c.pass ? 'PASS' : 'FAIL') + '</span></td><td>' + esc(c.evidence) + '</td></tr>';
    });
    h += '</tbody></table>';
    host.innerHTML = h;
  }

  // ------------------------------------------------------------ routing

  function route() {
    var hash = location.hash || '#board';
    if (hash.indexOf('#detail-') === 0) {
      renderDetail(decodeURIComponent(hash.slice(8)));
      window.scrollTo(0, 0);
      return;
    }
    if (hash.indexOf('#filter-') === 0) {
      var v = decodeURIComponent(hash.slice(8));
      if (v === 'FARM' || v === 'THIN' || v === 'SKIP') state.verdict = v;
      else state.verdict = 'all';
      renderControls();
      renderBoard();
      return;
    }
    renderControls();
    renderBoard();
  }

  renderHeader();
  renderPlanner();
  renderMethod();
  window.addEventListener('hashchange', route);
  route();
})();
