// Launch Radar v5 — entrypoint.
//
// Reads the sealed snapshot, builds the ranked board with lib/model.ts,
// writes board.json and the dashboard's data, copies dashboard/ and
// screenshots/ into the output directory, and writes dossier.json with
// buildDossier from vendor/makefun-board.ts.
//
//   MAKEFUN_OUTPUT_DIR=<dir> node main.ts --input <snapshot.json>
//
// Without --input the program exits 2. Both runs write identical bytes:
// the build is a pure function of the snapshot file, and the bootstrap
// refits use a fixed seed, never the clock or an unseeded random source.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = dirname(fileURLToPath(import.meta.url));

function fail(message: string, code: number): never {
  process.stderr.write(`main.ts: ${message}\n`);
  process.exit(code);
}

const args = process.argv.slice(2);
const inputAt = args.indexOf('--input');
if (inputAt === -1 || !args[inputAt + 1]) fail('usage: node main.ts --input <snapshot.json>', 2);
const inputPath = args[inputAt + 1]!;
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(here, 'out');

let raw: string;
try {
  raw = readFileSync(inputPath, 'utf8');
} catch {
  fail(`cannot read snapshot at ${inputPath}`, 2);
}
const snapshot = JSON.parse(raw!);
const build = buildBoard(snapshot);

mkdirSync(join(outDir, 'dashboard'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

// The board: every protocol in the snapshot, ranked by implied value.
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: build.rows }, null, 2)}\n`, 'utf8');

// The dashboard's data, beside the page: the same rows plus the validation
// numbers and the counts the page renders. Written as one assignment so the
// page loads it with a plain script tag and no network.
const data = `window.LAUNCH_RADAR = ${JSON.stringify(build)};\n`;
writeFileSync(join(outDir, 'data.js'), data, 'utf8');

// The page and its screenshots, copied whole.
cpSync(join(here, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The dossier the judge reads: byte for byte what buildDossier writes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536 }));

process.stdout.write(
  `board: ${build.rows.length} rows, watchlist ${build.counts.watchlist_covered}/${build.counts.watchlist} covered, ` +
    `verdicts FARM ${build.counts.farm} / THIN ${build.counts.thin} / SKIP ${build.counts.skip}\n`,
);
