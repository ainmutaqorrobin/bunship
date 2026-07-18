import type { ProjectConfig, StackId } from '../config/schema';
import { ScaffoldError } from '../errors';
import { express } from './express';
import { nest } from './nest';
import { next } from './next';
import type { StackAdapter } from './types';

const ADAPTERS: Partial<Record<StackId, StackAdapter>> = {
  next,
  nest,
  express,
  // react-vite, nuxt, expo, hono, fastify land in M3.
};

export function getAdapter(id: StackId): StackAdapter {
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
