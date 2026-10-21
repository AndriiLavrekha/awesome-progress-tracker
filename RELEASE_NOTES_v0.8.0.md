# Breadcrumbs v0.8.0

Install the plugin as **`breadcrumbs@breadcrumbs`**. This release completes the plugin identity rename that v0.7.0 deliberately left unchanged.

## Changes

- Claude Code and Codex plugin IDs and marketplace IDs are now `breadcrumbs`.
- The bundled skill is now `skills/breadcrumbs/SKILL.md`, with skill name `breadcrumbs`.
- Plugin and CLI MCP configuration keys, the MCP handshake identity, and Hermes managed skill/server names are `breadcrumbs`.
- New managed bootstrap/configuration blocks use Breadcrumbs markers. The CLI recognizes and removes its old owned blocks and server keys during reinstall/uninstall, preserves unrelated configuration, and replaces the old managed Codex skill file after installing its replacement.
- Hermes requires explicit old-component removal to avoid running both identities. The new `breadcrumbs uninstall -g hermes` recognizes both old and new managed names.

## Switch an existing plugin installation

Claude Code:

```bash
claude plugin uninstall project-progress@awesome-progress-tracker
claude plugin marketplace remove awesome-progress-tracker
claude plugin marketplace add AndriiLavrekha/breadcrumbs
claude plugin install breadcrumbs@breadcrumbs
```

Codex:

```bash
codex plugin remove project-progress@awesome-progress-tracker
codex plugin marketplace remove awesome-progress-tracker
codex plugin marketplace add AndriiLavrekha/breadcrumbs
codex plugin add breadcrumbs@breadcrumbs
```

Only run the old uninstall/remove steps if that old installation exists. Restart the agent after switching, and avoid enabling both identities together.

## Data and CLI compatibility

Existing `project-progress/` files, schema, MCP tools, saved opt-outs, and index/state paths remain intact. No project-data migration is required. The primary executable is `breadcrumbs`; the old CLI aliases remain available. The npm package name remains `@andriilavrekha/breadcrumbs`; the unscoped `breadcrumbs` npm package is unrelated.

Historical release notes and explicit old-install removal instructions retain their original identifiers. All current install commands use `breadcrumbs@breadcrumbs`.
