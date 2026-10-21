# Breadcrumbs Plugin Identity Release Plan

User request: replace the retained `project-progress@awesome-progress-tracker` install identity so the old plugin can be uninstalled and Breadcrumbs installed under its own name. This supersedes the v0.7.0 decision to keep plugin, marketplace, skill and MCP IDs unchanged. Canonical spelling is `breadcrumbs`, matching the selected project name; the typed `breadcrumbds` is treated as a typo unless the user corrects it.

## Contract

- Release `0.8.0` as `@andriilavrekha/breadcrumbs`.
- Both provider plugin IDs and marketplace IDs are `breadcrumbs`; the selector is `breadcrumbs@breadcrumbs`.
- The bundled skill is `skills/breadcrumbs/SKILL.md`, with `name: breadcrumbs`. Manual Codex installs use the `breadcrumbs` skill directory. Hermes skill/MCP IDs and plugin/CLI MCP keys and handshake name are `breadcrumbs`.
- New bootstrap/MCP markers use `breadcrumbs`; the existing installer recognizes/removes old owned blocks and MCP keys so reinstall cannot register duplicate servers or skills. Preserve unrelated configuration.
- Keep existing `project-progress/` project files, schema, tools, saved opt-outs, state/index locations and environment semantics. Retain the old CLI executable aliases. These compatibility references and historical release records are not new install identities.
- Document old native plugin uninstall and marketplace removal followed by a fresh `breadcrumbs@breadcrumbs` install. Never load both native plugin identities together.
- Do not alter the already pushed v0.7.0 tag. It remains historical; its unpublished draft is superseded by the new release.

## Execution

- [x] Inventory manifest, skill, CLI, MCP, doc and test ownership; add canonical identity expectations and observe them fail.
- [x] Rename current component identities, add bounded legacy cleanup at existing installer helpers, update active install/upgrade instructions and release notes.
- [x] Run focused/full tests, typecheck/build, inspect the packed artifact, and verify old uninstall/new install plus runtime MCP/hooks in disposable Claude/Codex/Hermes profiles.
- [ ] Commit, review, merge, tag/push `v0.8.0`; publish the GitHub release and npm package; verify the public install route. npm requires owner2FA, with a fresh browser approval if needed.
- [ ] Record actual verification/release results in canonical progress and Obsidian. No credentials or auth URLs belong in those files.

## Release checkpoint

User confirmed canonical spelling breadcrumbs. v0.8.0 is merged and publicly released on GitHub atd4d0613. Native old-uninstall/new-install and fresh remote breadcrumbs@breadcrumbs installs, runtime MCP/hooks and live Hermes checks pass. Linux405/405; Windows404+1POSIXskip; typecheck/build/packed runtime pass. Independent review has no blockers after legacy status/doctor fixes. npm publication remains gated only on the registry's owner2FA confirmation; no secrets are stored in project files.
