# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | Deutsch | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center"><b>Finde Agent Skills, die still aufgehört haben zu funktionieren – und wann sich das Verhalten deines Agenten geändert hat.</b><br>Claude Code · Codex · DeepSeek Harness</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.png" alt="skill-healthcheck: one checkup flags a skill whose upstream description changed" width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> Dein Agent ist in letzter Zeit dümmer geworden? Vielleicht liegt es an dem Skill, das du vor drei Wochen installiert hast.

Wenn ein Plugin kaputtgeht, merkst du es sofort: es lässt sich nicht installieren, es wirft Fehler, es verschwindet aus der Oberfläche. **Wenn ein Skill kaputtgeht, merkst du es nie**: `SKILL.md` liegt weiter auf der Platte, alles sieht normal aus, und das Modell benutzt es einfach nicht mehr. Vielleicht hat der Upstream die `description` geändert, das Skill umbenannt, das Repository gelöscht — oder ein lokales Skill mit demselben Namen verdeckt es. Du bemerkst nur, dass „der Agent nicht mehr zuhört“ oder „nicht mehr auf Chinesisch antwortet“, und gibst dann dem Modell und deinen Prompts die Schuld.

`skill-healthcheck` beantwortet genau eine Frage:

**Funktioniert noch, was ich installiert habe? Was ist kaputt, und seit wann?**

Ein Befehl, ein Check, ein Bildschirm Ausgabe. Nur lesend, und es aktualisiert sich nie von selbst.

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

Die Ausgabe folgt der Sprache deines Systems; `--lang zh` oder `--lang en` erzwingt eine.

(Die Ausgabe oben stammt aus einem echten `npm run demo`-Lauf: beide Skills kommen aus lokalen Git-Repositories, das Sitzungsprotokoll ist synthetisch.)

## Installation

Erfordert Node.js 22.19+ und git. Ohne Installation ausprobieren:

```bash
npx skill-healthcheck
```

Oder installieren:

```bash
npm install -g skill-healthcheck
```

Aus dem Quellcode:

```bash
git clone https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

In Festlandchina installiert der npmmirror-Spiegel meist schneller: hänge `--registry=https://registry.npmmirror.com` an einen der beiden Befehle.


## Verwendung

| Befehl | Zweck |
|---|---|
| `skill-healthcheck` | Check auf einem Bildschirm: Host, Plugins, Skills |
| `skill-healthcheck why "<Symptom>"` | Geht die Zeitachse zurück zu verdächtigen Skills, z. B. `why "不用中文回答了"`; akzeptiert auch `--since 2026-10-01` |
| `skill-healthcheck log` | Journal darüber, was installiert wurde, was sich geändert hat und wann (`~` markiert aus Dateizeiten geschätzte Angaben) |
| `skill-healthcheck ls` | Welche Skills die Plattform tatsächlich lädt, welche verdeckt und welche verworfen werden |
| `skill-healthcheck adopt --repo <repo>` | Quellen gesammelt registrieren: gleicht lokale Skills mit denen des Repositories nach Name und Inhalt ab, z. B. `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | Quelle eines Skills registrieren: `github:owner/repo/path`, eine GitHub-URL oder `<git-url>#<path>` |
| `skill-healthcheck record` | Einen einzelnen Schnappschuss aufnehmen (für Hooks und geplante Jobs) |

Häufige Optionen: `--all` alles aufklappen, `--json` maschinenlesbar, `--offline` ohne Netzwerk, `--no-sessions` Sitzungsprotokolle ignorieren, `--lang zh|en` Ausgabesprache (Standard: System-Locale; auch `SKILL_HEALTHCHECK_LANG`), `--explain` ein Satz Klartext pro Upstream-Änderung (siehe unten), `--platform dsh|generic`, `--profile <Name>`, `--cwd <Projektverzeichnis>`.

Exit-Codes: `0` alles in Ordnung (verfügbare Updates zählen als in Ordnung), `1` etwas ist kaputt (inklusive verworfener, verdeckter oder zu tief verschachtelter Skills und kaputter Plugins), `2` Nutzungsfehler, `3` interner Fehler. Passt direkt in die CI. Jeder Befund hat einen stabilen Code für `--json`-Konsumenten: [docs/findings.md](docs/findings.md).

Skills ohne ihr `.git` kopiert? Führe einmal `skill-healthcheck adopt --repo <das Repository, aus dem sie kamen>` aus, damit die Upstream-Prüfungen funktionieren. Skills mit umbenanntem Ordner werden über den Inhalt zugeordnet.

## In DeepSeek Harness

Das Begleit-Plugin [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) läuft in dsh:

- es nimmt bei jedem dsh-Start einen Schnappschuss auf, und erneut immer wenn dsh meldet, dass sich der Skill-Katalog geändert hat, damit das Journal während der Arbeit keine Lücken hat;
- es fügt `/skill-healthcheck` in den Chat ein: derselbe Check auf einem Bildschirm, plus `why <Symptom>`, `log` und `ls`.

Installiere es über die Plugins-Seite in dsh, oder:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Mit Claude Code und Codex

Ohne dsh läuft `skill-healthcheck` im generischen Modus. Es liest die Skills, die jeder Agent tatsächlich lädt, mit den Regeln des jeweiligen Agenten:

- **Claude Code** (laut seiner Dokumentation): `~/.claude/skills`, `~/.claude/skills/synced` und `.claude/skills` in jedem Ordner von deinem Startverzeichnis bis zur Repository-Wurzel. Namen müssen nicht kebab-case sein, eine fehlende description wird durch die erste Zeile des Bodys ersetzt, und ein kaputtes Frontmatter wird ohne alle Felder geladen — das wird gemeldet, weil das Modell die description dann nie sieht. Persönliche Skills gewinnen gegen Projekt-Skills.
- **Codex** (laut seinem Quellcode): `.agents/skills` von der Repository-Wurzel bis zu deinem Startverzeichnis, `.codex/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`, bis zu sechs Ordner tief. Eine description ist Pflicht; gleichnamige Skills werden dem Modell beide gelistet.

Es füllt außerdem die Historie aus den Sitzungsprotokollen der beiden nach (`~/.claude/projects`, `~/.codex/sessions`): der Skill-Katalog, den das Modell über die Zeit gesehen hat, jeder Skill-Aufruf und die Sprache der Antworten. `why` funktioniert also auch dort. Ein Skill, der für beide Agenten installiert ist, ist kein Konflikt.

Skills aus Claude-Code-Plugins (`/plugin:skill`) werden vom Plugin-Manager von Claude Code installiert und aktualisiert, deshalb werden sie hier nicht gescannt und ihr Upstream nicht geprüft; ihre description-Änderungen erreichen `why` trotzdem über die Sitzungsprotokolle.

Damit das Journal von selbst weiterläuft, zeichne zu Beginn jeder Claude-Code-Sitzung mit einem Hook in `~/.claude/settings.json` auf:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Für Codex führe `skill-healthcheck record` einmal täglich aus cron oder der Aufgabenplanung aus.

## Optional: `--explain`

`--explain` ergänzt einen Satz Klartext unter jeder Upstream-Änderung („es wird nicht mehr für chinesisches Schreiben ausgewählt“) und unter dem ersten `why`-Verdächtigen. Standardmäßig aus, und es ändert nie ein Urteil. Es nutzt, was du hast:

| Umgebung | Anbieter |
|---|---|
| `ANTHROPIC_API_KEY` (oder `ANTHROPIC_AUTH_TOKEN`) | Claude, `claude-opus-5-5` mit geringem Aufwand, über das offizielle SDK, mit serverseitigem Fallback bei Ablehnungen |
| `DEEPSEEK_API_KEY` | DeepSeek, `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | jeder OpenAI-kompatible Endpunkt (Ollama, vLLM, …) |

`SKILL_HEALTHCHECK_LLM` wählt eines explizit und `SKILL_HEALTHCHECK_LLM_MODEL` ändert das Modell. Gesendet werden nur der Vorher/Nachher-Text des Skills und die erkannten Wörter, nie Sitzungsprotokolle. Der Skill-Text wird als nicht vertrauenswürdige Daten eingegrenzt, Antworten werden auf eine Zeile gekürzt und Antworten werden zwischengespeichert.

## Was geprüft wird

**Skills: lokal (offline, deterministisch)**

| Problem | Warum es still fehlschlägt |
|---|---|
| Ungültiges Frontmatter | dsh und Codex verwerfen das ganze Skill; Claude Code lädt es ohne description, sodass das Modell es nie wählt |
| Von einem gleichnamigen Skill verdeckt | Bei dsh gewinnt die Projekt-Kopie, bei Claude Code die persönliche; Codex listet beide und das Modell wählt vielleicht falsch |
| Zu tief verschachtelt | dsh und Claude Code lesen nur `<root>/<name>/SKILL.md`; ein komplett geklontes Skill-Repository aktiviert dort kein einziges Skill |
| Falsches Verzeichnis | dsh durchsucht weder `~/.claude/skills` noch `~/.codex/skills` |
| description über dem Kataloglimit | dsh schneidet bei 500 Zeichen ab, Codex bei 1024, Claude Code bei 1536: die Triggerwörter am Ende gehen verloren |
| Früher oft genutzt, dann eines Tages nie wieder | Die Belege aus dem Sitzungsprotokoll sind stärker als jede Vermutung |

**Skills: Upstream (git, jede Hosting-Plattform)**

| Upstream-Änderung | Auswirkung |
|---|---|
| `description` geändert | ⚠ Höchstes Risiko: Die Auslösebedingungen haben sich geändert und das Skill wird vielleicht nie wieder aufgerufen. Es listet die entfernten und hinzugefügten Wörter und markiert Sprach-/Ton-Regeln |
| `name` geändert / Verzeichnis verschoben | Der Einstieg `/alter-name` funktioniert nicht mehr; du bekommst den neuen genannt |
| Repository gelöscht / Skill gelöscht | Deine lokale Kopie ist nicht mehr gepflegt (nur ein eindeutiges 404 gilt als Löschung; Netzwerkfehler melden „konnte nicht prüfen“) |
| Neue ausführbare Datei in `scripts/` | Ein Mensch muss den Code prüfen |
| description länger geworden oder über dem Limit | Sie wird abgeschnitten oder kostet in jedem Turn mehr Kontext |
| Body länger geworden | Wie viele zusätzliche Tokens jeder Aufruf kostet (der Body wird bei Bedarf geladen und verdrängt daher keine anderen Skills) |
| Neue plattformspezifische Syntax | PowerShell-Cmdlets, `brew`, `/usr/bin` zum Beispiel — läuft auf deinem System vielleicht nicht |

**Plugins (dsh)**: ob die in einem Profile installierten Plugins mit der aktuellen dsh-Version kompatibel sind (`engines.dsh` / peerDependencies), ob sie über eine Versionsausnahme laufen, ob npm eine neuere Version hat und ob der Autor sie als veraltet markiert hat.

**Die Zusammenfassungszeile ist absichtlich asymmetrisch**: `插件 2 个可一键升级；技能 3 个需你逐个确认` („2 Plugins lassen sich auf einmal aktualisieren; 3 Skills musst du einzeln prüfen“). Plugins sind npm-Pakete mit Versionsnummer und Rollback; Skills sind Prompts — einmal überschrieben, ist die alte Version weg, und wenn sich das Verhalten geändert hat, merkst du es nicht. Deshalb muss ein Mensch draufschauen.

## Zuordnung: `why`

Das Tool protokolliert ab dem allerersten Lauf (`~/.skill-healthcheck/journal.jsonl`): was installiert, was geändert, was gelöscht wurde, mit dem vollständigen Text jeder Version jedes `SKILL.md`. `why` kombiniert dieses Journal mit den Sitzungsprotokollen des Agenten (die den Skill-Katalog enthalten, den das Modell jeweils gesehen hat, in zeitlicher Reihenfolge) und sortiert die Verdächtigen:

- **Symptom-Lexikon**: ordnet „antwortet nicht mehr auf Chinesisch“ Sprachregeln zu (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Zeit**: Änderungen näher am Symptombeginn sind verdächtiger; spätere Änderungen werden abgewertet
- **Verhaltensumschlag**: berechnet aus den Sitzungsprotokollen den Anteil chinesischer Antworten und die Aufrufzahlen, um den Tag des Wandels zu finden

Alles ist deterministischer Code ohne LLM-Aufrufe, die Ergebnisse sind stabil und testbar.

## Mit echten Daten validiert

Wir haben 74 echte `SKILL.md`-Änderungen aus 15 öffentlichen Skill-Repositories gesammelt (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness und andere) und die Regeln auf jede einzelne angewendet:

| Änderungsart | Erkannt / tatsächlich |
|---|---:|
| description geändert | 44 / 44 |
| name geändert | 18 / 18 |
| Verzeichnis verschoben | 20 / 20 |
| Skripte hinzugefügt | 13 / 13 |

In diesem Datensatz haben 37 Upstream-Änderungen Wörter aus der description entfernt, 16 das Skill umbenannt und 3 eine neue Version erzeugt, die dsh direkt verwirft. Datensatz, Reproduktionsschritte und Regelabstimmung stehen in [research/EVAL.md](research/EVAL.md).

## Daten und Privatsphäre

- Liest nur deine Skill-Verzeichnisse, dsh-Profile und Sitzungsprotokolle; schreibt nichts außerhalb von `~/.skill-healthcheck/`.
- Sitzungsprotokolle werden nur lokal gelesen, und nur abgeleitete Daten werden zwischengespeichert (Skill-Katalog, Aufrufzahlen, täglicher Anteil chinesischer Antworten). Gesprächstexte werden nie gespeichert.
- Upstream-Prüfungen laufen in separaten Bare-Repositories unter `~/.skill-healthcheck/cache/`; es wird nie in deine eigenen Skill-Repositories gefetcht oder dort etwas verändert.
- Das `metadata.source` im Frontmatter eines Skills schreibt ein Dritter, deshalb gilt es als nicht vertrauenswürdig: akzeptiert werden nur https/ssh/git/file-URLs und absolute Pfade, Options-Injection wie `--upload-pack=…` und Transporte wie `ext::` werden abgelehnt, und git fragt nie nach Zugangsdaten.
- Netzwerkzugriff passiert standardmäßig genau drei Dinge: `git fetch` der Skill-Upstreams, die GitHub-API fragen, ob ein Repository noch existiert, und `npm view` für Plugin-Versionen. `--offline` schaltet alles ab. `--explain` fügt ein viertes hinzu, nur wenn du es übergibst: der Vorher/Nachher-Text des Skills geht an den konfigurierten LLM-Anbieter.
- Sitzungsprotokolle, die älter als 180 Tage sind, werden übersprungen (`SKILL_HEALTHCHECK_SESSION_DAYS` ändert das). Um alles zu vergessen, lösche `~/.skill-healthcheck/`.

## Plattformunterstützung

| Plattform | Umfang |
|---|---|
| DeepSeek Harness (dsh) | Vollständig: bildet Scan-Reihenfolge und Parsing-Regeln von dsh nach, füllt Sitzungsprotokolle nach, prüft Plugins und Host |
| Claude Code und Codex (generischer Modus) | Die Skill-Wurzeln und Parsing-Regeln des jeweiligen Agenten, lokale und Upstream-Prüfungen, Nachfüllen aus den Sitzungsprotokollen |

Bei erkanntem `~/.dsh/profiles` schaltet es automatisch in den dsh-Modus; mit `--platform` lässt sich das auch erzwingen.

## Wie die Quelle eines Skills bestimmt wird

Die Agenten halten nicht fest, woher ein Skill installiert wurde, deshalb probiert das Tool diese Reihenfolge und sagt sonst „Quelle unbekannt“, statt zu raten:

1. Eine mit `skill-healthcheck adopt` registrierte Quelle
2. `metadata.source` im Frontmatter
3. Das Skill-Verzeichnis ist ein Git-Checkout → dessen `origin` verwenden

## Entwicklung

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## Roadmap

- [x] Journal, lokale Prüfung stiller Fehlschläge, Nachfüllen der Sitzungsprotokolle
- [x] Upstream-Verfügbarkeit und Bewertung der Änderungsauswirkungen
- [x] `why`-Zuordnung
- [x] Plugin-Kompatibilität und Update-Prüfung (dsh)
- [x] dsh-Plugin `dsh-skill-healthcheck`: protokolliert beim Host-Start und bei Katalogänderungen, fügt `/skill-healthcheck` hinzu
- [x] Chinesische und englische Ausgabe (`--lang`)
- [x] Optionales `--explain`: ein Satz pro Änderung von Claude, DeepSeek oder jedem OpenAI-kompatiblen Modell
- [x] Nachfüllen der Sitzungsprotokolle von Claude Code und Codex

Beiträge sind willkommen: lies zuerst [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitsprobleme bitte über [SECURITY.md](SECURITY.md) statt über ein öffentliches Issue.

## License

MIT
