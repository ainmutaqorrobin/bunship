export interface ScaffoldErrorMeta {
  step?: string;
  stackId?: string;
  hint?: string;
  tail?: string[];
}

/** Pipeline failure (exit 1). */
export class ScaffoldError extends Error {
  readonly meta: ScaffoldErrorMeta;

  constructor(message: string, meta: ScaffoldErrorMeta = {}) {
    super(message);
    this.name = 'ScaffoldError';
    this.meta = meta;
  }
}

/** Invalid flags/arguments (exit 2). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function toScaffoldError(err: unknown, step: string, stackId?: string): ScaffoldError {
  if (err instanceof ScaffoldError) {
    err.meta.step ??= step;
    err.meta.stackId ??= stackId;
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const tail =
    err !== null && typeof err === 'object' && 'tail' in err && Array.isArray(err.tail)
      ? (err.tail as string[])
      : undefined;
  return new ScaffoldError(message, { step, stackId, tail });
}
