/**
 * dsh-ref-doctor — audit a manuscript's reference list against Crossref and emit
 * GB/T 7714 entries. Parses .bib, LaTeX \bibitem lists and numbered references.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseReferences, toGb7714, verifyEntry } from './lib/refs.js'

export const name = 'dsh-ref-doctor'
export const inject = ['tools']

const MAX_ENTRIES = 40

const text = value => [{ type: 'text', text: value }]

/** Wrap a tool body so failures read as one line. */
function guard(fn) {
  return async args => {
    try {
      // Tool results must be lossless JSON: drop undefined fields from parsed entries.
      return JSON.parse(JSON.stringify(await fn(args)))
    } catch (error) {
      throw new Error(`[${error.name || 'Error'}] ${error.message}`)
    }
  }
}

/** Load references from a file path or from the arguments. */
function loadEntries(args) {
  if (Array.isArray(args.references) && args.references.length) {
    const entries = []
    for (const [index, raw] of args.references.entries()) {
      entries.push(...parseReferences(String(raw), '').map(entry => ({ ...entry, index: index + 1 })))
    }
    return entries
  }
  if (args.file) {
    const path = resolve(process.cwd(), args.file)
    const content = readFileSync(path, 'utf8')
    return parseReferences(content, path)
  }
  throw new Error('pass file (a .bib/.tex/.txt path) or references (an array of citation strings)')
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'ref_audit',
    description:
      'Audit a reference list against Crossref: parse .bib, LaTeX \\bibitem lists, or numbered '
      + 'citations, then report for each entry whether the DOI resolves, the title matches, or nothing '
      + 'was found. Use it before submitting a paper or a thesis chapter.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bib, .tex or numbered .txt reference list.' },
        references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Citation strings, when there is no file.',
        },
        limit: { type: 'integer', minimum: 1, maximum: MAX_ENTRIES, description: `Entries to verify; default 20, max ${MAX_ENTRIES}.` },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const entries = loadEntries(args).filter(entry => entry.title || entry.raw)
      if (!entries.length) throw new Error('no reference entries found in that input')
      const limit = Math.min(args.limit ?? 20, MAX_ENTRIES)
      const checked = entries.slice(0, limit)
      const results = []
      for (const entry of checked) results.push(await verifyEntry(entry))
      const counts = results.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {})
      const symbol = status => (['verified', 'verified-by-title'].includes(status) ? '✅'
        : ['title-mismatch', 'doi-not-found'].includes(status) ? '⚠️' : '❌')
      const lines = [
        `checked ${results.length} of ${entries.length} entries: `
        + Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', '),
        ...results.map(item => {
          const label = (item.entry.title || item.entry.raw || '').slice(0, 70)
          const note = item.found ? ` → ${item.found.title?.slice(0, 60)} (${Math.round(item.similarity * 100)}% title match)` : ''
          return `${symbol(item.status)} ${label}${note}`
        }),
      ]
      return { results, counts, summary: lines.join('\n') }
    }),
  })

  ctx.tools.register({
    name: 'ref_format',
    description:
      'Format a reference list as GB/T 7714 numbered entries, using Crossref metadata (authors, venue, '
      + 'year) to fill what the input lacks. Useful for a Chinese thesis bibliography.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bib, .tex or numbered .txt reference list.' },
        references: { type: 'array', items: { type: 'string' }, description: 'Citation strings, when there is no file.' },
        enrich: { type: 'boolean', description: 'Fill missing fields from Crossref; default true.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_ENTRIES, description: `Entries to format; default 20, max ${MAX_ENTRIES}.` },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value.summary),
    },
    execute: guard(async args => {
      const entries = loadEntries(args).filter(entry => entry.title || entry.raw)
      if (!entries.length) throw new Error('no reference entries found in that input')
      const limit = Math.min(args.limit ?? 20, MAX_ENTRIES)
      const enrich = args.enrich !== false
      const formatted = []
      for (const entry of entries.slice(0, limit)) {
        let reference = entry
        if (enrich && (!entry.authors?.length || !entry.venue || !entry.doi)) {
          const result = await verifyEntry(entry)
          if (result.found) reference = { ...entry, ...result.found }
        }
        formatted.push(toGb7714(reference, formatted.length + 1))
      }
      return { entries: formatted, summary: formatted.join('\n') }
    }),
  })
}
