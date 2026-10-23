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
