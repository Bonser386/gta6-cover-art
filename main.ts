// Vice Cover Studio — the hand-in program for gta6-cover-art-01 (Node 22, stdlib only).
//
// It copies this repository's app/ and screenshots/ into the grader's /output directory
// (or $MAKEFUN_OUTPUT_DIR when run outside the grader) and writes /output/dossier.json
// with the vendored make.fun library, so the judge can read the app's source and shots.
// Deterministic: the same tree always produces byte-identical output, since the dossier
// is built from file contents alone and the copy preserves them as they are.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps from the competition's gate (kit RULES.txt): the dossier text is capped at 160 KiB;
// the other caps refuse an entry the scorer would refuse outright (more than 4 screenshots
// or one over 256 KiB; more than 993 files in app/ or 48 MiB of app files in all, or a
// path under app/ over 1000 bytes).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
