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
export function selectedAdapters(cfg: ProjectConfig): StackAdapter[] {
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
 * Strictest Node floor demanded by the selected stacks, or null when none declare one.
 * Reported with the stack that demands it so the error can name a culprit.
 */
export function nodeFloor(cfg: ProjectConfig): { min: string; label: string } | null {
  let strictest: { min: string; label: string } | null = null;
  for (const adapter of selectedAdapters(cfg)) {
    const { minNode, label } = adapter;
    if (!minNode) continue;
    if (!strictest || compareVersions(minNode, strictest.min) > 0) {
      strictest = { min: minNode, label };
    }
  }
  return strictest;
}
