# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Laika-lgtm/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: every protocol DefiLlama tracks that records no token, ranked by what its launch would be worth. The implied value is a comparable-based model — the median market-cap / TVL of the trading protocols in the same category, computed from the sealed snapshot, times growth, maturity and chain-diversity multipliers — never a hardcoded list of names. The dashboard shows the ranked board, a detail view with the model's breakdown and a concrete farm plan for every protocol, plus the protocols whose token already trades (the market's own values, not ranked).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The program reads the sealed snapshot, writes `board.json` (178 rows: the full 40-protocol watchlist plus the rankable pre-token protocols below the $50M floor), `data.js`, the static `dashboard/`, three `screenshots/`, and `dossier.json` — deterministically, with no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=w2e3vyyb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
