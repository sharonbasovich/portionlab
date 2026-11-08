# Validation scope

Checked on November 8, 2026. This is a local-first prototype, not an audited
production service or a tested cooking method.

## Automated checks

`npm test` runs 43 tests with Node's built-in test runner. They cover exact
arithmetic (including 5,000 seeded cases), input validation, synthetic JSON
fixtures, persistence, recovery, Undo and targeted interaction callbacks.
Some interaction checks use stubs and extracted callback bodies. These are
not a substitute for running the app in a browser.

The optional `regression` suite contains 15 DOM test groups covering raw
line-break preservation, draft edits, pending-target reconciliation and
dirty-draft leaving protection.
Install its test-only dependency and run it separately:

```sh
npm install --no-save --package-lock=false jsdom@30.1.1
node --test regression/*.test.cjs
```

This does not add an app/runtime dependency. The harness uses a simulated DOM,
including stubbed dialogs and file selection; it does not verify native browser
prompts, printing, file chooser behavior or accessibility. These 15 groups passed for the dirty-draft exit correction.

## Actual Chromium checks (prior public baseline)

A bounded browser pass on public baseline b5bcaddd verified:

- Import through the file chooser, export through a completed download, and
  byte-for-byte comparison of saved JSON for unchanged and edited recipes.
- Preservation of LF, CR and CRLF in raw quantities and labels across unchanged
  scaling, editor collection, rerendering, row changes and unrelated edits.
- Dirty editor Cancel, Escape and Reset confirmation paths, plus focus return.
- Undo and import reconciliation for identical raw pending targets, while
  preserving different pending edits.
- Desktop layout and narrow Chromium frames at 390 and 320 pixels, including
  the ingredient table and editor, with no observed horizontal overflow.
- Keyboard focus wrapping in the narrow editor and clean Escape dismissal.

These narrow-frame checks are not physical-phone or touch-device acceptance.

## Maintenance update validation

The 150,000-byte backup ceiling passed 39 source tests and 11 optional JSDOM
groups. New checks cover the old compact/pretty mismatch, exact saved-reload
recovery, maximal strings, UTF-8 rather than character counts, and the inclusive
file-size boundary. See `docs/BACKUP_SIZE.md` for the conservative bound. These
are automated checks only; native file chooser/export and actual-browser
acceptance have not been rerun for this maintenance update.

## Dirty-draft exit correction

The correction passed 43 Node tests and 15 optional JSDOM groups. New checks
cover pristine and dirty editors, title and row edits, invalid and reverted
input, reset/apply/discard, same-tab draft recovery, pending targets and storage
failures. They verify the actual beforeunload callback requests protection for
dirty drafts even with healthy storage. Native leaving-page prompts were not
rerun or verified; browsers may suppress them, especially without prior user
interaction. Reloads can also request this best-effort warning.

## Remaining limits

Native leaving-page prompts, native print preview and Cancel, and actual-browser
storage-error injection were not verified. Storage failures have automated
coverage, but that does not establish their behavior in every browser.
Safari, physical devices and screen readers have not been audited. The checks
above are bounded evidence, not comprehensive accessibility or browser support
certification. Simultaneous edits across tabs have no transactional locking.
Keep JSON backups and use one tab for editing.
