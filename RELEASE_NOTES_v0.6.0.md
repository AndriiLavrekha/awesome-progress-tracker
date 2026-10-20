# Awesome Progress Tracker v0.6.0

Released 2026-10-20.

## Highlights

- New `awesome-progress-tracker compact [directory] [--write]`. It moves old history out of `Progress.md`, `Session Log.md`, and `Tasks.md` into one `Archive.md`, verbatim apart from heading levels. It is a dry run unless `--write` is given, writes `Archive.md` first, refuses files that are not valid UTF-8, and repairs text garbled by Windows-1252 misreads in all five progress files.
- SessionStart shows a `Progress health:` line when `Progress.md` has unknown or duplicate sections, when more than 8 KB of history could move, or when files need repair or editing. It names the exact command to run.
- The Stop hook now reports every validator problem (for example an invalid `status` or a missing required section) once per session, not only secret-like values. Secret warnings still show on every stop.
- The MCP `Done` fold no longer loses folded items when `Archive.md` cannot be written; the reply returns them as `unarchivedItems` with a hint.
- Agent guidance now says where old text belongs and how to write Session Log entries (`## YYYY-MM-DD HH:MM <topic>`, newest at the bottom).

Existing progress files remain valid. The progress schema stays at version 1. Run `compact` without `--write` first and commit before applying it.
