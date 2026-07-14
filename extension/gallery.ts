import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GeneratedImage } from '../shared/types';
import {
  readState,
  resolveImagesDir,
  resolveStatePath,
  writeState,
} from './state-store';

export interface GalleryImageContent {
  data: string;
  mimeType: string;
}

function resolveManagedImagePath(cwd: string, image: GeneratedImage): string {
  const imagesDir = path.resolve(resolveImagesDir(cwd));
  const filePath = path.resolve(image.filePath);
  if (!filePath.startsWith(`${imagesDir}${path.sep}`)) {
    throw new Error('Generated image path is outside the ImageGen gallery');
  }
  return filePath;
}

export async function readGalleryImage(cwd: string, imageId: string): Promise<GalleryImageContent> {
  const state = await readState(resolveStatePath(cwd));
  const image = state.generations
    .flatMap((generation) => generation.images)
    .find((candidate) => candidate.id === imageId);
  if (!image) throw new Error('Image not found');

  const data = await fs.readFile(resolveManagedImagePath(cwd, image));
  return { data: data.toString('base64'), mimeType: image.mimeType };
}

export async function deleteGalleryImage(
  cwd: string,
  generationId: number,
  imageId?: string,
): Promise<void> {
  const statePath = resolveStatePath(cwd);
  const state = await readState(statePath);
  const generationIndex = state.generations.findIndex((generation) => generation.id === generationId);
  if (generationIndex === -1) throw new Error('Image not found');

  const generation = state.generations[generationIndex];
  const images = imageId
    ? generation.images.filter((image) => image.id === imageId)
    : generation.images;
  if (images.length === 0) throw new Error('Image not found');

  await Promise.all(images.map((image) => fs.rm(resolveManagedImagePath(cwd, image), { force: true })));

  if (imageId) {
    generation.images = generation.images.filter((image) => image.id !== imageId);
    if (generation.images.length === 0) state.generations.splice(generationIndex, 1);
  } else {
    state.generations.splice(generationIndex, 1);
  }

  await writeState(statePath, state);
}
