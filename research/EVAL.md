# 规则在真实数据上的表现

数据：[`upstream-changes.jsonl`](upstream-changes.jsonl)，来自 15 个公开仓库的 74 条真实 `SKILL.md` 变更（收集方法和校验见 [upstream-changes.README.md](upstream-changes.README.md)）。其中 7 条是删除，属于上游存活检查，不进入影响评估，剩下 67 条。

复现：

```bash
npm run build
node scripts/corpus-eval.mjs --os windows   # 也可以 --os macos / linux
```

脚本会从 GitHub 取每条变更前后两个版本的 `SKILL.md`（缓存在 `research/.cache/`），对每条跑一遍 `assessImpact`，再和人工标注的变更类型对比。

## 召回（标注了某类变更时，规则有没有报出来）

| 标注类型 | 报出 / 标注 | 说明 |
|---|---:|---|
| description 被改 | 44 / 44 | |
| name 被改 | 18 / 18 | 其中 3 条新 name 不合法，报为"上游新版本会被静默丢弃" |
| 目录移动 | 20 / 20 | |
| 新增脚本 | 13 / 13 | |
| 正文变长 | 16 / 18 | 漏掉的 2 条新版本本身不合法，规则直接报"会被丢弃"而不再细评，这是有意的 |
| 平台专用写法 | 2 / 4（Windows） | 漏掉的 2 条人工复核后认为标注偏宽：新增内容是"在 PowerShell 里要这样写"的跨平台说明，不会在其他平台失效 |

## 严重度分布（Windows，67 条）

| 规则 | 严重度 | 条数 |
|---|---|---:|
| description 被改（删了词） | critical | 37 |
| description 被扩写（只加词） | medium | 4 |
| name 被改 | critical | 16 |
| 新版本不合法、会被丢弃 | critical | 3 |
| 新增脚本 | high | 13 |
| description 超过 500 字符被截断 | high | 6 |
| 平台专用写法 | medium | 3 |
| 技能在仓库里被移动 | medium | 5 |
| 正文变长 | low | 16 |
| description 变长 | low | 6 |

## 根据数据做的调整

- description 只新增词、没删词时，从 critical 降为 medium：这类改动多半是扩大触发范围，不会让技能"从此不再触发"。如果新增的是语言、语气这类规则，仍报 high。
- 比较删词时先做词形归一，`discovers` → `discover` 不算删掉了触发词。
- 平台词表删掉了 8 条误报多的规则，比如会匹配任何 Markdown 行内代码的反引号规则、PowerShell 7 也支持的 `&&`。

## 这份评测没有测什么

- **只有召回，没有精度。** 74 条都标注了"确实变了"，没有负样本，所以"规则会不会误报"不在数字里。误报主要靠人工复核和外部评审发现：1.0.2 修掉了 `metadata.source` 造成的永久 minor、改名加重写被报成"上游删除"、本地路径笔误被报成"仓库消失"这几类。
- **"目录移动"和"新增脚本"两行是规则级验证，不是发现级验证。** `scripts/corpus-eval.mjs` 直接把标注的 `path_before/path_after` 和 `scripts_added` 传给 `assessImpact`，测的是"知道答案之后规则会不会开火"，没有走 `findMovedSkill` 的相似度匹配和 git tree 比对。真实发现链路在 `test/upstream.test.ts` 和 `test/regressions.test.ts` 里用本地裸仓库端到端覆盖。
- **语料以英文为主。** `description_before/after` 里没有中文样本，CJK 分支（分词、字符权重）没有被这批数据校准过。
- **同一批数据既调参又报成绩。** 74 条用来改规则（上一节），再用来算召回，属于同分布自评，没有留出盲测集。
