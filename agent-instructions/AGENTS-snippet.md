## Project Progress

For multi-step features, investigations, refactors, project setup, debugging, deployment, and release work, maintain project-local progress in `project-progress/`. Treat `project-progress/Progress.md` as the first resume file and `project-progress/` as the canonical project state.

At kickoff, check whether `project-progress/Progress.md` exists. If it exists, read its frontmatter and `Resume Snapshot` first. Then read `Next Action`, `Blockers`, and `Remaining Work`. If it is missing during meaningful multi-step work, ask the user before initializing Awesome Progress Tracker in the project. Only create `project-progress/` after the user says yes. If the user says no, record opt-out state with `awesome-progress-tracker state set . --state opted-out` when the CLI is available, then continue without creating project progress files. Use token-conscious reads: open `Tasks.md`, `Decisions.md`, `Open Questions.md`, and the latest `Session Log.md` entry only when needed.

Update progress files after meaningful work checkpoints: kickoff when state changes, major decisions, completed milestones, blockers, verification, scope changes, deployment, and session ending. Before finishing meaningful work, make sure the resume snapshot, next action, blockers, and remaining work are current.

Do not write secrets to progress files. Respect `sensitivity` and `commit_progress` in frontmatter: if `sensitivity: private`, avoid personal, customer, business, proprietary, or identifying details that are not needed to resume work; if `sensitivity: sensitive` or `commit_progress: false`, do not stage or commit progress files unless explicitly instructed.
