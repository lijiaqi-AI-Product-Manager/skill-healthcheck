# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | Português

<p align="center">
  <a href="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center"><b>Encontre agent skills que pararam de funcionar em silêncio e quando o comportamento do seu agente mudou.</b><br>Claude Code · Codex · DeepSeek Harness</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.png" alt="skill-healthcheck: one checkup flags a skill whose upstream description changed" width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> Seu agente ficou mais burro ultimamente? Pode ser aquele skill que você instalou três semanas atrás.

Quando um plugin quebra, você percebe na hora: não instala, dá erro, some da interface. **Quando um skill quebra, você nunca fica sabendo**: o `SKILL.md` continua no disco, tudo parece normal, e o modelo simplesmente para de usá-lo. Talvez o upstream tenha mudado a `description`, renomeado o skill, apagado o repositório — ou um skill local com o mesmo nome esteja cobrindo o seu. Você só nota que "o agente parou de obedecer" ou que "ele não responde mais em chinês", e acaba culpando o modelo e os seus prompts.

O `skill-healthcheck` responde a uma única pergunta:

**O que eu instalei ainda funciona? O que quebrou, e desde quando?**

Um comando, uma verificação, uma tela de saída. Somente leitura, e nunca se atualiza sozinho.

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

A saída segue o idioma do seu sistema; `--lang zh` ou `--lang en` escolhem um.

(A saída acima vem de uma execução real de `npm run demo`: os dois skills vêm de repositórios git locais e o log de sessão é sintético.)

## Instalação

Requer Node.js 22.19+ e git. Experimente sem instalar:

```bash
npx skill-healthcheck
```

Ou instale:

```bash
npm install -g skill-healthcheck
```

A partir do código-fonte:

```bash
git clone https://github.com/lijiaqimun-coder/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

Na China continental o espelho npmmirror costuma instalar mais rápido: adicione `--registry=https://registry.npmmirror.com` a qualquer um dos dois comandos.


## Uso

| Comando | O que faz |
|---|---|
| `skill-healthcheck` | Verificação em uma tela: host, plugins, skills |
| `skill-healthcheck why "<sintoma>"` | Volta na linha do tempo até os skills suspeitos, por exemplo `why "不用中文回答了"`; também aceita `--since 2026-10-01` |
| `skill-healthcheck log` | Registro do que foi instalado, do que mudou e quando (`~` indica horários estimados pela data dos arquivos) |
| `skill-healthcheck ls` | Quais skills a plataforma realmente carrega, quais estão cobertos e quais são descartados |
| `skill-healthcheck adopt --repo <repo>` | Registra origens em lote: casa os skills locais com os do repositório por nome e conteúdo, por exemplo `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | Registra a origem de um skill: `github:owner/repo/path`, uma URL do GitHub ou `<git-url>#<path>` |
| `skill-healthcheck record` | Registra um único snapshot (para hooks e tarefas agendadas) |

Opções comuns: `--all` expandir tudo, `--json` legível por máquina, `--offline` sem rede, `--no-sessions` ignorar os logs de sessão, `--lang zh|en` idioma da saída (padrão: locale do sistema; também `SKILL_HEALTHCHECK_LANG`), `--explain` uma frase clara por mudança no upstream (veja abaixo), `--platform dsh|generic`, `--profile <nome>`, `--cwd <diretório do projeto>`.

Códigos de saída: `0` tudo certo (atualizações disponíveis contam como certo), `1` algo quebrado (incluindo skills descartados, cobertos ou aninhados fundo demais, e plugins quebrados), `2` erro de uso, `3` erro interno. Serve direto para CI. Cada achado tem um código estável para consumidores de `--json`: [docs/findings.md](docs/findings.md).

Copiou seus skills sem o `.git`? Rode uma vez `skill-healthcheck adopt --repo <o repositório de onde vieram>` para as verificações de upstream funcionarem. Skills cuja pasta foi renomeada são casados por conteúdo.

## Dentro do DeepSeek Harness

O plugin companheiro [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) roda dentro do dsh:

- registra um snapshot toda vez que o dsh inicia, e de novo sempre que o dsh informa que o catálogo de skills mudou, para o diário não ter lacunas enquanto você trabalha;
- adiciona `/skill-healthcheck` ao chat: a mesma verificação de uma tela, mais `why <sintoma>`, `log` e `ls`.

Instale pela página Plugins do dsh, ou:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Com Claude Code e Codex

Sem o dsh, o `skill-healthcheck` funciona no modo genérico. Ele lê os skills que cada agente realmente carrega, com as regras do próprio agente:

- **Claude Code** (segundo a documentação dele): `~/.claude/skills`, `~/.claude/skills/synced` e `.claude/skills` em cada pasta desde onde você inicia até a raiz do repositório. Os nomes não precisam estar em kebab-case, uma description ausente usa a primeira linha do corpo, e um frontmatter quebrado carrega sem nenhum campo — isso é reportado porque o modelo então nunca vê a description. Skills pessoais ganham dos skills do projeto.
- **Codex** (segundo o código-fonte dele): `.agents/skills` da raiz do repositório até onde você inicia, `.codex/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`, até seis pastas de profundidade. A description é obrigatória; skills de mesmo nome são ambos listados ao modelo.

Ele também preenche o histórico a partir dos logs de sessão de cada um (`~/.claude/projects`, `~/.codex/sessions`): o catálogo de skills que o modelo viu ao longo do tempo, cada chamada de skill e o idioma das respostas. Então `why` também funciona lá. Um skill instalado para os dois agentes não é conflito.

Skills de plugins do Claude Code (`/plugin:skill`) são instalados e atualizados pelo gerenciador de plugins do Claude Code, então não são varridos nem têm o upstream verificado; as mudanças de description deles ainda chegam ao `why` pelos logs de sessão.

Para o diário continuar sozinho, registre no início de cada sessão do Claude Code com um hook em `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Para o Codex, rode `skill-healthcheck record` pelo cron ou pelo Agendador de Tarefas uma vez por dia.

## Opcional: `--explain`

`--explain` acrescenta uma frase clara sob cada mudança no upstream ("ele não será mais escolhido para escrever em chinês") e sob o primeiro suspeito do `why`. Fica desligado por padrão e nunca muda um veredito. Usa o que você tiver:

| Ambiente | Provedor |
|---|---|
| `ANTHROPIC_API_KEY` (ou `ANTHROPIC_AUTH_TOKEN`) | Claude, `claude-opus-5-5` com esforço baixo, pelo SDK oficial, com fallback no servidor em caso de recusa |
| `DEEPSEEK_API_KEY` | DeepSeek, `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | qualquer endpoint compatível com OpenAI (Ollama, vLLM, …) |

`SKILL_HEALTHCHECK_LLM` escolhe um explicitamente e `SKILL_HEALTHCHECK_LLM_MODEL` troca o modelo. Só o texto antes/depois do skill e as palavras detectadas são enviados, nunca os logs de sessão. O texto do skill é delimitado como dado não confiável, as respostas são cortadas em uma linha e as respostas são cacheadas.

## O que ele verifica

**Skills: local (offline, determinístico)**

| Problema | Por que falha em silêncio |
|---|---|
| frontmatter inválido | o dsh e o Codex descartam o skill inteiro; o Claude Code carrega sem description, então o modelo nunca o escolhe |
| Coberto por um skill de mesmo nome | No dsh vence a cópia do projeto, no Claude Code a pessoal; o Codex lista as duas e o modelo pode escolher errado |
| Aninhamento profundo demais | dsh e Claude Code só leem `<root>/<name>/SKILL.md`; clone um repositório inteiro de skills ali e nenhum entra em vigor |
| Diretório errado | o dsh não varre `~/.claude/skills` nem `~/.codex/skills` |
| description acima do limite do catálogo | o dsh corta em 500 caracteres, o Codex em 1024, o Claude Code em 1536: as palavras de ativação do final se perdem |
| Antes era muito invocado e um dia deixou de ser | A evidência do log de sessão vale mais do que qualquer dedução |

**Skills: upstream (git, qualquer plataforma de hospedagem)**

| Mudança no upstream | Impacto |
|---|---|
| `description` alterada | ⚠ Risco máximo: as condições de ativação mudaram e o skill pode nunca mais ser invocado. Ele lista as palavras removidas e adicionadas e sinaliza regras de idioma/tom |
| `name` alterado / diretório movido | O ponto de entrada `/nome-antigo` para de funcionar; ele informa o novo |
| Repositório apagado / skill apagado | Sua cópia local fica sem manutenção (apenas um 404 explícito conta como exclusão; falhas de rede são reportadas como "não foi possível verificar") |
| Novo executável em `scripts/` | Uma pessoa precisa revisar o código |
| description ficou maior ou passou do limite | Ela é truncada, ou ocupa mais contexto a cada turno |
| Corpo ficou maior | Quantos tokens extras cada invocação custa (o corpo é carregado sob demanda, então não desloca outros skills) |
| Nova sintaxe específica de plataforma | Cmdlets do PowerShell, `brew`, `/usr/bin`, por exemplo — pode não rodar no seu sistema |

**Plugins (dsh)**: se os plugins instalados em um profile são compatíveis com a versão atual do dsh (`engines.dsh` / peerDependencies), se rodam graças a uma isenção de versão, se o npm tem uma versão mais nova e se o autor os marcou como obsoletos.

**A linha de conclusão é assimétrica de propósito**: `插件 2 个可一键升级；技能 3 个需你逐个确认` ("2 plugins podem ser atualizados de uma vez; 3 skills precisam ser revisados um a um"). Plugins são pacotes npm com número de versão e rollback; skills são prompts — uma vez sobrescrito, a versão antiga se foi, e se o comportamento mudou você não saberia. Por isso uma pessoa precisa olhar.

## Atribuição: `why`

A ferramenta começa a registrar desde a primeira execução (`~/.skill-healthcheck/journal.jsonl`): o que foi instalado, o que mudou, o que foi apagado, com o texto completo de cada versão de cada `SKILL.md`. O `why` combina esse diário com os logs de sessão do próprio agente (que contêm, em ordem, o catálogo de skills que o modelo viu a cada vez) para ordenar os suspeitos:

- **Léxico de sintomas**: mapeia "parou de responder em chinês" para regras de idioma (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Tempo**: mudanças mais próximas do início do sintoma são mais suspeitas; as que vieram depois perdem peso
- **Ponto de mudança de comportamento**: calcula a proporção de respostas em chinês e o número de invocações a partir dos logs de sessão para achar o dia em que a mudança começou

Tudo é código determinístico, sem chamadas a LLM, então os resultados são estáveis e testáveis.

## Validado com dados reais

Reunimos 74 mudanças reais de `SKILL.md` em 15 repositórios públicos de skills (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness, entre outros) e aplicamos as regras a cada uma:

| Tipo de mudança | Detectadas / reais |
|---|---:|
| description alterada | 44 / 44 |
| name alterado | 18 / 18 |
| diretório movido | 20 / 20 |
| scripts adicionados | 13 / 13 |

Neste conjunto, 37 mudanças no upstream removeram palavras que estavam na description, 16 renomearam o skill e 3 geraram uma versão que o dsh descarta de imediato. O conjunto de dados, os passos de reprodução e o ajuste das regras estão em [research/EVAL.md](research/EVAL.md).

## Dados e privacidade

- Lê apenas seus diretórios de skills, os profiles do dsh e os logs de sessão; não escreve nada fora de `~/.skill-healthcheck/`.
- Os logs de sessão são lidos somente no local, e apenas dados derivados são cacheados (catálogo de skills, número de invocações, proporção diária de respostas em chinês). O texto das conversas nunca é armazenado.
- As verificações de upstream rodam em repositórios bare separados em `~/.skill-healthcheck/cache/`; ele nunca faz fetch nem modifica os seus próprios repositórios de skills.
- O `metadata.source` no frontmatter de um skill é escrito por terceiros, então é tratado como não confiável: só URLs https/ssh/git/file e caminhos absolutos são aceitos, injeções de opção como `--upload-pack=…` e transportes como `ext::` são recusados, e o git nunca pede credenciais.
- O acesso à rede faz exatamente três coisas por padrão: `git fetch` dos upstreams de skills, consultar a API do GitHub para saber se um repositório ainda existe e `npm view` para versões de plugins. O `--offline` desliga tudo. O `--explain` acrescenta uma quarta, só quando você o passa: o texto antes/depois do skill vai para o provedor de LLM que você configurou.
- Logs de sessão com mais de 180 dias são ignorados (`SKILL_HEALTHCHECK_SESSION_DAYS` muda isso). Para esquecer tudo, apague `~/.skill-healthcheck/`.

## Plataformas suportadas

| Plataforma | Nível de suporte |
|---|---|
| DeepSeek Harness (dsh) | Completo: reproduz a ordem de varredura e as regras de parsing do dsh, preenche os logs de sessão e verifica plugins e host |
| Claude Code e Codex (modo genérico) | Raízes de skills e regras de parsing de cada agente, verificações locais e de upstream, preenchimento a partir dos logs de sessão |

Ele entra no modo dsh automaticamente quando detecta `~/.dsh/profiles`; você também pode forçar com `--platform`.

## Como a origem de um skill é determinada

Os agentes não registram de onde o skill foi instalado, então a ferramenta tenta nesta ordem e, se não achar, diz "origem desconhecida" em vez de adivinhar:

1. Uma origem registrada com `skill-healthcheck adopt`
2. `metadata.source` no frontmatter
3. O diretório do skill é um checkout git → usar o `origin` dele

## Desenvolvimento

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## Roteiro

- [x] Diário, verificação local de falhas silenciosas, preenchimento dos logs de sessão
- [x] Verificação de disponibilidade do upstream e avaliação do impacto das mudanças
- [x] Atribuição com `why`
- [x] Compatibilidade de plugins e verificação de atualizações (dsh)
- [x] Plugin do dsh `dsh-skill-healthcheck`: registra na inicialização do host e em mudanças de catálogo, adiciona `/skill-healthcheck`
- [x] Saída em chinês e inglês (`--lang`)
- [x] `--explain` opcional: uma frase por mudança do Claude, DeepSeek ou qualquer modelo compatível com OpenAI
- [x] Preenchimento dos logs de sessão do Claude Code e do Codex

Contribuições são bem-vindas: leia [CONTRIBUTING.md](CONTRIBUTING.md) primeiro. Para problemas de segurança, use [SECURITY.md](SECURITY.md) em vez de uma issue pública.

## License

MIT
