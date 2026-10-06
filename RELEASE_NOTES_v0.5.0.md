# Awesome Progress Tracker v0.5.0

This release adds a last runtime memo to the Claude Code and Codex plugins.

## Highlights

- `Progress.md` can record the provider, agent, model, and effort from the session that last updated it.
- SessionStart displays the saved runtime as one compact line, omitting unknown values.
- Claude Code and Codex Stop hooks fill an unknown provider during the existing clean-handoff write (`claude-code` or `codex`).
- Agent guidance and the project template now describe and include the optional runtime fields.

Existing progress files remain valid. The progress schema stays at version 1.
