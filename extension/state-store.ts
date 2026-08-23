import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { withStateLock } from '@sero-ai/extension-runtime';

import { normalizeState } from '../shared/state';
import type { ImageGenState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

const STATE_REL = path.join('.sero', 'apps', 'imagegen', 'state.json');
const IMAGES_REL = path.join('.sero', 'apps', 'imagegen', 'images');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL);
}

export function resolveImagesDir(cwd: string): string {
  return path.join(cwd, IMAGES_REL);
}

export async function readState(filePath: string): Promise<ImageGenState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writeState(filePath: string, state: ImageGenState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${crypto.randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * Locked read-modify-write for state.json. The Sero host writes this file for
 * the UI under the same `<stateFile>.lock` mutex, so a tool write cannot
 * interleave with a panel edit and clobber it (sero#428). Keep generation and
 * other slow work outside the updater — the lock is held for milliseconds.
 */
export async function updateState(
  filePath: string,
  updater: (current: ImageGenState) => ImageGenState,
): Promise<ImageGenState> {
  return withStateLock(filePath, async () => {
    const next = updater(await readState(filePath));
    await writeState(filePath, next);
    return next;
  });
}
