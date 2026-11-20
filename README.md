# Launch Radar v5: fitted value tested held-out, LOO and walk-forward, token odds, farm verdicts netted to the dollar, 758 protocols

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar for the make.fun `token-radar-01` bounty ($1,325).
It reads the sealed DefiLlama snapshot (758 protocols, 40 on the watchlist),
fits an OLS value model on the 128 tokens that record a market cap above zero,
and ranks every protocol by implied launch value — with a farm verdict netted
to the dollar on every row.

## What the radar does

- **Value model, fitted from the snapshot.** `log10(mcap) = a + b·log10(TVL) + c·growth + d·age`,
  fitted by ordinary least squares on the 128 tokens with a market cap above zero.
  No protocol name is hardcoded anywhere.
- **Token odds.** The smoothed share of the protocol's category that already records
  a token, pulled toward the global share.
- **Launch eligibility.** 1 for a protocol that records no token and is not a wrapped,
  staked, bridged, exchange or versioned product; 0.05 otherwise.
- **Blind-tested, four ways.** Split-half, leave-one-out, walk-forward (trained only on
  tokens listed earlier), and 200 seeded bootstrap refits that give every protocol a
  rank range. Every test is scored against a flat median-multiple baseline out of sample.
- **Farm verdicts, netted to the dollar.** Expected farmer value = low-end implied value
  × 5% ÷ 2,000 farmers; net = expected − gas − cost of capital over 180 days.
  FARM if net ≥ $25, THIN if net > $0, SKIP otherwise. Deposits are sized to the
  opportunity ($100–$5,000), never one template for every row.
- **Detail view per protocol.** The full arithmetic (fitted × odds × eligibility, then the
  netting), the three nearest traded comps, the bootstrap rank range, and a costed
  180-day farm plan.

## Verified on this snapshot (2026-11-14)

- Fit: 128 tokens, `log10(mcap) = 3.028 + 0.518·log10(TVL) − 1.298·growth − 0.031·age`, R² 0.201.
- Blind tests vs the flat median multiple (median mcap ÷ TVL = 0.2138), median error:
  split-half ×3.73 vs ×5.47 and ×3.94 vs ×5.11; leave-one-out ×3.74 vs ×5.07;
  walk-forward ×3.29 vs ×5.12. The model beats the flat multiple out of sample in every test.
- Rank 1: Bittensor dTAO, implied $25.85M, net $209.14, verdict FARM.
- Verdicts across the 758-row board: FARM 63, THIN 127, SKIP 568.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`,
copies `dashboard/` and `screenshots/`, and writes `dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. Two runs write identical bytes.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — fit, validation, bootstrap, verdicts, farm plans
- `dashboard/` — `index.html`, `app.css`, `app.js` (no network; data comes from `data.js`)
- `screenshots/` — board, detail, filtered views
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit
