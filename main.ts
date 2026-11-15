// SABLE LINE — a three.js tactical FPS entry for make.fun (threejs-fps-02).
// Node 22, standard library only. The game itself is this directory's game/
// folder: plain static files the browser loads as ES modules, three.js from
// an import map, no build step and no network request. This program hands the
// entry in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program runs twice in the grader and both runs must write the same
// bytes: the copy is a plain file copy and buildDossier is deterministic, so
// the dossier is identical every run.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing');

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const caps = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 };
const dossier = buildDossier(out, caps);
// The grader runs this program twice and both runs must write the same
// bytes: rebuild the dossier from the same files and refuse to hand in a
// result that is not byte-identical to itself.
const dossierAgain = buildDossier(out, caps);
// buildDossier returns a Uint8Array, which has no .equals — compare via Buffer.
if (!Buffer.from(dossier).equals(Buffer.from(dossierAgain))) throw new Error('dossier is not deterministic');
writeFileSync(join(out, 'dossier.json'), dossier);

// Refuse a broken hand-in instead of submitting it: the gate would reject
// an entry with no dossier, no screenshots, or a game/ that is empty.
const shots = readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
if (statSync(join(out, 'dossier.json')).size === 0) throw new Error('dossier.json is empty');

// A short human-readable summary of what was handed in. stdout only; the
// bytes in /output are what the gate reads.
const countFiles = (dir: string): number => {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return total;
};
console.log(
  `sable-line: ${countFiles(join(out, 'game'))} game files, ${shots.length} screenshots, ` +
  `dossier ${statSync(join(out, 'dossier.json')).size} bytes -> ${out}`,
);
