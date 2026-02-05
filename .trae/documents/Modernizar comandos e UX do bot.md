## Objetivo
- Deixar o bot “mais moderno e funcional” no padrão discord.js v14: interações sem expirar, UI consistente (embeds/menus/botões/modais), e menos código legado/compat.

## Diagnóstico rápido (estado atual)
- O projeto já usa discord.js v14, mas ainda tem **padrões legados** (ex.: `MessageSelectMenu`, `componentType: "SELECT_MENU"`, `fetchReply: true`) e um **shim de compat** em [djs.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/djs.js) que mascara diferenças v13→v14.
- Os hubs mais usados (help/mercadonegro/policia/eleicao/config_evento) têm coletores longos (10 min) e algumas checagens antigas; isso impacta UX e estabilidade.

## Plano de aprimoramento (incremental, sem quebrar produção)
### 1) Consolidar “v14 puro” e reduzir legado
- Trocar usos de `MessageSelectMenu`/`MessageActionRow`/strings de componentType por builders atuais:
  - `ActionRowBuilder`, `ButtonBuilder`, `StringSelectMenuBuilder`, `ModalBuilder`, `TextInputBuilder`.
- Padronizar `componentType` para enums v14 (`Discord.ComponentType.StringSelect`, `Discord.ComponentType.Button`).
- Onde existir `isSelectMenu()` (legado), substituir por `isStringSelectMenu()`.
- Revisar o shim [djs.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/djs.js): manter só o mínimo necessário (ex.: aliases de cores/perms) e remover “gambiarras” de reply/fetchReply se os comandos forem modernizados.

### 2) Padronizar fluxo de interação (UX sem timeout)
- Forçar um padrão único em todos os comandos:
  - defer automático para comandos lentos (já existe no handler),
  - `replyOrEdit` para toda resposta,
  - remover `fetchReply: true` onde não é necessário.
- Criar helper para “responder e pegar mensagem” de forma moderna (quando precisar collector), sem depender de `fetchReply` no `reply`.

### 3) Modernizar os hubs (menus/coletores) com UX melhor
- Prioridade 1 (alto impacto):
  - [/help](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Outros/help.js)
  - [/mercadonegro](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/mercadonegro.js)
  - [/policia](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/policia.js)
  - [/eleicao](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/eleicao.js)
  - [/config_evento](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Admin/config_evento.js)
- Melhorias nesses hubs:
  - reduzir `idle` (ex.: 2–5 min) e sempre **desabilitar componentes** no `end`,
  - padronizar feedback (“Menu pessoal”, “Menu expirado”),
  - padronizar estilo visual (cores, títulos, thumbnails, e footer WDA já existente).

### 4) Modernizar comandos interativos (jogos/confirmações)
- Prioridade 2: blackjack/quiz/jokenpo/contrato/pay/casar/divorciar/call.
- Trocar confirmações por botões padronizados, validar permissões e lidar com cancelamento/timeout com UX consistente.

### 5) Validação e deploy sem dor
- Rodar validação local:
  - geração de comandos,
  - start sem warnings legados,
  - smoke test dos hubs e 2–3 comandos interativos.
- Garantir compat no Linux (já houve problema de deploy): manter o hook do `discord.js` robusto e adicionar falha explícita quando o discord.js real não carregar.

## Entregáveis
- Comandos/hubs reescritos em padrão v14 moderno.
- Menos dependência do shim e menos warnings/deprecações.
- UX consistente (embeds com footer WDA, menus/botões “limpos”, mensagens de erro uniformes).

Se você aprovar, eu começo pela Prioridade 1 (hubs) porque é o que mais melhora a “cara” e reduz erros de interação.