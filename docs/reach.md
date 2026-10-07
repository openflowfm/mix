# The reach view

`npm run dev` opens the window **and** serves the same app to a browser, at the
`http://localhost:<port>/` it prints. It is the real app, not a screenshot of one:
your library, your settings, the stems you have already separated.

No port here is fixed. vite listens on `PORT` when a launcher sets one, otherwise on a
free port from the OS; the reach port the tab dials is a second free port. `tools/app.ts
dev` picks both, bakes the reach port into the page through vite's `define`, and hands
the shell `OPENFLOW_DEV_URL`, `OPENFLOW_MIX_UI_PORT` and `OPENFLOW_MIX_REACH_PORT` — see
`@openflow/desktop`'s `docs/registry.md`, "Ports". Anything else that talks to the
running app, such as `tools/mix-key-backfill.ts`, is given `OPENFLOW_MIX_REACH_PORT` by
hand from what `npm run dev` printed.

That takes explaining, because it did not used to work. The library lives in the main
process, the renderer asks for it over IPC, and IPC arrives through a preload that only a
window gets — so a tab ran the same bundle and drew the empty first-run app, which looks
exactly like an empty library. What was missing there was never the window, it was the
transport.

So `src/main.tsx` builds one when it finds that no preload has: it opens the loopback
port the main process serves, then runs the app's own `preload.ts`, unchanged, with
`electron` resolved to a browser stand-in. `invoke` becomes a POST and events become one
server-sent stream, both answered by the running main process. One preload, two
transports, and no second description of the API to drift from the first. A tab with no
app behind it says so rather than pretending to be a fresh install.

There is no second entry point and no special URL: `import.meta.env.DEV` folds the whole
branch out of a build, which the alias above is keyed to match.

Worth having because a browser is a better place to work than a shell around a page —
real devtools, a readable DOM for anything driving the app, several tabs at once, and it
outlives the window. It is also less forgiving: a cost the desktop shell absorbs shows up
here first, which is how the canvas in every lane turned out to be reallocated on every
frame.

Two things it cannot do, both for the same reason a browser is a browser. Dropped files
have no path, so **drag-and-drop does nothing** — use Import. And the native dialogs open
on the app rather than in the tab.

It is open exactly while the window is on a dev server, bound to loopback, and locked to
that dev server's origin. A packaged build opens no port at all. Be clear about what it
is, though: the window's whole API on a port, with no Chromium in front of it. It belongs
in a dev loop and nowhere else.

