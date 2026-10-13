# mix[flow]

Read [`README.md`](README.md) and `docs/` first.

| Command | What it checks | When to run |
| --- | --- | --- |
| `npm run typecheck` | the app, the Electron main process, e2e and dsp compile | after any change |
| `npm test` | unit tests (vitest) | in a test pass (when asked, or before a PR) and on CI |
| `npm run test:dsp` | the DSP render tests | in a test pass, when the DSP changed, and on CI |
| `npm run test:browser` | the Playwright smoke test | in a test pass and on CI |

A change runs only `npm run typecheck`. Tests are written to a spec as their own step, not
as part of a change; if an existing test breaks, the next test pass or CI catches it.

`npm run dev` runs vite and the window together; no dev port is fixed — it takes `PORT`
or a free port from the OS and hands the real one to the shell.

Every agent commit must end with a blank line and a GitHub-compatible co-author trailer naming the agent that actually made it, for example `Co-authored-by: Codex <noreply@openai.com>` or `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never name an agent that didn't write the commit.
