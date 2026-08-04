import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveGoogleApiKey } from '../image-generator';

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('Google API key resolution', () => {
  it('uses ModelRegistry credentials when the environment has no key', async () => {
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    runtime.setRuntimeApiKey('google', 'runtime-google-key');

    await expect(resolveGoogleApiKey({
      modelRegistry: new ModelRegistry(runtime),
    })).resolves.toBe('runtime-google-key');
  });

  it('keeps the environment key as the first choice', async () => {
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    runtime.setRuntimeApiKey('google', 'runtime-google-key');
    process.env.GEMINI_API_KEY = 'environment-google-key';

    await expect(resolveGoogleApiKey({
      modelRegistry: new ModelRegistry(runtime),
    })).resolves.toBe('environment-google-key');
  });
});
