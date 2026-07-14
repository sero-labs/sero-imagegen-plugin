/**
 * ImageGen Pi extension — tool + command for Gemini Nano Banana image generation.
 *
 * Tool: generate_image — called by the LLM agent to create images.
 * Command: /generate-image — user-invokable shortcut.
 *
 * The extension owns generation directly and persists results to plugin state.
 */

import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import type { Generation, GenerateParams, AspectRatio } from '../shared/types';
import { deleteGalleryImage, readGalleryImage } from './gallery';
import { generateImages } from './image-generator';
import {
  readState,
  resolveImagesDir,
  resolveStatePath,
  writeState,
} from './state-store';

// ── Tool parameters ──

const AttachmentParams = Type.Object({
  id: Type.String(),
  data_uri: Type.String(),
  mime_type: Type.String(),
  filename: Type.String(),
});

const Params = Type.Object({
  prompt: Type.String({ description: 'Text description of the image to generate' }),
  model: Type.Optional(
    StringEnum(['flash', 'pro'] as const, {
      description: 'Model: "flash" = Nano Banana (fast), "pro" = Nano Banana Pro (high-fidelity). Default: flash',
    }),
  ),
  variations: Type.Optional(
    Type.Number({ description: 'Number of image variations (1-4). Default: 1', minimum: 1, maximum: 4 }),
  ),
  aspect_ratio: Type.Optional(
    StringEnum(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'] as const, {
      description: 'Aspect ratio. Default: 1:1',
    }),
  ),
  negative_prompt: Type.Optional(
    Type.String({ description: 'What to avoid in the image' }),
  ),
  attachments: Type.Optional(
    Type.Array(AttachmentParams, {
      description: 'Reference images for editing or remixing',
      maxItems: 4,
    }),
  ),
});

const GalleryParams = Type.Object({
  action: StringEnum(['read', 'delete'] as const),
  image_id: Type.Optional(Type.String()),
  generation_id: Type.Optional(Type.Number()),
});

type ModelAlias = 'flash' | 'pro';

const MODEL_MAP: Record<ModelAlias, GenerateParams['model']> = {
  flash: 'gemini-2.5-flash-image',
  pro: 'gemini-3-pro-image-preview',
};

// ── Extension entry point ──

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_tree', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  async function generateAndPersist(
    genParams: GenerateParams,
    alias: ModelAlias,
    resolvedPath: string,
    ctx: ExtensionContext,
  ): Promise<{ text: string; imagePaths: string[] }> {
    const imagesDir = resolveImagesDir(ctx.cwd);

    const result = await generateImages(genParams, imagesDir, ctx);
    if (!result.images.length) {
      return { text: `Error: ${result.error ?? 'No images generated'}`, imagePaths: [] };
    }

    const state = await readState(resolvedPath);
    const generation: Generation = {
      id: state.nextId,
      prompt: genParams.prompt,
      negativePrompt: genParams.negativePrompt,
      model: genParams.model,
      aspectRatio: genParams.aspectRatio,
      images: result.images,
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(generation);
    state.nextId++;
    await writeState(resolvedPath, state);

    const imagePaths = result.images.map((image) => {
      const relative = path.relative(ctx.cwd, image.filePath).split(path.sep).join('/');
      return `/workspace/${relative}`;
    });
    const count = result.images.length;
    const modelName = alias === 'pro' ? 'Nano Banana Pro' : 'Nano Banana';
    return {
      text: [
        `Generated ${count} image${count > 1 ? 's' : ''} with ${modelName} (${genParams.aspectRatio}).`,
        `Prompt: "${genParams.prompt}"`,
        'Open the generated files from the image links in this tool result.',
      ].join('\n'),
      imagePaths,
    };
  }

  // ── Tool ──

  pi.registerTool({
    name: 'generate_image',
    label: 'Generate Image',
    description:
      'Generate images using Google Gemini Nano Banana. ' +
      'Supports two models: "flash" (fast, efficient) and "pro" (high-fidelity with thinking). ' +
      'Can generate 1-4 variations. Supports aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9.',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd;
      const resolvedPath = cwd ? resolveStatePath(cwd) : statePath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd' }], details: {} };
      }
      statePath = resolvedPath;

      const alias = (params.model ?? 'flash') as ModelAlias;
      const genParams: GenerateParams = {
        prompt: params.prompt,
        model: MODEL_MAP[alias] ?? 'gemini-2.5-flash-image',
        variations: params.variations ?? 1,
        aspectRatio: (params.aspect_ratio as AspectRatio | undefined) ?? '1:1',
        negativePrompt: params.negative_prompt,
        attachments: params.attachments?.map((attachment) => ({
          id: attachment.id,
          dataUri: attachment.data_uri,
          mimeType: attachment.mime_type,
          filename: attachment.filename,
        })),
      };

      try {
        const generated = await generateAndPersist(genParams, alias, statePath, ctx);
        return {
          content: [{ type: 'text', text: generated.text }],
          details: { imagePaths: generated.imagePaths },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], details: {} };
      }
    },

    renderCall(args, theme) {
      const model = args.model === 'pro' ? 'Pro' : 'Flash';
      let text = theme.fg('toolTitle', theme.bold('generate_image '));
      text += theme.fg('muted', `[${model}] `);
      text += theme.fg('dim', `"${args.prompt}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content[0];
      const text = msg?.type === 'text' ? msg.text : '';
      return new Text(
        text.startsWith('Error:')
          ? theme.fg('error', text)
          : theme.fg('success', '🎨 ') + theme.fg('muted', text),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: 'imagegen_gallery',
    label: 'ImageGen Gallery',
    description: 'Read or delete images managed by the ImageGen gallery.',
    parameters: GalleryParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        if (params.action === 'read') {
          if (!params.image_id) {
            return { content: [{ type: 'text', text: 'Error: image_id is required' }], details: {} };
          }
          const image = await readGalleryImage(ctx.cwd, params.image_id);
          return {
            content: [{ type: 'image', data: image.data, mimeType: image.mimeType }],
            details: { imageId: params.image_id },
          };
        }

        if (params.generation_id === undefined) {
          return { content: [{ type: 'text', text: 'Error: generation_id is required' }], details: {} };
        }
        await deleteGalleryImage(ctx.cwd, params.generation_id, params.image_id);
        return {
          content: [{ type: 'text', text: 'Deleted generated image.' }],
          details: { generationId: params.generation_id, imageId: params.image_id },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], details: {} };
      }
    },
  });

  // Slash shortcut lives in prompts/generate-image.md so it does not shadow the
  // bridged generate_image tool/CLI entry.
}
