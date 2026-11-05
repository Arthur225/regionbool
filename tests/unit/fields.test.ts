import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getFieldImage, listFields } from '../../src/main/fields';
import { isFieldId, parseFieldDefinition } from '../../src/shared/fields';
import { createFolder, removeCreatedFolders } from './fixtures/robotProject';

afterAll(removeCreatedFolders);

/** The same shape as Elastic's 2025-reefscape.json. */
const REEFSCAPE = {
  game: 'Reefscape',
  'source-url': 'https://example.com/image',
  'field-image': 'assets/fields/2025-field.png',
  'field-corners': { 'top-left': [421, 91], 'bottom-right': [3352, 1437] },
  'field-size': [17.548, 8.052],
};

describe('parseFieldDefinition', () => {
  it('reads the Elastic format', () => {
    expect(parseFieldDefinition('2025-reefscape', REEFSCAPE)).toEqual({
      id: '2025-reefscape',
      game: 'Reefscape',
      lengthMeters: 17.548,
      widthMeters: 8.052,
      symmetry: null,
      imageFile: '2025-field.png',
      topLeftPixel: [421, 91],
      bottomRightPixel: [3352, 1437],
    });
  });

  it('reads an optional symmetry', () => {
    const definition = parseFieldDefinition('a', { ...REEFSCAPE, symmetry: 'mirrored' });
    expect(definition?.symmetry).toBe('mirrored');
  });

  it('reduces the image path to a file name', () => {
    const windows = { ...REEFSCAPE, 'field-image': '..\\..\\secret\\photo.jpg' };
    expect(parseFieldDefinition('a', windows)?.imageFile).toBe('photo.jpg');
    const unix = { ...REEFSCAPE, 'field-image': '../../../../etc/photo.png' };
    expect(parseFieldDefinition('a', unix)?.imageFile).toBe('photo.png');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a zero size', { ...REEFSCAPE, 'field-size': [0, 8] }],
    ['a text size', { ...REEFSCAPE, 'field-size': ['17', 8] }],
    ['no corners', { ...REEFSCAPE, 'field-corners': undefined }],
    [
      'reversed corners',
      { ...REEFSCAPE, 'field-corners': { 'top-left': [100, 100], 'bottom-right': [10, 10] } },
    ],
    ['an image that is not an image', { ...REEFSCAPE, 'field-image': 'passwords.txt' }],
    ['an unknown symmetry', { ...REEFSCAPE, symmetry: 'diagonal' }],
  ])('rejects %s', (_label, json) => {
    expect(parseFieldDefinition('a', json)).toBeNull();
  });

  it('rejects ids that could be paths', () => {
    expect(isFieldId('2025-reefscape')).toBe(true);
    expect(isFieldId('../secret')).toBe(false);
    expect(isFieldId('a/b')).toBe(false);
    expect(isFieldId('')).toBe(false);
    expect(parseFieldDefinition('../secret', REEFSCAPE)).toBeNull();
  });
});

describe('field folders', () => {
  const definition = (image: string, game = 'Game') =>
    JSON.stringify({ ...REEFSCAPE, game, 'field-image': image });

  it('lists valid definitions, newest first, skipping bad and non-JSON files', async () => {
    const dir = createFolder({
      '2024-a.json': definition('a.png'),
      '2025-b.json': definition('b.png'),
      'broken.json': '{oops',
      'invalid.json': '{}',
      'notes.txt': 'x',
    });
    const fields = await listFields([dir]);
    expect(fields.map((field) => field.id)).toEqual(['2025-b', '2024-a']);
  });

  it('handles a missing folder', async () => {
    await expect(listFields(['/does/not/exist'])).resolves.toEqual([]);
  });

  it('lets a later folder override an id', async () => {
    const bundled = createFolder({ 'f.json': definition('a.png', 'Bundled') });
    const project = createFolder({ 'f.json': definition('b.png', 'Project') });
    const fields = await listFields([bundled, project]);
    expect(fields.map((field) => field.game)).toEqual(['Project']);
  });

  it('returns an image as a data URL', async () => {
    const dir = createFolder({ 'f.json': definition('field.png') });
    writeFileSync(join(dir, 'field.png'), Buffer.from([1, 2, 3]));
    await expect(getFieldImage([dir], 'f')).resolves.toBe('data:image/png;base64,AQID');
  });

  it('only reads images from the definition folder', async () => {
    const outside = createFolder({ 'secret.png': 'secret' });
    const dir = createFolder({ 'f.json': definition(join(outside, 'secret.png')) });
    await expect(getFieldImage([dir], 'f')).resolves.toBeNull();
  });

  it('returns null for unknown ids, path-like ids and missing images', async () => {
    const dir = createFolder({ 'f.json': definition('missing.png') });
    await expect(getFieldImage([dir], 'nope')).resolves.toBeNull();
    await expect(getFieldImage([dir], '../f')).resolves.toBeNull();
    await expect(getFieldImage([dir], 'f')).resolves.toBeNull();
  });
});
