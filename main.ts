// Verano Heat — make.fun entry program (gta6-01).
//
// The game itself is the static site in game/ (open game/index.html in a
// desktop browser and play; it needs no build step and no network). This
// program is the hand-in: it validates the entry against the competition's
// size caps, copies game/ and screenshots/ into the output directory, and
// writes dossier.json with the kit's buildDossier, exactly as the grader
// will rebuild it.
//
// Run it the way the kit describes:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Walk a directory tree and report entry count and total bytes, refusing
// anything the scorer would refuse so a bad entry fails here, loudly,
// instead of at grading time.
function survey(dir: string, label: string): { entries: number; bytes: number } {
  let entries = 0;
  let bytes = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      entries += 1;
      if (Buffer.byteLength(p) > CAPS.game_path_max_bytes && label === 'game') {
        throw new Error(`path too long under game/: ${p}`);
      }
      if (st.isDirectory()) walk(p);
      else bytes += st.size;
    }
  };
  walk(dir);
  return { entries, bytes };
}

const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing — the game must live in game/');
}
const gameStats = survey(gameDir, 'game');
if (gameStats.entries > CAPS.game_max_files) {
  throw new Error(`game/ holds ${gameStats.entries} entries, over the ${CAPS.game_max_files} cap`);
}
if (gameStats.bytes > CAPS.game_max_bytes) {
  throw new Error(`game/ is ${gameStats.bytes} bytes, over the ${CAPS.game_max_bytes} cap`);
}
const shotStats = existsSync(shotsDir) ? survey(shotsDir, 'screenshots') : { entries: 0, bytes: 0 };
if (shotStats.entries > CAPS.screenshots.max) {
  throw new Error(`screenshots/ holds ${shotStats.entries} images, over the ${CAPS.screenshots.max} cap`);
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Final self-check of the whole output tree: the platform caps /output at
// 1,000 entries and the dossier at 1.5 MiB, and a hand-in that trips either
// is refused — so count everything that was just written and say so.
const outStats = survey(outDir, 'output');
const DOSSIER_MAX = 1572864;
const OUTPUT_MAX_ENTRIES = 1000;
if (Buffer.byteLength(dossier) > DOSSIER_MAX) {
  throw new Error(`dossier.json is ${Buffer.byteLength(dossier)} bytes, over the ${DOSSIER_MAX} cap`);
}
if (outStats.entries > OUTPUT_MAX_ENTRIES) {
  throw new Error(`/output holds ${outStats.entries} entries, over the ${OUTPUT_MAX_ENTRIES} cap`);
}

console.log(
  `Verano Heat handed in: game/ ${gameStats.entries} entries, ${gameStats.bytes} bytes; ` +
  `screenshots/ ${shotStats.entries} images; dossier.json ${Buffer.byteLength(dossier)} bytes; ` +
  `output total ${outStats.entries} entries -> ${outDir}`,
);
