/**
 * ImageGen Pi extension — tool + command for Gemini Nano Banana image generation.
 *
 * Tool: generate_image — called by the LLM agent to create images.
 * Command: /generate-image — user-invokable shortcut.
 *
 * The extension owns generation directly and persists results to plugin state.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from 'typebox';

import type { ImageGenState, Generation, GenerateParams, AspectRatio } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { normalizeState } from '../shared/state';
import { generateImages } from './image-generator';

// ── Paths ──

const STATE_REL = path.join('.sero', 'apps', 'imagegen', 'state.json');
const IMAGES_REL = path.join('.sero', 'apps', 'imagegen', 'images');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL);
}

// ── State I/O ──

async function readState(filePath: string): Promise<ImageGenState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: ImageGenState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

// ── Tool parameters ──

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
    const imagesDir = path.join(ctx.cwd, IMAGES_REL);

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

  // Slash shortcut lives in prompts/generate-image.md so it does not shadow the
  // bridged generate_image tool/CLI entry.
}
