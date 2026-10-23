# skill-healthcheck

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Español | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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

> ¿Tu agente se ha vuelto más torpe últimamente? Puede ser ese skill que instalaste hace tres semanas.

Cuando un plugin se rompe, te enteras al instante: no instala, lanza errores, desaparece de la interfaz. **Cuando un skill se rompe, nunca te enteras**: `SKILL.md` sigue en disco, todo parece normal y el modelo simplemente deja de usarlo. Puede que el upstream haya cambiado la `description`, haya renombrado el skill, haya borrado el repositorio, o que un skill local con el mismo nombre lo esté tapando. Lo único que notas es que "el agente ya no obedece" o que "ya no responde en chino", y acabas culpando al modelo y a tus prompts.

`skill-healthcheck` responde una sola pregunta:

**¿Lo que instalé sigue sirviendo? ¿Qué se rompió y desde cuándo?**

Un comando, una revisión, una pantalla de salida. Solo lectura, y nunca se actualiza por su cuenta.

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

La salida sigue el idioma de tu sistema; `--lang zh` o `--lang en` eligen uno.

(La salida anterior es de una ejecución real de `npm run demo`: los dos skills vienen de repositorios git locales y el registro de sesión es sintético.)

## Instalación

Requiere Node.js 22.19+ y git.

```bash
npm install -g skill-healthcheck
```

Desde el código fuente:

```bash
git clone https://github.com/lijiaqimun-coder/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

## Uso

| Comando | Qué hace |
|---|---|
| `skill-healthcheck` | Revisión en una pantalla: host, plugins, skills |
| `skill-healthcheck why "<síntoma>"` | Retrocede por la línea de tiempo hasta los skills sospechosos, p. ej. `why "不用中文回答了"`; también acepta `--since 2026-10-01` |
| `skill-healthcheck log` | Registro de qué se instaló, qué cambió y cuándo (`~` marca horas estimadas a partir de la fecha de los archivos) |
| `skill-healthcheck ls` | Qué skills carga realmente la plataforma, cuáles están tapados y cuáles se descartan |
| `skill-healthcheck adopt --repo <repo>` | Registra orígenes en bloque: empareja los skills locales con los del repositorio por nombre y contenido, p. ej. `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | Registra el origen de un skill: `github:owner/repo/path`, una URL de GitHub o `<git-url>#<path>` |
| `skill-healthcheck record` | Registra una única instantánea (para hooks y tareas programadas) |

Opciones comunes: `--all` expandir todo, `--json` legible por máquina, `--offline` sin red, `--no-sessions` ignorar los registros de sesión, `--lang zh|en` idioma de salida (por defecto el locale del sistema; también `SKILL_HEALTHCHECK_LANG`), `--explain` una frase llana por cada cambio upstream (ver abajo), `--platform dsh|generic`, `--profile <nombre>`, `--cwd <directorio del proyecto>`.

Códigos de salida: `0` todo bien (las actualizaciones disponibles cuentan como bien), `1` algo está roto (incluidos skills descartados, tapados o anidados demasiado profundo, y plugins rotos), `2` error de uso. Encaja directamente en CI. Cada hallazgo tiene un código estable para consumidores de `--json`: [docs/findings.md](docs/findings.md).

¿Copiaste tus skills sin su `.git`? Ejecuta una vez `skill-healthcheck adopt --repo <el repositorio del que vinieron>` para que funcionen las comprobaciones upstream. Los skills cuya carpeta se renombró se emparejan por contenido.

## Dentro de DeepSeek Harness

El plugin complementario [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) se ejecuta dentro de dsh:

- registra una instantánea cada vez que arranca dsh, y otra siempre que dsh informa de que el catálogo de skills cambió, así el diario no tiene huecos mientras trabajas;
- añade `/skill-healthcheck` al chat: la misma revisión de una pantalla, más `why <síntoma>`, `log` y `ls`.

Instálalo desde la página Plugins de dsh, o:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## Con Claude Code y Codex

Sin dsh, `skill-healthcheck` funciona en modo genérico. Lee los skills que cada agente carga realmente (Claude Code: `.claude/skills`, `~/.claude/skills`; Codex: `.codex/skills`, `.agents/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`) y rellena el historial desde sus registros de sesión (`~/.claude/projects`, `~/.codex/sessions`): el catálogo de skills que vio el modelo a lo largo del tiempo, cada llamada a un skill y el idioma de las respuestas. Así que `why` también funciona ahí. Un skill instalado para ambos agentes no es un conflicto; dos copias con el mismo nombre para un mismo agente sí lo son.

Para que el diario siga solo, registra al inicio de cada sesión de Claude Code con un hook en `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Para Codex, ejecuta `skill-healthcheck record` desde cron o el Programador de tareas una vez al día.

## Opcional: `--explain`

`--explain` añade una frase llana bajo cada cambio upstream ("ya no se elegirá para escribir en chino") y bajo el primer sospechoso de `why`. Está desactivado por defecto y nunca cambia un veredicto. Usa lo que tengas:

| Entorno | Proveedor |
|---|---|
| `ANTHROPIC_API_KEY` (o `ANTHROPIC_AUTH_TOKEN`) | Claude, `claude-opus-5-5` con esfuerzo bajo, mediante el SDK oficial, con fallback en el servidor ante rechazos |
| `DEEPSEEK_API_KEY` | DeepSeek, `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | cualquier endpoint compatible con OpenAI (Ollama, vLLM, …) |

`SKILL_HEALTHCHECK_LLM` elige uno explícitamente y `SKILL_HEALTHCHECK_LLM_MODEL` cambia el modelo. Solo se envían el texto antes/después del skill y las palabras detectadas, nunca los registros de sesión. El texto del skill se delimita como datos no confiables, las respuestas se recortan a una línea y las respuestas se cachean.

## Qué revisa

**Skills: local (sin conexión, determinista)**

| Problema | Por qué falla en silencio |
|---|---|
| frontmatter inválido (name no está en kebab-case, un booleano mal escrito, un campo con nombre antiguo) | dsh descarta el skill entero y solo escribe una línea de advertencia en el log |
| Tapado por otro skill con el mismo nombre | Un skill con el mismo nombre en `.dsh/skills` del proyecto tapa el que instalaste globalmente |
| Anidado demasiado profundo | Solo se reconoce `<root>/<name>/SKILL.md`; si clonas un repositorio de skills completo ahí dentro, no se activa ninguno |
| Directorio equivocado | dsh no escanea `~/.claude/skills` ni `~/.codex/skills` |
| description de más de 500 caracteres | Se trunca en el catálogo, así que el modelo nunca ve las palabras de activación del final |
| Antes se invocaba a menudo y un día dejó de hacerlo | La evidencia del registro de sesión vale más que cualquier inferencia |

**Skills: upstream (git, cualquier plataforma de alojamiento)**

| Cambio upstream | Impacto |
|---|---|
| `description` modificada | ⚠ Riesgo máximo: cambiaron las condiciones de activación y puede que nunca se vuelva a invocar. Enumera las palabras eliminadas y añadidas, y marca las reglas de idioma/tono |
| `name` modificado / directorio movido | El punto de entrada `/nombre-antiguo` deja de funcionar; te indica el nuevo |
| Repositorio borrado / skill borrado | Tu copia local queda sin mantenimiento (solo un 404 explícito cuenta como borrado; los fallos de red se reportan como "no se pudo comprobar") |
| Nuevo ejecutable en `scripts/` | Alguien tiene que revisar el código |
| description más larga o por encima del límite | Se trunca, o consume más contexto en cada turno |
| Cuerpo más largo | Cuántos tokens extra cuesta cada invocación (el cuerpo se carga bajo demanda, así que no desplaza a otros skills) |
| Nueva sintaxis específica de plataforma | Cmdlets de PowerShell, `brew`, `/usr/bin`, por ejemplo: puede que no funcione en tu sistema |

**Plugins (dsh)**: si los plugins instalados en un profile son compatibles con la versión actual de dsh (`engines.dsh` / peerDependencies), si funcionan gracias a una excepción de versión, si npm tiene una versión más nueva y si el autor los ha marcado como obsoletos.

**La línea de resumen es asimétrica a propósito**: `插件 2 个可一键升级；技能 3 个需你逐个确认` ("2 plugins se actualizan de una vez; 3 skills requieren que los revises uno a uno"). Los plugins son paquetes npm con número de versión y posibilidad de revertir; los skills son prompts: si sobrescribes uno, la versión anterior desaparece, y si su comportamiento cambió no te enterarías. Por eso tiene que mirarlo una persona.

## Atribución: `why`

La herramienta empieza a registrar desde la primera ejecución (`~/.skill-healthcheck/journal.jsonl`): qué se instaló, qué cambió, qué se borró, con el texto completo de cada versión de cada `SKILL.md`. `why` combina ese diario con los registros de sesión del propio dsh (que contienen, en orden, el catálogo de skills que vio el modelo cada vez) para ordenar los sospechosos:

- **Léxico de síntomas**: asigna "dejó de responder en chino" a reglas de idioma (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Tiempo**: los cambios más cercanos al inicio del síntoma son más sospechosos; los posteriores pierden peso
- **Punto de cambio de comportamiento**: calcula la proporción de respuestas en chino y el número de invocaciones a partir de los registros de sesión para encontrar el día en que empezó el cambio

Todo es código determinista sin llamadas a un LLM, así que los resultados son estables y testeables.

## Validado con datos reales

Reunimos 74 cambios reales de `SKILL.md` de 15 repositorios públicos de skills (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness, entre otros) y aplicamos las reglas a cada uno:

| Tipo de cambio | Detectados / reales |
|---|---:|
| description modificada | 44 / 44 |
| name modificado | 18 / 18 |
| directorio movido | 20 / 20 |
| scripts añadidos | 13 / 13 |

En este conjunto, 37 cambios upstream eliminaron palabras que estaban en la description, 16 renombraron el skill y 3 produjeron una versión nueva que dsh descarta directamente. El conjunto de datos, los pasos de reproducción y el ajuste de reglas están en [research/EVAL.md](research/EVAL.md).

## Datos y privacidad

- Solo lee tus directorios de skills, los profiles de dsh y los registros de sesión; no escribe nada fuera de `~/.skill-healthcheck/`.
- Los registros de sesión se leen únicamente en local, y solo se cachean datos derivados (catálogo de skills, número de invocaciones, proporción diaria de respuestas en chino). El texto de las conversaciones nunca se almacena.
- Las comprobaciones upstream se ejecutan en repositorios bare independientes bajo `~/.skill-healthcheck/cache/`; nunca hace fetch ni modifica tus propios repositorios de skills.
- El `metadata.source` del frontmatter de un skill lo escribe un tercero, así que se trata como no confiable: solo se aceptan URLs https/ssh/git/file y rutas absolutas, se rechazan inyecciones de opciones como `--upload-pack=…` y transportes como `ext::`, y git nunca pide credenciales.
- El acceso a la red hace exactamente tres cosas por defecto: `git fetch` de los upstreams de skills, consultar la API de GitHub para saber si un repositorio existe y `npm view` para las versiones de los plugins. `--offline` lo desactiva todo. `--explain` añade una cuarta, solo cuando lo pasas: el texto antes/después del skill va al proveedor de LLM que hayas configurado.
- Los registros de sesión de más de 180 días se omiten (`SKILL_HEALTHCHECK_SESSION_DAYS` lo cambia). Para olvidarlo todo, borra `~/.skill-healthcheck/`.

## Plataformas compatibles

| Plataforma | Nivel de soporte |
|---|---|
| DeepSeek Harness (dsh) | Completo: replica el orden de escaneo y las reglas de análisis de dsh, rellena los registros de sesión y revisa plugins y host |
| Claude Code y Codex (modo genérico) | Raíces de skills propias de cada agente, comprobaciones locales y upstream, relleno desde los registros de ambos agentes |

Cambia automáticamente al modo dsh cuando detecta `~/.dsh/profiles`; también puedes fijarlo con `--platform`.

## Cómo se determina el origen de un skill

dsh no registra de dónde se instaló un skill, así que la herramienta prueba en este orden y, si no encuentra nada, dice "origen desconocido" en lugar de adivinar:

1. Un origen registrado con `skill-healthcheck adopt`
2. `metadata.source` en el frontmatter
3. El directorio del skill es un checkout de git → usa su `origin`

## Desarrollo

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## Hoja de ruta

- [x] Diario, comprobaciones locales de fallo silencioso, relleno de registros de sesión
- [x] Comprobación de vida del upstream y evaluación del impacto de cambios
- [x] Atribución con `why`
- [x] Compatibilidad de plugins y comprobación de actualizaciones (dsh)
- [x] Plugin de dsh `dsh-skill-healthcheck`: registra al arrancar el host y al cambiar el catálogo, añade `/skill-healthcheck`
- [x] Salida en chino e inglés (`--lang`)
- [x] `--explain` opcional: una frase por cambio desde Claude, DeepSeek o cualquier modelo compatible con OpenAI
- [x] Relleno de registros de sesión de Claude Code y Codex

## License

MIT
