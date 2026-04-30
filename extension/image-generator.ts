import {
  createPartFromBase64,
  createPartFromText,
  GoogleGenAI,
  type Part,
} from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

import type { GenerateParams, GeneratedImage } from '../shared/types';

export interface ImageGenerationResult {
  images: GeneratedImage[];
  error?: string;
}

const GOOGLE_PROVIDER_IDS = ['google', 'google-gemini-cli', 'google-vertex'] as const;

async function resolveGoogleApiKey(ctx: ExtensionContext): Promise<string> {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;

  for (const providerId of GOOGLE_PROVIDER_IDS) {
    const key = await ctx.modelRegistry.getApiKeyForProvider(providerId);
    if (key?.trim()) return key;
  }

  throw new Error('No Google API key found. Set GEMINI_API_KEY or add a Google API key via /login.');
}

function buildPromptText(params: GenerateParams): string {
  if (!params.negativePrompt) return params.prompt;
  return `${params.prompt}\n\nAvoid: ${params.negativePrompt}`;
}

function stripDataUriPrefix(dataUri: string): string {
  const idx = dataUri.indexOf(',');
  return idx >= 0 ? dataUri.slice(idx + 1) : dataUri;
}

function buildContentParts(params: GenerateParams): Part[] {
  const parts: Part[] = [];

  for (const attachment of params.attachments ?? []) {
    parts.push(createPartFromBase64(stripDataUriPrefix(attachment.dataUri), attachment.mimeType));
  }

  parts.push(createPartFromText(buildPromptText(params)));
  return parts;
}

function mimeToExt(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

export async function generateImages(
  params: GenerateParams,
  imagesDir: string,
  ctx: ExtensionContext,
): Promise<ImageGenerationResult> {
  const apiKey = await resolveGoogleApiKey(ctx);
  const client = new GoogleGenAI({ apiKey });

  await fs.mkdir(imagesDir, { recursive: true });

  const count = Math.min(Math.max(params.variations, 1), 4);
  const parts = buildContentParts(params);
  const results: GeneratedImage[] = [];
  const errors: string[] = [];

  const jobs = Array.from({ length: count }, async () => {
    try {
      const response = await client.models.generateContent({
        model: params.model,
        contents: [{ parts }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: params.aspectRatio },
        },
      });

      const responseParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of responseParts) {
        if (!part.inlineData?.data) continue;
        const mimeType = part.inlineData.mimeType ?? 'image/png';
        const id = crypto.randomUUID();
        const filePath = path.join(imagesDir, `${id}.${mimeToExt(mimeType)}`);
        await fs.writeFile(filePath, Buffer.from(part.inlineData.data, 'base64'));
        results.push({ id, filePath, mimeType });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  });

  await Promise.all(jobs);

  return {
    images: results,
    ...(errors.length ? { error: errors.join('; ') } : {}),
  };
}
