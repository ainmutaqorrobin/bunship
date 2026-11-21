import { PRODUCT } from '../branding';
import type { ProjectConfig, StackId } from '../config/schema';
import { ScaffoldError } from '../errors';
import { expo } from './expo';
import { express } from './express';
import { fastify } from './fastify';
import { hono } from './hono';
import { nest } from './nest';
import { next } from './next';
import { nuxt } from './nuxt';
import { reactVite } from './react-vite';
import type { StackAdapter } from './types';

const ADAPTERS: Partial<Record<StackId, StackAdapter>> = {
  next,
  'react-vite': reactVite,
  nuxt,
  expo,
  nest,
  express,
  hono,
  fastify,
};

function getAdapter(id: StackId): StackAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new ScaffoldError(`Stack "${id}" is not implemented yet.`, { stackId: id });
  }
  return adapter;
}

/** Selected adapters in generation order: web → mobile → api. */
export function selectedAdapters(cfg: Pick<ProjectConfig, 'stacks'>): StackAdapter[] {
  const ids = [cfg.stacks.web, cfg.stacks.mobile, cfg.stacks.api].filter(
    (id): id is StackId => id !== null,
  );
  return ids.map(getAdapter);
}

/** Numeric compare of dotted versions; missing segments count as 0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when `current` is at least `min`. */
export function meetsMinVersion(current: string, min: string): boolean {
  return compareVersions(current, min) >= 0;
}

/**
 * The generator's own Node floor, mirrored in package.json `engines` (a unit test keeps
 * the two in sync). The skills CLI declares `>=22.20.0` and runs under the node on PATH,
 * and Node 20 left upstream support in April 2026. Enforced in preflight rather than left
 * to `engines`, because npx only warns on it.
 */
export const CLI_MIN_NODE = '22.20.0';

interface NodeFloor {
  min: string;
  /** Who demands the floor, so the error can name a culprit. */
  label: string;
  /** 'stack' when a selected framework needs more than the CLI's own floor. */
  source: 'cli' | 'stack';
}

/**
 * Strictest Node floor for this run: the CLI's own, raised by any selected stack that
 * demands more. A stack floor below CLI_MIN_NODE never lowers it.
 */
export function nodeFloor(cfg: ProjectConfig): NodeFloor {
  let strictest: NodeFloor = { min: CLI_MIN_NODE, label: PRODUCT, source: 'cli' };
  for (const adapter of selectedAdapters(cfg)) {
    const { minNode, label } = adapter;
    if (minNode && compareVersions(minNode, strictest.min) > 0) {
      strictest = { min: minNode, label, source: 'stack' };
    }
  }
  return strictest;
}

/**
 * Label of a selected stack whose framework CLI needs a real node on PATH, or null.
 * Declaring `minNode` is what marks a stack as node-bound, even when its floor is below
 * the CLI's. Prefers the stack that set the floor, so both errors name the same culprit.
 */
export function nodeBoundStack(cfg: ProjectConfig): string | null {
  const floor = nodeFloor(cfg);
  if (floor.source === 'stack') return floor.label;
  return selectedAdapters(cfg).find((a) => a.minNode !== undefined)?.label ?? null;
}
