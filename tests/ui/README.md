# Console UI smoke test

Renders `statuspage/console-v2` in jsdom and drives the six interactive
features: board default, collapsible rail, notification bell, command palette,
account menu, comments. It catches null references and broken wiring that
`node --check` cannot.

    npm i jsdom          # not a dependency of this project
    node tests/ui/console-v2.smoke.js

Exit code 1 means a check failed; the failing step is named in the output.

## What this test cannot see

jsdom does not model the real CSS cascade. Most importantly it resolves any
element carrying the `hidden` attribute to `display: none`, whereas a browser
lets an author rule such as `.signin { display: grid }` override the user-agent
`[hidden] { display: none }` and paint the element anyway. That exact bug
shipped once — the sign-in screen covered the console on every load and its
button appeared dead, while this test reported all green.

Step `0a` therefore checks the `[hidden]` guard rule statically instead of at
runtime. Anything else that depends on the cascade — layout, stacking order,
the collapsed rail width, the hover tooltips — has to be checked in a browser.
