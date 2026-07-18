import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFileLf } from './fsx';

// Resolves to packages/cli/templates both in dev (src/ sibling) and in the published
// package (dist/ sibling). Never use process.cwd() for template lookup.
export const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url));

export type TemplateVars = Record<string, string>;

function renderVars(content: string, vars: TemplateVars): string {
  return content.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

/** Copy one template file; `.tpl` sources are `{{var}}`-rendered (dest name should omit .tpl). */
export async function copyTemplate(
  rel: string,
  dest: string,
  vars: TemplateVars = {},
): Promise<void> {
  const content = await readFile(join(templatesRoot, rel), 'utf8');
  await writeFileLf(dest, rel.endsWith('.tpl') ? renderVars(content, vars) : content);
}

/** Recursively copy a template directory, rendering and stripping `.tpl` suffixes. */
export async function copyTemplateDir(
  relDir: string,
  destDir: string,
  vars: TemplateVars = {},
): Promise<void> {
  const srcDir = join(templatesRoot, relDir);
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const relChild = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyTemplateDir(relChild, join(destDir, entry.name), vars);
    } else {
      const destName = entry.name.endsWith('.tpl') ? entry.name.slice(0, -4) : entry.name;
      await copyTemplate(relChild, join(destDir, destName), vars);
    }
  }
}
