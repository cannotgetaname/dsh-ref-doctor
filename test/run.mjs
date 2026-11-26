import { parseBibtex, parseNumbered, parseTex, titleSimilarity, toGb7714, verifyEntry, fromCrossref } from '../lib/refs.js'

let passed = 0
const failures = []
const check = (name, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  ok   ${name}`) }
  else { failures.push(name); console.log(`  FAIL ${name} ${detail}`) }
}

console.log('# parsing')
const bib = parseBibtex(`@article{chen2022thermal,
  title = {Thermal runaway analysis},
  author = {Zhaoqi Chen and Peng Huang},
  journal = {Measurement},
  year = {2022},
  doi = {10.1109/CVCI.2022.1}
}`)
check('bib entry count', bib.length === 1)
check('bib title', bib[0].title === 'Thermal runaway analysis')
check('bib splits authors', bib[0].authors.length === 2)
check('bib doi', bib[0].doi === '10.1109/CVCI.2022.1')

const tex = parseTex(`\\begin{thebibliography}{9}
\\bibitem{key1} A. Author. A study of things. Journal, 2021.
\\bibitem{key2} B. Author. Another study. 2020. doi: 10.1000/x
\\end{thebibliography}`)
check('tex entry count', tex.length === 2)
check('tex year', tex[0].year === '2021')
check('tex doi', tex[1].doi === '10.1000/x')

const numbered = parseNumbered(`[1] First reference, 2019.
[2] Second reference, 2020.
continued detail`)
check('numbered count', numbered.length === 2)
check('numbered index', numbered[0].index === 1)
check('numbered keeps continuation', numbered[1].raw.includes('continued detail'))

console.log('# similarity')
check('identical titles', titleSimilarity('Thermal runaway analysis', 'Thermal runaway analysis') === 1)
check('disjoint titles', titleSimilarity('alpha beta', 'gamma delta') === 0)
check('partial titles', titleSimilarity('thermal runaway in batteries', 'thermal runaway') >= 0.5)

console.log('# gb/t 7714')
const gb = toGb7714({ title: '基于微环的脉冲神经网络', authors: ['何香玉', '郭鹏星', '卢冰', '李斌'], venue: '中国激光', year: '2026' }, 1)
check('numbered', gb.startsWith('[1] '))
check('three authors then 等', gb.includes('何香玉, 郭鹏星, 卢冰, 等'))
check('journal tag', gb.includes('[J]'))
check('conference tag', toGb7714({ title: 'C', venue: 'Conference on X', year: '2020' }, 2).includes('[C]'))

console.log('# verification with a fake registry')
const fake = (payload, status = 200) => async () => ({ ok: status === 200, status, json: async () => payload })
const verified = await verifyEntry(
  { title: 'Thermal runaway analysis', doi: '10.1/x' },
  { fetchImpl: fake({ message: { DOI: '10.1/x', title: ['Thermal runaway analysis'], author: [{ family: 'Chen', given: 'Zhaoqi' }], issued: { 'date-parts': [[2022]] }, 'container-title': ['Measurement'] } }) },
)
check('doi verified', verified.status === 'verified')
check('crossref authors mapped', verified.found.authors[0] === 'Chen Zhaoqi')
check('crossref year mapped', verified.found.year === '2022')

const mismatch = await verifyEntry(
  { title: 'Thermal runaway analysis of lithium batteries', doi: null },
  { fetchImpl: fake({ message: { items: [{ DOI: '10.9/y', title: ['Completely different topic'], issued: { 'date-parts': [[2021]] } }] } }) },
)
check('title mismatch detected', mismatch.status === 'title-mismatch')

const missing = await verifyEntry({ title: 'x', doi: '10.1/none' }, { fetchImpl: fake({}, 404) })
check('unknown doi reported', missing.status === 'doi-not-found')

check('fromCrossref maps type', fromCrossref({ type: 'journal-article', DOI: '10.1/z' }).type === 'journal-article')

console.log(`\nref-doctor tests: ${passed}/${passed + failures.length} passed`)
if (failures.length) process.exitCode = 1
