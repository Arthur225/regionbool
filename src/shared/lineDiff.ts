/** A small line diff for the export preview. Generated files are short, so simple LCS is enough. */

/** One line of a diff. */
export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

/** A line to display, or a marker for lines hidden between changes. */
export type DiffRow = DiffLine | { type: 'gap'; hidden: number };

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** Compares two texts line by line, ignoring line ending differences. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  // lengths[i][j] is the longest common run of a[i..] and b[j..].
  const rows = endA - start;
  const columns = endB - start;
  const lengths = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[start + i] === b[start + j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = a.slice(0, start).map((text) => ({ type: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < rows || j < columns) {
    if (i < rows && j < columns && a[start + i] === b[start + j]) {
      result.push({ type: 'same', text: a[start + i]! });
      i++;
      j++;
    } else if (i < rows && (j === columns || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      // Removals come first, as in git's output.
      result.push({ type: 'remove', text: a[start + i]! });
      i++;
    } else {
      result.push({ type: 'add', text: b[start + j]! });
      j++;
    }
  }
  for (const text of a.slice(endA)) result.push({ type: 'same', text });
  return result;
}

/** Hides unchanged lines further than `context` lines from a change. */
export function collapseDiff(lines: readonly DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type === 'same') return;
    const last = Math.min(index + context, lines.length - 1);
    for (let i = Math.max(index - context, 0); i <= last; i++) keep[i] = true;
  });

  const rows: DiffRow[] = [];
  let hidden = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden > 0) rows.push({ type: 'gap', hidden });
      hidden = 0;
      rows.push(line);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) rows.push({ type: 'gap', hidden });
  return rows;
}
