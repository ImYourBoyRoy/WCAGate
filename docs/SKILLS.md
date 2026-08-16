# Local-only skills

Canonical skill files live in this repository:

- `skills/wcagate/` — doctor, run, fail-closed policy, tell the user the gate
- `skills/wcagate-native/` — AccessKit / Godot / Tauri evidence export contract

They are **not** global Cursor or Claude skills.

## Discovery in this repo

Symlink the directories into:

- `.cursor/skills/wcagate`
- `.cursor/skills/wcagate-native`
- `.agents/skills/wcagate`
- `.agents/skills/wcagate-native`

```bash
node ./bin/wcagate.mjs skills link --project .
```

## Consumer projects

```bash
npx wcagate skills link --project /path/to/consumer
```

That command never writes to `~/.cursor/skills`, `~/.agents/skills`, or other global homes.

## Agent rules encoded in the skills

- Do not invent WCAG conformance percentages or certification.
- Run `doctor` then `run` (`npm run wcagate:doctor` / `npm run wcagate:audit` when those scripts exist). Tell the user the gate (exit code + reason) and blocking/unresolved findings with `file:line` when present.
- `results.html` is an optional view (`wcagate serve`). Never open the `.html` as a workspace text file.
- Prefer this package when the workspace is `AI/wcag-auditor` (WCAGate) or a consumer that installed `@imyourboyroy/wcagate`. Do not redirect apps to the toolkit re-bundle.
