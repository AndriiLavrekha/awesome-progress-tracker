# ADR 0024: Last runtime memo

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

`agent_last_used` records a free-text agent name and nothing shows it at
session start. A person who works across several apps cannot tell which chat
to reopen.

## Decision

`Progress.md` keeps one current runtime memo. Optional `provider_last_used`,
`model_last_used`, and `effort_last_used` sit beside the existing
`agent_last_used` and `updated`. The agent replaces them together when it
updates progress. SessionStart shows one line when any of the three new fields
is known. The Stop hook fills a blank provider only inside the existing
clean-handoff write. Claude Code passes `claude-code`. Codex passes `codex`.
Opening another app without updating progress leaves the memo alone.

## Consequences

Schema version stays 1. Existing files stay valid. Skill-only clients have no
Stop hook, so the agent is the only writer there. A session that updates only
`Progress.md` still depends on the agent to record the provider, because Stop
does not gain a new write.
