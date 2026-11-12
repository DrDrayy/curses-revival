# Contributing

Thanks for helping with curses-revival, a fork of [curses by mmpneo](https://github.com/mmpneo/curses).

## Branches

- `features` is the main branch (the front page). New features go here.
- `fixes` holds the original program plus bug fixes only. Bug fixes go here first and are then merged into `features`.

## Reporting bugs and ideas

Use the issue forms: **Bug report** or **Feature request**. For bugs, add the lines from `curses.log` (Settings > Open log folder). Tokens and keys are hidden in the log, but read it before you post.

Security problems: see [SECURITY.md](SECURITY.md). Please don't post details in a public issue.

## Building

Windows, Node 20, pnpm 9 and Rust **1.79.0** (newer Rust fails on the locked `time` 0.3.30 package):

```
pnpm install --frozen-lockfile
pnpm tauri build
```

For a quick type check without building: `pnpm exec tsc --noEmit`.

## Pull requests

- Keep each pull request to one fix or one feature, and say which build it is for.
- Keep the existing code style. Write user-facing text in plain English, and add it to all three files in `public/i18n/` (English text is fine in the other languages if you can't translate).
- Don't change `pnpm-lock.yaml` unless you are changing dependencies on purpose. The build uses `--frozen-lockfile`.
- Add a line to `CHANGELOG.md` under a new "Unreleased" heading.
- By contributing you agree that your work is licensed under the GNU AGPL-3.0, like the rest of the project.

## Releases

Pushing a tag like `v0.1.2-features` or `v0.1.2-fixes` builds the program and publishes a Release. Update the version in `src-tauri/Cargo.toml` first.
