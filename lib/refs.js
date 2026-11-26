/**
 * Reference parsing, verification and GB/T 7714 formatting.
 * Pure functions where possible: the network fetcher is injectable for tests.
 */

const CROSSREF = 'https://api.crossref.org'

/** Extract a DOI from free text. */
export function doiOf(text) {
  const match = String(text ?? '').match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/)
  return match ? match[0].replace(/[.,;]+$/, '') : null
}

/** Parse a BibTeX file into entries. */
export function parseBibtex(text) {
  const entries = []
  const pattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\}/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const fields = {}
    for (const field of match[3].matchAll(/(\w+)\s*=\s*(?:\{([\s\S]*?)\}|"([^"]*)")/g)) {
      fields[field[1].toLowerCase()] = (field[2] ?? field[3] ?? '').trim()
    }
    entries.push({
      kind: 'bibtex',
      key: match[2],
      type: match[1].toLowerCase(),
      title: fields.title,
      authors: fields.author ? fields.author.split(/\s+and\s+/).map(name => name.trim()).filter(Boolean) : [],
      venue: fields.journal ?? fields.booktitle,
      year: fields.year,
      doi: fields.doi ?? doiOf(fields.url ?? ''),
      raw: match[0],
    })
  }
  return entries
}

/** Parse `\bibitem` entries from LaTeX. */
export function parseTex(text) {
  const entries = []
  const pattern = /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)(?=\\bibitem|\\end\{thebibliography\}|$)/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const body = match[2].replace(/\\[a-z]+\{[^}]*\}/gi, ' ').replace(/\s+/g, ' ').trim()
    entries.push({
      kind: 'tex',
      key: match[1],
      title: body.split(/[.,]/)[0]?.trim(),
      authors: [],
      venue: null,
      year: (body.match(/\b(19|20)\d{2}\b/) || [null])[0],
      doi: doiOf(body),
      raw: match[0].trim(),
    })
  }
  return entries
}

/** Parse a numbered reference list (`[1] ...`, `1. ...`). */
export function parseNumbered(text) {
  const entries = []
  const lines = String(text).split(/\r?\n/)
  let current = null
  for (const line of lines) {
    const start = line.match(/^\s*(?:\[(\d+)\]|(\d+)[.)])\s+(.*)$/)
    if (start) {
      if (current) entries.push(current)
      current = {
        kind: 'numbered',
        index: Number(start[1] ?? start[2]),
        title: start[3].trim(),
        authors: [],
        venue: null,
        year: (start[3].match(/\b(19|20)\d{2}\b/) || [null])[0],
        doi: doiOf(start[3]),
        raw: line.trim(),
      }
    } else if (current && line.trim()) {
      current.raw += ` ${line.trim()}`
    }
  }
  if (current) entries.push(current)
  return entries
}

/** Choose a parser by filename or by the shape of the text. */
export function parseReferences(text, filename = '') {
  if (/\.bib$/i.test(filename) || /@\w+\s*\{/.test(text)) return parseBibtex(text)
  if (/\.tex$/i.test(filename) || /\\bibitem/.test(text)) return parseTex(text)
  return parseNumbered(text)
}

/** Crossref lookup by DOI. */
export async function crossrefByDoi(doi, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!doi) return null
  try {
    const response = await fetchImpl(`${CROSSREF}/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'dsh-ref-doctor (https://github.com/cannotgetaname/dsh-ref-doctor)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body?.message ?? null
  } catch {
    return null
  }
}

/** Crossref title search; returns the best candidate or null. */
export async function crossrefByTitle(title, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const query = String(title ?? '').slice(0, 160).trim()
  if (!query) return null
  try {
    const url = `${CROSSREF}/works?query.bibliographic=${encodeURIComponent(query)}&rows=1&select=DOI,title,author,container-title,published,issued`
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'dsh-ref-doctor (https://github.com/cannotgetaname/dsh-ref-doctor)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body?.message?.items?.[0] ?? null
  } catch {
    return null
  }
}

/** Normalized token set, for a cheap title comparison. */
function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').split(/\s+/).filter(Boolean))
}

/** Jaccard overlap of two titles, 0..1. */
export function titleSimilarity(a, b) {
  const left = tokens(a)
  const right = tokens(b)
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / (left.size + right.size - shared)
}

/** Map one Crossref record to our reference shape. */
export function fromCrossref(message) {
  if (!message) return null
  const authors = (message.author ?? [])
    .map(person => [person.family, person.given].filter(Boolean).join(' ').trim() || person.name)
    .filter(Boolean)
  const year = message['published-print']?.['date-parts']?.[0]?.[0]
    ?? message['published-online']?.['date-parts']?.[0]?.[0]
    ?? message.issued?.['date-parts']?.[0]?.[0]
    ?? null
  return {
    title: message.title?.[0] ?? null,
    authors,
    venue: message['container-title']?.[0] ?? message.event?.name ?? null,
    year: year ? String(year) : null,
    doi: message.DOI ?? null,
    type: message.type ?? null,
  }
}

/**
 * Verify one parsed entry: DOI first, title search second.
 * @returns {Promise<{entry: object, status: string, found: object|null, similarity: number}>}
 */
export async function verifyEntry(entry, options = {}) {
  if (entry.doi) {
    const message = await crossrefByDoi(entry.doi, options)
    if (message) {
      const found = fromCrossref(message)
      return { entry, status: 'verified', found, similarity: titleSimilarity(entry.title, found.title) }
    }
    return { entry, status: 'doi-not-found', found: null, similarity: 0 }
  }
  const message = await crossrefByTitle(entry.title ?? entry.raw, options)
  if (!message) return { entry, status: 'not-found', found: null, similarity: 0 }
  const found = fromCrossref(message)
  const similarity = titleSimilarity(entry.title, found.title)
  return { entry, status: similarity >= 0.6 ? 'verified-by-title' : 'title-mismatch', found, similarity }
}

/** GB/T 7714 line for one reference. */
export function toGb7714(reference, index = 1) {
  // Normalize "Family, Given" to "Family Given" and drop trailing periods, so the
  // line does not end up with "Schuman Catherine D..".
  const authors = (reference.authors ?? [])
    .map(name => String(name).replace(/,\s*/, ' ').replace(/\.\s*$/, '').trim())
    .filter(Boolean)
  const authorText = authors.length > 3
    ? `${authors.slice(0, 3).join(', ')}, 等`
    : authors.join(', ') || '佚名'
  const venue = reference.venue ?? ''
  const type = /conference|congress|symposium|workshop|会议/i.test(venue) ? 'C'
    : /thesis|学位/i.test(venue) ? 'D' : 'J'
  const tail = [venue, reference.year].filter(Boolean).join(', ')
  return `[${index}] ${authorText}. ${String(reference.title ?? '').trim()}[${type}]. ${tail}${tail ? '.' : ''}`
}
