---
name: "amazon-devices-vega-app-manifest"
description: |
  Required manifest.toml configuration for Vega apps including package identifiers, capabilities, and privileges.
  Use when a developer needs to create or modify the manifest.toml for a Vega application.
  Use when declaring system capabilities, privileges, or service dependencies for a Vega app.
  Use when a build or deployment fails because of a manifest configuration error.
  
version: "1.1.0"
tags: ["vega", "manifest", "configuration", "toml"]
---

# App Manifest

## Prerequisites

This skill requires the `amazon-devices-buildertools-mcp` MCP server. Install the MCP server in your AI agent's MCP configuration. Example:

    {
      "amazon-devices-buildertools-mcp": {
        "command": "npx",
        "args": ["-y", "@amazon-devices/amazon-devices-buildertools-mcp@latest"]
      }
    }

## Overview

Every Vega app requires a `manifest.toml` that declares the app's identity, system capabilities, and service dependencies. Deviations from the required structure cause deployment failures.

## Core Concepts

- Package ID must start with reverse domain (e.g., `com.yourcompany.yourapp`), lowercase letters/numbers/dots only, max 128 characters, globally unique in Amazon Appstore
- App icon must be PNG format, 512x512 pixels, placed in `assets/image/` directory, referenced with `@image/` prefix
- `[needs]` section declares required capabilities — app won't launch without them
- `[wants]` section declares optional capabilities — app launches but features may be unavailable
- `[offers]` section declares services the app provides to the system
- `[os.version]` table is required as of Vega SDK 0.24 — the app fails to build without it. Declare `min` and `target` (both `"1.2"` on SDK 0.24, the only minted OS version). The `/com.amazon.vega.os@IVega_*` module entries are generated from this table by the tooling, not authored by hand.

## Common Mistakes

| Problem | Fix |
|---|---|
| App fails to deploy | Verify manifest.toml structure exactly matches the required schema — any deviation causes failure |
| Build/packaging fails: `OS-prefixed module entries are declared but the manifest does not declare an [os.version] table` (or `Missing [os.version].target` / `Missing [os.version].min`) | Required as of Vega SDK 0.24: add the `[os.version]` table. Run `vega project update-manifest --os-min 1.2 --os-version 1.2` (pass both flags together). See `vega_app_manifest.md` → OS Version |
| Missing media playback | Add required media services under `[wants]`: `com.amazon.media.server`, audio services, etc. |
| DRM not working | Add both `com.amazon.drm.key` and `com.amazon.drm.crypto` under `[wants]` |
| Package ID rejected | Ensure reverse domain format, lowercase only, no special characters, max 128 chars |

Use `amazon-devices-buildertools-mcp:search_documentation` to find troubleshooting guides and learn more about any topic.

## Workflow

1. Use `amazon-devices-buildertools-mcp:read_document` to read `vega_app_manifest.md` for the complete manifest configuration guide
2. Use `amazon-devices-buildertools-mcp:list_documents` to discover related docs (media player services, content personalization privileges)
3. Use `amazon-devices-buildertools-mcp:search_documentation` to find specific manifest configuration topics

## Dependencies

Tools used from `amazon-devices-buildertools-mcp`:
- `amazon-devices-buildertools-mcp:read_document`
- `amazon-devices-buildertools-mcp:list_documents`
- `amazon-devices-buildertools-mcp:search_documentation`
