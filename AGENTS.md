# Repo-specific working notes

- Native Road to Gramby's geometry/rotation investigations: read [the probing runbook](docs/NATIVE_GEOMETRY_PROBING.md) before changing pose conventions. It links the reproducible creation generator, read-only capture script, version-bound layout and offline comparison tool.
- Run a live geometry capture only when the user has authorized reading the running game in the current session. Use query/read rights only; never add writes, injection or hooks. Stop on executable/layout mismatch or ambiguous sample assignment.
- Preserve independently measured native fixtures. Compare model pieces/body frames rather than assuming a multi-piece part's lead frame is its Handle. Read [the rotation findings](docs/superpowers/research/2026-10-26-point-mount-rotation.md) before revisiting point, hinge or Orientation rules.

Deployment uses `.github/workflows/pages.yml` on `main`. Validate assets, tests, types, formatting and build before pushing an authorized deployment, then verify the workflow and served asset revision.
