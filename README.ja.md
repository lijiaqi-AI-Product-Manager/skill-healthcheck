# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | 日本語 | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center"><b>静かに止まった agent skill と、エージェントの挙動が変わった時点を見つける。</b><br>Claude Code · Codex · DeepSeek Harness</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.png" alt="skill-healthcheck: one checkup flags a skill whose upstream description changed" width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> 最近、エージェントが急に馬鹿になった？原因は三週間前に入れたあの skill かもしれません。

プラグインが壊れればすぐ分かります。インストールできない、エラーが出る、UI から消える。**しかし skill が壊れても分かりません**。`SKILL.md` はディスク上にあり、見た目は何も変わらないのに、モデルはもうそれを使わなくなります。上流が `description` を書き換えた、skill の名前を変えた、リポジトリを削除した。あるいは同じ名前のローカル skill が影を作っているかもしれません。気づくのは「最近エージェントの言うことを聞かない」「中国語で答えてくれなくなった」といった変化だけで、疑う先はモデルやプロンプトになってしまいます。

`skill-healthcheck` が答えるのはひとつだけです。

**いま入っているものはまだ動いているのか。動かなくなったのはどれで、いつからなのか。**

コマンドひとつ、チェック一回、出力は一画面。読み取り専用で、勝手に更新はしません。

```text
$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:27
Host     dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  +1 bundle
Skills   2: 2 ok · 0 updated upstream · 0 broken
Summary: everything still works; nothing for you to do
Recording started (2 entries). Every run from now on records what changed.

$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:27
Host     dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  +1 bundle
Skills   2: 1 ok · 1 updated upstream · 0 broken
      ↑ zh-writer        upstream changed the description: removed "Chinese" "paragraphs" "rewritten"; added "professional" "marketing" "posts"  ⚠ critical
Summary: 1 skill needs your review, one by one

$ skill-healthcheck why "stopped replying in Chinese"
why "stopped replying in Chinese" → Reply language changed (no longer Chinese / mixed languages)
Onset: share of Chinese in replies: ~100% before 2026-10-19, 0% that day (you kept asking in Chinese)
1. doc-writer           the description the model sees changed on 2026-10-19
     adds "professional tone"
     adds "Always respond in English"
     removed "structured" "clearly"
Ranked by time and keywords, not a verdict. Disable #1 first to confirm.
```

出力はシステムの言語に従います。`--lang zh` か `--lang en` で明示できます。

（上の出力は実際の `npm run demo` の結果です。2 つの skill はローカルの git リポジトリ由来で、セッションログは合成データです。）

## インストール

Node.js 22.19 以上と git が必要です。インストールせずに試す:

```bash
npx skill-healthcheck
```

インストールする場合:

```bash
npm install -g skill-healthcheck
```

ソースから入れる場合:

```bash
git clone https://github.com/lijiaqimun-coder/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

中国本土では npmmirror ミラーのほうが速いことが多いです: 上のどちらのコマンドにも `--registry=https://registry.npmmirror.com` を付けてください。


## 使い方

| コマンド | 動作 |
|---|---|
| `skill-healthcheck` | 一画面のチェック: ホスト、プラグイン、skill |
| `skill-healthcheck why "<症状>"` | 症状から時間軸をさかのぼって怪しい skill を特定します。例: `why "不用中文回答了"`。`--since 2026-10-01` も使えます |
| `skill-healthcheck log` | いつ何を入れて何が変わったかの記録（`~` はファイル時刻からの推定値） |
| `skill-healthcheck ls` | プラットフォームが実際に読み込む skill、影になっているもの、破棄されたもの |
| `skill-healthcheck adopt --repo <repo>` | 取得元をまとめて登録: ローカルの skill をリポジトリ側の skill と名前・内容で照合します。例: `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | 1 つの skill の取得元を登録: `github:owner/repo/path`、GitHub URL、`<git-url>#<path>` |
| `skill-healthcheck record` | スナップショットを 1 回だけ記録（フックや定期実行向け） |

共通オプション: `--all` すべて展開、`--json` 機械可読、`--offline` ネットワークなし、`--no-sessions` セッションログを読まない、`--lang zh|en` 出力言語（既定はシステムロケール。`SKILL_HEALTHCHECK_LANG` でも指定可）、`--explain` 上流の変更ごとに一文の平易な解説（下記）、`--platform dsh|generic`、`--profile <名前>`、`--cwd <プロジェクトディレクトリ>`。

終了コード: `0` 問題なし（更新可能も問題なし扱い）、`1` 壊れている（破棄・遮蔽・深すぎるネスト・壊れたプラグインを含む）、`2` 使い方の誤り、`3` ツール自体のエラー。そのまま CI に組み込めます。各検出には `--json` 利用者向けの固定コードがあります: [docs/findings.md](docs/findings.md)。

`.git` なしで skill をコピーしてきましたか？ 一度 `skill-healthcheck adopt --repo <コピー元リポジトリ>` を実行すれば上流チェックが動きます。フォルダ名を変えた skill は内容で照合されます。

## DeepSeek Harness の中で

同梱プラグイン [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) は dsh の中で動きます。

- dsh が起動するたび、および skill カタログが変わったと dsh が報告するたびにスナップショットを記録するので、作業中も記録が途切れません。
- チャットに `/skill-healthcheck` を追加します。いつもの一画面チェックに加えて `why <症状>`、`log`、`ls` も使えます。

dsh の Plugins ページから入れるか、次のコマンドで:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Claude Code と Codex と一緒に

dsh がなくても `skill-healthcheck` は汎用モードで動きます。各エージェントが実際に読み込む skill を、そのエージェント自身の規則で読みます:

- **Claude Code**（公式ドキュメントの規則）: `~/.claude/skills`、`~/.claude/skills/synced`、そして起動したディレクトリからリポジトリのルートまでの各階層にある `.claude/skills`。name は kebab-case でなくてもよく、description がなければ本文の 1 行目で代用し、frontmatter が壊れていても全フィールドを無視して読み込みます（モデルは description を見られなくなるため、これは報告されます）。個人の skill がプロジェクトの skill より優先されます。
- **Codex**（ソースコードの規則）: リポジトリのルートから起動ディレクトリまでの `.agents/skills`、`.codex/skills`、`~/.agents/skills`、`$CODEX_HOME/skills`、深さは最大 6 階層。description は必須で、同名の skill はどちらもモデルに列挙されます。

それぞれのセッションログ（`~/.claude/projects`、`~/.codex/sessions`）から履歴も補完します。モデルが時系列で見た skill カタログ、すべての skill 呼び出し、応答の言語。だから `why` もそこで動きます。同じ skill を両方のエージェントに入れても競合ではありません。

Claude Code のプラグインの skill（`/plugin:skill`）は Claude Code のプラグインマネージャーが導入・更新するため、ここでは走査も上流チェックも行いません。description の変化はセッションログ経由で `why` に届きます。

記録を自動で続けるには、`~/.claude/settings.json` のフックで Claude Code のセッション開始時に記録します:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Codex の場合は、cron かタスクスケジューラから 1 日 1 回 `skill-healthcheck record` を実行してください。

## 任意: `--explain`

`--explain` は上流の変更ごと、および `why` の第 1 候補の下に、一文の平易な解説を足します（「中国語ライティングではもう選ばれません」など）。既定では無効で、判定は変えません。次のうち使えるものを利用します:

| 環境 | プロバイダー |
|---|---|
| `ANTHROPIC_API_KEY`（または `ANTHROPIC_AUTH_TOKEN`） | Claude。`claude-opus-5-5` を低推論強度で、公式 SDK 経由、拒否時はサーバー側でフォールバック |
| `DEEPSEEK_API_KEY` | DeepSeek。`deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | OpenAI 互換の任意のエンドポイント（Ollama、vLLM など） |

`SKILL_HEALTHCHECK_LLM` で明示的に選び、`SKILL_HEALTHCHECK_LLM_MODEL` でモデルを変えられます。送るのは skill の変更前後のテキストと検出語だけで、セッションログは送りません。skill のテキストは信頼できないデータとして囲い、応答は一行に切り詰め、結果はキャッシュします。

## 何を検査するか

**skill: ローカル（オフライン、決定的）**

| 問題 | なぜ静かに壊れるのか |
|---|---|
| frontmatter が不正 | dsh と Codex は skill ごと捨て、Claude Code は description なしで読み込むため、モデルは決して選ばない |
| 同名の skill による影 | dsh はプロジェクト側のコピー、Claude Code は個人側のコピーが優先。Codex は両方を列挙し、モデルが誤って選ぶことがある |
| ネストが深すぎる | dsh と Claude Code は `<root>/<name>/SKILL.md` しか読まない。skill リポジトリごと clone すると 1 つも有効にならない |
| 置き場所が違う | dsh は `~/.claude/skills` や `~/.codex/skills` を走査しない |
| description がカタログ上限を超える | dsh は 500 文字、Codex は 1024 文字、Claude Code は 1536 文字で切り詰められ、末尾のトリガー語が失われる |
| 以前はよく呼ばれていたのに、ある日から呼ばれない | セッションログの証拠はどんな推測よりも強い |

**skill: 上流（git、任意のホスティング）**

| 上流の変化 | 影響 |
|---|---|
| `description` の変更 | ⚠ 最も危険: トリガー条件が変わり、今後呼ばれなくなる可能性。削除・追加された語を並べ、言語やトーンの規則に印を付ける |
| `name` の変更 / ディレクトリ移動 | `/旧名前` の入口が無効になる。新しい入口を提示する |
| リポジトリ削除 / skill 削除 | ローカルのコピーは保守されなくなる（明示的な 404 のみ削除と判定し、通信失敗は「確認できない」と報告） |
| `scripts/` に実行ファイルが増えた | 人がコードを確認する必要がある |
| description が長くなった、上限を超えた | 切り詰められるか、毎回余分にコンテキストを食う |
| 本文が長くなった | 1 回の呼び出しで余分に使う token 数（本文は必要時に読み込むので、他の skill を押し出さない） |
| プラットフォーム固有の記法が増えた | PowerShell の cmdlet、`brew`、`/usr/bin` など。あなたの環境では動かないかもしれない |

**プラグイン（dsh）**: profile に入れたプラグインが現在の dsh と互換か（`engines.dsh` / peerDependencies）、バージョン免除で動いていないか、npm に新しい版があるか、作者が非推奨にしていないか。

**結論の行はわざと非対称です**: `插件 2 个可一键升级；技能 3 个需你逐个确认`（プラグイン 2 個は一括更新、skill 3 個は 1 つずつ確認が必要）。プラグインは npm パッケージで、バージョンがあり、戻せます。skill はプロンプトで、上書きされたら元には戻らず、挙動が変わっても気づけません。だから人が見る必要があります。

## 帰属: `why`

ツールは初回実行から記録します（`~/.skill-healthcheck/journal.jsonl`）。何を入れ、何が変わり、何が消えたか、そして全バージョンの `SKILL.md` 全文。`why` はこの記録とエージェント自身のセッションログ（モデルが毎回見た skill カタログが時系列で入っている）を突き合わせて、疑わしい順に並べます。

- **症状レキシコン**: 「中国語で答えてくれなくなった」を言語系の規則（`respond in English`、`professional tone`、`默认使用英文` など）に対応づける
- **時間**: 症状の起点に近い変更ほど疑わしい。症状より後に起きた変更は重みを下げる
- **挙動の変化点**: セッションログから中国語回答の割合や skill 呼び出し回数を計算し、変化が始まった日を特定する

すべて決定的なコードで、LLM は呼びません。結果は安定し、テストできます。

## 実データで検証済み

公開 skill リポジトリ 15 件（anthropics/skills、obra/superpowers、vercel-labs/agent-skills、deepseek-ai/deepseek-harness など）から実際の `SKILL.md` 変更 74 件を集め、1 件ずつルールで判定しました。

| 変更の種類 | 検出 / 実際 |
|---|---:|
| description の変更 | 44 / 44 |
| name の変更 | 18 / 18 |
| ディレクトリ移動 | 20 / 20 |
| スクリプト追加 | 13 / 13 |

このデータでは、37 件の上流変更が description にあった語を削除し、16 件が name を変え、3 件は新しい版が dsh にそのまま破棄されます。データセット、再現手順、ルール調整は [research/EVAL.md](research/EVAL.md) にあります。

## データとプライバシー

- 読むのは skill ディレクトリ、dsh の profile、セッションログだけ。`~/.skill-healthcheck/` 以外にファイルを書きません。
- セッションログはローカルで読むだけで、キャッシュするのは派生データ（skill カタログ、呼び出し回数、日ごとの中国語回答の割合）のみ。会話本文は保存しません。
- 上流の検査は `~/.skill-healthcheck/cache/` の独立した bare リポジトリで行い、あなたの skill リポジトリを fetch したり変更したりしません。
- skill の frontmatter にある `metadata.source` は第三者が書くものなので、信頼しないデータとして扱います。受け付けるのは https/ssh/git/file の URL と絶対パスだけで、`--upload-pack=…` のようなオプション注入や `ext::` のようなトランスポートは拒否し、git が認証情報を尋ねることもありません。
- 既定でネットワークを使うのは 3 つだけ: skill 上流の `git fetch`、リポジトリの存在確認の GitHub API、プラグイン版の `npm view`。`--offline` で全部止まります。`--explain` を渡したときだけ 4 つ目が増え、skill の変更前後のテキストが設定した LLM プロバイダーへ送られます。
- 180 日より古いセッションログは読みません（`SKILL_HEALTHCHECK_SESSION_DAYS` で変更可）。すべて忘れたいときは `~/.skill-healthcheck/` を削除してください。

## 対応プラットフォーム

| プラットフォーム | 対応範囲 |
|---|---|
| DeepSeek Harness（dsh） | 完全: dsh の走査順と解析規則をそのまま再現し、セッションログを補完し、プラグインとホストも検査 |
| Claude Code と Codex（汎用モード） | 各エージェント固有の skill ルートと解析規則、ローカルと上流の検査、セッションログの補完 |

`~/.dsh/profiles` を検出すると自動で dsh モードになります。`--platform` で明示もできます。

## skill の取得元の決め方

エージェントは skill をどこから入れたかを記録しません。そのため次の順に探し、見つからなければ推測せず「取得元不明」と答えます。

1. `skill-healthcheck adopt` で登録された取得元
2. frontmatter の `metadata.source`
3. skill のディレクトリが git checkout なら、その `origin`

## 開発

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## ロードマップ

- [x] 記録、ローカルの静かな失敗の検査、セッションログの補完
- [x] 上流の生存確認と変更影響の評価
- [x] `why` による帰属
- [x] プラグインの互換性と更新可否の検査（dsh）
- [x] dsh プラグイン `dsh-skill-healthcheck`: ホスト起動時とカタログ変更時に記録し、`/skill-healthcheck` を追加
- [x] 中国語と英語の出力（`--lang`）
- [x] 任意の `--explain`: Claude、DeepSeek、OpenAI 互換モデルから変更ごとに一文
- [x] Claude Code と Codex のセッションログ補完

コントリビューション歓迎です。まず [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。セキュリティの問題は公開 issue ではなく [SECURITY.md](SECURITY.md) へ。

## License

MIT
