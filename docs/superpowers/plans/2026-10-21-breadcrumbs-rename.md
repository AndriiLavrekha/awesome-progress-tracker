# Breadcrumbs Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only if the user requests it.

**Goal:** Rebrand Awesome Progress Tracker as Breadcrumbs while preserving existing commands, installed configuration and project data.

**Architecture:** Extend the current CLI/package and replace active brand text at its owning surfaces. Retain storage paths, installer ownership markers, plugin/marketplace identities and MCP contracts, so the rebrand needs no data migration or second plugin.

**Tech Stack:** Existing TypeScript ESM, Node.js >=18, npm, Vitest, Claude Code/Codex plugins and Hermes Skill + MCP integration. No new dependencies.

## Global Constraints

- Design: `docs/superpowers/specs/2026-10-21-breadcrumbs-rename-design.md`.
- Brand is **Breadcrumbs**, plural; executable is `breadcrumbs`.
- Preserve every value listed in the design's compatibility contract; no bulk replacement of `project-progress`.
- Confirmed package: `@andriilavrekha/breadcrumbs`. Owner confirmation and `npm whoami` identify `andriilavrekha`. Never use the occupied unscoped npm name.
- The package name is a release decision, not a placeholder: until an owner-controlled scope is confirmed, keep the current package metadata and do not add tests that assert the proposed scope.
- Proposed release `0.7.0` follows `0.6.0`; keep version-bearing manifests and lockfile synchronized.
- Do not modify `dist/` manually; rebuild it.
- Preserve the initial dirty checkpoint metadata in `project-progress/Progress.md`.
- Planning documents may contain old names to describe the migration. Historical files remain unchanged.
- No external writes until implementation and verification produce a reviewable release candidate and the user authorizes release execution.

## Ownership and file map

| Area | Files and responsibility |
| --- | --- |
| Package/CLI | `package.json`, `package-lock.json`, `src/cli.ts`: package identity, bins, help, generated bootstrap, install URL/spec and Hermes URL |
| Hook/index prose | `src/hook/cc-adapter.ts`, `src/mcp/index.ts`: user-facing product name, shared-state behavior stays unchanged |
| Shared package metadata / MCP handshake | `src/package.ts`, `src/mcp/server.ts`, `src/cli.ts`: module-relative package root/version, stable protocol name and tools |
| Plugins | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`: display text, URLs and versions; preserve identity keys |
| Stable configuration | `.mcp.json`, `.mcp.codex.json`, `hooks/hooks*.json`, `src/project-state.ts`: compatibility review; change brand prose only if present |
| Agent guidance | `skills/project-progress/SKILL.md`, `commands/init.md`, `agent-instructions/*.md`, `templates/project-progress/*.md`: prose and invocation examples, stable paths and skill ID |
| Current docs | `README.md`, `TESTING.md`, `RELEASE_CHECKLIST.md`, `AGENTS.md`, `docs/demo-use-cases.md`, `docs/glossary.md`, `src/mcp/config.example.yaml`: active branding and supported commands |
| Bench | `bench/harness/setup.ts`, `bench/scenarios/*/README.md`, `bench/RESULTS.md`: inspect current install examples separately from historical results/fixtures |
| Release | New `RELEASE_NOTES_v0.7.0.md`, regenerated `dist/src/**`; no older release rewrite |
| Tests | Existing `tests/mcp/cli.test.ts`, `tests/mcp/index.test.ts`, `tests/mcp/server.test.ts`, `tests/plugin/cc-adapter.test.ts`, `tests/plugin/manifests.test.ts`, `tests/hook/instruction-pack.test.ts`, `tests/bench/setup.test.ts` |

## Task 1: Lock down aliases and existing install contracts

**Consumes:** Existing exported `installAgent`, `readStatus`, `uninstallAgent`, `initProjectAndIndex`, `readProjectTrackingState` and fixture helpers.
**Produces:** Regression coverage for the agreed naming and compatibility contract; no new runtime abstraction.

- [x] Confirm user review of the design; verify npm scope ownership and GitHub rename permissions using authenticated read-only account checks. Record the final package identity in both documents. If ownership is unavailable, finish only scope-independent compatibility work and stop package/release mutation until an owned scope is selected.
- [x] Add these checks to `tests/plugin/manifests.test.ts` using its existing `readJson` helper:

```ts
it("exposes Breadcrumbs and legacy command aliases through one entry point", async () => {
  const pkg = await readJson("package.json");
  expect(pkg.bin.breadcrumbs).toBe("dist/src/cli.js");
  expect(pkg.bin["awesome-progress-tracker"]).toBe(pkg.bin.breadcrumbs);
  expect(pkg.bin["project-progress"]).toBe(pkg.bin.breadcrumbs);
});
```

Add the `pkg.name` assertion only after the ownership gate above, using the recorded owned package name. This keeps the precondition failure actionable instead of baking an unowned namespace into the first implementation task.

- [x] In existing CLI lifecycle tests, seed the current legacy bootstrap block, `.claude.json` MCP key, Codex managed TOML block and installed skill path. Call `installAgent` twice and assert exactly one managed block/entry remains. Assert `readStatus` detects it and `uninstallAgent` removes only managed content, leaving an unrelated sentinel MCP server and user text intact. Extend the existing Hermes mock tests to keep `project-progress` and `awesome-progress-tracker` IDs and rollback expectations unchanged.
- [x] Keep existing opt-out, sensitive-commit, session suppression and fixture-path assertions. Add explicit regression coverage where a renamed public message otherwise causes those assertions to be replaced.
- [x] Run `npx vitest run tests/plugin/manifests.test.ts tests/mcp/cli.test.ts`; expect the new branding/alias assertion to fail until Task 2, with existing compatibility tests green. Record unrelated baseline failures separately.

## Task 2: Implement package and runtime-facing branding

**Files:** Package/CLI, hook/index prose and MCP handshake from the file map; related existing tests.
**Consumes:** Confirmed scope and Task 1 contracts. **Produces:** One CLI implementation with three executable names; unchanged storage and configuration contracts.

- [x] Update the package identity and bins, preserving the existing entry point:

```json
"name": "@andriilavrekha/breadcrumbs",
"bin": {
  "breadcrumbs": "dist/src/cli.js",
  "awesome-progress-tracker": "dist/src/cli.js",
  "project-progress": "dist/src/cli.js"
}
```

- [x] In `src/cli.ts`, update help and bootstrap product prose to Breadcrumbs and primary command examples to `breadcrumbs`. Set `PACKAGE_SPEC` to `github:AndriiLavrekha/breadcrumbs`; update `hermesSkillUrl()` to the renamed repository, keeping the version tag and `skills/project-progress/SKILL.md` suffix. Keep `MCP_SERVER_NAME`, `HERMES_SKILL_NAME`, markers, target paths and environment keys unchanged. Use `PACKAGE_SPEC` in generated bootstrap GitHub invocations instead of leaving old hardcoded URLs. Do not advertise or smoke-test the new GitHub URL until the repository rename and tagged ref exist; pre-release tests should assert generated values only.
- [x] In `src/hook/cc-adapter.ts`, change product mentions and recommended executable only. Keep project directory recognition, sensitive commit checks, cache paths, hook output JSON shape and `[project-progress]` diagnostic prefix unchanged.
- [x] Change `renderProjectsMarkdown` heading to `# Breadcrumbs Projects`. In `src/mcp/server.ts`, read the runtime package version by walking upward from `import.meta.url` until the nearest package.json is found, so both `src/mcp/server.ts` and `dist/src/mcp/server.js` resolve the repository/package root without a layout-specific hardcoded depth. Keep `name: "project-progress"`. Add an initialize-handshake assertion to the existing MCP server test so the advertised version equals the root package metadata, and run it against the built server as part of the packed smoke test.
- [x] Update expected help, product messages, index heading and install URL assertions in existing tests, preserving old identity/path expectations.
- [x] Regenerate lockfile metadata with `npm install --package-lock-only --ignore-scripts`; inspect the diff and reject unrelated dependency/version churn. The current lockfile root still records `0.4.2`, so verify both root `name` and `version` are corrected rather than assuming npm will preserve the package metadata.
- [x] Run `npx vitest run tests/mcp/cli.test.ts tests/mcp/index.test.ts tests/mcp/server.test.ts tests/plugin/cc-adapter.test.ts`. Commit the runtime rename with its tests after they pass.

## Task 3: Rebrand plugin presentation and current guidance

**Consumes:** Task 2 executable and repository names. **Produces:** Consistent current public identity without duplicate plugin/skill installs.

- [x] Change Codex `interface.displayName` and marketplace display text to `Breadcrumbs`; update descriptions, homepage/repository URLs and brand comments across both provider manifests and hooks. Leave plugin/marketplace `name` values and all plugin component paths unchanged. Claude Code may show the stable plugin ID where it has no independent display-name field; explain this in README rather than inventing unsupported manifest properties.
- [x] Keep plugin MCP identity assertions in `tests/plugin/manifests.test.ts`; add exact Breadcrumbs display-name and renamed repository URL assertions. Keep version synchronization checks.
- [x] Update the current docs and agent-guidance files in the map. Retain skill frontmatter `name: project-progress`, use Breadcrumbs in the title/body, and keep existing instruction-pack safety semantics. Current commands should use `breadcrumbs` or the explicit scoped npm invocation. GitHub examples use `npx --package=github:AndriiLavrekha/breadcrumbs breadcrumbs ...`.
- [x] Explain the stable installation ID (`project-progress@awesome-progress-tracker`), environment keys, data directory, old executable aliases and package transition in one README upgrade section. State that existing npm installs require an explicit package update; GitHub redirects do not rename npm packages or plugin IDs.
- [x] Replace the README's old logo placement with a Breadcrumbs text heading. Keep the binary asset unless all current references are gone; do not create a new logo in this task.
- [x] Inspect benchmark setup/tests and update any active install URL/command; preserve benchmark result history, bundle files and `project-progress/` fixture contracts. Do not alter older ADRs/specs/plans/releases.
- [x] Run `npx vitest run tests/plugin/manifests.test.ts tests/hook/instruction-pack.test.ts tests/bench/setup.test.ts`. Review the README commands manually against the manifests and package bins. Commit the documentation/plugin presentation change.

## Task 4: Prepare and verify the Breadcrumbs release candidate

**Consumes:** Renamed runtime/docs, unchanged compatibility contracts. **Produces:** Verified `0.7.0` package and committed compiled output ready for external release.

- [x] Set version `0.7.0` in package metadata/lockfile, both plugin manifests and Claude marketplace metadata. Create `RELEASE_NOTES_v0.7.0.md` describing the rebrand, retained IDs/data/aliases, exact scoped install command and upgrade/rollback instructions. Update the README badge and latest release links, leaving historical release links intact.
- [x] From the execution environment with working native dependencies, run:

```sh
npm test
npm run typecheck
npm run build
npm pack --json
```

On this host, earlier sessions used WSL because `node_modules` contains Linux bindings. Recheck that condition before choosing the environment; do not silently accept a previous WSL-only failure. Every failure must be fixed or shown to exist on the unchanged baseline and recorded before release approval.

- [x] Inspect the tarball file list against the CLI's actual runtime reads: `dist/src/**`, `templates/project-progress/**`, `skills/project-progress/**`, `agent-instructions/**`, `hooks/**`, and current package documentation. The current `files` allowlist omits `.claude-plugin/**` and `commands/**`; include those only if the npm artifact is explicitly intended to be a plugin source. Verify repository-only plugin references separately against the tagged checkout rather than adding unused manifests to the npm artifact.
- [x] Install the actual packed tarball into an isolated temporary prefix. Run all three bin aliases with `help` and compare successful exit codes/output. Initialize a temporary project using `breadcrumbs`, then read state and compact in dry-run mode using the old aliases; verify the same `project-progress/Progress.md` and opt-out state are used. Run `npm exec --package=<absolute-tarball-path> -- breadcrumbs help` as the npm invocation smoke check. Separately simulate an existing global install that owns `awesome-progress-tracker` and `project-progress`: document an explicit package-specific uninstall/reinstall upgrade that preserves home/config/data files, and confirm no `--force` overwrite is required.
- [x] Exercise install twice, status/doctor and uninstall with disposable Claude/Codex home directories and a disposable Hermes profile. For the pre-release candidate, use the existing injected Hermes command runner/mock to verify exact install, status, doctor, rollback and uninstall calls without fetching the future tag. Confirm no duplicate MCP entries/hooks, unrelated configuration preserved and existing opt-out honored. Do not modify the owner's live installations for testing. Defer real Hermes/raw-URL checks that require the renamed repository and `v0.7.0` tag to Task 5; the candidate remains staged until those checks pass.
- [x] Audit remaining tracked references with `git grep -n -i -E 'awesome-progress-tracker|awesome-project-progress|awesome progress tracker|project-progress|breadcrumb'`. Classify each match as new branding, retained compatibility or history. Review active `apt-logo` references separately. Do not require zero legacy matches.
- [x] Run `git diff --check`, inspect generated `dist/`, update progress/Obsidian notes and commit the verified candidate. Record exact commands and results in the release checklist.

## Task 5: Publish in an order that preserves working install routes

**Consumes:** Verified candidate and explicit authorization for external release. **Produces:** GitHub repository/release and confirmed scoped npm package; compatibility routes verified.

- [ ] Present the concrete candidate, exact npm package/scope, release notes, repository target and verification evidence for release authorization. This plan does not perform those external writes.
- [ ] Rename the existing GitHub repository to `breadcrumbs`; verify old Git HTTPS and release/tag links redirect. Update the local `origin` URL after confirming the result. Preserve old tags, issues, stars and the local directory path.
- [ ] Push the verified release commit and create tag `v0.7.0`. Before any public release or npm deprecation, verify the immutable Hermes raw skill URL, the GitHub install route, and a real disposable Hermes install/status/doctor/uninstall against the tagged candidate. If any check fails, leave the candidate staged and do not publish or deprecate packages.
- [ ] Publish the reviewed scoped tarball with public access only after the tagged provider checks pass. Verify `npm view @andriilavrekha/breadcrumbs` and the explicit scoped `npm exec` command in an isolated project, including all three aliases. Adjust only to the previously confirmed scope.
- [ ] If the old npm package is owned, publish the compatible candidate under that legacy package identity too, using a temporary packaging copy rather than changing canonical metadata. Verify both the scoped and legacy packages expose working commands before adding a deprecation message on the legacy package pointing to Breadcrumbs. If ownership/publication cannot be verified, document that limit instead of issuing an unauthorized publish/deprecation.
- [ ] Document the global upgrade order for users of the old npm package: verify the installed package identity, uninstall only that package to release the two legacy bin names, then install the scoped package; never tell users to use `npm install -g --force`, and state that npm package removal does not remove `project-progress/`, provider config, opt-out state, or the existing `~/.awesome-progress-tracker` data.
- [ ] Test the existing plugin update route and a fresh install using the stable marketplace/plugin IDs. If a provider does not follow the repository redirect, document and verify re-adding the renamed source while retaining the same identity; never install a parallel plugin to hide a failing update.
- [ ] After tagged provider, package and plugin checks pass, publish the GitHub release from `v0.7.0`, titled `Breadcrumbs v0.7.0`, with `RELEASE_NOTES_v0.7.0.md`. Until then, keep any GitHub release entry as a draft. A pushed tag and repository rename are already externally visible; "staged" means the release announcement and later publications are withheld, not that those earlier mutations are private or automatically reversible.
- [ ] Record actual release URLs, registry identities and smoke results. Keep local directory/vault renaming and updates to unrelated projects outside this rollout. Roll back executable versions if needed; retain data and published history.

## Plan self-review and handoff

- Brand, command/package identity, plugin presentation, install URLs, docs/assets, tests/build artifacts, release publication, compatibility and rollback each have an owning task.
- Only namespace ownership and remote rename eligibility depend on external account state. Resolve them before the affected mutations; do not substitute a bare npm name.
- This planning session does not claim implementation tests passed. Execution starts with Task 1 after design review; no additional features or data migration are included.

## Independent review record (2026-10-21)

- High: global npm installs can collide on legacy executable names. Added an isolated upgrade check and package-specific removal/reinstall sequence without `--force`, preserving configuration and data.
- High: pre-release live Hermes checks depended on an unpublished tag. Split local/mock checks from tagged live checks and made public release/publication ordering explicit.
- Medium: proposed npm scope was asserted before ownership was confirmed. Package-name assertions and mutations now follow the ownership gate.
- Medium: lockfile version is still `0.4.2`, and runtime MCP version is `0.1.1`. Added explicit synchronization and source/compiled package-location verification.
- Medium: npm tarball checks conflated CLI runtime files and repository plugin files. Separated their verification without expanding package contents unnecessarily.
- Parent checked the revised instructions against source/package metadata, restored the explicit final GitHub release step, and clarified that pushed tags and repository renames are externally visible.
- Verification: document/source inspection and whitespace/consistency checks only. Implementation and live account/release verification have not started.

## Local implementation result (2026-10-21)

Tasks 1-4 are implemented and locally verified as one coherent candidate commit; Task 5 has not started. The shared package-root/version lookup lives in src/package.ts and is reused by CLI and MCP to avoid duplicating root discovery. Two required compatibility proofs exposed existing bugs: Codex MCP upserts used the wrong markers, and CLI symlink invocations never ran the entry point. Both were fixed with regression tests. The existing WSL-only Windows-path assertion was corrected to use platform path resolution.

Verification: 403/403 tests, typecheck, build, actual scoped tarball aliases/npm exec/Claude+Codex lifecycle/shared state/compiled MCP, and local legacy-bin collision upgrade all passed. Windows direct compiled CLI help passed. npm login is verified; registry package reads and the target GitHub URL return 404. Real tagged Hermes/plugin routes and all external release mutations remain pending. See RELEASE_CHECKLIST.md for exact scope and limitations.
