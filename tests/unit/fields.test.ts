import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  getFieldImage,
  listFields,
  PROJECT_FIELDS_DIR,
  readPickedImage,
  saveCustomField,
  toFieldId,
  type PickedImage,
} from '../../src/main/fields';
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
      imageRotated: false,
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

describe('importing a field', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const image: PickedImage = { fileName: 'a.png', bytes: PNG, type: 'png' };
  const spec = {
    name: 'My Field',
    lengthMeters: 16,
    widthMeters: 8,
    symmetry: 'mirrored' as const,
    imageRotated: true,
    topLeftPixel: [10, 20] as [number, number],
    bottomRightPixel: [110, 70] as [number, number],
  };

  it('recognizes images by their contents, whatever the file is called', async () => {
    const dir = createFolder({});
    writeFileSync(join(dir, 'looks-like-text.txt'), PNG);
    writeFileSync(join(dir, 'photo.png'), JPEG);
    writeFileSync(join(dir, 'fake.png'), 'not an image');
    expect((await readPickedImage(join(dir, 'looks-like-text.txt'))).image?.type).toBe('png');
    expect((await readPickedImage(join(dir, 'photo.png'))).image?.type).toBe('jpeg');
    const fake = await readPickedImage(join(dir, 'fake.png'));
    expect(fake.image).toBeNull();
    expect(fake.result.status).toBe('invalid');
  });

  it('reports a missing file', async () => {
    expect((await readPickedImage('/does/not/exist.png')).result.status).toBe('invalid');
  });

  it('makes safe ids from names', () => {
    expect(toFieldId('My Field 2026!')).toBe('my-field-2026');
    expect(toFieldId('Campo de Ação')).toBe('campo-de-acao');
    expect(toFieldId('../../evil')).toBe('evil');
    expect(toFieldId('区域')).toBe('field');
  });

  it('saves into the project, in a form that loads back', async () => {
    const root = createFolder({});
    const result = await saveCustomField(root, image, spec);
    expect(result).toMatchObject({ ok: true, field: { id: 'my-field', symmetry: 'mirrored' } });
    const dir = join(root, PROJECT_FIELDS_DIR);
    expect(readFileSync(join(dir, 'my-field.png'))).toEqual(PNG);
    expect((await listFields([dir]))[0]).toMatchObject({
      imageRotated: true,
      id: 'my-field',
      game: 'My Field',
      lengthMeters: 16,
    });
    await expect(getFieldImage([dir], 'my-field')).resolves.toContain('data:image/png');
  });

  it('never replaces an existing field', async () => {
    const root = createFolder({});
    await saveCustomField(root, image, spec);
    const second = await saveCustomField(root, { ...image, type: 'jpeg', bytes: JPEG }, spec);
    expect(second).toMatchObject({
      ok: true,
      field: { id: 'my-field-2', imageFile: 'my-field-2.jpg' },
    });
    expect(readFileSync(join(root, PROJECT_FIELDS_DIR, 'my-field.png'))).toEqual(PNG);
  });

  it.each<[string, Partial<typeof spec>]>([
    ['an empty name', { name: '  ' }],
    ['a zero size', { lengthMeters: 0 }],
    ['corners with no area', { bottomRightPixel: [10, 20] }],
  ])('rejects %s, writing nothing', async (_label, change) => {
    const root = createFolder({});
    expect((await saveCustomField(root, image, { ...spec, ...change })).ok).toBe(false);
    expect(existsSync(join(root, PROJECT_FIELDS_DIR))).toBe(false);
  });

  it('rejects a bad symmetry', async () => {
    const root = createFolder({});
    const bad = { ...spec, symmetry: 'diagonal' } as unknown as typeof spec;
    expect((await saveCustomField(root, image, bad)).ok).toBe(false);
  });
});

describe('links in field folders', () => {
  it('will not read an image through a link', async () => {
    const outside = createFolder({ 'secret.png': 'secret' });
    const dir = createFolder({
      'f.json': JSON.stringify({ ...REEFSCAPE, 'field-image': 'link.png' }),
    });
    symlinkSync(join(outside, 'secret.png'), join(dir, 'link.png'));
    await expect(getFieldImage([dir], 'f')).resolves.toBeNull();
  });
});
