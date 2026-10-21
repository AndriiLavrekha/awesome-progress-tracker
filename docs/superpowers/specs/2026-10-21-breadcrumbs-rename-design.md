# Breadcrumbs Rename Design

Date: 2026-10-21. Status: independently reviewed; local v0.7.0 candidate implemented and verified, not released.

## Intent and agreed scope

Rename Awesome Progress Tracker to **Breadcrumbs**. The user selected the plural spelling and explicitly requested that old commands, configuration, and `project-progress/` data continue working. The actual current repository/package name is `awesome-progress-tracker`, not `awesome-project-progress`.

Change the public brand, primary CLI command, current product documentation, repository identity, and next release identity together. Preserve existing machine identifiers where changing them would invalidate installed configuration or require data migration. This is a rebrand, with no progress schema or workflow change.

## Naming and availability

| Surface | Target |
| --- | --- |
| Product name | Breadcrumbs |
| Search-friendly description | Resumable Markdown memory for coding agents |
| GitHub repository | `AndriiLavrekha/breadcrumbs`, subject to owner-side rename eligibility |
| Primary executable | `breadcrumbs` |
| npm package | `@andriilavrekha/breadcrumbs`; owner confirmed and CLI login verified as `andriilavrekha` |
| Next release | Proposed `v0.7.0`, titled `Breadcrumbs v0.7.0` |
| Old executable aliases | Retain `awesome-progress-tracker` and `project-progress` |

Registry evidence on 2026-10-21: `breadcrumb@1.0.0` and `breadcrumbs@0.0.5` already exist and belong to unrelated projects. Never document `npm install breadcrumbs` or bare `npx breadcrumbs`. A scoped package can expose an unscoped executable. Canonical proposed npm usage is `npx --package=@andriilavrekha/breadcrumbs breadcrumbs init .`. GitHub API returned 404 for the target repository, which does not prove availability or rename permissions.

The scoped package is a release prerequisite, not an already approved or reserved namespace. If the proposed scope is unavailable, settle an owner-controlled scope before editing package identity or generating release artifacts. Until then, the current package name remains the source of truth for local tests. GitHub installation remains a supported route after the repository rename and tagged ref exist.

## Alternatives considered

1. **Brand and CLI rename with stable compatibility identifiers (recommended).** Meets the user's compatibility choice without migrations or duplicate plugin packages.
2. Rename all machine identifiers with dual-reading/migration support. Requires handling plugin ownership, duplicate hooks, managed-block replacement, state precedence and rollback; unnecessary for this release.
3. Replace only display text. Smallest diff, but leaves the primary command, package and repository identity inconsistent with the requested rename.

## Compatibility contract

Retain these exact values and their existing semantics:

- Project data directory `project-progress/`, filenames including `Progress.md` and `Archive.md`, frontmatter keys, schema versions, and MCP tool names/arguments.
- `templates/project-progress/`, `skills/project-progress/`, skill frontmatter `name: project-progress`, legacy installed Codex skill directory, and hook wrapper paths `hooks/project-progress-check.*`.
- Plugin IDs `project-progress`, marketplace IDs `awesome-progress-tracker`, plugin MCP keys `project-progress`, installer-managed MCP keys `awesome-progress-tracker`, and MCP server protocol identity `project-progress`.
- Bootstrap markers `<!-- awesome-progress-tracker:start -->` / `<!-- awesome-progress-tracker:end -->` and Codex MCP markers `# awesome-progress-tracker:mcp:start` / `# awesome-progress-tracker:mcp:end`.
- `PROJECT_PROGRESS_ROOTS`, `AWESOME_PROGRESS_TRACKER_HOME`, `PLUGIN_DATA`, `~/.awesome-progress-tracker` and the existing session cache under the temporary directory. Do not add new environment aliases or state locations.

The index treats `AWESOME_PROGRESS_TRACKER_HOME` as a parent containing `.awesome-progress-tracker`, while project-state treats it as the state directory itself and also honors `PLUGIN_DATA`. Preserve both existing behaviors; the rename must not incidentally change path semantics.

Old and new CLI aliases must execute the same entry point and share data, opt-out state, session suppression and indexes. Reinstall must replace the existing managed block rather than append a second one; status/doctor/uninstall must recognize existing installs. User-maintained configuration and unrelated MCP servers must survive.

Stable plugin IDs mean installation commands such as `project-progress@awesome-progress-tracker` remain intentionally visible. Explain them as compatibility identifiers. Do not create a second installable plugin or duplicate skill just to obtain a new slug.

## Reference policy

Update active branding in CLI help, bootstrap prose, hook guidance, plugin descriptions/display names, generated project-index heading, current documentation, snippets, templates where they mention the product, repository URLs, and asset references. Keep diagnostic prefix `[project-progress]` as a compatibility identifier.

Historical release notes, older specs/plans, ADR records, archived progress and benchmark evidence retain their original identity. Add one clear rename explanation in current docs and the new release notes. Do not rewrite Git history, existing tags, or previous release bodies. Benchmark executable setup references are current integration surfaces and must follow the supported install route; historical benchmark results and fixture data remain historical/data-contract examples.

The old logo is `misc/apt-logo.png`. For this release, remove its README placement and use a text Breadcrumbs heading; a new illustrated logo is outside scope. Inspect other asset references before deleting any file.

## Release and rollout

Keep package, lockfile and all version-bearing plugin manifests synchronized at `0.7.0`. Rebuild committed `dist/` from source. Correct the existing hardcoded MCP handshake version (`0.1.1`) by reading the package version, without changing protocol identity or tools.

Prepare all code, docs, upgrade evidence and artifacts before external mutation. Verify repository rename permissions and npm scope ownership. Rename the existing GitHub repository rather than creating a replacement, preserving issues/stars/tags and testing redirects. Do not automatically rename the local checkout, Obsidian vault, or other projects: absolute paths are recorded in state and external configuration.

Validate tagged Hermes raw-content URLs after the new tag exists; GitHub repository redirects must not be assumed to cover every raw URL. Complete the real tagged Hermes/provider checks before publishing the public GitHub release or npm packages. Publish the scoped package first, then—if the old npm package is owner-controlled—publish the same compatible candidate under that legacy identity from a temporary packaging copy, verify both packages, and only then add a deprecation notice linking users to Breadcrumbs. If the legacy package is not controlled, do not claim it can be redirected or deprecated. Existing npm installations are not automatically updated by a package-name change.

The scoped package exposes all three executable names. A user who has the old package installed globally may therefore hit npm's existing-bin collision protection. The upgrade path must identify and uninstall only the old `awesome-progress-tracker` package, then install the scoped package without `--force`; npm package removal does not remove project-local `project-progress/` data, provider configuration, opt-out state, or `~/.awesome-progress-tracker` index/state files. Do not promise a seamless in-place global upgrade under both package names.

Rollback: keep previous release/tag/package versions available; document reinstalling the old version. No data migration is needed. Do not delete published versions or repurpose the old GitHub repository name, which can affect redirects. A remote rename reversal is an owner-coordinated action, not an automatic error handler.

## Acceptance

- New users see Breadcrumbs and can run `breadcrumbs`; both old executable names still work.
- Existing installs and opt-outs survive install/status/doctor/uninstall; no second plugin, hook registration, or MCP entry is created.
- Existing progress remains readable, writable, compactable and guarded against sensitive commits; no project files are moved by the rename.
- Current installation instructions never resolve to the unrelated npm `breadcrumbs` package.
- The scoped-package upgrade path cannot overwrite an existing global legacy package's bins and explicitly preserves configuration, opt-out state, and project data.
- All remaining old-name occurrences are compatibility identifiers or historical references, reviewed explicitly.
- Focused tests, complete suite, typecheck, build, packed CLI smoke and isolated provider checks have recorded outcomes before release.

## Planning limits

No application changes, external repository rename, npm publish, plugin update, or release is authorized by this planning document alone. Scoped package ownership and external release execution remain release prerequisites. See the accompanying implementation plan for the concrete sequence.

## Execution checkpoint (2026-10-21)

User requested implementation after independent plan review, then confirmed the npm account andriilavrekha; npm whoami verified that login. The local candidate implements the design and passes 403 tests, typecheck, build and packed compatibility checks. No external rename or release has occurred. Historical prerequisite language above records the original rollout contract; namespace selection is now resolved.
