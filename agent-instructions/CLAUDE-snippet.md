## Project Progress Memory

When working in a repository on multi-step work, use `project-progress/Progress.md` as the first resume file. If it exists, read it before changing project files, starting with frontmatter and `Resume Snapshot`. If it is missing during meaningful multi-step work, ask the user before initializing Awesome Progress Tracker in the project. Only create `project-progress/` after the user says yes. If the user says no, record opt-out state with `awesome-progress-tracker state set . --state opted-out` when the CLI is available, then continue without creating project progress files.

Default read path: `project-progress/Progress.md` frontmatter, `Resume Snapshot`, `Next Action`, `Blockers`, and `Remaining Work`. Read `Tasks.md`, `Decisions.md`, `Open Questions.md`, and the latest `Session Log.md` entry only when needed.

Before finishing meaningful work, update `Progress.md`, `Tasks.md`, and `Session Log.md`. Update `Decisions.md` and `Open Questions.md` when relevant. Keep the `Resume Snapshot`, next action, blockers, and completion state current enough for another agent to resume.

Never store secrets in progress files. If `sensitivity: private`, avoid personal, customer, business, proprietary, or identifying details that are not needed to resume work. If `sensitivity: sensitive` or `commit_progress: false`, do not stage or commit progress files unless explicitly instructed.
