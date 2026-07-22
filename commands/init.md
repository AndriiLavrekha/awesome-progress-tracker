---
description: Initialize Awesome Progress Tracker (project-progress/) in the current project
argument-hint: [project name]
---

Initialize Awesome Progress Tracker for the current project.

Use the `project-progress` skill. Steps:

1. If `project-progress/Progress.md` already exists, stop and report it is already initialized — do not overwrite it.
2. Otherwise create the `project-progress/` directory from the canonical templates.
3. Set the `Progress.md` frontmatter: `project` = "$ARGUMENTS" (if empty, infer a sensible name from the repository or its remote), `path` = the absolute project path, `status: active`, `progress_schema_version: 1`, plus `sensitivity` and `commit_progress` defaults.
4. Write an initial `Resume Snapshot`, `Next Action`, and `Completion Criteria` grounded in the current state of the repository (read README / recent commits as needed).
5. Never write secrets into the progress files.

Then confirm exactly which files were created and what the Resume Snapshot says.
