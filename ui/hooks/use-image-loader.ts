/**
 * Lazy image loader — reads plugin-owned images through the generic app-tool bridge.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppTools, type AppToolResult } from '@sero-ai/app-runtime';

import type { GeneratedImage } from '../../shared/types';

const imageCache = new Map<string, string>();

function imageDataUri(result: AppToolResult): string {
  const image = result.content.find((block) => block.type === 'image');
  if (!image || image.type !== 'image') {
    throw new Error(result.text || 'Image data unavailable');
  }
  return `data:${image.mimeType};base64,${image.data}`;
}

/** Load a single generated image, returning a data URI. */
export function useImageLoader(image: GeneratedImage | undefined): {
  dataUri: string | null;
  loading: boolean;
} {
  const { run } = useAppTools();
  const imageId = image?.id;
  const [dataUri, setDataUri] = useState<string | null>(
    imageId ? imageCache.get(imageId) ?? null : null,
  );
  const [loading, setLoading] = useState(!dataUri && !!imageId);

  useEffect(() => {
    if (!imageId) {
      setDataUri(null);
      setLoading(false);
      return;
    }

    const cached = imageCache.get(imageId);
    if (cached) {
      setDataUri(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setDataUri(null);
    setLoading(true);

    run('imagegen_gallery', { action: 'read', image_id: imageId }).then((result) => {
      if (result.isError) throw new Error(result.text);
      const uri = imageDataUri(result);
      if (cancelled) return;
      imageCache.set(imageId, uri);
      setDataUri(uri);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [imageId, run]);

  return { dataUri, loading };
}

/** Batch-load multiple images. Returns a map of image ID → data URI. */
export function useImageBatchLoader(sourceImages: GeneratedImage[]): {
  images: Map<string, string>;
  loading: boolean;
} {
  const { run } = useAppTools();
  const [images, setImages] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const image of sourceImages) {
      const cached = imageCache.get(image.id);
      if (cached) initial.set(image.id, cached);
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const keyRef = useRef('');

  const load = useCallback(async (requestedImages: GeneratedImage[]) => {
    if (requestedImages.length === 0) return;

    const missing = requestedImages.filter((image) => !imageCache.has(image.id));
    if (missing.length === 0) {
      const result = new Map<string, string>();
      for (const image of requestedImages) {
        const cached = imageCache.get(image.id);
        if (cached) result.set(image.id, cached);
      }
      setImages(result);
      return;
    }

    setLoading(true);

    const results = await Promise.allSettled(
      missing.map(async (image) => {
        const result = await run('imagegen_gallery', { action: 'read', image_id: image.id });
        if (result.isError) throw new Error(result.text);
        const uri = imageDataUri(result);
        imageCache.set(image.id, uri);
        return [image.id, uri] as const;
      }),
    );

    const newMap = new Map<string, string>();
    for (const image of requestedImages) {
      const cached = imageCache.get(image.id);
      if (cached) newMap.set(image.id, cached);
    }
    for (const r of results) {
      if (r.status === 'fulfilled') {
        newMap.set(r.value[0], r.value[1]);
      }
    }

    setImages(newMap);
    setLoading(false);
  }, [run]);

  useEffect(() => {
    const key = sourceImages.map((image) => image.id).join('|');
    if (key === keyRef.current) return;
    keyRef.current = key;
    void load(sourceImages);
  }, [sourceImages, load]);

  return { images, loading };
}
