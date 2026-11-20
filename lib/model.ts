// Launch Radar v6 — value model, validation and farm verdicts.
//
// Everything here is computed from the sealed snapshot at run time: no
// protocol name is hardcoded anywhere. The fit set is the protocols whose
// token records a market cap above zero; the board ranks every protocol in
// the snapshot by an implied launch value built from that fit.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Comp {
  slug: string;
  name: string;
  multiple: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  status: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  fitted_usd: number;
  odds: number;
  eligibility: number;
  low_usd: number;
  gas_usd: number;
  deposit_usd: number;
  capital_usd: number;
  breakeven_pct: number;
  verdict: string;
  rank_lo: number;
  rank_hi: number;
  comps: Comp[];
  farm_steps: string[];
}

export interface BlindTest {
  name: string;
  n_test: number;
  model_fold: number;
  base_fold: number;
  improvement_pct: number;
}

export interface Validation {
  fit_n: number;
  excluded_nonpositive_mcap: number;
  token_no_mcap: number;
  r2: number;
  in_sample_fold: number;
  coef: number[];
  baseline_multiple: number;
  split_half: BlindTest[];
  loo: BlindTest;
  walk_forward: BlindTest;
  bootstrap_refits: number;
  bootstrap_seed: number;
}

export interface BoardBuild {
  rows: BoardRow[];
  validation: Validation;
  counts: Record<string, number>;
  meta: { as_of: string; source: string; floor_usd: number };
}

// ---- farm verdicts: a break-even airdrop share, derived not assumed ----
// No airdrop size or farmer count is assumed anywhere: the break-even
// share is the farming cost divided by the low-end implied value — the
// share of the low end an airdrop would have to be for the farm to pay.
// The 0.01% / 0.1% lines below are stated judgement rules, not facts.
export const LOW_FACTOR = 0.5; // low end of the value band = half the central value
export const FARM_BE_MAX = 0.0001; // FARM if the break-even share is at most 0.01%
export const THIN_BE_MAX = 0.001; // THIN if at most 0.1%, else SKIP
export const HORIZON_DAYS = 180; // farming horizon the plans are costed over
export const CAPITAL_RATE = 0.08; // 8% a year for the cost of locked capital
export const TX_COUNT = 12; // transactions in a 180-day plan
export const BOOTSTRAP_REFITS = 200;
export const BOOTSTRAP_SEED = 20261114;

// ---- small numeric helpers ----

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Deterministic PRNG (mulberry32) so the bootstrap refits are byte-stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Least squares by the normal equations with Gauss-Jordan elimination. */
export function fitOls(x: number[][], y: number[]): number[] {
  const k = x[0]!.length;
  const a: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < x.length; r++) s += x[r]![i]! * x[r]![j]!;
      row.push(s);
    }
    let s = 0;
    for (let r = 0; r < x.length; r++) s += x[r]![i]! * y[r]!;
    row.push(s);
    a.push(row);
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    const tmp = a[c]!;
    a[c] = a[piv]!;
    a[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r]![c]! / a[c]![c]!;
      for (let cc = c; cc <= k; cc++) a[r]![cc] = a[r]![cc]! - f * a[c]![cc]!;
    }
  }
  return a.map((row, i) => row[k]! / row[i]!);
}

function predict(coef: number[], row: number[]): number {
  let s = 0;
  for (let i = 0; i < coef.length; i++) s += coef[i]! * row[i]!;
  return s;
}

// ---- features ----

function ageYears(p: Protocol, asOf: Date): number | null {
  if (!p.listed_at) return null;
  const listed = new Date(`${p.listed_at}T00:00:00Z`).getTime();
  if (Number.isNaN(listed)) return null;
  return Math.max(0, (asOf.getTime() - listed) / (365.25 * 86400000));
}

/**
 * One row of the design matrix. log10(mcap) is fitted on log10(TVL), the
 * 7-day TVL change clipped to [-20%, +50%] (a wider clip lets a single
 * incentive spike dominate the fit), and age in years clipped to [0, 8].
 * Missing growth reads as 0, missing age as 2 years.
 */
export function features(p: Protocol, asOf: Date): number[] {
  const growth = p.change_7d === null ? 0 : clamp(p.change_7d, -20, 50) / 100;
  const age = ageYears(p, asOf);
  const ageClipped = age === null ? 2 : clamp(age, 0, 8);
  return [1, Math.log10(Math.max(1, p.tvl_usd)), growth, ageClipped];
}

// ---- launch eligibility ----

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** A protocol whose own launch is plausible: records no token and is not a
 * wrapped, staked, bridged or exchange product, nor a versioned copy. */
function isCleanPreToken(p: Protocol): boolean {
  if (recordsToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  for (const e of EXCHANGE_NAMES) if (p.name.startsWith(e)) return false;
  return true;
}

// ---- gas: dollars per transaction on the protocol's first chain ----

const GAS_PER_TX: Record<string, number> = {
  Ethereum: 6,
  Bitcoin: 2,
  Solana: 0.05,
  Tron: 0.5,
  Binance: 0.3,
};
const CHEAP_EVM = new Set([
  'Arbitrum', 'Optimism', 'Base', 'Polygon', 'zkSync Era', 'Linea', 'Scroll',
  'Blast', 'Mantle', 'Ink', 'Berachain', 'Avalanche', 'BSC', 'Gnosis', 'Fantom',
  'Mode', 'Taiko', 'Zora', 'Fraxtal', 'Sonic',
]);

function gasPerTx(chain: string): number {
  if (GAS_PER_TX[chain] !== undefined) return GAS_PER_TX[chain]!;
  if (CHEAP_EVM.has(chain)) return 0.4;
  return 1;
}

// ---- farm steps: concrete, costed, timed, per category ----

function money(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K`;
  if (n >= 100) return `$${Math.round(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function planSteps(row: BoardRow): string[] {
  const name = row.name;
  const chain = row.chains[0] ?? 'its main chain';
  const dep = money(row.deposit_usd);
  const gas = money(row.gas_usd);
  const cat = row.category;
  const core: string =
    cat === 'Dexs' || cat === 'Derivatives' || cat === 'Basis Trading'
      ? `Swap ${dep} through ${name} on ${chain} in 3 trades a week, keeping every receipt, so the volume is real and spread over ${HORIZON_DAYS} days.`
      : cat === 'Lending' || cat === 'CDP' || cat === 'CDP Manager' || cat === 'Yield Aggregator'
        ? `Supply ${dep} to ${name} on ${chain} and hold the position for ${HORIZON_DAYS} days, topping it up once a month instead of churning it in and out.`
        : cat === 'Restaking' || cat === 'Liquid Restaking' || cat === 'Yield'
          ? `Restake ${dep} through ${name} on ${chain} and leave the position untouched for ${HORIZON_DAYS} days, checking points once a week.`
          : cat === 'RWA' || cat === 'Onchain Capital Allocator'
            ? `Deposit ${dep} into ${name} on ${chain} and hold for the full ${HORIZON_DAYS}-day window, recording the entry date and every fee.`
            : `Use ${name} on ${chain} with ${dep} every week for ${HORIZON_DAYS} days, doing the protocol's core action rather than a single test transaction.`;
  return [
    `Open ${name} on ${chain} and connect a fresh wallet you use only for this farm; a first test action of $10 costs about ${money(gasPerTx(chain))} in gas and takes 10 minutes.`,
    core,
    `Repeat the core action weekly for ${HORIZON_DAYS} days, about ${TX_COUNT} transactions in all, roughly ${gas} of gas on ${chain} at current prices.`,
    `Keep ${dep} working in the position for the whole window; at 8% a year the locked capital costs about ${money(row.capital_usd)} over ${HORIZON_DAYS} days.`,
    `Track the position in a note with dates and amounts, and stop early if fees pass ${money(row.gas_usd + row.capital_usd)} — the cost the airdrop must cover before this farm pays.`,
  ];
}

// ---- the build ----

export function buildBoard(snap: Snapshot): BoardBuild {
  const asOf = new Date(`${snap.as_of}T00:00:00Z`);
  const protocols = [...snap.protocols].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const fitSet = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const excludedNonpositive = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length;
  const tokenNoMcap = protocols.filter((p) => recordsToken(p) && p.mcap_usd === null).length;
  const watchSet = new Set(snap.watchlist);

  // Token odds: the smoothed share of protocols in the same category that
  // already record a token, pulled toward the global share 0.549.
  const globalShare = protocols.filter(recordsToken).length / protocols.length;
  const catCount = new Map<string, [number, number]>();
  for (const p of protocols) {
    const c = p.category ?? 'Uncategorised';
    const cur = catCount.get(c) ?? [0, 0];
    cur[1] += 1;
    if (recordsToken(p)) cur[0] += 1;
    catCount.set(c, cur);
  }
  const oddsOf = (p: Protocol): number => {
    const c = p.category ?? 'Uncategorised';
    const [traded, total] = catCount.get(c)!;
    return (traded + 2 * globalShare) / (total + 2);
  };

  // ---- the fit ----
  const x = fitSet.map((p) => features(p, asOf));
  const y = fitSet.map((p) => Math.log10(p.mcap_usd!));
  const coef = fitOls(x, y);
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  const inErr: number[] = [];
  for (let i = 0; i < y.length; i++) {
    const e = y[i]! - predict(coef, x[i]!);
    inErr.push(Math.abs(e));
    ssRes += e * e;
    ssTot += (y[i]! - yMean) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;
  const inSampleFold = Math.pow(10, median(inErr));
  const baselineMultiple = median(fitSet.map((p) => p.mcap_usd! / p.tvl_usd));

  const baseLogErr = (train: Protocol[], test: Protocol[]): number[] =>
    test.map((p) => {
      const m = median(train.map((q) => q.mcap_usd! / q.tvl_usd));
      return Math.abs(Math.log10(p.mcap_usd! / (m * p.tvl_usd)));
    });
  const modelLogErr = (train: Protocol[], test: Protocol[]): number[] => {
    const c = fitOls(train.map((p) => features(p, asOf)), train.map((p) => Math.log10(p.mcap_usd!)));
    return test.map((p) => Math.abs(Math.log10(p.mcap_usd!) - predict(c, features(p, asOf))));
  };
  const foldOf = (errs: number[]): number => Math.pow(10, median(errs));
  const improvement = (model: number[], base: number[]): number =>
    100 * (1 - median(model) / median(base));
  const blind = (name: string, train: Protocol[], test: Protocol[]): BlindTest => {
    const m = modelLogErr(train, test);
    const b = baseLogErr(train, test);
    return { name, n_test: test.length, model_fold: foldOf(m), base_fold: foldOf(b), improvement_pct: improvement(m, b) };
  };

  // Split-half by slug order (even / odd positions).
  const sortedFit = [...fitSet].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const halfA = sortedFit.filter((_, i) => i % 2 === 0);
  const halfB = sortedFit.filter((_, i) => i % 2 === 1);
  const splitHalf = [blind('Split-half A (train B)', halfB, halfA), blind('Split-half B (train A)', halfA, halfB)];

  // Leave-one-out over all 128 fitted tokens.
  const looModel: number[] = [];
  const looBase: number[] = [];
  for (let i = 0; i < fitSet.length; i++) {
    const train = fitSet.filter((_, j) => j !== i);
    looModel.push(...modelLogErr(train, [fitSet[i]!]));
    looBase.push(...baseLogErr(train, [fitSet[i]!]));
  }
  const loo: BlindTest = {
    name: 'Leave-one-out',
    n_test: fitSet.length,
    model_fold: foldOf(looModel),
    base_fold: foldOf(looBase),
    improvement_pct: improvement(looModel, looBase),
  };

  // Walk-forward: train on the protocols listed earliest, test the next
  // slice, at four cutoffs — the model is only ever tested on tokens
  // listed after every token it trained on.
  const dated = fitSet.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const wfModel: number[] = [];
  const wfBase: number[] = [];
  let wfN = 0;
  for (const q of [0.5, 0.6, 0.7, 0.8]) {
    const cut = Math.floor(dated.length * q);
    const nxt = Math.min(dated.length, Math.floor(dated.length * (q + 0.1)));
    const train = dated.slice(0, cut);
    const test = dated.slice(cut, nxt);
    wfModel.push(...modelLogErr(train, test));
    wfBase.push(...baseLogErr(train, test));
    wfN += test.length;
  }
  const walkForward: BlindTest = {
    name: 'Walk-forward (4 windows)',
    n_test: wfN,
    model_fold: foldOf(wfModel),
    base_fold: foldOf(wfBase),
    improvement_pct: improvement(wfModel, wfBase),
  };

  // ---- fitted values, odds, eligibility, implied value ----
  const fittedOf = (p: Protocol, c: number[]): number => Math.pow(10, predict(c, features(p, asOf)));
  const impliedOf = (p: Protocol, c: number[]): { fitted: number; odds: number; elig: number; implied: number } => {
    const fitted = fittedOf(p, c);
    // Token odds apply to every row: for a protocol whose token already
    // trades, the odds are its category's smoothed traded share, so a huge
    // traded name cannot outrank the launch candidates on fitted size alone.
    const odds = oddsOf(p);
    const elig = isCleanPreToken(p) ? 1 : 0.05;
    return { fitted, odds, elig, implied: fitted * odds * elig };
  };

  // ---- bootstrap refits: 200 seeded resamples, rank range per protocol ----
  const rng = mulberry32(BOOTSTRAP_SEED);
  const rankLo = new Map<string, number>();
  const rankHi = new Map<string, number>();
  for (const p of protocols) {
    rankLo.set(p.slug, Infinity);
    rankHi.set(p.slug, -Infinity);
  }
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const sample: Protocol[] = [];
    for (let i = 0; i < fitSet.length; i++) sample.push(fitSet[Math.floor(rng() * fitSet.length)]!);
    const c = fitOls(sample.map((p) => features(p, asOf)), sample.map((p) => Math.log10(p.mcap_usd!)));
    const scored = protocols
      .map((p) => ({ slug: p.slug, v: impliedOf(p, c).implied }))
      .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    scored.forEach((s, i) => {
      const rank = i + 1;
      if (rank < rankLo.get(s.slug)!) rankLo.set(s.slug, rank);
      if (rank > rankHi.get(s.slug)!) rankHi.set(s.slug, rank);
    });
  }

  // ---- nearest traded comps: same category, nearest TVL ----
  const tradedFit = fitSet;
  const compsOf = (p: Protocol): Comp[] => {
    const sameCat = tradedFit.filter((q) => (q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised') && q.slug !== p.slug);
    const pool = sameCat.length >= 3 ? sameCat : tradedFit.filter((q) => q.slug !== p.slug);
    return pool
      .map((q) => ({ q, d: Math.abs(Math.log10(q.tvl_usd) - Math.log10(Math.max(1, p.tvl_usd))) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ q }) => ({ slug: q.slug, name: q.name, multiple: q.mcap_usd! / q.tvl_usd }));
  };

  // ---- rows ----
  const scored = protocols.map((p) => {
    const { fitted, odds, elig, implied } = impliedOf(p, coef);
    return { p, fitted, odds, elig, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  let farm = 0;
  let thin = 0;
  let skip = 0;
  const rows: BoardRow[] = scored.map((s, i) => {
    const p = s.p;
    const low = s.implied * LOW_FACTOR;
    const gas = TX_COUNT * gasPerTx(p.chains[0] ?? '');
    const deposit = clamp(Math.round(low * 0.0002), 100, 5000);
    const capital = deposit * CAPITAL_RATE * (HORIZON_DAYS / 365);
    // Break-even airdrop share: the fraction of the low-end implied value
    // an airdrop would have to be for the farm to cover its own cost.
    const breakeven = (gas + capital) / Math.max(low, 1);
    const breakevenPct = Math.round(breakeven * 1000000) / 10000;
    const verdict = breakeven <= FARM_BE_MAX ? 'FARM' : breakeven <= THIN_BE_MAX ? 'THIN' : 'SKIP';
    if (verdict === 'FARM') farm++;
    else if (verdict === 'THIN') thin++;
    else skip++;
    const age = ageYears(p, asOf);
    const row: BoardRow = {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: Math.max(1, Math.round(s.implied)),
      status: recordsToken(p) ? 'TRADING' : 'PRE-TOKEN',
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: age === null ? null : Math.round(age * 10) / 10,
      fitted_usd: Math.max(1, Math.round(s.fitted)),
      odds: Math.round(s.odds * 1000) / 1000,
      eligibility: s.elig,
      low_usd: Math.max(1, Math.round(low)),
      gas_usd: Math.round(gas * 100) / 100,
      deposit_usd: deposit,
      capital_usd: Math.round(capital * 100) / 100,
      breakeven_pct: breakevenPct,
      verdict,
      rank_lo: rankLo.get(p.slug)!,
      rank_hi: rankHi.get(p.slug)!,
      comps: compsOf(p),
      farm_steps: [],
    };
    row.farm_steps = planSteps(row);
    return row;
  });

  // Keep ranks strictly non-increasing in implied value (ties are broken by
  // TVL above, so the order is already non-increasing; enforce it anyway).
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      rows[i]!.implied_value_usd = rows[i - 1]!.implied_value_usd;
    }
  }

  const validation: Validation = {
    fit_n: fitSet.length,
    excluded_nonpositive_mcap: excludedNonpositive,
    token_no_mcap: tokenNoMcap,
    r2,
    in_sample_fold: inSampleFold,
    coef: coef.map((c) => Math.round(c * 1000) / 1000),
    baseline_multiple: Math.round(baselineMultiple * 10000) / 10000,
    split_half: splitHalf,
    loo,
    walk_forward: walkForward,
    bootstrap_refits: BOOTSTRAP_REFITS,
    bootstrap_seed: BOOTSTRAP_SEED,
  };

  const counts: Record<string, number> = {
    protocols: protocols.length,
    watchlist: watchSet.size,
    watchlist_covered: rows.filter((r) => watchSet.has(r.slug)).length,
    fit_tokens: fitSet.length,
    clean_pretoken: protocols.filter(isCleanPreToken).length,
    pretoken: protocols.filter((p) => !recordsToken(p)).length,
    trading: protocols.filter(recordsToken).length,
    farm,
    thin,
    skip,
  };

  return {
    rows,
    validation,
    counts,
    meta: { as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd },
  };
}
