# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | 日本語 | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=20&pause=1200&color=3FB950&center=true&vCenter=true&width=720&lines=Find+skills+that+silently+stopped+working;Know+when+your+agent%27s+behavior+changed" alt="Find skills that silently stopped working">
</p>

<p align="center">
  <img src="docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> 最近、エージェントが急に馬鹿になった？原因は三週間前に入れたあの skill かもしれません。

プラグインが壊れればすぐ分かります。インストールできない、エラーが出る、UI から消える。**しかし skill が壊れても分かりません**。`SKILL.md` はディスク上にあり、見た目は何も変わらないのに、モデルはもうそれを使わなくなります。上流が `description` を書き換えた、skill の名前を変えた、リポジトリを削除した。あるいは同じ名前のローカル skill が影を作っているかもしれません。あなたが気づくのは「最近エージェントの言うことを聞かない」「中国語で答えてくれなくなった」といった変化だけで、疑う先はモデルやプロンプトになってしまいます。

`skill-healthcheck` が答えるのはひとつだけです。

**いま入っているものはまだ動いているのか。動かなくなったのはどれで、いつからなのか。**

コマンドひとつ、チェック一回、出力は一画面。読み取り専用で、勝手に更新はしません。

```text
$ skill-healthcheck --lang en
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 18:57
Host    dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  (+1 bundles)
Skills  2: 2 ok · 0 update · 0 broken
Summary: everything still works, nothing for you to do
Recording started (2 events). Every run now saves what changed.

$ skill-healthcheck --lang en
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 18:57
Host    dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  (+1 bundles)
Skills  2: 1 ok · 1 update · 0 broken
      ↑ zh-writer        Upstream changed the description: removed "paragraphs" "rewritten" "articles", added "professional" "marketing" "posts"  ⚠ critical
Summary: 1 skill needs you to review it

$ skill-healthcheck --lang en why "stopped replying in Chinese"
why "stopped replying in Chinese" → reply language changed
Onset: share of Chinese replies: ~100% before 2026-10-19, 0% that day (you were still asking in Chinese)
1. doc-writer           the description the model sees changed on 2026-10-19
     added "professional tone"
     added "Always respond in English"
     removed "structured" "clearly"
Ranked by time and keywords, not a verdict. Disable #1 first to confirm.
```

（ツールの出力は現在中国語です。英語出力はロードマップにあります。）

（上の出力は実際の `npm run demo` の結果です。2 つの skill はローカルの git リポジトリ由来で、セッションログは合成データです。）

## インストール

Node.js 22.19 以上と git が必要です。

```bash
npm install -g skill-healthcheck
```

まだ npm に公開されていない場合はソースから入れます。

```bash
git clone <this repo> && cd skill-healthcheck && npm install && npm run build && npm link
```

## 使い方

| コマンド                                  | 動作                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `skill-healthcheck`                       | 一画面のチェック：ホスト、プラグイン、skill                                                                        |
| `skill-healthcheck why "<症状>"`          | 症状から時間軸をさかのぼって怪しい skill を特定します。例：`why "不用中文回答了"`。`--since 2026-10-01` も使えます |
| `skill-healthcheck log`                   | いつ何を入れて何が変わったかの記録（`~` はファイル時刻からの推定値）                                               |
| `skill-healthcheck ls`                    | プラットフォームが実際に読み込む skill、影になっているもの、捨てられたもの                                         |
| `skill-healthcheck adopt <name> <source>` | skill の取得元を登録：`github:owner/repo/path`、GitHub URL、`<git-url>#<path>`                                     |
| `skill-healthcheck record`                | スナップショットを 1 回だけ記録（フックや定期実行向け）                                                            |

共通オプション：`--all` すべて展開、`--json` 機械可読、`--offline` ネットワークなし、`--no-sessions` セッションログを読まない、`--platform dsh|generic`、`--profile <名前>`、`--cwd <プロジェクトディレクトリ>`。

`check` は異常を見つけると終了コード 1 を返すので、CI に組み込めます。

## 何を検査するか

**skill：ローカル（オフライン、決定的）**

| 問題                                                                                | なぜ静かに壊れるのか                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| frontmatter が不正（name が kebab-case でない、真偽値の綴り違い、古いフィールド名） | dsh は skill ごと捨て、警告を 1 行ログに出すだけ                                                  |
| 同名の skill による影                                                               | プロジェクト側 `.dsh/skills` の同名 skill が、グローバルに入れたものを覆い隠す                    |
| ネストが深すぎる                                                                    | `<root>/<name>/SKILL.md` しか認識されない。skill リポジトリごと clone すると 1 つも有効にならない |
| 置き場所が違う                                                                      | dsh は `~/.claude/skills` や `~/.codex/skills` を走査しない                                       |
| description が 500 文字を超える                                                     | カタログ側で切り詰められ、末尾のトリガー語がモデルに届かない                                      |
| 以前はよく呼ばれていたのに、ある日から呼ばれない                                    | セッションログの証拠はどんな推測よりも強い                                                        |

**skill：上流（git、任意のホスティング）**

| 上流の変化                             | 影響                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `description` の変更                   | ⚠ 最も危険：トリガー条件が変わり、今後呼ばれなくなる可能性。削除・追加された語を並べ、言語やトーンの規則に印を付ける |
| `name` の変更 / ディレクトリ移動       | `/旧名前` の入口が無効になる。新しい入口を提示する                                                                   |
| リポジトリ削除 / skill 削除            | ローカルのコピーは保守されなくなる（明示的な 404 のみ削除と判定し、通信失敗は「確認できない」と報告）                |
| `scripts/` に実行ファイルが増えた      | 人がコードを確認する必要がある                                                                                       |
| description が長くなった、上限を超えた | 切り詰められるか、毎回余分にコンテキストを食う                                                                       |
| 本文が長くなった                       | 1 回の呼び出しで余分に使う token 数（本文は必要時に読み込むので、他の skill を押し出さない）                         |
| プラットフォーム固有の記法が増えた     | PowerShell の cmdlet、`brew`、`/usr/bin` など。あなたの環境では動かないかもしれない                                  |

**プラグイン（dsh）**：profile に入れたプラグインが現在の dsh と互換か（`engines.dsh` / peerDependencies）、バージョン免除で動いていないか、npm に新しい版があるか、作者が非推奨にしていないか。

**結論の行はわざと非対称です**：`插件 2 个可一键升级；技能 3 个需你逐个确认`（プラグイン 2 個は一括更新、skill 3 個は 1 つずつ確認が必要）。プラグインは npm パッケージで、バージョンがあり、戻せます。skill はプロンプトで、上書きされたら元には戻らず、挙動が変わっても気づけません。だから人が見る必要があります。

## 帰属：`why`

ツールは初回実行から記録を始めます（`~/.skill-healthcheck/journal.jsonl`）。何を入れ、何が変わり、何が消えたか、そして各バージョンの `SKILL.md` 全文。`why` はこの記録と dsh 自身のセッションログ（モデルが毎回見た skill カタログが時系列で入っている）を突き合わせて、疑わしい順に並べます。

- **症状レキシコン**：「中国語で答えてくれなくなった」を言語系の規則（`respond in English`、`professional tone`、`默认使用英文` など）に対応づける
- **時間**：症状の起点に近い変更ほど疑わしい。症状より後に起きた変更は重みを下げる
- **挙動の変化点**：セッションログから中国語回答の割合や skill 呼び出し回数を計算し、変化が始まった日を特定する

すべて決定的なコードで、LLM は呼びません。結果は安定し、テストできます。

## 実データで検証済み

公開 skill リポジトリ 15 件（anthropics/skills、obra/superpowers、vercel-labs/agent-skills、deepseek-ai/deepseek-harness など）から実際の `SKILL.md` 変更 74 件を集め、1 件ずつルールで判定しました。

| 変更の種類         | 検出 / 実際 |
| ------------------ | ----------: |
| description の変更 |     44 / 44 |
| name の変更        |     18 / 18 |
| ディレクトリ移動   |     20 / 20 |
| スクリプト追加     |     13 / 13 |

このデータでは、37 件の上流変更が description にあった語を削除し、16 件が name を変え、3 件は新しい版が dsh にそのまま捨てられます。データセット、再現手順、ルール調整は [research/EVAL.md](research/EVAL.md) にあります。

## データとプライバシー

- 読むのは skill ディレクトリ、dsh の profile、セッションログだけ。`~/.skill-healthcheck/` 以外にファイルを書きません。
- セッションログはローカルで読むだけで、キャッシュするのは派生データ（skill カタログ、呼び出し回数、日ごとの中国語回答の割合）のみ。会話本文は保存しません。
- 上流の検査は `~/.skill-healthcheck/cache/` の独立した bare リポジトリで行い、あなたの skill リポジトリを fetch したり変更したりしません。
- ネットワークを使うのは 3 つだけ：skill 上流の `git fetch`、リポジトリの存在確認のための GitHub API、プラグイン版の `npm view`。`--offline` で全部止まります。

## 対応プラットフォーム

| プラットフォーム                             | 対応範囲                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DeepSeek Harness（dsh）                      | 完全：dsh の走査順と解析規則をそのまま再現し、セッションログを補完し、プラグインとホストも検査 |
| 汎用 Agent Skills（Claude Code、Codex など） | `.agents/skills`、`.claude/skills`、`~/.codex/skills` を走査し、ローカルと上流の検査を実施     |

`~/.dsh/profiles` を検出すると自動で dsh モードになります。`--platform` で明示もできます。

## skill の取得元の決め方

dsh 自身は skill をどこから入れたかを記録しません。そのため次の順に探し、見つからなければ推測せず「取得元不明」と答えます。

1. `skill-healthcheck adopt` で登録された取得元
2. frontmatter の `metadata.source`
3. skill のディレクトリが git checkout なら、その `origin`

## 開発

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, lexicon
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## ロードマップ

- [x] 記録、ローカルの静かな失敗の検査、セッションログの補完
- [x] 上流の生存確認と変更影響の評価
- [x] `why` による帰属（最小版）
- [x] プラグインの互換性と更新可否の検査（dsh）
- [ ] dsh プラグインシェル `dsh-skill-healthcheck`：ホスト起動時の記録、skill 変更の監視、`/skill-healthcheck` の提供
- [ ] 任意の `--explain`：LLM で diff を一文に要約（既定は無効）
- [x] 英語出力（`--lang en`）

## License

MIT
