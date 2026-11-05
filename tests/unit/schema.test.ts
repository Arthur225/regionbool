import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { sampleProject } from './fixtures/sampleProject';

const schema: object = JSON.parse(
  readFileSync(join(__dirname, '../../schemas/regions.schema.json'), 'utf8'),
);
const validate = new Ajv({ allErrors: true }).compile(schema);

describe('regions.schema.json', () => {
  it('accepts a project as saved by the app', () => {
    const saved: unknown = JSON.parse(JSON.stringify(sampleProject()));
    expect(validate(saved), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts the optional profile and hash', () => {
    const project = sampleProject();
    project.output.javaProfile = 'modern';
    project.generatedHash = 'abc';
    expect(validate(JSON.parse(JSON.stringify(project)))).toBe(true);
    (project.output as { javaProfile: string }).javaProfile = 'future';
    expect(validate(JSON.parse(JSON.stringify(project)))).toBe(false);
  });

  it.each<[string, (project: ReturnType<typeof sampleProject>) => void]>([
    ['an unknown version', (p) => ((p as { version: number }).version = 2)],
    ['an unknown symmetry', (p) => ((p.field as { symmetry: string }).symmetry = 'diagonal')],
    ['an unknown shape kind', (p) => ((p.regions[0]!.shapes[0] as { kind: string }).kind = 'blob')],
    ['an extra property', (p) => ((p as unknown as { extra: number }).extra = 1)],
    ['a missing field', (p) => delete (p as Partial<typeof p>).output],
    ['a text coordinate', (p) => ((p.regions[0]!.shapes[0] as unknown as { cx: string }).cx = '1')],
  ])('rejects %s', (_label, corrupt) => {
    const project = sampleProject();
    corrupt(project);
    expect(validate(JSON.parse(JSON.stringify(project)))).toBe(false);
  });
});
