# Project status

**2026-10-15: v0.3 released (= v20). v21 (calls) on the branch `feature/calls`,** passing the harness, waiting for
the phone checks and a real call.

v21 adds Audio / Video call buttons to DM conversations and makes Instagram's call page start in iPhone Safari (its
code allows desktop Safari 16+ only; the call page alone is told it runs in Mac Safari). Measured: with Request
Desktop Website the gate opened, but the call opens in a new tab without desktop mode, which is why calls "could not
reach". To check before merging: DEVICE PASS with desktop mode off, the call buttons on a conversation, the call
lobby's gate open, then one real call.

Known limits (see the brief): English and French labels only; iPad, desktop and landscape not targeted; incoming
calls ring in the app only; the pre-v0.3 git history has a DM thread id and a few rule-breaking commits that would
need a force-push to clean.

Not decided: a license (none yet, so the code is visible but not reusable).
