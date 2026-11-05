import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFieldDefinition } from '../../src/shared/fields';

const dir = join(__dirname, '../../resources/fields');
const definitions = readdirSync(dir).filter((file) => file.endsWith('.json'));
const sources = readFileSync(join(dir, 'SOURCES.md'), 'utf8');

function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('bundled fields', () => {
  it('has fields', () => {
    expect(definitions.length).toBeGreaterThan(0);
  });

  it.each(definitions)('%s is valid and fits its image', (file) => {
    const id = file.replace('.json', '');
    const field = parseFieldDefinition(id, JSON.parse(readFileSync(join(dir, file), 'utf8')));
    expect(field).not.toBeNull();
    expect(field!.symmetry).not.toBeNull();

    const image = join(dir, field!.imageFile);
    expect(existsSync(image)).toBe(true);
    const [width, height] = pngSize(image);
    expect(field!.bottomRightPixel[0]).toBeLessThanOrEqual(width);
    expect(field!.bottomRightPixel[1]).toBeLessThanOrEqual(height);

    // Pixels should be about square, which catches swapped or mistyped sizes and corners.
    const xScale = field!.lengthMeters / (field!.bottomRightPixel[0] - field!.topLeftPixel[0]);
    const yScale = field!.widthMeters / (field!.bottomRightPixel[1] - field!.topLeftPixel[1]);
    expect(xScale / yScale).toBeGreaterThan(0.95);
    expect(xScale / yScale).toBeLessThan(1.05);

    // These images show red on the left, and blue has to end up at x = 0. See SOURCES.md.
    expect(field!.imageRotated).toBe(true);

    expect(sources, 'list the field in SOURCES.md').toContain(`\`${id}\``);
    expect(sources, 'list the image in SOURCES.md').toContain(`\`${field!.imageFile}\``);
  });

  it('warns that licenses are unconfirmed until someone resolves that', () => {
    // Remove this test deliberately, when the licenses have actually been confirmed.
    expect(sources).toContain('License status: unconfirmed');
  });
});
