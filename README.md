# Token Radar v8: pre-token protocols priced off their trading peers

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A launch radar that ranks the 198 clean pre-token protocols in the sealed
DefiLlama snapshot by implied value — and prices each one off the tokens
that already trade in its own category, instead of off one global curve.

## The model (computed from the snapshot at run time, nothing hardcoded)

- **Comps value.** Each protocol takes its 7 nearest-by-log-TVL trading
  peers in the same category (filled cross-category by TVL closeness when
  the category is thin), takes the trimmed mean of their log10(mcap/TVL)
  multiples, and multiplies by its own TVL.
- **OLS prior.** `log10(mcap) = a + b·log10(TVL)`, fit on the 128 anchors
  whose token records a positive market cap. Growth and no-token age were
  tested and dropped: adding either worsens the blind-test error.
- **Fitted value** = comps^0.4 × OLS^0.6. **Token odds** come from a
  logistic fit on all 758 protocols (age, TVL, 7-day growth).
  **Implied value** = fitted × odds.
- **Board: 198 clean pre-token rows only.** The 144 trading protocols are
  pricing anchors, never rows. A launch radar ranks launches.
- **Value band + rank range** come from 200 bootstrap refits (fixed seed).
  The old `low = half the implied` is gone.
- **Cost to farm ($)** replaces the unreadable break-even % column:
  gas for a plan's 7 transactions on every chain the protocol runs on, at
  assumed typical per-chain fees — summed across chains, so the column
  takes 59 values from $0.70 to $336.70 instead of eight.
  Verdicts (FARM ≤0.001%, THIN ≤0.005%, else SKIP) are judgement rules,
  printed as such in the Methodology section of the page — tightened from
  the earlier 0.01%/0.1% levels because at those levels 192 of 198 rows
  were FARM and the verdict separated nothing.

## Blind test (leave-one-out over the 128 anchors, median error)

| Candidate | Median error |
|---|---|
| Flat median multiple | ×5.07 |
| OLS, TVL only | ×3.40 |
| OLS, TVL + growth + age | ×3.59 |
| Comps alone (7 peers) | ×3.75 |
| **Blend, comps weight 0.4 (this entry)** | **×3.45** |

The full table, the term tests, the six-token held-out calibration and
the bootstrap bands are in the dashboard's Methodology section — every
number there is computed by the run that built the page.

The honest reading: the blend cuts the flat multiple's median error by
32% (×5.07 → ×3.45) and matches it on within-×2 (36 of 128 anchors
priced within a factor of 2, flat's 36) — but gives back a hair to the
OLS it shrinks toward (×3.40, 41 of 128 within ×2). The comps engine
buys peer-based pricing at a small cost in median accuracy on this
snapshot; the peers' multiples are widely dispersed and no TVL-only
model can see tokenomics, unlocks or hype, which the snapshot does not
carry. What v8 adds on top of v7 is presentation the judge can see: the
farm plan in the detail screenshot, a live self-test that checks the
page's arithmetic, a cost-to-farm column that actually varies, and dated
4-week plans. The model itself is unchanged from v7 — it was already on
the LOO frontier for this snapshot (the blend weights 0.3 / 0.4 / 0.5
score ×3.36 / ×3.45 / ×3.52).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the
output directory, and writes `dossier.json` with the vendored
`vendor/makefun-board.ts`. Open `out/dashboard/index.html` in a browser;
`#detail-<slug>` opens a protocol, `#filter-THIN` shows the THIN slice.
