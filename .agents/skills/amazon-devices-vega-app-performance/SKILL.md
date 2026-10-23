---
name: "amazon-devices-vega-app-performance"
description: |
  Performance optimization, KPI targets, and diagnostics for Vega applications.
  Use when applying performance best practices, improving app performance, diagnose app performance issues
  
version: "1.0.0"
tags: ["vega", "performance", "optimization", "kpi", "diagnostics"]
---

# App Performance

## Prerequisites

This skill requires the `amazon-devices-buildertools-mcp` MCP server. Install the MCP server in your AI agent's MCP configuration. Example:

    {
      "amazon-devices-buildertools-mcp": {
        "command": "npx",
        "args": ["-y", "@amazon-devices/amazon-devices-buildertools-mcp@latest"]
      }
    }

## Overview

Vega apps have specific performance KPI targets enforced by the platform. Performance optimization should be integrated early — not as an afterthought.

## Core Concepts

Performance on Vega apps is measured against several KPIs. See [Measure App KPIs](https://developer.amazon.com/docs/vega/0.22/measure-app-kpis.html) for the full reference. Key KPIs and guidelines:

| KPI | Test Scenario | Guideline |
|---|---|---|
| Time-to-First-Frame | Cool start | < 1.5s |
| Time-to-First-Frame | Warm start | < 0.5s |
| Time-to-Fully-Drawn | Cool start | < 8.0s |
| Time-to-Fully-Drawn | Warm start | < 1.5s |
| Foreground Memory | App in foreground | < 400 MiB |
| Background Memory | App in background | < 150 MiB |
| Video Fluidity | Video playback | > 99% |
| Time-to-First-Video-Frame | Video playback | < 2500 ms |
| UI Fluidity | UI interaction | > 99% |
| App Event Response Time - Focus | UI interaction | < 200 ms |
| Key pressed/released latency | Video playback | < 100 ms |

- Never bundle React/React Native — these are system-provided
- Use `React.memo()` and native animation drivers to minimize re-renders
- Use KPI Visualizer tool to measure KPIs before optimizing

## Common Mistakes

| Problem | Fix |
|---|---|
| Slow cold start | Defer non-critical initialization, use lazy loading for screens |
| High memory usage | Implement image downsampling, clear unused resources, use proper cache eviction |
| Janky UI scrolling | Use native drivers for animations, implement view recycling, minimize JS bridge traffic |
| Bundle too large | Never include React/React Native, use dynamic imports for large features |
| No performance data | Use `vega exec perf kpi-visualizer` to measure KPIs before optimizing |

Use `amazon-devices-buildertools-mcp:search_documentation` to find troubleshooting guides and learn more about any topic.

## Workflow

1. Start with `amazon-devices-buildertools-mcp:read_document` to read `react-native-for-vega-performance-best-practices.md` for optimization patterns
2. To measure KPIs, use `amazon-devices-buildertools-mcp:read_document` to read `vega_cli_commands_exec_perf.md` for the KPI Visualizer tool
3. Based on the results, use `amazon-devices-buildertools-mcp:list_documents` or `amazon-devices-buildertools-mcp:search_documentation` to find relevant diagnosis docs for the specific issue (slow launch, re-renders, memory leaks, fluidity)

## Dependencies

Tools used from `amazon-devices-buildertools-mcp`:
- `amazon-devices-buildertools-mcp:read_document`
- `amazon-devices-buildertools-mcp:list_documents`
- `amazon-devices-buildertools-mcp:search_documentation`
