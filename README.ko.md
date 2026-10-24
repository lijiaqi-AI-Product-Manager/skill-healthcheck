# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center"><b>조용히 멈춘 agent skill과 에이전트 동작이 언제 바뀌었는지 찾아냅니다.</b><br>Claude Code · Codex · DeepSeek Harness</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.png" alt="skill-healthcheck: one checkup flags a skill whose upstream description changed" width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> 요즘 에이전트가 갑자기 멍청해졌나요? 3주 전에 설치한 그 skill이 원인일 수 있습니다.

플러그인이 고장 나면 바로 알 수 있습니다. 설치가 안 되고, 오류가 나고, UI에서 사라집니다. **하지만 skill이 고장 나면 알 수 없습니다**. `SKILL.md`는 디스크에 그대로 있고 겉보기에는 멀쩡한데, 모델이 더 이상 그것을 쓰지 않습니다. 업스트림이 `description`을 바꿨거나, skill 이름을 바꿨거나, 저장소를 지웠을 수 있습니다. 같은 이름의 로컬 skill이 그 위를 덮고 있을 수도 있습니다. 당신이 느끼는 것은 "요즘 에이전트가 말을 안 듣는다", "중국어로 답하지 않는다" 정도이고, 의심은 모델과 프롬프트로 향합니다.

`skill-healthcheck`는 한 가지 질문에만 답합니다.

**내가 설치한 것이 지금도 쓸모가 있나? 쓸모없어진 것은 어느 것이고, 언제부터인가?**

명령 하나, 점검 한 번, 출력 한 화면. 읽기 전용이며 스스로 업데이트하지 않습니다.

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

출력 언어는 시스템 로케일을 따릅니다. `--lang zh` 또는 `--lang en`으로 지정할 수 있습니다.

(위 출력은 실제 `npm run demo` 결과입니다. 두 skill은 로컬 git 저장소에서 왔고, 세션 로그는 합성 데이터입니다.)

## 설치

Node.js 22.19 이상과 git이 필요합니다. 설치 없이 사용해 보려면:

```bash
npx skill-healthcheck
```

설치하려면:

```bash
npm install -g skill-healthcheck
```

소스에서 설치하려면:

```bash
git clone https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

중국 본토에서는 npmmirror 미러가 보통 더 빠릅니다: 위 두 명령 중 어느 쪽이든 `--registry=https://registry.npmmirror.com`를 붙이면 됩니다.


## 사용법

| 명령 | 하는 일 |
|---|---|
| `skill-healthcheck` | 한 화면 점검: 호스트, 플러그인, skill |
| `skill-healthcheck why "<증상>"` | 증상에서 시간축을 거슬러 올라가 의심스러운 skill을 찾습니다. 예: `why "不用中文回答了"`. `--since 2026-10-01`도 지원합니다 |
| `skill-healthcheck log` | 무엇을 설치했고 무엇이 바뀌었는지, 언제인지 기록 (`~`는 파일 시각으로 추정한 값) |
| `skill-healthcheck ls` | 플랫폼이 실제로 불러오는 skill, 가려진 것, 버려진 것 |
| `skill-healthcheck adopt --repo <repo>` | 출처를 한꺼번에 등록: 로컬 skill을 저장소의 skill과 이름·내용으로 대조합니다. 예: `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | skill 하나의 출처 등록: `github:owner/repo/path`, GitHub URL, `<git-url>#<path>` |
| `skill-healthcheck record` | 스냅샷을 한 번만 기록 (훅·스케줄 작업용) |

공통 옵션: `--all` 전체 펼치기, `--json` 기계 판독용, `--offline` 네트워크 차단, `--no-sessions` 세션 로그 무시, `--lang zh|en` 출력 언어(기본값은 시스템 로케일, `SKILL_HEALTHCHECK_LANG`으로도 지정), `--explain` 업스트림 변경마다 한 문장 해설(아래 참고), `--platform dsh|generic`, `--profile <이름>`, `--cwd <프로젝트 디렉터리>`.

종료 코드: `0` 문제 없음(업데이트 가능도 정상으로 봄), `1` 고장(버려짐·가려짐·너무 깊은 중첩·고장 난 플러그인 포함), `2` 사용법 오류, `3` 도구 자체 오류. 그대로 CI에 넣을 수 있습니다. 모든 발견 항목에는 `--json` 소비자를 위한 고정 코드가 있습니다: [docs/findings.md](docs/findings.md).

`.git` 없이 skill을 복사해 오셨나요? `skill-healthcheck adopt --repo <복사해 온 저장소>`를 한 번 실행하면 업스트림 검사가 동작합니다. 폴더 이름이 바뀐 skill은 내용으로 대조합니다.

## DeepSeek Harness 안에서

동반 플러그인 [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck)은 dsh 안에서 동작합니다.

- dsh가 시작할 때마다, 그리고 skill 카탈로그가 바뀌었다고 dsh가 알릴 때마다 스냅샷을 기록하므로 작업 중에도 기록이 끊기지 않습니다.
- 채팅에 `/skill-healthcheck`를 추가합니다. 평소의 한 화면 점검에 더해 `why <증상>`, `log`, `ls`도 쓸 수 있습니다.

dsh의 Plugins 페이지에서 설치하거나 다음 명령으로:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Claude Code, Codex와 함께

dsh가 없어도 `skill-healthcheck`는 일반 모드로 동작합니다. 각 에이전트가 실제로 불러오는 skill을 그 에이전트 자신의 규칙으로 읽습니다:

- **Claude Code**(공식 문서 기준): `~/.claude/skills`, `~/.claude/skills/synced`, 그리고 시작한 디렉터리부터 저장소 루트까지 각 단계의 `.claude/skills`. name은 kebab-case가 아니어도 되고, description이 없으면 본문 첫 줄로 대신하며, frontmatter가 깨져도 모든 필드를 무시하고 불러옵니다(모델이 description을 보지 못하게 되므로 이 경우 보고합니다). 개인 skill이 프로젝트 skill보다 우선합니다.
- **Codex**(소스 코드 기준): 저장소 루트부터 시작 디렉터리까지의 `.agents/skills`, `.codex/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`, 최대 6단계 깊이. description은 필수이며, 같은 이름의 skill은 둘 다 모델에 나열됩니다.

각자의 세션 로그(`~/.claude/projects`, `~/.codex/sessions`)에서 이력도 채웁니다. 모델이 시간순으로 본 skill 카탈로그, 모든 skill 호출, 응답 언어까지. 그래서 `why`도 거기서 동작합니다. 같은 skill을 두 에이전트에 설치한 것은 충돌이 아닙니다.

Claude Code 플러그인의 skill(`/plugin:skill`)은 Claude Code의 플러그인 관리자가 설치·업데이트하므로 여기서 스캔하거나 업스트림을 검사하지 않습니다. description 변경은 세션 로그를 통해 `why`에 전달됩니다.

기록을 자동으로 이어가려면 `~/.claude/settings.json`의 훅으로 Claude Code 세션 시작 시 기록하세요:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Codex는 cron이나 작업 스케줄러에서 하루 한 번 `skill-healthcheck record`를 실행하면 됩니다.

## 선택 사항: `--explain`

`--explain`은 업스트림 변경마다, 그리고 `why` 1순위 의심 항목 아래에 한 문장 해설을 붙입니다("중국어 글쓰기에는 더 이상 선택되지 않습니다" 같은). 기본값은 꺼짐이고 판정은 바꾸지 않습니다. 사용 가능한 것 중에서 고릅니다:

| 환경 | 제공자 |
|---|---|
| `ANTHROPIC_API_KEY` (또는 `ANTHROPIC_AUTH_TOKEN`) | Claude. `claude-opus-5-5`를 낮은 추론 강도로, 공식 SDK 경유, 거부 시 서버 측 폴백 |
| `DEEPSEEK_API_KEY` | DeepSeek. `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | OpenAI 호환 엔드포인트 아무거나 (Ollama, vLLM 등) |

`SKILL_HEALTHCHECK_LLM`으로 명시적으로 고르고 `SKILL_HEALTHCHECK_LLM_MODEL`로 모델을 바꿀 수 있습니다. 보내는 것은 skill의 변경 전후 텍스트와 감지된 단어뿐이며 세션 로그는 보내지 않습니다. skill 텍스트는 신뢰할 수 없는 데이터로 감싸고, 응답은 한 줄로 자르고, 결과는 캐시합니다.

## 무엇을 검사하나

**skill: 로컬 (오프라인, 결정적)**

| 문제 | 왜 조용히 실패하나 |
|---|---|
| frontmatter가 잘못됨 | dsh와 Codex는 skill 전체를 버리고, Claude Code는 description 없이 불러오므로 모델이 선택하지 않습니다 |
| 같은 이름 skill에 가려짐 | dsh는 프로젝트 사본, Claude Code는 개인 사본이 이깁니다. Codex는 둘 다 나열해 모델이 잘못 고를 수 있습니다 |
| 너무 깊게 중첩됨 | dsh와 Claude Code는 `<root>/<name>/SKILL.md`만 읽습니다. skill 저장소를 통째로 clone하면 하나도 적용되지 않습니다 |
| 잘못된 디렉터리 | dsh는 `~/.claude/skills`나 `~/.codex/skills`를 스캔하지 않습니다 |
| description이 카탈로그 상한을 넘음 | dsh는 500자, Codex는 1024자, Claude Code는 1536자에서 잘려 끝부분의 트리거 단어가 사라집니다 |
| 예전에는 자주 호출되다가 어느 날부터 호출되지 않음 | 세션 로그의 증거가 어떤 추론보다 강합니다 |

**skill: 업스트림 (git, 모든 호스팅)**

| 업스트림 변화 | 영향 |
|---|---|
| `description` 변경 | ⚠ 가장 위험: 트리거 조건이 바뀌어 다시는 호출되지 않을 수 있습니다. 삭제·추가된 단어를 나열하고 언어·톤 규칙을 표시합니다 |
| `name` 변경 / 디렉터리 이동 | `/옛이름` 진입점이 동작하지 않습니다. 새 진입점을 알려줍니다 |
| 저장소 삭제 / skill 삭제 | 로컬 사본은 더 이상 관리되지 않습니다 (명확한 404만 삭제로 판정하고, 네트워크 실패는 "확인할 수 없음"으로 보고) |
| `scripts/`에 실행 파일 추가 | 사람이 코드를 검토해야 합니다 |
| description이 길어짐 또는 상한 초과 | 잘리거나, 매번 컨텍스트를 더 차지합니다 |
| 본문이 길어짐 | 호출마다 추가로 쓰는 token 수 (본문은 필요할 때 로드하므로 다른 skill을 밀어내지 않습니다) |
| 플랫폼 전용 문법 추가 | PowerShell cmdlet, `brew`, `/usr/bin` 등. 당신의 시스템에서는 실행되지 않을 수 있습니다 |

**플러그인 (dsh)**: profile에 설치된 플러그인이 현재 dsh와 호환되는지(`engines.dsh` / peerDependencies), 버전 예외로 돌고 있지는 않은지, npm에 새 버전이 있는지, 작성자가 폐기했는지.

**결론 줄은 일부러 비대칭입니다**: `插件 2 个可一键升级；技能 3 个需你逐个确认` ("플러그인 2개는 한 번에 업그레이드, skill 3개는 하나씩 확인 필요"). 플러그인은 npm 패키지라 버전이 있고 되돌릴 수 있습니다. skill은 프롬프트라서 덮어쓰면 원본이 사라지고, 동작이 바뀌어도 알 수 없습니다. 그래서 사람이 봐야 합니다.

## 원인 추적: `why`

도구는 첫 실행부터 기록합니다(`~/.skill-healthcheck/journal.jsonl`). 무엇을 설치했고 무엇이 바뀌었고 무엇이 삭제되었는지, 그리고 모든 버전의 `SKILL.md` 전문을 저장합니다. `why`는 이 기록과 에이전트 자체의 세션 로그(모델이 매번 본 skill 카탈로그가 시간순으로 들어 있음)를 결합해 의심 항목의 순위를 매깁니다.

- **증상 사전**: "중국어로 답하지 않는다"를 언어 관련 규칙(`respond in English`, `professional tone`, `默认使用英文` 등)에 대응시킵니다
- **시간**: 증상 시작점에 가까운 변경일수록 의심스럽고, 증상 이후의 변경은 가중치를 낮춥니다
- **행동 변화점**: 세션 로그에서 중국어 응답 비율과 skill 호출 횟수를 계산해 변화가 시작된 날을 찾습니다

전부 결정적 코드이고 LLM을 호출하지 않으므로 결과가 안정적이며 테스트할 수 있습니다.

## 실제 데이터로 검증

공개 skill 저장소 15곳(anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness 등)에서 실제 `SKILL.md` 변경 74건을 모아 규칙으로 하나씩 판정했습니다.

| 변경 유형 | 보고 / 실제 |
|---|---:|
| description 변경 | 44 / 44 |
| name 변경 | 18 / 18 |
| 디렉터리 이동 | 20 / 20 |
| 스크립트 추가 | 13 / 13 |

이 데이터에서 업스트림 변경 37건이 description에 있던 단어를 지웠고, 16건이 name을 바꿨으며, 3건은 새 버전이 dsh에서 그대로 버려집니다. 데이터셋, 재현 방법, 규칙 조정은 [research/EVAL.md](research/EVAL.md)에 있습니다.

## 데이터와 프라이버시

- skill 디렉터리, dsh profile, 세션 로그만 읽습니다. `~/.skill-healthcheck/` 밖에는 아무 파일도 쓰지 않습니다.
- 세션 로그는 로컬에서만 읽고, 캐시하는 것은 파생 데이터(skill 카탈로그, 호출 횟수, 일별 중국어 응답 비율)뿐입니다. 대화 원문은 저장하지 않습니다.
- 업스트림 검사는 `~/.skill-healthcheck/cache/`의 별도 bare 저장소에서 수행하며, 당신의 skill 저장소를 fetch하거나 수정하지 않습니다.
- skill frontmatter의 `metadata.source`는 제3자가 쓰는 값이므로 신뢰하지 않는 데이터로 다룹니다. https/ssh/git/file URL과 절대 경로만 허용하고, `--upload-pack=…` 같은 옵션 주입이나 `ext::` 같은 트랜스포트는 거부하며, git이 자격 증명을 묻지도 않습니다.
- 기본적으로 네트워크는 세 가지만 씁니다: skill 업스트림 `git fetch`, 저장소 존재 확인용 GitHub API, 플러그인 버전 확인용 `npm view`. `--offline`이면 전부 꺼집니다. `--explain`을 넘길 때만 네 번째가 추가되어 skill의 변경 전후 텍스트가 설정한 LLM 제공자로 전송됩니다.
- 180일이 지난 세션 로그는 읽지 않습니다(`SKILL_HEALTHCHECK_SESSION_DAYS`로 변경). 전부 잊으려면 `~/.skill-healthcheck/`를 지우면 됩니다.

## 플랫폼 지원

| 플랫폼 | 지원 범위 |
|---|---|
| DeepSeek Harness(dsh) | 전체: dsh의 스캔 순서와 파싱 규칙을 그대로 따르고, 세션 로그를 채우며, 플러그인과 호스트까지 검사 |
| Claude Code와 Codex(일반 모드) | 각 에이전트의 skill 루트와 파싱 규칙, 로컬·업스트림 검사, 세션 로그 채우기 |

`~/.dsh/profiles`가 감지되면 자동으로 dsh 모드가 됩니다. `--platform`으로 지정할 수도 있습니다.

## skill 출처를 정하는 방법

에이전트는 skill을 어디서 설치했는지 기록하지 않습니다. 그래서 다음 순서로 찾고, 없으면 추측하지 않고 "출처 알 수 없음"이라고 답합니다.

1. `skill-healthcheck adopt`로 등록한 출처
2. frontmatter의 `metadata.source`
3. skill 디렉터리가 git checkout이면 그 `origin`

## 개발

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## 로드맵

- [x] 기록, 로컬 조용한 실패 검사, 세션 로그 채우기
- [x] 업스트림 생존 확인과 변경 영향 평가
- [x] `why` 원인 추적
- [x] 플러그인 호환성과 업그레이드 가능 여부 검사(dsh)
- [x] dsh 플러그인 `dsh-skill-healthcheck`: 호스트 시작 시와 카탈로그 변경 시 기록, `/skill-healthcheck` 추가
- [x] 중국어와 영어 출력(`--lang`)
- [x] 선택적 `--explain`: Claude, DeepSeek, OpenAI 호환 모델에서 변경마다 한 문장
- [x] Claude Code와 Codex 세션 로그 채우기

기여를 환영합니다. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 보안 문제는 공개 이슈 대신 [SECURITY.md](SECURITY.md)를 이용해 주세요.

## License

MIT
