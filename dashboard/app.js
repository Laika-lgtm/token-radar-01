/* Token Radar dashboard: renders window.RADAR with no network.
 *
 * The farm plan below is the same generator the model's lib/model.ts runs:
 * the action, the capital and the gas come from the row's own category,
 * chains, TVL and age — never from a list of names. The detail view shows
 * exactly the steps board.json carries for that row; the check is that
 * farmStepsFor(row) equals the row's farm_steps for every row.
 */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.innerHTML = '<p>Token Radar data did not load.</p>'; return; }
  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.s] = r; });

  /* ------------------------------------------------------------ money */
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(g) { return g === null || g === undefined ? '—' : (g > 0 ? '+' : '') + g.toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------- farm plans */
  function chainOf(row) { return row.h ? row.h.split('|')[0] : 'its main chain'; }
  function capitalFor(row) {
    if (row.t >= 5e9) return 250;
    if (row.t >= 1e9) return 150;
    if (row.t >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $6 of gas';
    if (chain === 'Solana' || chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Polygon') return 'under $1 of gas';
    if (chain === 'Bitcoin') return 'about $2 of network fees';
    return 'about $2 of gas';
  }
  function actionFor(row, capital, chain) {
    var c = (row.c || '').toLowerCase();
    var name = row.n;
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the loan-to-value below 50%.';
    if (c.indexOf('cdp') >= 0) return 'Open a vault on ' + name + ' on ' + chain + ', deposit $' + capital + ' of collateral and mint a small amount of stablecoin.';
    if (c.indexOf('dex') >= 0) return 'Swap $' + capital + ' through ' + name + ' on ' + chain + ', then add liquidity to its deepest pool and keep the position open.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s highest-TVL vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('risk curator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' curator vault on ' + chain + ' and keep the vault shares for the full window.';
    if (c.indexOf('capital allocator') >= 0) return 'Allocate $' + capital + ' of USDC to a ' + name + ' vault on ' + chain + ' and keep the allocation open.';
    if (c.indexOf('rwa') >= 0) return 'Mint or buy $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in the same wallet.';
    if (c.indexOf('prediction') >= 0) return 'Fund your account with $' + capital + ' of USDC on ' + name + ' and take one position in an active market on ' + chain + '.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s basis vault on ' + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' in two separate payments a week apart.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + '\'s index token on ' + chain + ' and hold it.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed liquidity position on ' + chain + ' and keep it open.';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a $' + capital + ' leveraged farming position on ' + name + ' on ' + chain + ' at 2x or less and check it weekly.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' and use it in ' + name + '\'s app at least once a week.';
    if (c.indexOf('governance') >= 0) return 'Lock or delegate $' + capital + ' of assets through ' + name + ' on ' + chain + ' and vote in one proposal.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s farm on ' + chain + ' and keep the position staked.';
    if (c.indexOf('btc') >= 0) return 'Mint or hold $' + capital + ' of ' + name + '\'s BTC-backed asset on ' + chain + '.';
    if (c.indexOf('otc') >= 0) return 'Complete one $' + capital + ' OTC trade through ' + name + ' on ' + chain + '.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('staking pool') >= 0) return 'Stake $' + capital + ' through ' + name + '\'s pool on ' + chain + ' and keep the receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('card') >= 0) return 'Order the card and spend $' + capital + ' through ' + name + ' on ' + chain + ' over two separate purchases.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(row) {
    var c = (row.c || '').toLowerCase();
    var name = row.n;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply, then repay it in full within the same week.';
    if (c.indexOf('dex') >= 0) return 'Make one more swap through ' + name + ' each week so the wallet shows repeated use.';
    if (c.indexOf('prediction') >= 0) return 'Take one more position in a different market each week.';
    if (c.indexOf('payment') >= 0) return 'Make a second payment through ' + name + ' the following week.';
    if (c.indexOf('governance') >= 0) return 'Vote in a second proposal when one opens.';
    return 'Come back once a week and make one more qualifying action — a deposit, a swap, a borrow or a vote, whichever ' + name + ' offers.';
  }
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmStepsFor(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.a);
    var gas = gasFor(chain);
    return [
      stepText('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      stepText(actionFor(row, capital, chain), '$' + capital + ' of capital and ' + gas, '15 minutes to set up'),
      stepText(secondActionFor(row), 'about ' + gas + ' a week', '10 minutes a week'),
      stepText('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'),
      stepText('Before you withdraw, open the protocol\'s own points or rewards page from the link it publishes itself, and claim only there.', 'nothing to check, and never pay to claim', '10 minutes'),
      stepText('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes')
    ];
  }
  window.farmStepsFor = farmStepsFor;

  /* ------------------------------------------------------------ header */
  $('asof').textContent = D.as_of;
  $('asof2').textContent = D.as_of;
  var top = rows[0];
  $('stats').innerHTML =
    '<div><dt>Protocols scanned</dt><dd>758</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + D.watchlist_size + '</dd></div>' +
    '<div><dt>Ranked</dt><dd>' + D.board_size + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + money(top.v) + '</dd></div>' +
    '<div><dt>Watchlist floor</dt><dd>' + money(D.floor_usd) + '</dd></div>';

  /* ------------------------------------------------------------ filters */
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.c && cats.indexOf(r.c) < 0) cats.push(r.c);
    r.h.split('|').forEach(function (ch) { if (ch && chains.indexOf(ch) < 0) chains.push(ch); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $('cat').appendChild(new Option(c, c)); });
  chains.forEach(function (c) { $('chain').appendChild(new Option(c, c)); });

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'r', dir: 1 };
  function readHash() {
    var h = (location.hash || '').slice(1);
    var parts = h ? h.split('&') : [];
    parts.forEach(function (p) {
      var kv = p.split('=');
      var k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent(kv[1] || '');
      if (k === 'detail') showDetail(v);
      if (k === 'cat') { state.cat = v; $('cat').value = v; }
      if (k === 'chain') { state.chain = v; $('chain').value = v; }
      if (k === 'watchlist') { state.watch = v === '1'; $('watch').checked = true; }
      if (k === 'q') { state.q = v; $('q').value = v; }
    });
  }
  function filtered() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.w) return false;
      if (state.cat && r.c !== state.cat) return false;
      if (state.chain && r.h.split('|').indexOf(state.chain) < 0) return false;
      if (q && (r.n.toLowerCase().indexOf(q) < 0 && r.s.indexOf(q) < 0)) return false;
      return true;
    });
  }
  function sorted(list) {
    var k = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'string') return dir * (x < y ? -1 : x > y ? 1 : 0);
      return dir * (x - y);
    });
  }
  function render() {
    var list = sorted(filtered());
    var html = list.map(function (r) {
      var g = r.g;
      var gcls = g === null ? '' : g >= 0 ? 'up' : 'down';
      var chains = r.h.split('|').slice(0, 3).join(', ') + (r.h.split('|').length > 3 ? ' +' + (r.h.split('|').length - 3) : '');
      return '<tr data-slug="' + esc(r.s) + '"' + (selected === r.s ? ' class="selected"' : '') + '>' +
        '<td class="num rank">' + r.r + '</td>' +
        '<td><span class="name">' + esc(r.n) + '</span>' + (r.w ? '<span class="badge">WATCHLIST</span>' : '') +
        '<span class="sub">' + esc(r.s) + '</span></td>' +
        '<td>' + esc(r.c || '—') + '</td>' +
        '<td>' + esc(chains) + '</td>' +
        '<td class="num">' + money(r.t) + '</td>' +
        '<td class="num ' + gcls + '">' + pct(g) + '</td>' +
        '<td class="num">' + (r.a === null || r.a === undefined ? '—' : r.a + 'd') + '</td>' +
        '<td class="num"><strong>' + money(r.v) + '</strong></td>' +
        '<td class="num">' + r.m.toFixed(2) + '&times;</td></tr>';
    }).join('');
    $('rows').innerHTML = html || '<tr><td colspan="9">No protocol matches these filters.</td></tr>';
    $('count').textContent = list.length + ' of ' + rows.length + ' ranked protocols shown. Implied values are this radar\u2019s own estimates.';
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
      th.classList.toggle('asc', th.getAttribute('data-sort') === state.sort && state.dir === -1);
    });
  }
  var selected = null;
  function showDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    selected = slug;
    var steps = farmStepsFor(r);
    var comp = null;
    D.comps.forEach(function (c) { if (c.category === (r.c || '(no category)')) comp = c; });
    var g = r.g;
    var allChains = r.h.split('|');
    var chainList = allChains.slice(0, 5).join(', ') + (allChains.length > 5 ? ' +' + (allChains.length - 5) + ' more' : '');
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<button class="close" type="button" id="closeDetail">Close</button>' +
      '<h2>#' + r.r + ' ' + esc(r.n) + '</h2>' +
      '<p class="meta">' + esc(r.c || 'Uncategorised') + ' &middot; ' + esc(chainList) + ' &middot; listed ' +
      (r.a === null || r.a === undefined ? 'date not recorded' : r.a + ' days before the snapshot') +
      ' &middot; TVL ' + money(r.t) + ' &middot; 7-day change ' + pct(g) + (r.w ? ' &middot; on the watchlist' : '') + '</p>' +
      '<div class="model-grid">' +
      '<div><dt>Implied value</dt><dd>' + money(r.v) + '</dd></div>' +
      '<div><dt>Category multiple</dt><dd>' + r.m.toFixed(3) + '&times;<small>' + (comp ? comp.comps + ' trading comps' + (comp.fallback ? ' — thin, uses snapshot median' : '') : 'snapshot median') + '</small></dd></div>' +
      '<div><dt>Growth</dt><dd>' + r.p.toFixed(3) + '&times;<small>7-day change ' + pct(g) + '</small></dd></div>' +
      '<div><dt>Maturity</dt><dd>' + r.q.toFixed(3) + '&times;<small>' + (r.a === null || r.a === undefined ? 'age unknown, 365 days assumed' : r.a + ' days with no token recorded') + '</small></dd></div>' +
      '<div><dt>Chains</dt><dd>' + r.u.toFixed(2) + '&times;<small>' + r.h.split('|').length + ' chain' + (r.h.split('|').length === 1 ? '' : 's') + '</small></dd></div>' +
      '</div>' +
      '<p class="formula">implied = ' + money(r.t) + ' &times; ' + r.m.toFixed(3) + ' &times; ' + r.p.toFixed(3) + ' &times; ' + r.q.toFixed(3) + ' &times; ' + r.u.toFixed(2) + ' = ' + money(r.v) + '</p>' +
      '<h3>How to farm it</h3>' +
      '<ol class="farm">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="meta">This protocol records no token in the snapshot — that is the record, not proof it has none. ' +
      'Farming never guarantees a token, an airdrop or a reward.</p>';
    $('closeDetail').addEventListener('click', function () { $('detail').hidden = true; selected = null; render(); });
    render();
  }
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'r' || k === 'v' || k === 't' ? 1 : 1; }
      render();
    });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; render(); });
  $('watch').addEventListener('change', function () { state.watch = $('watch').checked; render(); });
  $('reset').addEventListener('click', function () {
    state = { q: '', cat: '', chain: '', watch: false, sort: 'r', dir: 1 };
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('watch').checked = false;
    $('detail').hidden = true; selected = null; render();
  });

  /* ------------------------------------------------- comps and live */
  $('compRows').innerHTML = D.comps.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '&times;</td><td class="num">' + c.comps + '</td><td>' + (c.fallback ? 'Thin — uses the snapshot-wide median ' + D.global_multiple.toFixed(3) + '&times;.' : 'Median of its trading protocols.') + '</td></tr>';
  }).join('');
  $('liveRows').innerHTML = D.live.map(function (p) {
    return '<tr><td><span class="name">' + esc(p.name) + '</span></td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td>' +
      '<td class="num">' + (p.mcap_tvl === null ? '—' : p.mcap_tvl.toFixed(2) + '&times;') + '</td></tr>';
  }).join('');

  readHash();
  render();
})();
