import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('documentation stays in sync with the repository', () => {
  it('lists only existing paths in the AGENTS.md repository map', () => {
    const map = /<!-- repo-map:start -->([\s\S]*)<!-- repo-map:end -->/.exec(
      read('AGENTS.md'),
    )?.[1];
    expect(map, 'repo-map markers not found').toBeDefined();

    const paths = [...(map ?? '').matchAll(/^\|\s*`([^`]+)`/gm)].map((match) => match[1] ?? '');
    expect(paths.length).toBeGreaterThan(0);

    const missing = paths.filter((path) => !existsSync(join(root, path)));
    expect(missing).toEqual([]);
  });

  it('lists every decision record in the decisions index', () => {
    const index = read('docs/decisions/README.md');
    const records = readdirSync(join(root, 'docs/decisions')).filter((f) =>
      /^\d{4}-.*\.md$/.test(f),
    );
    expect(records.length).toBeGreaterThan(0);

    const unlisted = records.filter((record) => !index.includes(`(${record})`));
    expect(unlisted).toEqual([]);
  });
});
