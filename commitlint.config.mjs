// Enforces the repo's Conventional-Commit titles (see CLAUDE.md → "PR titles &
// bodies" / "Commits"). Wired to the `commit-msg` git hook via lefthook.yml.
//
// config-conventional allows the types the repo uses — feat | fix | chore |
// docs | ci | refactor | test | perf — plus a few more (build, revert, style);
// the extras are harmless. Scope is optional and free-form (provider, gateway,
// web, backend, ci, deps, dx, …), matching how scopes are used in practice.
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
