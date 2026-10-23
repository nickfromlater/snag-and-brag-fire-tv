# Amazon Devices Builder Tools — spike setup and feedback

Verified 2026-10-12. Source: [Amazon's repository](https://github.com/AmazonAppDev/amazon-devices-buildertools), [npm package](https://www.npmjs.com/package/@amazon-devices/amazon-devices-buildertools-mcp), [getting started](https://developer.amazon.com/docs/adbt/get-started.html). The GitHub repository hosts the Kiro Power; the callable MCP server is distributed through npm.

## Installed locally

```sh
npm install --prefix spike/tooling --cache spike/.cache/npm --no-audit --no-fund \
  @amazon-devices/amazon-devices-buildertools-mcp@1.0.17
```

Version 1.0.17 has an 18,528,378-byte unpacked package; installed tooling with optional dependencies measured 32 MiB. It installed in 8 seconds. No account or credential was needed. npm 11 warned that the optional sqlite3 install script was not approved; MCP documentation search still worked without it. The existing SDK and globally installed Amazon skills were reused. Three relevant Amazon skill packages, version 1.1.0 with their licenses, were copied into this project's [.agents/skills](../../.agents/skills) for local discovery: build/run, manifest, performance. No global config or skills were changed.

## Codex configuration

The project [.codex/config.toml](../../.codex/config.toml) contains:

```toml
[mcp_servers.amazon-devices-buildertools]
command = "npx"
args = ["--yes", "@amazon-devices/amazon-devices-buildertools-mcp@1.0.17"]
startup_timeout_sec = 30
```

[Official OpenAI documentation](https://developers.openai.com/codex/mcp) describes project MCP configuration. A fresh trusted-project Codex session loads this entry. The active session's tool inventory cannot be reloaded by writing the file, so this spike **actually called MCP over stdio** using [mcp_call.py](../../spike/tooling/mcp_call.py), running the locally installed binary. It performs initialize, notifications/initialized, tools/list/tools/call and project-context setup. This is not a search replacement or a claim that a newly added connector appeared in the current tool menu.

For fully local execution without npx/cache resolution, use `command = "node"` and an absolute argument to `spike/tooling/node_modules/@amazon-devices/amazon-devices-buildertools-mcp/dist/startserver` in your checkout. The current Mac's path is `~/Desktop/Projects/snag-wt/spike/spike/tooling/node_modules/@amazon-devices/amazon-devices-buildertools-mcp/dist/startserver`.

## Claude Code configuration

The committed project [.mcp.json](../../.mcp.json) is ready for Claude Code:

```json
{
  "mcpServers": {
    "amazon-devices-buildertools": {
      "command": "npx",
      "args": ["--yes", "@amazon-devices/amazon-devices-buildertools-mcp@1.0.17"]
    }
  }
}
```

Equivalent CLI setup from this checkout:

```sh
claude mcp add --scope project amazon-devices-buildertools -- \
  npx --yes @amazon-devices/amazon-devices-buildertools-mcp@1.0.17
```

Do not execute it over the existing entry just to re-add it. If keeping every downloaded file local, set `npm_config_cache` to the absolute `<checkout>/spike/.cache/npm` in the server's `env` block.

## Project context and actual usage

The tool refuses useful searches until context is supplied. [.adbt-config.json](../../.adbt-config.json) is the source:

```json
{
  "platform": {"default": "vega_os", "paths": {"spike/vega-app": "vega_os"}},
  "project": {"identifier": "snag-brag-spike"}
}
```

Call `set_project_context({config: <the contents above>})` once in every MCP session, then e.g.:

```json
{
  "name": "search_documentation",
  "arguments": {
    "query": "native SVG audio binary WebSocket",
    "target_platform": {"device_os": ["vega_os"]}
  }
}
```

`read_document` takes `document_uri`, **not** `document_name`; `list_documents` requires `target_platform`. Exact schemas are in [builder-tools-schema.json](evidence/builder-tools-schema.json). The bridge sets context automatically for subsequent calls:

```sh
python3 spike/tooling/mcp_call.py '[{"name":"read_document","arguments":{"document_uri":"vega_app_manifest.md"}}]'
# For complex requests or SQL with quotes, write a JSON file:
python3 spike/tooling/mcp_call.py @spike/.cache/requests.json
```

`init-context` is interactive by default and writes agent steering/config files. Version 1.0.17 also documents `--agent`, `--context-document-path`, `--skip-mcp-config`, `--force`. It has no explicit Codex target in its documented list. Its skills installer uses host-level skill locations and may remove stale Amazon skill directories. We used manual project config and local skill copies to honor this brief's worktree boundary. Nothing in another project was touched.

## Product feedback

Worked well: fast account-free setup, discoverable MCP schemas, primary-source search URLs, RN version-specific SVG/Reanimated docs, exact manifest rules, remote input docs, local media URI guidance and successful Perfetto SQL analysis. The app-type detector returned `vegascript`, exit 0; its asset and result were inspected before profiling. The server was used throughout this spike, including for firmware/account/capture research and native trace queries.

Needs work: API pages often spend the entire 100,020-character response on navigation and truncate the useful body; the font dependency example contains an unpublished version range; broad search terms can prioritize old SDK releases; there is no native Codex initializer target or clear project-local skills mode. See reproducible entries in [friction-entries.md](friction-entries.md). Search results are leads, not runtime proof; public forum reports are labeled separately from our reproduced findings. No feedback was submitted or messages sent to Amazon.
