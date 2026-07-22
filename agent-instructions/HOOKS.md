# Project Progress Hooks

Hooks should remind, validate, and load compact context. They should not be the only mechanism for project progress. They do not write semantic progress summaries by themselves; agents are responsible for recording decisions, blockers, milestones, verification, and final resume state.

Use hooks as a safety net around `project-progress/Progress.md` and `Resume Snapshot`, not as a replacement for the project-local Markdown workflow.

## Recommended Behavior

- startup: if initialized, remind the agent to read `project-progress/Progress.md` and `Resume Snapshot`; if uninitialized and not opted out, provide context telling the agent to ask before initialization on multi-step work.
- during work: do not interrupt normal progress.
- final response: warn if meaningful work happened and progress appears stale.
- commit, PR, or deploy: block or strongly warn when supported if meaningful work was not recorded, or if `sensitivity: sensitive` or `commit_progress: false` indicates progress files should not be staged.

Use `hooks/project-progress-check.ps1` on Windows and `hooks/project-progress-check.sh` on POSIX systems. Configure them as reminder and validation hooks; keep semantic progress summaries in the Markdown files through agent updates.

Hooks cannot force an interactive prompt. For uninitialized projects, the hook should emit context and the agent should ask: `This project is not initialized with Awesome Progress Tracker. Do you want me to create project-progress/ here?` If the user declines, record local opt-out state with `awesome-progress-tracker state set . --state opted-out`.
