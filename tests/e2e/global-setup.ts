import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeBigZip } from '../../scripts/make-fixtures.ts';

// big.zip (~20MB) is gitignored; build it on first run so e2e works on a fresh clone.
export default function globalSetup() {
  const dir = fileURLToPath(new URL('../fixtures/', import.meta.url));
  if (!existsSync(dir + 'big.zip')) makeBigZip(dir);
}
