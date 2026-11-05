import { describe, expect, it } from 'vitest';
import { collapseDiff, lineDiff } from '../../src/shared/lineDiff';

const types = (before: string, after: string) =>
  lineDiff(before, after).map((l) => `${l.type[0]}:${l.text}`);

describe('lineDiff', () => {
  it('shows additions and removals in place', () => {
    expect(types('a\nb\nc\n', 'a\nx\nc\n')).toEqual(['s:a', 'r:b', 'a:x', 's:c']);
  });

  it('treats everything as added for a new file', () => {
    expect(types('', 'a\nb\n')).toEqual(['a:a', 'a:b']);
  });

  it('treats everything as removed for an empty result', () => {
    expect(types('a\nb\n', '')).toEqual(['r:a', 'r:b']);
  });

  it('finds no changes in identical text, including with different line endings', () => {
    expect(lineDiff('a\nb\n', 'a\nb\n').every((l) => l.type === 'same')).toBe(true);
    expect(lineDiff('a\r\nb\r\n', 'a\nb\n').every((l) => l.type === 'same')).toBe(true);
  });

  it('can rebuild both texts', () => {
    const before = 'one\ntwo\nthree\nfour\nfive\n';
    const after = 'zero\ntwo\nfour\nsix\nfive\nseven\n';
    const diff = lineDiff(before, after);
    const join = (skip: string) =>
      diff
        .filter((l) => l.type !== skip)
        .map((l) => `${l.text}\n`)
        .join('');
    expect(join('add')).toBe(before);
    expect(join('remove')).toBe(after);
  });

  it('handles repeated lines', () => {
    const diff = lineDiff('}\n}\n}\n', '}\nx\n}\n}\n');
    expect(diff.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['x']);
    expect(diff.filter((l) => l.type === 'remove')).toEqual([]);
  });
});

describe('collapseDiff', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n';

  it('keeps context around changes, and reports what it hid', () => {
    const rows = collapseDiff(lineDiff(lines, lines.replace('line 10', 'changed')), 2);
    expect(rows[0]).toEqual({ type: 'gap', hidden: 8 });
    expect(rows.at(-1)).toEqual({ type: 'gap', hidden: 7 });
    expect(rows.filter((r) => r.type === 'same')).toHaveLength(4);
  });

  it('hides everything when nothing changed', () => {
    expect(collapseDiff(lineDiff(lines, lines))).toEqual([{ type: 'gap', hidden: 20 }]);
  });

  it('has no gaps when changes are close together', () => {
    const rows = collapseDiff(lineDiff('a\nb\nc\n', 'x\nb\ny\n'));
    expect(rows.some((r) => r.type === 'gap')).toBe(false);
  });
});
