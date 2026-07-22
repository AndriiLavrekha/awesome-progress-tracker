# Awesome Progress Tracker Agent Self-Test

Use these instructions when the user asks you to test Awesome Progress Tracker behavior. Run tests in temporary projects unless the user explicitly asks you to test a real project.

## Safety Rules

- Do not initialize a real project without explicit user approval.
- Do not overwrite existing `project-progress/` files.
- Do not write secrets or private user data into progress files.
- Do not stage or commit progress files when `sensitivity: sensitive` or `commit_progress: false`.
- Keep test projects small and disposable.

## Required Checks

1. Run `awesome-progress-tracker doctor` for the selected agent if the command is available.
2. Test a new empty project.
3. Test an existing project without `project-progress/`.
4. Test an existing initialized project.
5. Test MCP refresh/list behavior if MCP tools are available.
6. Test `init` updates the global index.
7. Test hook validation if hook scripts are present.
8. Test uninstall/status only in a temporary home or with explicit user approval.

## Expected Agent Behavior

When `project-progress/Progress.md` is missing during meaningful work, ask:

```text
This project is not initialized with Awesome Progress Tracker. Do you want me to create `project-progress/` here?
```

Only initialize after the user says yes.

When `project-progress/Progress.md` exists, read it first and update it before finishing meaningful work.

## Report Format

Return a concise report:

```text
Awesome Progress Tracker Self-Test

Environment:
- Agent:
- Project:
- MCP available:

Results:
- New project prompt: PASS|FAIL|NOT TESTED
- Existing uninitialized prompt: PASS|FAIL|NOT TESTED
- Existing initialized resume: PASS|FAIL|NOT TESTED
- Progress file updates: PASS|FAIL|NOT TESTED
- Hook validation: PASS|FAIL|NOT TESTED
- MCP refresh/list: PASS|FAIL|NOT TESTED
- Global index update: PASS|FAIL|NOT TESTED
- Privacy/commit policy: PASS|FAIL|NOT TESTED
- Uninstall/status: PASS|FAIL|NOT TESTED

Broken Behavior:
- <issue or None>

Recommended Fixes:
- <fix or None>
```

If any required behavior is not testable because the current agent lacks tool access, mark it `NOT TESTED` and explain what access or command is needed.
