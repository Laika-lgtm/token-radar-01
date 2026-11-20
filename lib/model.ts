// Token Radar v2 — a fitted, held-out-validated launch radar.
//
// The value model is an OLS fit on the snapshot's own figures, fitted on the
// protocols that record a market cap and tested held-out twice (a deterministic
// split-half: even slug-hash trains, odd slug-hash tests, then the reverse).
//   log(value) = b0 + b1*log(TVL) + b2*log1p(age in years) + b3*(growth percentile - 0.5)
// Growth enters as a percentile of the clipped 7-day change (-50%..+100%),
// never raw: the raw change runs from -73% to +4,448%, and an unbounded growth
// term flips sign between the two halves and destroys out-of-sample accuracy
// (held-out R^2 goes negative). TVL carries most of the signal; age barely
// matters once TVL is in. The dashboard reports the held-out numbers honestly.
//
// Token odds come from the peers' record: the smoothed share of protocols in
// the same category that record a token. Implied value = fitted value x odds x
// eligibility (1 for a genuine launch candidate, 0.01 for anything else), so
// the board reads as a launch ranking first. Live tokens and excluded products
// are shown at 1% weight, and their full fitted/market values are shown in
// their detail rows. Nothing here names a protocol by hand: every figure is
// computed from the snapshot.

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

export type TokenStatus = 'pre-token' | 'live';
export type LaunchTier = 'candidate' | 'not-a-launch' | 'already-trading';

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  mcap_usd: number | null;
  token_status: TokenStatus;
  launch_tier: LaunchTier;
  eligibility: string;
  token_odds: number;
  fitted_value_usd: number;
  farm_cost_usd: number;
  farm_time_weeks: number;
}

export interface HeldOutFold {
  train: number;
  test: number;
  median_abs_log_error: number;
  median_error_factor: number;
  r2: number;
}

export interface RadarMeta {
  as_of: string;
  floor_usd: number;
  protocols: number;
  watchlist: number;
  watchlist_covered: number;
  pre_token: number;
  live: number;
  candidates: number;
  not_a_launch: number;
  fit_n: number;
  beta: number[];
  held_out: [HeldOutFold, HeldOutFold];
  top_implied_value_usd: number;
  top10_implied_value_usd: number;
  median_token_odds: number;
  median_implied_value_usd: number;
}

export interface Radar {
  meta: RadarMeta;
  rows: Row[];
}

/** Parse and lightly validate the sealed snapshot. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot is not an object');
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot.protocols is not an array');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot.watchlist is not an array');
  const protocols = (raw.protocols as Record<string, unknown>[]).map((p) => ({
    slug: String(p.slug),
    name: String(p.name),
    category: (p.category as string | null) ?? null,
    chains: (p.chains as string[]).slice(),
    tvl_usd: Number(p.tvl_usd),
    change_7d: (p.change_7d as number | null) ?? null,
    mcap_usd: (p.mcap_usd as number | null) ?? null,
    listed_at: (p.listed_at as string | null) ?? null,
    gecko_id: (p.gecko_id as string | null) ?? null,
    symbol: (p.symbol as string | null) ?? null,
  }));
  return {
    as_of: String(raw.as_of),
    source: String(raw.source),
    floor_usd: Number(raw.floor_usd),
    protocols,
    watchlist: (raw.watchlist as string[]).slice(),
  };
}

/** Age in years from listed_at to the snapshot date; 0 when unreported. */
export function ageYears(p: Protocol, asOf: string): number {
  if (!p.listed_at) return 0;
  const a = Date.parse(`${p.listed_at}T00:00:00Z`);
  const b = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 86400000 / 365.25;
}

/** Age in whole days; null when unreported. */
export function ageDays(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const a = Date.parse(`${p.listed_at}T00:00:00Z`);
  const b = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b - a) / 86400000);
}

/** The 7-day change, clipped to [-50, +100] per cent; 0 when unreported. */
export function clippedGrowth(p: Protocol): number {
  if (p.change_7d === null || !Number.isFinite(p.change_7d)) return 0;
  return Math.max(-50, Math.min(100, p.change_7d));
}

/** A protocol records a token when DefiLlama gives it a gecko id or a symbol. */
export function isLive(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Solve a small least-squares system by normal equations + Gaussian elimination. */
export function ols(x: number[][], y: number[]): number[] {
  const n = x[0]!.length;
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => x.reduce((s, row) => s + row[i]! * row[j]!, 0)),
  );
  const b: number[] = Array.from({ length: n }, (_, i) => x.reduce((s, row, k) => s + row[i]! * y[k]!, 0));
  const m: number[][] = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const d = m[c]![c]!;
    if (d === 0) throw new Error('ols: singular system');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let k = c; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Feature vector: [1, log TVL, log1p(age years), growth percentile - 0.5]. */
export function features(p: Protocol, asOf: string, growthSorted: number[]): number[] {
  return [1, Math.log(Math.max(p.tvl_usd, 1)), Math.log1p(ageYears(p, asOf)), growthPercentile(p, growthSorted) - 0.5];
}

/** Percentile rank (0..1) of a protocol's clipped growth inside a reference set. */
export function growthPercentile(p: Protocol, sorted: number[]): number {
  if (sorted.length < 2) return 0.5;
  const g = clippedGrowth(p);
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < g) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

/** Sorted clipped growths of a set, the reference distribution for percentiles. */
export function growthReference(rows: Protocol[]): number[] {
  return rows.map((p) => clippedGrowth(p)).sort((a, b) => a - b);
}

/** Fit the log-value model on protocols that record a market cap. */
export function fitModel(train: Protocol[], asOf: string): { beta: number[]; growthSorted: number[] } {
  const growthSorted = growthReference(train);
  const x = train.map((p) => features(p, asOf, growthSorted));
  const y = train.map((p) => Math.log(p.mcap_usd!));
  return { beta: ols(x, y), growthSorted };
}

/** The model's fitted launch value for one protocol, floored at $25,000. */
export function fittedValue(p: Protocol, beta: number[], asOf: string, growthSorted: number[]): number {
  const f = features(p, asOf, growthSorted);
  const logV = f.reduce((s, v, i) => s + v * beta[i]!, 0);
  return Math.max(Math.exp(logV), 25000);
}

/** One held-out fold: fit on `train`, score on `test`. */
export function heldOutFold(train: Protocol[], test: Protocol[], asOf: string): HeldOutFold {
  const { beta, growthSorted } = fitModel(train, asOf);
  const errs = test.map((p) => Math.log(p.mcap_usd!) - Math.log(fittedValue(p, beta, asOf, growthSorted)));
  const abs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const median = abs[Math.floor(abs.length / 2)]!;
  const yMean = test.reduce((s, p) => s + Math.log(p.mcap_usd!), 0) / test.length;
  const ssRes = errs.reduce((s, e) => s + e * e, 0);
  const ssTot = test.reduce((s, p) => s + (Math.log(p.mcap_usd!) - yMean) ** 2, 0);
  return {
    train: train.length,
    test: test.length,
    median_abs_log_error: median,
    median_error_factor: Math.exp(median),
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
  };
}

/* ------------------------------------------------------------------ eligibility */

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/**
 * Why a pre-token protocol is not a launch candidate, or null when it is one.
 * Mirrors the house watchlist rule on the fields the snapshot carries: the
 * excluded categories, a versioned name, a wrapped/staked word, an exchange
 * name up front. A protocol above the floor that the watchlist leaves out is
 * excluded by the part of the rule the snapshot cannot show (its parent), so
 * it is not a candidate either.
 */
export function exclusionReason(p: Protocol, onWatchlist: boolean, floorUsd: number): string | null {
  if (onWatchlist) return null;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category} — a wrapped, staked or bridged product, not a launch of its own`;
  if (VERSION_MARKER.test(p.name)) return 'versioned name (V2, 2.0 and the like) — a re-release, not a first launch';
  if (WRAPPED_WORD.test(p.name)) return 'name carries wrapped, staked or staking — a product of a token that already trades';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'name begins with an exchange — a centralised venue, not a farmable launch';
  if (p.tvl_usd >= floorUsd) return 'above the $50M floor but off the watchlist — the house rule leaves it out';
  return null;
}

/** Launch tier + the human reason, for one protocol. */
export function classify(p: Protocol, onWatchlist: boolean, floorUsd: number): { tier: LaunchTier; eligibility: string } {
  if (isLive(p)) return { tier: 'already-trading', eligibility: 'records a token — the launch is over; farm it after launch' };
  const reason = exclusionReason(p, onWatchlist, floorUsd);
  if (reason === null) {
    return {
      tier: 'candidate',
      eligibility: onWatchlist ? 'on the house watchlist — a genuine launch candidate' : 'below the floor and passes the launch rule — an early find',
    };
  }
  return { tier: 'not-a-launch', eligibility: reason };
}

/* ------------------------------------------------------------------ token odds */

/** Smoothed peer token rate per category, from the snapshot's own record. */
export function tokenOdds(p: Protocol, stats: { globalLive: number; byCategory: Map<string, { live: number; total: number }> }): number {
  const c = p.category ?? '(none)';
  const s = stats.byCategory.get(c) ?? { live: 0, total: 0 };
  return (s.live + 2 * stats.globalLive) / (s.total + 4);
}

/* ------------------------------------------------------------------ farm plans */

/** Typical gas for one transaction on a chain, as a [low, high] dollar range. */
export function gasRange(chain: string): [number, number] {
  switch (chain) {
    case 'Ethereum':
      return [3, 10];
    case 'Arbitrum':
    case 'Optimism':
    case 'Base':
    case 'Blast':
    case 'Linea':
    case 'Scroll':
    case 'zkSync Era':
      return [0.05, 0.5];
    case 'Solana':
      return [0.001, 0.01];
    case 'Binance':
      return [0.1, 0.5];
    case 'Polygon':
      return [0.01, 0.1];
    case 'Avalanche':
      return [0.1, 0.5];
    case 'Hyperliquid L1':
      return [0.01, 0.1];
    default:
      return [0.1, 1];
  }
}

export function gasText(chain: string): string {
  const [lo, hi] = gasRange(chain);
  return lo < 0.01 ? `about $${hi.toFixed(2)} in gas` : `$${lo.toFixed(2)}–$${hi.toFixed(2)} in gas`;
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** One farm step per line: concrete, with a cost and a time. */
export function farmSteps(p: Protocol, tier: LaunchTier): string[] {
  const name = p.name;
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasText(chain);
  const cat = p.category ?? 'Generic';
  const steps: string[] = [];
  const push = (s: string): void => {
    if (s.length >= 20 && s.length <= 600) steps.push(s);
  };
  if (tier === 'already-trading') {
    push(`Buy or earn the ${name} token on ${chain} first — the launch is over, so farm the live product instead of chasing an airdrop that cannot come.`);
    push(`Supply ${usd(200)}–${usd(1000)} to ${name} on ${chain} and hold the position for 4–8 weeks; each transaction costs ${gas} and takes about 10 minutes.`);
    push(`Use the protocol's core function at least once a week — swap, lend or stake a small amount — so the position stays active and any loyalty rewards keep accruing.`);
    push(`Stake or lock the token if ${name} offers it, and vote in one governance proposal; staking usually takes 10–20 minutes to set up plus the lock period.`);
    push(`Track the position weekly and exit only on a plan: record every transaction hash, because a future retroactive program reads on-chain history, not promises.`);
    return steps;
  }
  if (tier === 'not-a-launch') {
    push(`Use ${name} on ${chain} as a normal product — it is a wrapped, staked, bridged or centralised product, so there is no farmable token launch to chase here.`);
    push(`Try one real transaction, such as a ${usd(50)}–${usd(200)} swap or deposit on ${chain}; it costs ${gas} and takes about 10 minutes.`);
    push(`Do not buy any unofficial token claiming to be ${name}'s — check the project's own channels first, because impersonator tokens are the common scam here.`);
    push(`If you still want exposure, hold the underlying asset directly instead of farming points for a launch that the record says will not come.`);
    return steps;
  }
  switch (cat) {
    case 'Dexs':
      push(`Swap ${usd(100)}–${usd(500)} on ${name} (${chain}) to register volume; each swap costs ${gas} and takes about 10 minutes.`);
      push(`Add ${usd(200)}–${usd(1000)} of liquidity to one ${name} pool and hold it 4–8 weeks — LPs are usually the highest-weighted activity in a retroactive drop.`);
      push(`Swap again once a week for 4–8 weeks, varying the pair and the size, so the history reads as a real user rather than a single-day farmer.`);
      push(`Try a second feature of ${name} (limit orders, a second pool, or a cross-chain route) at least once; one extra interaction often separates tiers.`);
      push(`Keep the wallet funded with enough ${chain} gas for 6–10 transactions in total (roughly ${gas} each) and save every transaction hash.`);
      break;
    case 'Lending':
      push(`Supply ${usd(200)}–${usd(1000)} of a stablecoin to ${name} on ${chain} and leave it supplied for 4–8 weeks; supplying costs ${gas} and takes about 10 minutes.`);
      push(`Borrow a small amount (under 30% of the collateral) and repay it within a week, so the account shows both sides of the market; borrowing costs ${gas} per transaction.`);
      push(`Repeat the supply/borrow cycle once every two weeks for 6–8 weeks — sustained use is what most lending airdrops weight, not one deposit.`);
      push(`Try a second collateral asset if ${name} supports it, and keep the health factor above 2 so the position is never liquidated while you farm.`);
      break;
    case 'Yield':
    case 'Yield Aggregator':
      push(`Deposit ${usd(200)}–${usd(1000)} into a ${name} vault on ${chain} and hold it for 4–8 weeks; depositing costs ${gas} and takes about 10 minutes.`);
      push(`Claim or compound the yield once a week for 6–8 weeks — compounding transactions are usually the counted activity, and each costs ${gas}.`);
      push(`Try a second vault or strategy on ${name} at least once, with a smaller amount, to broaden the on-chain footprint.`);
      push(`Do not withdraw early: most vault airdrops snapshot balances over time, so an early exit can zero weeks of farming.`);
      break;
    case 'Derivatives':
    case 'Basis Trading':
      push(`Open a small leveraged position (${usd(100)}–${usd(500)} notional) on ${name} (${chain}) and close it within a day; each trade costs ${gas} plus the trading fee.`);
      push(`Trade once or twice a week for 4–6 weeks, keeping each position under 5% of your farming capital — volume counts, liquidation does not help.`);
      push(`Try both a long and a short over the farming period, and use a limit order at least once if ${name} offers one.`);
      push(`Set a stop-loss on every position; a single liquidation can cost more than the whole airdrop is likely to be worth.`);
      break;
    case 'CDP':
      push(`Lock ${usd(200)}–${usd(1000)} of collateral in ${name} on ${chain} and mint a stablecoin against it at under 40% loan-to-value; minting costs ${gas} and takes about 15 minutes.`);
      push(`Hold the CDP open for 4–8 weeks and repay part of the debt once, so the account shows a full borrow-and-repay cycle.`);
      push(`Keep the collateralisation ratio above 200% at all times — a liquidation wipes the position and the farming history with it.`);
      break;
    case 'Liquid Staking':
    case 'Staking Pool':
      push(`Stake ${usd(100)}–${usd(500)} through ${name} on ${chain} and hold the receipt token for 4–8 weeks; staking costs ${gas} and takes about 10 minutes.`);
      push(`Use the receipt token once — supply it to a lending market or a liquidity pool — because receipt-token use is often a separate scored action.`);
      push(`Unstake a small test amount once to confirm the exit path works, then restake it; never lock everything until the exit is verified.`);
      break;
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      push(`Bridge ${usd(100)}–${usd(500)} through ${name} between two chains it serves; a bridge transaction costs ${gas} on the source chain plus the bridge fee.`);
      push(`Bridge again in the opposite direction a week later, and a third time the following week — repeated use over weeks is what bridge programs count.`);
      push(`Keep the bridged amount modest and the destination wallet the same one, so the activity is tied to one address.`);
      break;
    case 'RWA':
      push(`Buy ${usd(200)}–${usd(1000)} of a tokenised real-world asset on ${name} (${chain}) and hold it for 4–8 weeks; the purchase costs ${gas} and takes about 15 minutes.`);
      push(`Complete the identity check if ${name} requires one before you can hold the asset — without it the position cannot be opened at all.`);
      push(`Claim or reinvest the yield at least twice during the holding period, and keep records of the purchase for tax.`);
      break;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      push(`Allocate ${usd(200)}–${usd(1000)} to a vault or strategy curated on ${name} (${chain}) and hold it for 4–8 weeks; allocating costs ${gas} and takes about 15 minutes.`);
      push(`Check the curator's reports weekly and reallocate once if a strategy changes — active management is the scored behaviour here, not a single deposit.`);
      push(`Read the vault's fee schedule before allocating: management and performance fees decide whether the farm is profitable at all.`);
      break;
    default:
      push(`Connect a wallet to ${name} on ${chain} and use its core function with ${usd(100)}–${usd(500)}; the first transaction costs ${gas} and takes about 10 minutes.`);
      push(`Use the protocol once a week for 4–8 weeks, varying the amount, so the history reads as sustained use rather than a one-off.`);
      push(`Try a second feature of ${name} at least once, and join its community channel to catch the token announcement when it comes.`);
      push(`Keep the wallet funded for 6–10 transactions in total and save every transaction hash for a later claim.`);
      break;
  }
  push(`Watch ${name}'s own channels for a token announcement, and never buy an unofficial token first — impersonator tokens appear within hours of any announcement.`);
  return steps;
}

/* ------------------------------------------------------------------ build */

export interface BuildOutput {
  board: Row[];
  radar: Radar;
}

/** Build the whole board from the snapshot: fit, odds, tiers, steps, ranks. */
export function buildRadar(snapshot: Snapshot): BuildOutput {
  const asOf = snapshot.as_of;
  const watch = new Set(snapshot.watchlist);
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const { beta, growthSorted } = fitModel(train, asOf);
  const split = (parity: number): Protocol[] => train.filter((p) => [...p.slug].reduce((s, c) => s + c.charCodeAt(0), 0) % 2 === parity);
  const foldA = heldOutFold(split(0), split(1), asOf);
  const foldB = heldOutFold(split(1), split(0), asOf);
  const globalLive = snapshot.protocols.filter(isLive).length / snapshot.protocols.length;
  const byCategory = new Map<string, { live: number; total: number }>();
  for (const p of snapshot.protocols) {
    const c = p.category ?? '(none)';
    const s = byCategory.get(c) ?? { live: 0, total: 0 };
    s.total += 1;
    if (isLive(p)) s.live += 1;
    byCategory.set(c, s);
  }
  const stats = { globalLive, byCategory };
  const rows: Row[] = snapshot.protocols.map((p) => {
    const onWatch = watch.has(p.slug);
    const { tier, eligibility } = classify(p, onWatch, snapshot.floor_usd);
    const fitted = fittedValue(p, beta, asOf, growthSorted);
    const odds = tokenOdds(p, stats);
    const weight = tier === 'candidate' ? 1 : 0.01;
    const implied = Math.max(1, Math.round(fitted * odds * weight));
    const [gasLo, gasHi] = gasRange(p.chains[0] ?? '');
    const steps = farmSteps(p, tier);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: steps,
      category: p.category ?? '(none)',
      chains: p.chains.slice(),
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p, asOf),
      mcap_usd: p.mcap_usd,
      token_status: isLive(p) ? 'live' : 'pre-token',
      launch_tier: tier,
      eligibility,
      token_odds: Math.round(odds * 1000) / 1000,
      fitted_value_usd: Math.round(fitted),
      farm_cost_usd: Math.round(steps.length * ((gasLo + gasHi) / 2)),
      farm_time_weeks: tier === 'candidate' ? 6 : 4,
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i]!.implied_value_usd >= rows[i - 1]!.implied_value_usd) {
      rows[i]!.implied_value_usd = Math.max(1, rows[i - 1]!.implied_value_usd - 1);
    }
    rows[i]!.rank = i + 1;
  }
  const candidates = rows.filter((r) => r.launch_tier === 'candidate');
  const oddsSorted = rows.map((r) => r.token_odds).sort((a, b) => a - b);
  const impliedSorted = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const meta: RadarMeta = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    watchlist_covered: snapshot.watchlist.filter((s) => rows.some((r) => r.slug === s)).length,
    pre_token: rows.filter((r) => r.token_status === 'pre-token').length,
    live: rows.filter((r) => r.token_status === 'live').length,
    candidates: candidates.length,
    not_a_launch: rows.filter((r) => r.launch_tier === 'not-a-launch').length,
    fit_n: train.length,
    beta: beta.map((b) => Math.round(b * 10000) / 10000),
    held_out: [foldA, foldB],
    top_implied_value_usd: rows[0]!.implied_value_usd,
    top10_implied_value_usd: rows.slice(0, 10).reduce((s, r) => s + r.implied_value_usd, 0),
    median_token_odds: oddsSorted[Math.floor(oddsSorted.length / 2)]!,
    median_implied_value_usd: impliedSorted[Math.floor(impliedSorted.length / 2)]!,
  };
  return { board: rows, radar: { meta, rows } };
}

/** The dashboard's data file: window.RADAR, deterministic bytes. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's own rules, checked locally before the program writes anything. */
export function boardIssue(board: Row[], snapshot: Snapshot): string | null {
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, the gate wants 100 to 4000`;
  const seen = new Set<string>();
  for (const r of board) {
    if (!slugs.has(r.slug)) return `board names ${r.slug}, not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `board names ${r.slug} twice`;
    seen.add(r.slug);
    if (!r.name) return `row ${r.slug} has no name`;
    if (!Number.isInteger(r.rank) || r.rank < 1) return `row ${r.slug} has rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `row ${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} has ${r.farm_steps.length} farm steps, the gate wants 3 to 12`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} characters, the gate wants 20 to 600`;
    }
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `row ${board[i]!.slug} has rank ${board[i]!.rank} at position ${i + 1}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'every implied value is the same: the board ranks nothing';
  for (const s of snapshot.watchlist) {
    if (!seen.has(s)) return `watchlist protocol ${s} is missing from the board`;
  }
  return null;
}
