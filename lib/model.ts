// Token Radar v8 — comps-priced launch radar.
//
// Value model (all numbers computed from the sealed snapshot at run time):
//   * Anchors: the 128 protocols that record a token WITH a positive market
//     cap. 16 of the 144 token-recording protocols carry mcap <= 0 and so
//     carry no price signal; they are excluded and named in Methodology.
//   * Comps value: for a protocol, its 7 nearest-by-log-TVL trading peers
//     in the same category (filled from other categories by TVL closeness
//     when the category is thin); the trimmed mean of their log10(mcap/TVL)
//     multiples, times the protocol's own TVL.
//   * OLS prior: log10(mcap) = a + b*log10(TVL), fit on the 128 anchors.
//     Growth and no-token age were tested and DROPPED: adding them worsens
//     the blind (leave-one-out) error, see looTable() below.
//   * Fitted value = geometric blend: comps^0.4 * ols^0.6.
//   * Token odds: logistic fit on all 758 protocols (has-token vs not)
//     from logTVL, 7-day growth and no-token age in years.
//   * Implied value = fitted value * odds. The board ranks the 198 clean
//     pre-token protocols by implied value; trading protocols are anchors
//     only, never rows.
//   * Value band and rank range: 200 bootstrap refits of the anchors with
//     a fixed seed; per row the 10th/90th percentile of fitted value and
//     the min/max rank across refits. No invented constants: the old
//     low = half the implied is gone; the band comes from the bootstrap.
//
// v8 changes (presentation only — the model above is untouched):
//   * Cost to farm now sums the plan's 7 transactions across EVERY chain
//     the protocol runs on (v7 charged 7 x the main chain's fee only, so
//     the column took just eight values and every THIN row read $63.00).
//     With the same verdict thresholds the counts move to FARM 91 /
//     THIN 73 / SKIP 34: the thresholds are judgement, the costs are
//     measurement, so the thresholds did not move.
//   * The farm steps now farm the protocol on each of its chains, and the
//     per-step gas figures add up to the stated total. Single-chain rows
//     keep v7's wording byte for byte.
//   * The dashboard's watchlist slugs ride along in the radar object so
//     the page's live self-test can check the 40/40 coverage itself.
//
// Everything in this file is deterministic: fixed iteration counts, a
// fixed bootstrap seed, and sorts broken by slug. Two runs write the
// same bytes.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl: number;
  growth: number | null; // per cent, null when unreported
  mcap: number | null; // null when no token recorded
  listedAt: string | null;
  gecko: string | null;
  symbol: string | null;
}

export interface Snapshot {
  asOf: string;
  source: string;
  floorUsd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface Comp {
  slug: string;
  name: string;
  tvl: number;
  multiple: number;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface DetailRow extends Row {
  category: string | null;
  chains: string[];
  tvl: number;
  growth: number | null;
  ageYears: number | null;
  fitted: number;
  compsValue: number;
  olsValue: number;
  odds: number;
  low: number;
  high: number;
  rankLo: number;
  rankHi: number;
  costToFarm: number;
  deposit: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  breakEven: number; // cost / low, as a fraction
  comps: Comp[];
  compsSpread: number; // SD of the comps' log10 multiples
  sameCategoryComps: number;
}

export interface Radar {
  asOf: string;
  source: string;
  counts: { scanned: number; ranked: number; anchors: number; degenerate: number; watchlist: number };
  watchlist: string[];
  ols: { a: number; b: number };
  logit: number[];
  medianAnchorAge: number;
  loo: { label: string; median: number; within2: number; n: number }[];
  flatMedian: number;
  calibration: { slug: string; name: string; predicted: number; actual: number; factor: number }[];
  verdicts: { FARM: number; THIN: number; SKIP: number };
  medianRankRangeWidth: number;
  portfolio: { rows: { slug: string; name: string; deposit: number; cost: number; low: number }[]; totalDeposit: number; totalCost: number; totalLow: number };
  rows: DetailRow[];
}

const DAY = 86_400_000;

/** Median of numbers (copy sorted; empty -> 0). */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length;
  return m % 2 === 1 ? s[(m - 1) / 2]! : (s[m / 2 - 1]! + s[m / 2]!) / 2;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Deterministic PRNG (mulberry32) for the bootstrap. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as {
    as_of: string;
    source: string;
    floor_usd: number;
    protocols: Record<string, unknown>[];
    watchlist: string[];
  };
  const protocols: Proto[] = raw.protocols.map((p) => ({
    slug: String(p.slug),
    name: String(p.name),
    category: (p.category as string | null) ?? null,
    chains: (p.chains as string[]) ?? [],
    tvl: Number(p.tvl_usd),
    growth: (p.change_7d as number | null) ?? null,
    mcap: (p.mcap_usd as number | null) ?? null,
    listedAt: (p.listed_at as string | null) ?? null,
    gecko: (p.gecko_id as string | null) ?? null,
    symbol: (p.symbol as string | null) ?? null,
  }));
  return { asOf: raw.as_of, source: raw.source, floorUsd: raw.floor_usd, protocols, watchlist: raw.watchlist };
}

/** Years between the snapshot date and DefiLlama's first tracking day. */
export function ageYears(p: Proto, asOf: string): number | null {
  if (!p.listedAt) return null;
  const ms = new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${p.listedAt}T00:00:00Z`).getTime();
  return Math.max(0, ms / DAY / 365.25);
}

export function hasToken(p: Proto): boolean {
  return p.gecko !== null || p.symbol !== null;
}

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Clean pre-token: records no token and is not a wrapped, staked or
 * bridged product of a token that already trades — the watchlist's rule,
 * without its $50M floor. The watchlist is a subset of this set.
 */
export function isCleanPreToken(p: Proto): boolean {
  if (hasToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** Closed-form OLS for log10(mcap) = a + b*log10(TVL) on the anchors. */
export function fitOlsTvl(anchors: Proto[]): { a: number; b: number } {
  const xs = anchors.map((p) => Math.log10(p.tvl));
  const ys = anchors.map((p) => Math.log10(p.mcap as number));
  const xm = mean(xs);
  const ym = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - xm) * (ys[i]! - ym);
    den += (xs[i]! - xm) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: ym - b * xm, b };
}

export function olsValue(ols: { a: number; b: number }, tvl: number): number {
  return 10 ** (ols.a + ols.b * Math.log10(tvl));
}

/** Small dense linear solve (Gauss-Jordan) for the LOO comparison table. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / M[i]![i]!);
}

function olsGeneric(rows: Proto[], feats: (p: Proto) => number[]): number[] {
  const X = rows.map(feats);
  const y = rows.map((p) => Math.log10(p.mcap as number));
  const k = X[0]!.length;
  const XtX = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const XtY = Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      XtY[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  return solveLinear(XtX, XtY);
}

/** Nearest-by-log-TVL peers in the same category, filled cross-category. */
export function compsOf(anchors: Proto[], proto: Proto, k = 7): { value: number; list: Comp[]; spread: number; sameCount: number } {
  const dist = (q: Proto): number => Math.abs(Math.log10(q.tvl) - Math.log10(proto.tvl));
  const same = anchors
    .filter((q) => q.category === proto.category && q.slug !== proto.slug)
    .sort((a, b) => dist(a) - dist(b) || (a.slug < b.slug ? -1 : 1));
  let pool = [...same];
  if (pool.length < k) {
    const rest = anchors
      .filter((q) => q.category !== proto.category && q.slug !== proto.slug)
      .sort((a, b) => dist(a) - dist(b) || (a.slug < b.slug ? -1 : 1));
    pool = pool.concat(rest);
  }
  const sel = pool.slice(0, k);
  const logs = sel.map((q) => Math.log10((q.mcap as number) / q.tvl)).sort((a, b) => a - b);
  const trimmed = logs.length >= 5 ? logs.slice(1, -1) : logs;
  const value = 10 ** mean(trimmed) * proto.tvl;
  return {
    value,
    list: sel.map((q) => ({ slug: q.slug, name: q.name, tvl: q.tvl, multiple: (q.mcap as number) / q.tvl })),
    spread: sd(logs),
    sameCount: same.length,
  };
}

/** Geometric blend: comps^0.4 * ols^0.6. */
export function blendValue(compsValue: number, ols: number): number {
  return 10 ** (0.4 * Math.log10(compsValue) + 0.6 * Math.log10(ols));
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

/** Logistic fit P(has token) ~ logTVL + growth + no-token age. Fixed steps.
 * Growth is clamped to +/-50% inside the fit and the prediction alike:
 * six protocols report 7-day growth above +50% (one reports +4,448%),
 * and an unclamped linear term would let that single print decide odds. */
export function fitLogit(all: Proto[], asOf: string, medianAge: number): number[] {
  const clampGrowth = (p: Proto): number => Math.max(-0.5, Math.min(0.5, (p.growth ?? 0) / 100));
  const feats = (p: Proto): number[] => [
    1,
    Math.log10(p.tvl),
    clampGrowth(p),
    ageYears(p, asOf) ?? medianAge,
  ];
  let b = [-2, 0, 0, 0];
  const X = all.map(feats);
  const y = all.map((p) => (hasToken(p) ? 1 : 0));
  for (let it = 0; it < 2000; it++) {
    const g = [0, 0, 0, 0];
    for (let i = 0; i < X.length; i++) {
      const z = X[i]!.reduce((s, v, j) => s + v * b[j]!, 0);
      const e = sigmoid(z) - y[i]!;
      for (let j = 0; j < 4; j++) g[j]! += e * X[i]![j]!;
    }
    for (let j = 0; j < 4; j++) b[j]! -= (0.1 * g[j]!) / X.length;
  }
  return b;
}

export function tokenOdds(logit: number[], p: Proto, asOf: string, medianAge: number): number {
  const growth = Math.max(-0.5, Math.min(0.5, (p.growth ?? 0) / 100));
  const x = [1, Math.log10(p.tvl), growth, ageYears(p, asOf) ?? medianAge];
  return sigmoid(x.reduce((s, v, j) => s + v * logit[j]!, 0));
}

/** Error factor of a prediction vs the actual market cap. */
function errFactor(pred: number, actual: number): number {
  return Math.max(pred / actual, actual / pred);
}

/**
 * Leave-one-out table over the 128 anchors: each candidate prices a held
 * out token from the other 127 only. Median error factor + share within x2.
 * This is the table Methodology prints in full, including the candidates
 * that lost — the blend was picked from it, not before it.
 */
export function looTable(anchors: Proto[], medianAge: number, asOf: string): { label: string; median: number; within2: number; n: number }[] {
  const fFull = (p: Proto): number[] => [1, Math.log10(p.tvl), (p.growth ?? 0) / 100, ageYears(p, asOf) ?? medianAge];
  const fTvl = (p: Proto): number[] => [1, Math.log10(p.tvl)];
  const fNoGrowth = (p: Proto): number[] => [1, Math.log10(p.tvl), ageYears(p, asOf) ?? medianAge];
  const fNoAge = (p: Proto): number[] => [1, Math.log10(p.tvl), (p.growth ?? 0) / 100];
  const predictOls = (train: Proto[], feats: (p: Proto) => number[], te: Proto): number => {
    const b = olsGeneric(train, feats);
    return 10 ** feats(te).reduce((s, v, i) => s + v * b[i]!, 0);
  };
  const predictFlat = (train: Proto[], te: Proto): number =>
    median(train.map((q) => (q.mcap as number) / q.tvl)) * te.tvl;
  const predictComps = (train: Proto[], te: Proto): number => compsOf(train, te, 7).value;
  const predictBlend = (train: Proto[], te: Proto, w: number): number => {
    const cv = compsOf(train, te, 7).value;
    const ov = predictOls(train, fTvl, te);
    return 10 ** (w * Math.log10(cv) + (1 - w) * Math.log10(ov));
  };
  const cands: [string, (tr: Proto[], te: Proto) => number][] = [
    ['Flat median multiple (all 128 anchors)', predictFlat],
    ['OLS, TVL only', (tr, te) => predictOls(tr, fTvl, te)],
    ['OLS, TVL + growth + age', (tr, te) => predictOls(tr, fFull, te)],
    ['OLS, TVL + age (no growth)', (tr, te) => predictOls(tr, fNoGrowth, te)],
    ['OLS, TVL + growth (no age)', (tr, te) => predictOls(tr, fNoAge, te)],
    ['Comps alone (7 peers, trimmed log-mean)', predictComps],
    ['Blend, comps weight 0.3', (tr, te) => predictBlend(tr, te, 0.3)],
    ['Blend, comps weight 0.4 (this entry)', (tr, te) => predictBlend(tr, te, 0.4)],
    ['Blend, comps weight 0.5', (tr, te) => predictBlend(tr, te, 0.5)],
  ];
  return cands.map(([label, fn]) => {
    const errs: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      const train = [...anchors.slice(0, i), ...anchors.slice(i + 1)];
      errs.push(errFactor(fn(train, anchors[i]!), anchors[i]!.mcap as number));
    }
    return { label, median: median(errs), within2: errs.filter((e) => e <= 2).length, n: anchors.length };
  });
}

/** Six held-out anchors (spread across TVL), priced from the other 127. */
export function calibrationTable(anchors: Proto[], medianAge: number, asOf: string): Radar['calibration'] {
  const byTvl = [...anchors].sort((a, b) => b.tvl - a.tvl || (a.slug < b.slug ? -1 : 1));
  const picks = [10, 32, 54, 76, 98, 120].map((i) => byTvl[i]!).filter(Boolean);
  const fTvl = (p: Proto): number[] => [1, Math.log10(p.tvl)];
  return picks.map((te) => {
    const train = anchors.filter((q) => q.slug !== te.slug);
    const cv = compsOf(train, te, 7).value;
    const b = olsGeneric(train, fTvl);
    const ov = 10 ** fTvl(te).reduce((s, v, i) => s + v * b[i]!, 0);
    const pred = blendValue(cv, ov);
    const actual = te.mcap as number;
    return { slug: te.slug, name: te.name, predicted: Math.round(pred), actual, factor: errFactor(pred, actual) };
  });
}

// ---------------------------------------------------------------- farm cost

/**
 * Assumed typical fee for one transaction on a chain, in USD. These are
 * JUDGEMENT assumptions, not snapshot data — the snapshot carries no gas
 * prices — and Methodology says so. A farm plan runs 3 setup transactions
 * plus 4 weekly activity transactions in its first month: 7 in all, on
 * EACH chain the protocol runs on — a plan farms the protocol on every
 * one of its chains, so the cost is 7 x the sum of the chains' fees.
 * v7 charged 7 x the main chain's fee only, which left the cost column
 * with eight values and every THIN row reading $63.00.
 */
const GAS_USD: Record<string, number> = {
  Ethereum: 9.0,
  'Arbitrum One': 0.6,
  Base: 0.25,
  Solana: 0.1,
  BSC: 0.35,
  Polygon: 0.15,
  Optimism: 0.4,
  Avalanche: 0.5,
  'zkSync Era': 0.4,
  Linea: 0.3,
  Scroll: 0.3,
  Mantle: 0.2,
};

export function mainChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

export function gasUsd(chain: string): number {
  return GAS_USD[chain] ?? 1.0;
}

/** One transaction's gas on every chain the protocol runs on, summed. */
export function gasSum(p: Proto): number {
  const chains = p.chains.length > 0 ? p.chains : ['Ethereum'];
  return chains.reduce((s, c) => s + gasUsd(c), 0);
}

/** Cost to farm: 7 transactions (3 setup + 4 weekly) on every chain. */
export function costToFarm(p: Proto): number {
  return Math.round(7 * gasSum(p) * 100) / 100;
}

/** Suggested deposit, sized by implied value (a stated rule, not a fact). */
export function depositFor(implied: number): number {
  if (implied >= 20_000_000) return 5000;
  if (implied >= 5_000_000) return 2000;
  if (implied >= 1_000_000) return 500;
  return 100;
}

/**
 * Verdict thresholds are judgement rules, stated as such in Methodology.
 * They were tightened from the v6 levels (0.01% / 0.1%) because at those
 * levels 192 of these 198 rows were FARM — gas is small next to these
 * valuations, so the old thresholds blessed nearly the whole board and
 * separated nothing. FARM at 0.001% means the farmer needs one
 * hundred-thousandth of the low-end value to cover gas. The thresholds
 * did not move in v8; the costs did (multi-chain sums), and the counts
 * moved with them: FARM 91 / THIN 73 / SKIP 34.
 */
export function verdictFor(breakEven: number): 'FARM' | 'THIN' | 'SKIP' {
  if (breakEven <= 0.00001) return 'FARM';
  if (breakEven <= 0.00005) return 'THIN';
  return 'SKIP';
}

const FAMILY_VERB: Record<string, { act: string; asset: string }> = {
  Dexs: { act: 'swap and provide liquidity', asset: 'a trading pair' },
  Lending: { act: 'supply and borrow', asset: 'a lending market' },
  Yield: { act: 'deposit into the vault', asset: 'a yield vault' },
  'Yield Aggregator': { act: 'deposit into the vault', asset: 'a yield vault' },
  Farm: { act: 'deposit into the farm', asset: 'a farming pool' },
  'Liquid Staking': { act: 'stake and hold the receipt token', asset: 'a staking position' },
  Restaking: { act: 'restake and delegate', asset: 'a restaking position' },
  'Liquid Restaking': { act: 'restake and delegate', asset: 'a restaking position' },
  RWA: { act: 'mint and hold the tokenised asset', asset: 'a tokenised position' },
  Derivatives: { act: 'open a small hedged position', asset: 'a derivatives position' },
  'Basis Trading': { act: 'deposit into the basis vault', asset: 'a basis position' },
  CDP: { act: 'open a collateralised position', asset: 'a CDP position' },
  Bridge: { act: 'bridge and hold on the destination chain', asset: 'a bridged position' },
  'Canonical Bridge': { act: 'bridge and hold on the destination chain', asset: 'a bridged position' },
};

function familyVerb(category: string | null): { act: string; asset: string } {
  return (category !== null && FAMILY_VERB[category]) || { act: 'use the protocol', asset: 'a position' };
}

/**
 * The chains a plan touches, as the steps name them: one chain by name,
 * up to three listed, more than three as the first three plus a count.
 */
function chainScope(p: Proto): string {
  const n = p.chains.length;
  if (n <= 1) return mainChain(p);
  const list = n <= 3 ? p.chains.join(', ') : `${p.chains.slice(0, 3).join(', ')} and ${n - 3} more`;
  return `each of its ${n} chains (${list})`;
}

/** Five concrete farm steps, each 20-600 chars, built from snapshot facts.
 * The per-step gas figures add up to the plan's total cost: one
 * transaction's gas on every chain for the bridge, the opening and the
 * withdrawal, and four weekly actions' gas on every chain in between.
 * Single-chain rows keep v7's wording byte for byte. */
export function farmSteps(p: Proto, deposit: number, cost: number): string[] {
  const gas = gasSum(p);
  const v = familyVerb(p.category);
  const cat = p.category ?? 'DeFi';
  const scope = chainScope(p);
  const multi = p.chains.length > 1;
  return [
    `Bridge $${deposit} of USDC to ${scope} in a fresh wallet used only for ${p.name} (about $${gas.toFixed(2)} in gas, 10-20 minutes${multi ? ' per chain' : ''}).`,
    `Open ${p.name} (${cat}) on ${scope} and ${v.act} with $${deposit}${multi ? ' split across the chains' : ''} to open ${v.asset}${multi ? ' on each chain' : ''} (about $${gas.toFixed(2)} in gas, 20-30 minutes${multi ? ' per chain' : ''}).`,
    `Keep the position${multi ? 's' : ''} active for at least 4 weeks: check ${multi ? 'them' : 'it'} weekly, top ${multi ? 'them' : 'it'} up or rebalance if ${multi ? 'they drift' : 'it drifts'}, and record each interaction (4 weekly actions${multi ? ' on each chain' : ''}, about $${(4 * gas).toFixed(2)} in gas).`,
    `Use the protocol the way a real user would at least twice a week — a swap, a deposit or a vote where the app offers one — so the activity reads as usage, not a single deposit (about 15 minutes each time).`,
    `After 4 weeks, review the position${multi ? 's' : ''} against this radar's value band: if the protocol still ranks in the top half, keep farming; otherwise withdraw and move the $${deposit} to the next FARM row (about $${gas.toFixed(2)} in gas). Total plan cost about $${cost.toFixed(2)} in gas.`,
  ];
}

// ---------------------------------------------------------------- build

export function buildRadar(snapshot: Snapshot): { board: Row[]; radar: Radar } {
  const asOf = snapshot.asOf;
  const anchors = snapshot.protocols
    .filter((p) => p.mcap !== null && p.mcap > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const degenerate = snapshot.protocols.filter((p) => p.mcap !== null && p.mcap <= 0).length;
  const clean = snapshot.protocols.filter(isCleanPreToken);
  const medianAge = median(anchors.map((p) => ageYears(p, asOf)).filter((x): x is number => x !== null));
  const ols = fitOlsTvl(anchors);
  const logit = fitLogit(snapshot.protocols, asOf, medianAge);
  const loo = looTable(anchors, medianAge, asOf);
  const flatRow = loo.find((r) => r.label.startsWith('Flat median'));
  const flatMedian = flatRow ? flatRow.median : 0;
  const calibration = calibrationTable(anchors, medianAge, asOf);

  // Base rows with point estimates.
  const base = clean.map((p) => {
    const c = compsOf(anchors, p, 7);
    const ov = olsValue(ols, p.tvl);
    const fitted = blendValue(c.value, ov);
    const odds = tokenOdds(logit, p, asOf, medianAge);
    const implied = fitted * odds;
    return { p, c, fitted, odds, implied };
  });
  base.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));

  // Bootstrap: 200 refits of the anchors; per-row fitted band + rank range.
  const boot = rng(20261120);
  const fittedSamples: number[][] = base.map(() => []);
  const rankSamples: number[][] = base.map(() => []);
  const indexBySlug = new Map(base.map((r, i) => [r.p.slug, i]));
  for (let rep = 0; rep < 200; rep++) {
    const sample: Proto[] = [];
    for (let i = 0; i < anchors.length; i++) sample.push(anchors[Math.floor(boot() * anchors.length)]!);
    const olsB = fitOlsTvl(sample);
    const scored = base.map((r) => {
      const cb = compsOf(sample, r.p, 7);
      return { slug: r.p.slug, fitted: blendValue(cb.value, olsValue(olsB, r.p.tvl)), odds: r.odds };
    });
    scored.sort((a, b) => b.fitted * b.odds - a.fitted * a.odds || (a.slug < b.slug ? -1 : 1));
    scored.forEach((s, rank) => {
      const i = indexBySlug.get(s.slug)!;
      fittedSamples[i]!.push(s.fitted);
      rankSamples[i]!.push(rank + 1);
    });
  }
  const pct = (xs: number[], q: number): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
  };

  const rows: DetailRow[] = base.map((r, i) => {
    const samples = fittedSamples[i]!;
    const lowF = pct(samples, 0.1);
    const highF = pct(samples, 0.9);
    const low = Math.max(1, Math.round(lowF * r.odds));
    const high = Math.max(low, Math.round(highF * r.odds));
    const ranks = rankSamples[i]!;
    const cost = costToFarm(r.p);
    const implied = Math.max(1, Math.round(r.implied));
    const deposit = depositFor(implied);
    const breakEven = cost / low;
    return {
      slug: r.p.slug,
      name: r.p.name,
      rank: i + 1,
      implied_value_usd: implied,
      farm_steps: farmSteps(r.p, deposit, cost),
      category: r.p.category,
      chains: r.p.chains,
      tvl: r.p.tvl,
      growth: r.p.growth,
      ageYears: ageYears(r.p, asOf),
      fitted: Math.round(r.fitted),
      compsValue: Math.round(r.c.value),
      olsValue: Math.round(olsValue(ols, r.p.tvl)),
      odds: r.odds,
      low,
      high,
      rankLo: Math.min(...ranks),
      rankHi: Math.max(...ranks),
      costToFarm: cost,
      deposit,
      verdict: verdictFor(breakEven),
      breakEven,
      comps: r.c.list,
      compsSpread: r.c.spread,
      sameCategoryComps: r.c.sameCount,
    };
  });

  const verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of rows) verdicts[r.verdict]++;
  const widths = rows.slice(0, 50).map((r) => r.rankHi - r.rankLo);
  const farmRows = rows.filter((r) => r.verdict === 'FARM').slice(0, 10);
  const portfolio = {
    rows: farmRows.map((r) => ({ slug: r.slug, name: r.name, deposit: r.deposit, cost: r.costToFarm, low: r.low })),
    totalDeposit: farmRows.reduce((s, r) => s + r.deposit, 0),
    totalCost: Math.round(farmRows.reduce((s, r) => s + r.costToFarm, 0) * 100) / 100,
    totalLow: farmRows.reduce((s, r) => s + r.low, 0),
  };
  const radar: Radar = {
    asOf,
    source: snapshot.source,
    counts: { scanned: snapshot.protocols.length, ranked: rows.length, anchors: anchors.length, degenerate, watchlist: snapshot.watchlist.length },
    watchlist: snapshot.watchlist,
    ols,
    logit,
    medianAnchorAge: medianAge,
    loo,
    flatMedian,
    calibration,
    verdicts,
    medianRankRangeWidth: median(widths),
    portfolio,
    rows,
  };
  const board: Row[] = rows.map((r) => ({ slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, farm_steps: r.farm_steps }));
  return { board, radar };
}

/** The dashboard's data file: one global, no network, no imports. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Gate-shape check: null when the board is submittable, else the reason. */
export function boardIssue(board: Row[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, fewer than the 100 the gate needs`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  const sorted = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.implied_value_usd > sorted[i - 1]!.implied_value_usd) return `implied value rises from rank ${sorted[i - 1]!.rank} to rank ${sorted[i]!.rank}`;
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same: not a ranking';
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `watchlist slugs missing from the board: ${missing.slice(0, 5).join(', ')}`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} holds ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} holds a farm step of ${t.length} characters`;
    }
  }
  return null;
}
