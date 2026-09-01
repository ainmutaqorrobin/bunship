/**
 * Cut a create-bunship release: verify, bump, tag, publish, push.
 *
 * From the repo root:
 *   bun run release                  # patch  0.1.1 -> 0.1.2
 *   bun run release:minor            #        0.1.1 -> 0.2.0
 *   bun run release:major            #        0.1.1 -> 1.0.0
 *   bun run release 1.0.0-rc.1       # explicit version (publishes under a dist-tag)
 *   bun run release:dry              # guards + full gate, nothing mutated
 *
 * Nothing is written until every check has passed, so a failed gate leaves the tree
 * exactly as it was. If publishing fails after the commit and tag exist, the script
 * prints the two commands that undo them — both are still local at that point.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PKG_DIR = dirname(import.meta.dir);
const ROOT = dirname(dirname(PKG_DIR));
const PKG_JSON = join(PKG_DIR, 'package.json');
const RELEASE_BRANCH = 'main';

type Bump = 'patch' | 'minor' | 'major';

class ReleaseError extends Error {}

/** Run a command, streaming its output. Throws on a non-zero exit. */
function run(cmd: string, args: string[], cwd = ROOT): void {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.error) throw new ReleaseError(`${cmd} could not be started: ${res.error.message}`);
  if (res.status !== 0)
    throw new ReleaseError(`${[cmd, ...args].join(' ')} exited with ${String(res.status)}`);
}

/** Run a command and capture stdout. Throws on a non-zero exit. */
function capture(cmd: string, args: string[], cwd = ROOT): string {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (res.error) throw new ReleaseError(`${cmd} could not be started: ${res.error.message}`);
  if (res.status !== 0) {
    throw new ReleaseError(
      `${[cmd, ...args].join(' ')} exited with ${String(res.status)}\n${res.stderr}`,
    );
  }
  return res.stdout.trim();
}

function step(message: string): void {
  console.log(`\n› ${message}`);
}

// Semver, without taking a semver dependency (this package ships zero deps).
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

function nextVersion(current: string, bump: Bump): string {
  const m = SEMVER.exec(current);
  if (!m) throw new ReleaseError(`Current version is not semver: ${current}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (bump === 'major') return `${String(major + 1)}.0.0`;
  if (bump === 'minor') return `${String(major)}.${String(minor + 1)}.0`;
  // A prerelease patch-releases to its own base version (0.2.0-rc.1 -> 0.2.0).
  if (current.includes('-')) return `${String(major)}.${String(minor)}.${String(patch)}`;
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
}

function parseArgs(argv: string[]): { target: Bump | string; dryRun: boolean } {
  let target: Bump | string = 'patch';
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === 'patch' || arg === 'minor' || arg === 'major' || SEMVER.test(arg)) {
      target = arg;
    } else {
      throw new ReleaseError(
        `Unknown argument: ${arg} (expected patch|minor|major|<version>|--dry-run)`,
      );
    }
  }
  return { target, dryRun };
}

function assertReleasable(): void {
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== RELEASE_BRANCH) {
    throw new ReleaseError(`Releases are cut from ${RELEASE_BRANCH}, but HEAD is on ${branch}.`);
  }
  if (capture('git', ['status', '--porcelain']) !== '') {
    throw new ReleaseError('Working tree is dirty — commit or stash first.');
  }
  run('git', ['fetch', 'origin', RELEASE_BRANCH, '--tags']);
  const behind = capture('git', ['rev-list', '--count', `HEAD..origin/${RELEASE_BRANCH}`]);
  if (behind !== '0') {
    throw new ReleaseError(
      `Local ${RELEASE_BRANCH} is ${behind} commit(s) behind origin — pull first.`,
    );
  }
}

function main(): void {
  const { target, dryRun } = parseArgs(process.argv.slice(2));

  const manifest = readFileSync(PKG_JSON, 'utf8');
  const current = (JSON.parse(manifest) as { version: string }).version;
  const version =
    target === 'patch' || target === 'minor' || target === 'major'
      ? nextVersion(current, target)
      : target;
  const tag = `v${version}`;
  // Prereleases must never take the `latest` dist-tag away from a stable release.
  const distTag = version.includes('-') ? 'next' : 'latest';

  console.log(
    `create-bunship ${current} → ${version}  (tag ${tag}, dist-tag ${distTag})${dryRun ? '  [dry run]' : ''}`,
  );

  step('Checking the release preconditions');
  assertReleasable();
  const tags = capture('git', ['tag', '--list', tag]);
  if (tags !== '') throw new ReleaseError(`Tag ${tag} already exists.`);

  step('Running the full gate (check + test + build)');
  run('bun', ['run', 'check']);
  run('bun', ['test']);
  run('bun', ['run', 'build'], PKG_DIR);

  if (dryRun) {
    step('Dry run — packing without publishing');
    run('bun', ['publish', '--dry-run', '--access', 'public', '--tag', distTag], PKG_DIR);
    console.log(`\nDry run OK. Re-run without --dry-run to release ${tag}.`);
    return;
  }

  // Targeted replace rather than a JSON round-trip: keeps key order and formatting.
  step(`Bumping package.json to ${version}`);
  const bumped = manifest.replace(`"version": "${current}"`, `"version": "${version}"`);
  if (bumped === manifest)
    throw new ReleaseError(`Could not find "version": "${current}" in ${PKG_JSON}`);
  writeFileSync(PKG_JSON, bumped);

  step(`Committing and tagging ${tag}`);
  run('git', ['add', PKG_JSON]);
  run('git', ['commit', '-m', `chore(release): create-bunship ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', `create-bunship ${tag}`]);

  step(`Publishing to npm (${distTag})`);
  try {
    run('bun', ['publish', '--access', 'public', '--tag', distTag], PKG_DIR);
  } catch (err) {
    console.error(
      `\nPublish failed. The commit and tag are still local — undo them with:\n  git tag -d ${tag}\n  git reset --hard HEAD~1\n`,
    );
    throw err;
  }

  step('Pushing the release commit and tag');
  run('git', ['push', 'origin', RELEASE_BRANCH, '--follow-tags']);

  console.log(`\nReleased: create-bunship ${tag} published and pushed.`);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
