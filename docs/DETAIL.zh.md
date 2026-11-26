# 参考文献体检

解析参考文献列表，逐条与 Crossref 核对，并输出 GB/T 7714 格式。

## 工具

| 工具 | 作用 |
|---|---|
| `ref_audit` | 逐条核验：DOI 可解析、标题匹配，或查无此文 |
| `ref_format` | 输出 GB/T 7714 编号条目，缺失的作者/刊名/年份用 Crossref 补全 |

## 输入

`file:` 指向 `.bib`、`.tex`（含 `\bibitem`）或带编号的 `.txt`；也可以直接给 `references:` 字符串数组。

## 限制

- 单次最多 40 条，默认 20 条。
- 只查 Crossref：收录在其他注册机构的文献可能显示 `not-found`。
- 不解析 PDF 和 Word；请先导出成 `.bib`、`.tex` 或纯文本。
