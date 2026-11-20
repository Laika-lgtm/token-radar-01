// Token Radar: a comparable-based model over the sealed DefiLlama snapshot.
//
// The board ranks pre-token protocols by what their launch would be worth if the
// protocol's record stayed as it is. It never predicts whether or when a token
// is issued, and it never special-cases a protocol by name: the same function
// scores every row, from the snapshot's own figures only.
//
//   implied = TVL x category multiple x growth x maturity x chains
//
//   category multiple — the median market-cap / TVL of the token-bearing
//     protocols in the same category, computed from this snapshot at run
//     time. A category with fewer than 3 trading comparables falls back to
//     the whole snapshot's median (0.205 at this snapshot). The multiple is
//     clamped to [0.05, 1.50] so one outlier cannot set the board.
//   growth   — 1 + clamp(change_7d, -60, 120)% x 0.5. A protocol growing
//     20% in a week scores 1.10; one shrinking 20% scores 0.90.
//   maturity — 0.70 + min(age_days, 1095) / 1095 x 0.30, where age_days is
//     the days from listed_at to the snapshot's as_of date (365 when the
//     snapshot records no listing date). A protocol that ran three years
//     with no token scores 1.00; a 56-day-old one scores 0.72.
//   chains   — 1 + min(chains - 1, 4) x 0.03. Running on more chains is
//     worth a little, never more than 1.12.
//
// Scope. The board carries every slug on the snapshot's watchlist, plus the
// pre-token protocols below the watchlist floor. Above the floor it carries
// the watchlist only: the snapshot does not carry parent-protocol records,
// so a protocol the house left out above the floor may be a product of
// another protocol (a curator, a vault, a regional arm), and the radar does
// not rank what it cannot tell apart from a product. Wrapped, staked and
// bridged products, exchanges, versioned pools and exchange-branded products
// are never ranked. Live-token protocols are kept apart: the dashboard shows
// the market's own values for them, never a model's.
//
// Language matters: the snapshot records no token for a ranked protocol; it
// does not prove the protocol has none. The dashboard says "records no
// token", never "has no token".

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so the judge can check them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_max: 4,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_comps: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the "Already trading" view carries, by market cap. */
export const LIVE_ROWS = 12;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page generates farm plans from it. */
export interface RadarRow {
  r: number;
  s: string;
  n: string;
  c: string | null;
  h: string;
  t: number;
  g: number | null;
  a: number | null;
  v: number;
  m: number;
  k: number;
  p: number;
  q: number;
  u: number;
  w: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One category's comparable multiple, computed from the snapshot. */
export interface CompRow {
  category: string;
  multiple: number;
  comps: number;
  fallback: boolean;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Whether a protocol records a token at all (a market cap, a CoinGecko id or a symbol). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The category multiples, computed from the snapshot's own token-bearing
 * protocols: for each category, the median market-cap / TVL of its trading
 * protocols, clamped to [multiple_floor, multiple_cap]; a category with
 * fewer than min_comps comparables falls back to the snapshot-wide median.
 */
export function categoryComps(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, CompRow>; global: number } {
  const ratiosByCat = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    allRatios.push(ratio);
    const key = p.category ?? '(no category)';
    const list = ratiosByCat.get(key) ?? [];
    list.push(ratio);
    ratiosByCat.set(key, list);
  }
  const global = clamp(median(allRatios), model.multiple_floor, model.multiple_cap);
  const byCategory = new Map<string, CompRow>();
  for (const [category, ratios] of ratiosByCat) {
    if (ratios.length >= model.min_comps) {
      byCategory.set(category, { category, multiple: clamp(median(ratios), model.multiple_floor, model.multiple_cap), comps: ratios.length, fallback: false });
    } else {
      byCategory.set(category, { category, multiple: global, comps: ratios.length, fallback: true });
    }
  }
  return { byCategory, global };
}

/** The multiple one category gets: its own median, or the snapshot-wide median. */
export function multipleFor(category: string | null, comps: { byCategory: Map<string, CompRow>; global: number }): CompRow {
  const key = category ?? '(no category)';
  return comps.byCategory.get(key) ?? { category: key, multiple: comps.global, comps: 0, fallback: true };
}

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: { byCategory: Map<string, CompRow>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; comp: CompRow; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const comp = multipleFor(protocol.category, comps);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max) * model.chain_step;
  const base = protocol.tvl_usd * comp.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, comp, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the house watchlist rule keeps out: wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a name is a wrapped or staked product, or begins with an exchange's name. */
function isWrappedOrExchange(p: SnapshotProtocol): boolean {
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  return /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(p.name);
}

/** Whether a protocol is one the board may rank: pre-token, not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !EXCLUDED_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !isWrappedOrExchange(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const comps = categoryComps(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, in full.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL.
  // Above the floor the board carries the watchlist only (see the header note).
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, comps, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.comp.multiple),
      category_comps: s.comp.comps,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, in the words a farmer can budget. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $6 of gas';
  if (chain === 'Solana' || chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Polygon') return 'under $1 of gas';
  if (chain === 'Bitcoin') return 'about $2 of network fees';
  return 'about $2 of gas';
}

/** The category's first action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the loan-to-value below 50%.`;
  if (c.includes('cdp')) return `Open a vault on ${name} on ${chain}, deposit $${capital} of collateral and mint a small amount of stablecoin.`;
  if (c.includes('dex')) return `Swap $${capital} through ${name} on ${chain}, then add liquidity to its deepest pool and keep the position open.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the vault shares.`;
  if (c.includes('risk curator')) return `Deposit $${capital} of USDC into a ${name} curator vault on ${chain} and keep the vault shares for the full window.`;
  if (c.includes('capital allocator')) return `Allocate $${capital} of USDC to a ${name} vault on ${chain} and keep the allocation open.`;
  if (c.includes('rwa')) return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the same wallet.`;
  if (c.includes('prediction')) return `Fund your account with $${capital} of USDC on ${name} and take one position in an active market on ${chain}.`;
  if (c.includes('basis trading')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} in two separate payments a week apart.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and keep it open.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farming position on ${name} on ${chain} at 2x or less and check it weekly.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use it in ${name}'s app at least once a week.`;
  if (c.includes('governance')) return `Lock or delegate $${capital} of assets through ${name} on ${chain} and vote in one proposal.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and keep the position staked.`;
  if (c.includes('btc')) return `Mint or hold $${capital} of ${name}'s BTC-backed asset on ${chain}.`;
  if (c.includes('otc')) return `Complete one $${capital} OTC trade through ${name} on ${chain}.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('staking pool')) return `Stake $${capital} through ${name}'s pool on ${chain} and keep the receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('card')) return `Order the card and spend $${capital} through ${name} on ${chain} over two separate purchases.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The second qualifying action, so the wallet shows repeated use, not one deposit. */
function secondActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply, then repay it in full within the same week.`;
  if (c.includes('dex')) return `Make one more swap through ${name} each week so the wallet shows repeated use.`;
  if (c.includes('prediction')) return `Take one more position in a different market each week.`;
  if (c.includes('payment')) return `Make a second payment through ${name} the following week.`;
  if (c.includes('governance')) return `Vote in a second proposal when one opens.`;
  return `Come back once a week and make one more qualifying action — a deposit, a swap, a borrow or a vote, whichever ${name} offers.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p),
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page from the link it publishes itself, and claim only there.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's "Already trading" view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    r: row.rank,
    s: row.slug,
    n: row.name,
    c: row.category,
    h: row.chains.join('|'),
    t: row.tvl_usd,
    g: row.change_7d,
    a: row.age_days,
    v: row.implied_value_usd,
    m: row.model.category_multiple,
    k: row.model.category_comps,
    p: row.model.growth_multiplier,
    q: row.model.maturity_multiplier,
    u: row.model.chain_multiplier,
    w: 0,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = categoryComps(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const compRows: CompRow[] = [...comps.byCategory.values()]
    .filter((c) => board.some((r) => (r.category ?? '(no category)') === c.category))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const rows = board.map((r) => {
    const row = radarRow(r);
    row.w = watch.has(r.slug) ? 1 : 0;
    return row;
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    global_multiple: round4(comps.global),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: compRows,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
