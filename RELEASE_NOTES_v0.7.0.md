# Breadcrumbs v0.7.0

Awesome Progress Tracker is now **Breadcrumbs**, with the primary command `breadcrumbs` and repository `AndriiLavrekha/breadcrumbs`.

## Changes

- Updated CLI help, agent guidance, hook messages, plugin display names and current documentation to Breadcrumbs.
- Kept `awesome-progress-tracker` and `project-progress` as executable aliases.
- Preserved project files, opt-out state, indexes, environment variables, plugin/marketplace/skill IDs and MCP configuration keys. No data migration is required.
- Fixed Codex reinstall appending duplicate managed MCP blocks; existing managed blocks are now updated in place.
- Fixed the CLI entry-point check so npm's executable symlinks launch all three commands on POSIX systems.
- Aligned the MCP handshake version with package metadata for source and compiled installs.

## Upgrade

The package is now `@andriilavrekha/breadcrumbs`. The unscoped npm package `breadcrumbs` belongs to an unrelated project. Use:

```bash
npx --package=@andriilavrekha/breadcrumbs breadcrumbs init .
```

The new package retains the old command aliases. If an existing global `awesome-progress-tracker` package owns them, remove only that npm package before installing Breadcrumbs to avoid npm's `EEXIST` command collision. Do not use `--force`. npm package removal preserves provider configuration, `project-progress/` files and the existing global state directory.

Plugin installation IDs remain `project-progress@awesome-progress-tracker`. Existing configuration and project data stay in place; the local checkout and vault do not need to move.

## Rollback

Reinstall the previous package or GitHub tag `v0.6.0`. When switching package identities, uninstall only the current npm package first to release its executable names. Keep project data and provider configuration. Historical tags and releases will remain available.

## Verification

All 403 tests pass under WSL. A clean Windows install of the locked dependencies passes 402 tests with the POSIX-only symlink test skipped. Typecheck, build, packed executable aliases/MCP, shared state and isolated global upgrade checks pass. Release-route checks are recorded in RELEASE_CHECKLIST.md.
