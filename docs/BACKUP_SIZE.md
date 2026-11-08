# Recipe backup size contract

The JSON importer and browser file chooser accept at most **150,000 UTF-8
bytes**, inclusively. Field lengths, ingredient count and quantity validation
are unchanged. Valid strings, including lone UTF-16 surrogates represented by
JSON escapes, are preserved exactly. This is a byte limit, not a character limit.

## Conservative bound

The current schema permits at most 20,036 UTF-16 code units in string values:
100 title + 48 original portions + 48 target portions +
80 × (48 quantity + 40 unit + 160 ingredient name).

JSON serialization costs at most six UTF-8 bytes per code unit. Escaped lone
surrogates cost six; other escapes, ordinary Unicode and surrogate pairs cost
no more. This overestimates valid quantity strings deliberately.

With 80 rows, the versioned envelope, keys, punctuation, two-space indentation
and trailing newline cost 6,557 bytes with empty string values. Fewer rows
reduce that cost. Thus every schema-valid export is at most
20,036 × 6 + 6,557 = **126,773 bytes**, below 150,000. The boundary applies to
incoming file whitespace too; an arbitrarily padded file may still be rejected.

Tests pin the structural size and schema maxima, exercise maximal strings,
reimport exported bytes, reload persisted recipes, and check inclusive byte
boundaries. Revisit this proof and tests when changing schema limits, envelope
or serialization formatting. Raising the ceiling does not change the schema
or silently repair malformed Unicode.

## Original failure

The former 100,000-byte ceiling accepted a compact 96,702-byte recipe with
80 ingredient names of 155 lone surrogates and units of 40 lone surrogates.
Its pretty export is 100,268 bytes. Saving reported success, but reload rejected
those bytes and showed the sample. The corrected importer accepts the unchanged
100,268-byte export. No native browser acceptance is claimed by these tests.
