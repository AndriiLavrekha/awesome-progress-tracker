# ADR 0013: Require upstream immutable Git-ref support for plugin installation

- **Status:** Accepted
- **Date:** 2026-08-01
- **Supersedes:** ADR 0003

## Context

Current Hermes supports nested plugin identifiers such as `owner/repo/hermes-plugin`, but its installer clones only the remote default branch. It cannot select an immutable release ref. A plugin mirror does not solve this provenance problem: its default branch also moves.

## Decision

Public package-managed Hermes support requires an upstream Hermes plugin-install capability that selects an immutable Git ref while preserving nested-plugin selection.

Once available, the wrapper installs this repository’s `hermes-plugin/` from the release tag matching the npm package version. The exact CLI spelling will follow the upstream-supported interface; it must not be guessed or emulated by direct profile mutation. The installer verifies the resulting plugin’s declared version/provenance before enabling it.

Until the upstream capability is released and verified, the project may maintain a local plugin spike but must not claim supported package-managed Hermes compatibility.

## Consequences

- Remove the plugin release-mirror publishing requirement.
- The Hermes adaptation release plan includes an upstream contribution/dependency, compatibility detection, and a clear unsupported-Hermes diagnostic.
- The release gate requires an end-to-end install from the tagged nested plugin against the minimum supporting Hermes version.
