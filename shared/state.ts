import type { Generation, ImageGenState } from './types';
import { DEFAULT_STATE } from './types';

export function normalizeGeneration(value: unknown): Generation | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<Generation>;
  if (typeof input.id !== 'number') return null;

  return {
    id: input.id,
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    negativePrompt: typeof input.negativePrompt === 'string' ? input.negativePrompt : undefined,
    model: input.model === 'gemini-3-pro-image-preview' ? input.model : 'gemini-2.5-flash-image',
    aspectRatio: input.aspectRatio ?? '1:1',
    images: Array.isArray(input.images) ? input.images.filter((image) => image?.filePath) : [],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date(0).toISOString(),
  };
}

export function normalizeState(value: unknown): ImageGenState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STATE };

  const input = value as Partial<ImageGenState>;
  const generations = Array.isArray(input.generations)
    ? input.generations.map(normalizeGeneration).filter((gen): gen is Generation => Boolean(gen))
    : [];
  const nextId = typeof input.nextId === 'number'
    ? input.nextId
    : Math.max(0, ...generations.map((gen) => gen.id)) + 1;

  return { generations, nextId };
}
