# @sero-ai/plugin-imagegen

AI image generation plugin for Sero, powered by Gemini. Generate, view, and manage a gallery of images directly from your workspace.

## Sero Plugin Install

Install in **Sero → Admin → Plugins** with:

```text
git:https://github.com/monobyte/sero-imagegen-plugin.git
```

Sero clones the source repo, installs its dependencies locally, builds the UI,
and then hot-loads the plugin into the sidebar.

## Pi CLI Usage

Install as a Pi package:

```bash
pi install git:https://github.com/monobyte/sero-imagegen-plugin.git
```

The agent gains image generation tools and a gallery view for browsing generated images.

## Sero Usage

When loaded in Sero, the web UI mounts in the main app area. Use the **Generate** form to create images via Gemini, browse generated images in the **Gallery**, and view full-size images in the **ImageViewer**. Reference images can be attached to generation requests for editing and remixing.

## Features

- **Image generation** via Gemini Nano Banana
- **Gallery view** — browse all generated images for the workspace
- **Montage / multi-image** view
- **Reference images** — edit or remix up to four attached images

## State File

```
workspace-root/
└── .sero/
    └── apps/
        └── imagegen/
            ├── images/
            └── state.json
```

```json
{
  "generations": [
    {
      "id": 1,
      "prompt": "A sunset over the ocean",
      "model": "gemini-2.5-flash-image",
      "aspectRatio": "16:9",
      "images": [
        {
          "id": "abc123",
          "filePath": "/workspace/.sero/apps/imagegen/images/abc123.png",
          "mimeType": "image/png"
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "nextId": 2
}
```

## Development

```bash
npm install
npm run build       # Build extension + UI (dist/ui/remoteEntry.js)
npm run typecheck   # TypeScript check (zero errors expected)
npm run dev         # Start Vite dev server on port 5181
```

## Plugin Metadata

| Field    | Value                                    |
|----------|------------------------------------------|
| Name     | `@sero-ai/plugin-imagegen`               |
| Category | `creative`                               |
| Tags     | `image-generation`, `ai-art`, `gemini`   |
| Min Sero | `0.1.0`                                  |
