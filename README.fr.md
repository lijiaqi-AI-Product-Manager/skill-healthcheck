# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | Français | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> Votre agent est devenu plus bête récemment ? C'est peut-être ce skill installé il y a trois semaines.

Quand un plugin casse, vous le savez tout de suite : il ne s'installe pas, il plante, il disparaît de l'interface. **Quand un skill casse, vous ne le savez jamais** : `SKILL.md` est toujours sur le disque, tout semble normal, et le modèle cesse simplement de s'en servir. L'upstream a peut-être modifié la `description`, renommé le skill, supprimé le dépôt — ou un skill local du même nom le masque. Tout ce que vous remarquez, c'est que « l'agent n'écoute plus » ou qu'« il ne répond plus en chinois », et vous finissez par blâmer le modèle et vos prompts.

`skill-healthcheck` répond à une seule question :

**Ce que j'ai installé fonctionne-t-il encore ? Qu'est-ce qui a cassé, et depuis quand ?**

Une commande, un bilan, un écran de sortie. En lecture seule, et il ne met jamais rien à jour tout seul.

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

La sortie suit la langue de votre système ; `--lang zh` ou `--lang en` en impose une.

(La sortie ci-dessus provient d'une vraie exécution de `npm run demo` : les deux skills viennent de dépôts git locaux et le journal de session est synthétique.)

## Installation

Nécessite Node.js 22.19+ et git.

```bash
npm install -g skill-healthcheck
```

Depuis les sources :

```bash
git clone https://github.com/lijiaqimun-coder/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

## Utilisation

| Commande | Rôle |
|---|---|
| `skill-healthcheck` | Bilan en un écran : host, plugins, skills |
| `skill-healthcheck why "<symptôme>"` | Remonte la chronologie pour isoler les skills suspects, par ex. `why "不用中文回答了"` ; accepte aussi `--since 2026-10-01` |
| `skill-healthcheck log` | Journal de ce qui a été installé, de ce qui a changé et quand (`~` signale une heure estimée d'après la date des fichiers) |
| `skill-healthcheck ls` | Quels skills la plateforme charge réellement, lesquels sont masqués, lesquels sont écartés |
| `skill-healthcheck adopt --repo <repo>` | Enregistre les sources en bloc : apparie les skills locaux avec ceux du dépôt par nom et par contenu, par ex. `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | Enregistre la source d'un skill : `github:owner/repo/path`, une URL GitHub ou `<git-url>#<path>` |
| `skill-healthcheck record` | Enregistre une seule instantané (pour les hooks et les tâches planifiées) |

Options courantes : `--all` tout déplier, `--json` lisible par machine, `--offline` sans réseau, `--no-sessions` ignorer les journaux de session, `--lang zh|en` langue de sortie (par défaut la locale du système ; aussi `SKILL_HEALTHCHECK_LANG`), `--explain` une phrase claire par changement upstream (voir plus bas), `--platform dsh|generic`, `--profile <nom>`, `--cwd <dossier du projet>`.

Codes de sortie : `0` tout va bien (les mises à jour disponibles comptent comme bon), `1` quelque chose est cassé (y compris skills écartés, masqués ou imbriqués trop profond, et plugins cassés), `2` erreur d'usage. À brancher directement dans la CI. Chaque constat a un code stable pour les consommateurs de `--json` : [docs/findings.md](docs/findings.md).

Vous avez copié vos skills sans leur `.git` ? Lancez une fois `skill-healthcheck adopt --repo <le dépôt d'origine>` pour que les vérifications upstream fonctionnent. Les skills dont le dossier a été renommé sont appariés par contenu.

## Dans DeepSeek Harness

Le plugin compagnon [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) s'exécute dans dsh :

- il enregistre un instantané à chaque démarrage de dsh, et de nouveau chaque fois que dsh signale que le catalogue de skills a changé, pour que le journal n'ait aucun trou pendant que vous travaillez ;
- il ajoute `/skill-healthcheck` au chat : le même bilan en un écran, plus `why <symptôme>`, `log` et `ls`.

Installez-le depuis la page Plugins de dsh, ou :

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Avec Claude Code et Codex

Sans dsh, `skill-healthcheck` fonctionne en mode générique. Il lit les skills que chaque agent charge réellement (Claude Code : `.claude/skills`, `~/.claude/skills` ; Codex : `.codex/skills`, `.agents/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`) et reconstitue l'historique depuis leurs journaux de session (`~/.claude/projects`, `~/.codex/sessions`) : le catalogue de skills vu par le modèle au fil du temps, chaque appel de skill et la langue des réponses. `why` fonctionne donc là aussi. Un skill installé pour les deux agents n'est pas un conflit ; deux copies du même nom pour un seul agent en sont un.

Pour que le journal continue tout seul, enregistrez au début de chaque session Claude Code avec un hook dans `~/.claude/settings.json` :

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Pour Codex, lancez `skill-healthcheck record` depuis cron ou le Planificateur de tâches une fois par jour.

## Facultatif : `--explain`

`--explain` ajoute une phrase claire sous chaque changement upstream (« il ne sera plus choisi pour l'écriture en chinois ») et sous le premier suspect de `why`. Désactivé par défaut, il ne change jamais un verdict. Il utilise ce que vous avez :

| Environnement | Fournisseur |
|---|---|
| `ANTHROPIC_API_KEY` (ou `ANTHROPIC_AUTH_TOKEN`) | Claude, `claude-opus-5-5` en effort faible, via le SDK officiel, avec repli côté serveur en cas de refus |
| `DEEPSEEK_API_KEY` | DeepSeek, `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | n'importe quel endpoint compatible OpenAI (Ollama, vLLM, …) |

`SKILL_HEALTHCHECK_LLM` en choisit un explicitement et `SKILL_HEALTHCHECK_LLM_MODEL` change le modèle. Seuls le texte avant/après du skill et les mots détectés sont envoyés, jamais les journaux de session. Le texte du skill est délimité comme donnée non fiable, les réponses sont coupées à une ligne et les réponses sont mises en cache.

## Ce qu'il vérifie

**Skills : local (hors ligne, déterministe)**

| Problème | Pourquoi l'échec est silencieux |
|---|---|
| frontmatter invalide (name pas en kebab-case, booléen mal orthographié, ancien nom de champ) | dsh écarte le skill entier et n'écrit qu'une ligne d'avertissement dans le log |
| Masqué par un skill de même nom | Un skill du même nom dans le `.dsh/skills` du projet masque celui installé globalement |
| Imbrication trop profonde | Seul `<root>/<name>/SKILL.md` est reconnu ; clonez un dépôt de skills entier à cet endroit et aucun ne s'active |
| Mauvais dossier | dsh n'analyse ni `~/.claude/skills` ni `~/.codex/skills` |
| description de plus de 500 caractères | Elle est tronquée dans le catalogue, donc le modèle ne voit jamais les mots déclencheurs de la fin |
| Longtemps utilisé, puis plus jamais invoqué du jour au lendemain | Les preuves du journal de session valent mieux que n'importe quelle déduction |

**Skills : upstream (git, n'importe quelle plateforme d'hébergement)**

| Changement upstream | Impact |
|---|---|
| `description` modifiée | ⚠ Risque maximal : les conditions de déclenchement ont changé et le skill pourrait ne plus jamais être invoqué. L'outil liste les mots supprimés et ajoutés, et signale les règles de langue/ton |
| `name` modifié / dossier déplacé | Le point d'entrée `/ancien-nom` cesse de fonctionner ; l'outil indique le nouveau |
| Dépôt supprimé / skill supprimé | Votre copie locale n'est plus maintenue (seul un 404 explicite compte comme suppression ; un échec réseau est signalé comme « vérification impossible ») |
| Nouvel exécutable dans `scripts/` | Un humain doit relire le code |
| description plus longue ou au-delà de la limite | Elle est tronquée, ou consomme plus de contexte à chaque tour |
| Corps plus long | Combien de tokens supplémentaires coûte chaque invocation (le corps est chargé à la demande, il n'évince donc pas les autres skills) |
| Nouvelle syntaxe propre à une plateforme | Cmdlets PowerShell, `brew`, `/usr/bin`, par exemple : cela peut ne pas fonctionner sur votre système |

**Plugins (dsh)** : si les plugins installés dans un profile sont compatibles avec la version actuelle de dsh (`engines.dsh` / peerDependencies), s'ils tournent grâce à une exemption de version, si npm propose une version plus récente et si l'auteur les a dépréciés.

**La ligne de conclusion est volontairement asymétrique** : `插件 2 个可一键升级；技能 3 个需你逐个确认` (« 2 plugins se mettent à jour d'un coup ; 3 skills demandent une vérification un par un »). Les plugins sont des paquets npm, avec un numéro de version et la possibilité de revenir en arrière ; les skills sont des prompts : une fois écrasés, la version précédente a disparu, et si le comportement a changé vous ne le saurez pas. C'est donc à un humain de regarder.

## Attribution : `why`

L'outil commence à journaliser dès le premier lancement (`~/.skill-healthcheck/journal.jsonl`) : ce qui a été installé, ce qui a changé, ce qui a été supprimé, avec le texte intégral de chaque version de chaque `SKILL.md`. `why` croise ce journal avec les journaux de session de dsh (qui contiennent, dans l'ordre, le catalogue de skills vu par le modèle à chaque fois) pour classer les suspects :

- **Lexique de symptômes** : associe « il ne répond plus en chinois » à des règles de langue (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Temps** : les changements les plus proches du début du symptôme sont les plus suspects ; ceux survenus après sont pondérés à la baisse
- **Point de rupture** : calcule la part de réponses en chinois et le nombre d'invocations à partir des journaux de session pour trouver le jour où le changement a commencé

Tout est du code déterministe, sans appel à un LLM : les résultats sont stables et testables.

## Validé sur des données réelles

Nous avons collecté 74 modifications réelles de `SKILL.md` dans 15 dépôts publics de skills (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness, entre autres) et appliqué les règles à chacune :

| Type de changement | Détectés / réels |
|---|---:|
| description modifiée | 44 / 44 |
| name modifié | 18 / 18 |
| dossier déplacé | 20 / 20 |
| scripts ajoutés | 13 / 13 |

Dans ce jeu de données, 37 changements upstream ont retiré des mots présents dans la description, 16 ont renommé le skill et 3 ont produit une version que dsh écarte purement et simplement. Le jeu de données, les étapes de reproduction et le réglage des règles se trouvent dans [research/EVAL.md](research/EVAL.md).

## Données et confidentialité

- Ne lit que vos dossiers de skills, les profiles dsh et les journaux de session ; n'écrit rien en dehors de `~/.skill-healthcheck/`.
- Les journaux de session sont lus uniquement en local, et seules des données dérivées sont mises en cache (catalogue de skills, nombre d'invocations, part quotidienne de réponses en chinois). Le texte des conversations n'est jamais stocké.
- Les vérifications upstream s'exécutent dans des dépôts bare séparés sous `~/.skill-healthcheck/cache/` ; l'outil ne fait jamais de fetch dans vos propres dépôts de skills et ne les modifie pas.
- Le `metadata.source` du frontmatter d'un skill est écrit par un tiers : il est traité comme non fiable. Seules les URL https/ssh/git/file et les chemins absolus sont acceptés, les injections d'options comme `--upload-pack=…` et les transports comme `ext::` sont refusés, et git ne demande jamais d'identifiants.
- L'accès réseau fait exactement trois choses par défaut : `git fetch` des upstreams de skills, interroger l'API GitHub pour savoir si un dépôt existe encore, et `npm view` pour les versions des plugins. `--offline` coupe tout. `--explain` en ajoute une quatrième, seulement si vous le passez : le texte avant/après du skill part vers le fournisseur de LLM que vous avez configuré.
- Les journaux de session de plus de 180 jours sont ignorés (`SKILL_HEALTHCHECK_SESSION_DAYS` change cela). Pour tout oublier, supprimez `~/.skill-healthcheck/`.

## Plateformes prises en charge

| Plateforme | Niveau de prise en charge |
|---|---|
| DeepSeek Harness (dsh) | Complet : reproduit l'ordre d'analyse et les règles de parsing de dsh, complète les journaux de session, vérifie les plugins et le host |
| Claude Code et Codex (mode générique) | Racines de skills propres à chaque agent, vérifications locales et upstream, complétion depuis les journaux des deux agents |

Il passe automatiquement en mode dsh lorsqu'il détecte `~/.dsh/profiles` ; vous pouvez aussi le forcer avec `--platform`.

## Comment la source d'un skill est déterminée

dsh ne conserve pas l'origine d'installation d'un skill, l'outil essaie donc dans cet ordre et, à défaut, répond « source inconnue » au lieu de deviner :

1. Une source enregistrée avec `skill-healthcheck adopt`
2. `metadata.source` dans le frontmatter
3. Le dossier du skill est un checkout git → utiliser son `origin`

## Développement

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## Feuille de route

- [x] Journal, détection locale des échecs silencieux, complétion des journaux de session
- [x] Vérification de la disponibilité de l'upstream et évaluation de l'impact des changements
- [x] Attribution `why`
- [x] Compatibilité des plugins et vérification des mises à jour (dsh)
- [x] Plugin dsh `dsh-skill-healthcheck` : journalise au démarrage du host et au changement de catalogue, ajoute `/skill-healthcheck`
- [x] Sortie en chinois et en anglais (`--lang`)
- [x] `--explain` facultatif : une phrase par changement depuis Claude, DeepSeek ou tout modèle compatible OpenAI
- [x] Complétion des journaux de session de Claude Code et Codex

## License

MIT
