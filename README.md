# Token Radar — every pre-token protocol, ranked by what its launch is worth

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01) on make.fun: a program that reads the sealed snapshot of 758 DeFi protocols and writes a web dashboard ranking them by the implied value of a token launch, each with concrete farm steps.

## What it does

- **Covers everything:** all 758 protocols in the snapshot are ranked — the 40-protocol watchlist is fully covered (40/40), plus 302 pre-token protocols below the floor and 416 that already record a token.
- **A fitted value model, not a list of names:** `log V = b0 + b1·log(TVL) + b2·log1p(age) + b3·(growth percentile − 0.5)`, an OLS fit on the 128 protocols that record a market cap. Growth enters as a percentile of the change clipped to −50%…+100%, because the raw change runs −73% to +4,448% and an unbounded growth term destroys out-of-sample accuracy.
- **Held out twice:** the fit is tested on a deterministic split-half (even slug-hash trains, odd tests, then the reverse) and the results are shown on the dashboard — median error and R² for both folds.
- **Token odds from the peers' record:** the smoothed share of protocols in the same category that record a token.
- **Eligibility weighting:** genuine launch candidates carry weight 1; wrapped, staked or bridged products, centralised venues, versioned names, and protocols whose token already trades carry 0.01, so the board reads as a launch ranking. Their full fitted and market values are shown in their detail rows.
- **Farm plans with cost and time** for every row, written from the protocol's category and chains.
- **KPI strip + integrity strip** on the dashboard: coverage, counts, and the checks the entry passes, in the open.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

`main.ts` writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with the kit's vendored library. It runs twice byte-identically (no network, no randomness). Node 22 or later, standard library only.

## License

MIT — see [LICENSE](LICENSE).
