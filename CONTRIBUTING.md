# Contributing

Thanks for wanting to help. Bug reports, rule corrections, new board themes, translations and engine or AI improvements are all welcome.

## How it works

1. **Small fix** (typo, obvious bug): open a pull request directly.
2. **Anything bigger** (new feature, rules change, new dependency): open an issue first so we can agree on the approach before you spend time on it.
3. Fork the repository, create a branch, make your change and open a pull request against `main`.
4. CI runs the type checks, unit tests, end-to-end tests and the rules parity check. A pull request is merged once CI is green and it has been reviewed.

## Setup

```bash
pnpm install
pnpm dev                                         # the app on http://localhost:5173
pnpm --filter @dama/server dev                   # the online server on ws://localhost:8787
pnpm test && pnpm typecheck
pnpm --filter @dama/web exec playwright test     # end-to-end, mobile and desktop
```

The training code in `training/` uses [uv](https://docs.astral.sh/uv/): `cd training && uv sync && uv run pytest`.

## Ground rules

- **Rules changes need a source.** The engine implements the Italian rules (FID). If you think a rule is wrong, cite the regulation, and add a test with the position that shows it.
- **The engine and the Python port must agree.** If you change move generation, regenerate the fixtures (`pnpm --filter @dama/engine exec tsx scripts/gen-fixtures.ts`) and make the Python rules in `training/dama/rules.py` match; CI checks both against `fixtures/engine.json`.
- **Tests come with the change.** New behaviour gets a test; a bug fix gets a test that fails without it.
- **Keep it light on phones.** The app has to stay fast on a cheap Android phone; avoid heavy dependencies.
- **Translations** live in `apps/web/src/lib/i18n.ts`; every language must have every key (TypeScript enforces this).

## License

By contributing you agree that your contribution is released under the MIT license of this project.
