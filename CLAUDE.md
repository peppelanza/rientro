# rientro

Source for the rientro.it website.

## Project status

The repository is at its initial stage: only a README exists. Update this file as the stack,
build commands, and conventions are established.

## Claude Code environment

- `.claude/settings.json` registers a SessionStart hook (`.claude/hooks/session-start.sh`).
- The hook runs only in Claude Code on the web (`CLAUDE_CODE_REMOTE=true`) and installs
  dependencies when it finds `package.json` (npm/pnpm/yarn), `requirements.txt` /
  `pyproject.toml` (pip), or `composer.json` (composer).
- Extend the hook if the project adopts another toolchain.

## Commands

<!-- Fill in once defined, e.g. -->
<!-- - Dev server: `npm run dev` -->
<!-- - Lint: `npm run lint` -->
<!-- - Test: `npm test` -->
