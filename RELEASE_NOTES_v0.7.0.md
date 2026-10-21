# Breadcrumbs v0.7.0

Release candidate; not published.

Awesome Progress Tracker is becoming **Breadcrumbs**, with the primary command `breadcrumbs` and the planned repository `AndriiLavrekha/breadcrumbs`.

## Changes

- Updated CLI help, agent guidance, hook messages, plugin display names and current documentation to Breadcrumbs.
- Kept `awesome-progress-tracker` and `project-progress` as executable aliases.
- Preserved project files, opt-out state, indexes, environment variables, plugin/marketplace/skill IDs and MCP configuration keys. No data migration is required.
- Fixed Codex reinstall appending duplicate managed MCP blocks; existing managed blocks are now updated in place.
- Fixed the CLI entry-point check so npm's executable symlinks launch all three commands on POSIX systems.
- Aligned the MCP handshake version with package metadata for source and compiled installs.

## Upgrade

The package is now `@andriilavrekha/breadcrumbs`; the owner confirmed the npm account `andriilavrekha`. The unscoped npm package `breadcrumbs` belongs to an unrelated project. After publication, use:

```bash
npx --package=@andriilavrekha/breadcrumbs breadcrumbs init .
```

The new package will retain the old command aliases. If an existing global `awesome-progress-tracker` package owns them, remove only that npm package before installing Breadcrumbs to avoid npm's `EEXIST` command collision. Do not use `--force`. npm package removal preserves provider configuration, `project-progress/` files and the existing global state directory.

Plugin installation IDs remain `project-progress@awesome-progress-tracker`. Existing repository URLs and plugin update routes will be checked after the repository rename; the local checkout and vault will not be moved.

## Rollback

Reinstall the previous package or GitHub tag `v0.6.0`. When switching package identities, uninstall only the current npm package first to release its executable names. Keep project data and provider configuration. Historical tags and releases will remain available.

## Release gates

CLI login is verified as `andriilavrekha`. Repository rename, live tagged Hermes/plugin checks, npm publication and the public GitHub release are pending. Local verification passed 403 tests, typecheck, build, packed aliases/MCP and the isolated global upgrade scenario; details are recorded in `RELEASE_CHECKLIST.md`.
