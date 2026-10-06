// MapLibre runs map rendering work in a Web Worker loaded from its own files, which it expects to
// find next to its script. After bundling they aren't there, so we serve them from public/ and
// point MapLibre at them (setWorkerUrl in job-map.tsx). Copied on every dev/build so they always
// match the installed version. Generated: public/maplibre is git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/package.json')) + '/dist';
const out = join(import.meta.dirname, '../public/maplibre');
mkdirSync(out, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(dist, file), join(out, file));
