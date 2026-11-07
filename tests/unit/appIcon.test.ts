import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app icon', () => {
  it('is a square PNG large enough for every system', () => {
    const icon = readFileSync(join(__dirname, '../../build/icon.png'));
    expect(icon.subarray(1, 4).toString()).toBe('PNG');
    const [width, height] = [icon.readUInt32BE(16), icon.readUInt32BE(20)];
    expect(width).toBe(height);
    // electron-builder needs at least 512 px, and macOS uses 1024 px.
    expect(width).toBeGreaterThanOrEqual(1024);
  });
});
