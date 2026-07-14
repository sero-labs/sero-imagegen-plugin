/**
 * ImageGenApp — Sero app for Gemini Nano Banana image generation.
 *
 * Top: generation form. Below: bento gallery of generated images.
 * Uses plugin-owned tools for generation and gallery management.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { ScrollArea } from './components/ui/scroll-area';
import type { ImageGenState, GenerateParams } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { normalizeState } from '../shared/state';
import { GenerateForm } from './components/GenerateForm';
import { Gallery } from './components/Gallery';
import { EmptyState } from './components/EmptyState';
import './styles.css';

function toolErrorMessage(text: string, fallback: string): string {
  return text.replace(/^Error:\s*/, '').trim() || fallback;
}

export function ImageGenApp() {
  const [rawState] = useAppState<ImageGenState>(DEFAULT_STATE);
  const state = normalizeState(rawState);
  const { run } = useAppTools();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleGenerate = useCallback(
    async (params: GenerateParams) => {
      setGenerating(true);
      setError(null);

      try {
        const result = await run('generate_image', {
          prompt: params.prompt,
          model: params.model === 'gemini-3-pro-image-preview' ? 'pro' : 'flash',
          variations: params.variations,
          aspect_ratio: params.aspectRatio,
          negative_prompt: params.negativePrompt,
          attachments: params.attachments?.map((attachment) => ({
            id: attachment.id,
            data_uri: attachment.dataUri,
            mime_type: attachment.mimeType,
            filename: attachment.filename,
          })),
        });
        if (result.isError) {
          setError(toolErrorMessage(result.text, 'Generation failed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setGenerating(false);
      }
    },
    [run],
  );

  const handleDelete = useCallback(
    async (generationId: number, singleImageId?: string) => {
      try {
        const result = await run('imagegen_gallery', {
          action: 'delete',
          generation_id: generationId,
          image_id: singleImageId,
        });
        if (result.isError) {
          setError(toolErrorMessage(result.text, 'Delete failed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [run],
  );

  const hasGenerations = state.generations.length > 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-slot="imagegen-root"
      className="flex w-full min-h-0 flex-1 flex-col overflow-hidden bg-background outline-none"
    >
      {/* Header + Form — always visible */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-foreground">ImageGen</h1>
          <span className="text-xs text-muted-foreground">
            Gemini Nano Banana
          </span>
        </div>
        <GenerateForm onGenerate={handleGenerate} generating={generating} />
        {error && (
          <p className="mt-2 text-xs text-destructive animate-fade-in-up">
            {error}
          </p>
        )}
      </div>

      {/* Gallery — scrolls independently */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:hover:opacity-100 [&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity">
        <div className="p-5">
          {hasGenerations ? (
            <Gallery generations={state.generations} onDelete={handleDelete} />
          ) : (
            <EmptyState />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ImageGenApp;
