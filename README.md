# PortionLab

A local kitchen worksheet for resizing recipes with exact fractions. Original
measurements remain visible beside the scaled batch. Units are preserved as
text: there is no density inference or conversion between mass and volume.

## Run

Use Node.js 22 or later. There is no install step and there are no package or
runtime dependencies. The optional DOM regression suite uses a test-only dependency.

```sh
npm start
```

Open `http://127.0.0.1:4186/` in a modern browser. The server listens only on
the loopback interface. To use a different local port, set `PORT` before
starting. Keep using the same origin/port to access its browser-saved recipe.
The app is static HTML/CSS/JavaScript; the Node server only serves its six app
files. For an alternative local server, serve this directory over HTTP.
Opening `index.html` through `file://` is not supported because of ES modules.

```sh
npm test
```

Node's built-in test runner checks arithmetic, strict file validation, draft
recovery, storage failures, conflicting changes, and 5,000 seeded arithmetic
cases. The seeded expected values use direct integer cross-products rather
than the production parser/formatter. See `VALIDATION.md` for the scope of browser checks and remaining gaps.
Unit checks do not establish browser behavior.

## Use

- Set target portions and choose **Update portions**. The sheet uses the last
  applied value until a valid update succeeds. A partial target stays in the
  field during other renders and requests a best-effort leaving-page warning.
- **Edit recipe** edits a separate draft of the original amounts. You can add
  and remove rows, undo the last removal, apply valid changes, or cancel.
  Dirty Cancel/Escape and Reset require an explicit choice. Reset restores
  the values from when that draft opened.
- Unfinished recipe drafts are saved to this tab's session storage on input,
  including incomplete fields. Reload offers **Resume draft**. Complete or
  discard a waiting draft before loading, scaling, or undoing another recipe.
- Applied recipes are saved to local storage when available. **Undo last
  change** restores one applied change, including an import, during this page
  session. Repeating unchanged portions, applying an unchanged recipe, or
  importing the identical recipe keeps the useful Undo step. Exact text
  changes (for example, `6` to `6.0`) remain undoable. Undo history is not
  retained across reloads.
- **Download JSON** exports the applied recipe. **Load JSON** validates the
  entire file, previews it, then requires **Replace recipe**. Cancel never
  replaces the current recipe. JSON is local; file bytes are not uploaded.
- **Print sheet** requests the browser print dialog for the applied recipe,
  with original and scaled columns. Unapplied drafts/targets are excluded.

## Supported quantities and files

Accepts non-negative whole numbers, decimals (up to six places), fractions,
mixed numbers such as `1 1/2`, and common Unicode fraction glyphs. Portions
must be positive. A fraction glyph must be a complete quantity or the final
fraction in a mixed quantity, such as `½` or `1½`; trailing digits are errors.
Blank ingredient quantities are explicitly unmeasured and
remain "As written". Mixed fractional parts must be less than one. Negative
values, exponent notation, grouping commas and incomplete numbers are errors.

Numeric components allow up to 12 digits, values must be below one trillion,
and raw quantity fields allow at most 48 characters. Results use exact BigInt
rationals; decimals remain decimal when an exact result of at most six places
exists, otherwise an exact fraction is shown. There is no rounding.

At most 80 ingredient rows; title 100 characters, ingredient name 160, unit
40. Import accepts at most 100,000 UTF-8 bytes and exactly this versioned shape:

```json
{
  "format": "portionlab",
  "version": 1,
  "recipe": {
    "title": "A synthetic recipe",
    "basePortions": "3",
    "targetPortions": "7",
    "ingredients": [{"quantity": "1/3", "unit": "cup", "name": "dry grains"}]
  }
}
```

Values are strings so original spelling and units survive roundtrips. Unknown
fields/versions and malformed rows are rejected rather than guessed. Example
fixtures under `tests/fixtures` are synthetic, not scraped recipe material.

## Privacy, accessibility, and limits

No analytics, accounts, credentials, AI API, network fetches, remote fonts or
external media. The only HTTP requests are for the local app files. Local and
session storage depend on browser policy and can be cleared by the browser;
keep JSON backups for portability. Storage failures are visible. Unsaved applied
recipes retain a best-effort
leaving-page warning even after Undo; browser prompt behavior varies. Other-tab
changes are detected before writes and leave local work intact, but local
storage is not a transactional multi-user database: simultaneous writes have
no locking guarantee. Use one tab for editing.

Native buttons, labeled fields, semantic table headers, keyboard dialogs,
visible focus, reduced-motion CSS and responsive mobile layouts are included.
The plate diagram uses approximate display sizes with a minimum diameter for
visibility; numeric quantities are the exact result. Native dialog support
and BigInt require a modern browser. No Safari or assistive-technology audit
has been performed. There are no nutrition, allergen, doneness, or cooking
safety claims. The synthetic sample is an ingredient-scaling example, not a
tested cooking method.

## AI assistance and project files

OpenAI Codex assisted with design, code, synthetic sample text, tests and review.
The application itself makes no AI calls. It uses standard browser and Node
APIs and local system fonts. Test fixtures are synthetic.

Files: `core.js` exact math and schema; `state.js` recovery and persistence;
`app.js` browser interactions; `index.html` and `styles.css` interface;
`server.js` local preview; `tests` automated verification;
`VALIDATION.md` validation scope and known limits.
