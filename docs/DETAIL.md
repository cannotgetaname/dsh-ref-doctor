# Reference doctor

Parses a bibliography, checks every entry against Crossref, and prints GB/T 7714 lines.

## Tools

| Tool | Purpose |
|---|---|
| `ref_audit` | Verify each entry: DOI resolves, title matches, or nothing found. |
| `ref_format` | Emit numbered GB/T 7714 entries, filling missing authors/venue/year from Crossref. |

## Input

`file:` path to `.bib`, `.tex` (with `\bibitem`) or a numbered `.txt`, or `references:` an array of
citation strings.

## Limits

- At most 40 entries per call; the default is 20.
- Verification is Crossref-only: a work registered elsewhere may show `not-found`.
- PDF and Word files are not parsed; convert the bibliography to `.bib`, `.tex` or text first.
