# dsh-ref-doctor

Audit a manuscript's reference list against Crossref before you submit it.

```sh
dsh plugin add dsh-ref-doctor
```

| Tool | Purpose |
|---|---|
| `ref_audit` | Parse `.bib` / LaTeX / numbered citations, verify each entry, report `verified`, `verified-by-title`, `title-mismatch`, `doi-not-found` or `not-found`. |
| `ref_format` | Emit GB/T 7714 numbered entries, filling missing fields from Crossref. |

At most 40 entries per call (default 20). Crossref-only: works registered elsewhere may read
`not-found`. PDF and Word files are not parsed.

MIT licensed.
