## Objetivo
- Elevar o padrão “produção” do bot inteiro (todos os comandos), reduzindo erros de interação, padronizando UX, permissões, privacidade (`ephemeral`) e tratamento de falhas.
- Manter a regra: **não mexer em Config.json**.

## Diagnóstico (onde ainda está frágil)
- Muitos comandos fazem operações de DB/API sem `deferReply`, o que aumenta chance de timeout/“Unknown Interaction”. Exemplos: [banco.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/banco.js), [bancocentral.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/bancocentral.js), [loja-admin.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Loja/loja-admin.js).
- Tratamento de erro inconsistente: vários `catch` fazem `interaction.reply(...)` mesmo se já houve reply/edit → risco de “Interaction already replied”. Ex.: [quiz.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Diversao/quiz.js), [ban.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Moderacao/ban.js).
- Respostas admin/sensíveis às vezes públicas (deveria ser `ephemeral` por padrão em comandos administrativos/financeiros pessoais).
- Falta de checagem completa de permissões: usuário + bot + canal (ex.: `SendMessages`, `EmbedLinks`, `BanMembers`, etc.).
- Alguns fluxos ainda coletam entrada via chat (`awaitMessages`) via helper; ideal é migrar para **modal** para UX e estabilidade.

## Padrão único para TODOS os comandos (base)
### 1) Toolkit de comandos
- Criar/expandir utilitário `Utils/commandKit.js` (ou equivalente) com:
  - `ensureDeferred(interaction, { ephemeralDefault })`
  - `replyOrEdit(interaction, payload)` (centralizando “já respondeu?”)
  - `withErrorBoundary(runFn)` para padronizar erro/telemetria
  - `requireUserPerms(...)` e `requireBotPerms(...)` (mensagens claras)
  - Política de privacidade: `ephemeral` padrão por categoria (Admin/Moderação/Economia pessoal).

### 2) Router de execução
- Atualizar [interactionCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/interactionCreate.js) para executar comandos via um wrapper único:
  - Aplica `ensureDeferred` quando necessário
  - Loga contexto (command/guild/user)
  - Responde erro de forma consistente usando [embeds.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/embeds.js)

## Refatoração por blocos (com foco nos mais críticos)
### 3) Economia (alto impacto)
- Refatorar:
  - [banco.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/banco.js)
  - [bancocentral.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/bancocentral.js)
  - [loja-admin.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Loja/loja-admin.js)
- Ajustes:
  - `deferReply` onde tiver DB/loops
  - `ephemeral` consistente em ações administrativas e informações pessoais
  - `replyOrEdit` no `catch` e nos retornos

### 4) Moderação (segurança e previsibilidade)
- Refatorar:
  - [ban.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Moderacao/ban.js)
  - [kick.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Moderacao/kick.js)
  - [clear.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Moderacao/clear.js)
- Ajustes:
  - checar permissões do usuário e do bot
  - tratar casos comuns (alvo com cargo acima, alvo admin, DM falha)
  - sempre responder com embed padronizado e `ephemeral` por padrão

### 5) Diversão/Utilidade (consistência)
- Refatorar comandos com collector/edits e `catch` frágil:
  - [quiz.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Diversao/quiz.js)
  - comandos similares com botões/edits
- Ajustes:
  - `safe` e `replyOrEdit` para evitar erro de interação expirada
  - desativar componentes no fim (em vez de apagar)

### 6) Admin/Embed
- Refatorar [embed.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Admin/embed.js):
  - validar permissão do bot no canal (enviar mensagem/embeds)
  - tratar falha de `channel.send`
  - `ephemeral` por padrão

## Migração de inputs para Modal (onde faz sentido)
- Para comandos que pedem texto/valores/IDs:
  - substituir prompts via chat por `promptModal` (usando [interactions.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/interactions.js))
  - reduzir dependência de Message Content Intent e evitar “mensagem apagada → dúvida se funcionou”

## Verificação
- Rodar `npm run gen:cmds` e iniciar o bot localmente.
- Validar manualmente:
  - `/banco` (criar/depositar/retirar/emprestimo)
  - `/loja-admin` (criar/editar)
  - `/ban` `/kick` `/clear`
  - comandos com botões/collectors (ex.: quiz)
- Garantir que nenhum comando dá “already replied” e que timeouts não apagam mensagens sem feedback.

## Resultado esperado
- Todos os comandos passam a ter o mesmo “padrão profissional”: defer quando precisa, erros consistentes, permissões corretas, privacidade adequada e fluxo estável mesmo com atraso/cliques tardios.