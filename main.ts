// Token Radar — the program that builds the ranked board and its dashboard.
//
// Reads the sealed DefiLlama snapshot, prices every clean pre-token
// protocol off its trading peers with lib/model.ts, and writes the
// entry's outputs: board.json, data.js, a copy of dashboard/ and
// screenshots/, and dossier.json from the vendored make.fun library.
//
// Node 22, standard library only. Run it as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
// In the grader's container the snapshot sits at /input/snapshot.json
// and the outputs go to /output; both paths can be overridden.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { buildDossier as dossierOf } from './vendor/makefun-board.ts';

/** The directory this file lives in (the repository root). */
const repoRoot = new URL('.', import.meta.url).pathname;

/** Read a `--flag value` or `--flag=value` argument; `fallback` otherwise. */
function flagValue(flag: string, fallback: string): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === `--${flag}`) {
      if (i + 1 >= args.length) throw new Error(`token radar: --${flag} needs a value`);
      return args[i + 1]!;
    }
    if (a.startsWith(`--${flag}=`)) return a.slice(flag.length + 3);
  }
  return fallback;
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json')
  ? inputGiven
  : path.join(inputGiven, 'snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotPath} — pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const refused = boardIssue(board, snapshot);
if (refused !== null) {
  process.stderr.write(`token radar: the board fails the gate: ${refused}\n`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const boardPayload = JSON.stringify({ rows: board }) + '\n';
fs.writeFileSync(path.join(outDir, 'board.json'), boardPayload);
const dataPayload = dataScript(radar);
fs.writeFileSync(path.join(outDir, 'data.js'), dataPayload);

/**
 * Copy a directory's regular files into `dest`, skipping dot-names,
 * and report the names copied. Subdirectories are not followed: the
 * dashboard and the screenshots are flat by design.
 */
function copyFlat(fromDir: string, destDir: string): string[] {
  const copied: string[] = [];
  if (!fs.existsSync(fromDir)) return copied;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !entry.isFile()) continue;
    fs.copyFileSync(path.join(fromDir, entry.name), path.join(destDir, entry.name));
    copied.push(entry.name);
  }
  return copied;
}

copyFlat(path.join(repoRoot, 'dashboard'), path.join(outDir, 'dashboard'));
const shotNames = copyFlat(path.join(repoRoot, 'screenshots'), path.join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'} — hand in at least 3 (board, detail, filtered)\n`,
  );
  process.exit(1);
}

/** A dossier-plain name: a letter, digit or _ first, then letters, digits and . _ - . */
function plainName(name: string): boolean {
  if (name.length < 1 || name.length > 128) return false;
  const first = name[0]!;
  const firstOk = (first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z') || (first >= '0' && first <= '9') || first === '_';
  if (!firstOk) return false;
  for (const ch of name) {
    const ok =
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '.' ||
      ch === '_' ||
      ch === '-';
    if (!ok) return false;
  }
  return true;
}
for (const name of shotNames) {
  if (!plainName(name)) {
    process.stderr.write(`token radar: screenshots/${name} is not a plain dossier name\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this output
// directory and compares the bytes, so it must come from these files.
const dossierCaps = {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 },
};
const dossierBytes = dossierOf(outDir, dossierCaps);
fs.writeFileSync(path.join(outDir, 'dossier.json'), dossierBytes);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked (${radar.counts.anchors} anchors, ${radar.counts.degenerate} degenerate mcap<=0 set aside)\n` +
    `token radar: verdicts FARM ${radar.verdicts.FARM} / THIN ${radar.verdicts.THIN} / SKIP ${radar.verdicts.SKIP}; wrote ${path.join(outDir, 'board.json')}, ${path.join(outDir, 'data.js')}, ${path.join(outDir, 'dashboard')}, ${path.join(outDir, 'screenshots')} (${shotNames.length} images) and ${path.join(outDir, 'dossier.json')}\n`,
);
