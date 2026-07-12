/**
 * ImageGenWidget — recent generations gallery for the dashboard.
 *
 * The latest generated images in a compact grid with prompt-on-hover, plus a
 * header counting images and generations. The gallery grid is domain
 * presentation; everything around it composes the shared @sero-ai/ui set.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  DataBoundary,
  EmptyState,
  Grid,
  Inline,
  Stack,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { Image as ImageIcon } from 'lucide-react';
import type { AspectRatio, Generation, ImageGenState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { normalizeState } from '../../shared/state';
import { useImageLoader } from '../hooks/use-image-loader';
import '../widget.css';

/** How many recent generations the gallery shows. */
const SHOWN = 6;

/** Aspect-ratio class for a generation card. */
function aspectClass(ratio: AspectRatio): string {
  switch (ratio) {
    case '16:9': return 'aspect-video';
    case '9:16': return 'aspect-[9/16]';
    case '3:2': return 'aspect-[3/2]';
    case '2:3': return 'aspect-[2/3]';
    case '4:3': return 'aspect-[4/3]';
    case '3:4': return 'aspect-[3/4]';
    default: return 'aspect-square';
  }
}

export function ImageGenWidget() {
  const [rawState] = useAppState<ImageGenState>(DEFAULT_STATE);
  const state = normalizeState(rawState);

  const recent = useMemo(
    () =>
      [...state.generations]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, SHOWN),
    [state.generations],
  );
  const totalImages = useMemo(
    () => state.generations.reduce((sum, g) => sum + (g.images?.length ?? 0), 0),
    [state.generations],
  );

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="end">
          <Inline gap="xs" align="end">
            <Text variant="numeric">{totalImages}</Text>
            <Text variant="muted">images</Text>
          </Inline>
          <Text variant="supporting">{state.generations.length} generations</Text>
        </Inline>

        <DataBoundary
          state={state.generations.length === 0 ? 'empty' : 'ready'}
          empty={<EmptyState icon={ImageIcon} title="No images yet" />}
        >
          <Stack gap="none" scroll>
            <Grid columns={3} gap="xs">
              {recent.map((gen) => (
                <GenCard key={gen.id} generation={gen} />
              ))}
            </Grid>
          </Stack>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}

function GenCard({ generation }: { generation: Generation }) {
  const images = generation.images ?? [];
  const first = images[0];
  const { dataUri, loading } = useImageLoader(first?.filePath);

  return (
    <div
      className={`group relative overflow-hidden rounded-md bg-[var(--surface-flat)] ${aspectClass(generation.aspectRatio)}`}
    >
      {dataUri ? (
        <img
          src={dataUri}
          alt={generation.prompt}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className={`absolute inset-0 bg-[var(--surface-line)] ${loading ? 'animate-pulse' : ''}`} />
      )}

      {/* Prompt on hover */}
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="line-clamp-2 text-[9px] leading-tight text-white">{generation.prompt}</span>
      </div>

      {/* Multi-image badge */}
      {images.length > 1 && (
        <div className="absolute right-1 top-1 rounded-full bg-black/50 px-1 py-0.5">
          <span className="text-[8px] font-bold text-white">{images.length}</span>
        </div>
      )}
    </div>
  );
}

export default ImageGenWidget;
