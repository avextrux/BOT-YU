## Objetivo
- Deixar o bot mais profissional em **organização**, **estabilidade**, **UX** e **logs**, **sem alterar o arquivo Config.json**.

## Restrições (seguindo sua instrução)
- Não editar [Config.json](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Config.json).
- Melhorias de config serão feitas criando um módulo de leitura segura e ajustando o código para não depender de `require("../Config.json")` sem try/catch.

## Entregáveis
### 1) Configuração consistente (sem tocar no Config.json)
- Criar `Utils/config.js` que:
  - Lê variáveis de ambiente.
  - Tenta carregar `Config.json` com `try/catch` (se existir), sem modificar o arquivo.
  - Expõe getters (`getMongoUrl()`, `getBotToken()`, `getGiphyKey()`, etc.).
- Ajustar módulos que hoje quebram quando `Config.json` não existe (ex.: [giphy.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/giphy.js)) para usar `Utils/config.js`.

### 2) Helpers de interação (mais estável e com UX melhor)
- Criar `Utils/interactions.js` com:
  - `safeInteraction()` para engolir 10062/40060.
  - `replyOrEdit()` para responder/editar de forma segura.
  - `disableComponentsOnEnd()` para collectors expirados (sem apagar mensagem).
  - `promptModal()` (inputs via modal) para reduzir dependência de mensagens no chat.
- Migrar primeiro os hubs críticos para usar esses helpers:
  - [mercadonegro.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/mercadonegro.js)
  - [policia.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/policia.js)
  - [faccao.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/faccao.js)

### 3) Router mais limpo no interactionCreate
- Refatorar [interactionCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/interactionCreate.js) para ser um router fino:
  - Extrair handlers de modais para `Eventos/guild/modals/*.js`.
  - Manter no arquivo principal apenas dispatch e fallback de erro.

### 4) Logging profissional (sem novas dependências)
- Criar `Utils/logger.js` para logs com níveis + timestamp + contexto (guild/user/command).
- Substituir `console.*` espalhado por `logger.*` nos pontos centrais:
  - [index.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/index.js)
  - [Handler/index.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Handler/index.js)
  - [ready.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/client/ready.js)
  - [interactionCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/interactionCreate.js)

### 5) Loader de comandos mais robusto
- Melhorar validação no loader ([Handler/index.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Handler/index.js)):
  - Verificar se cada comando tem `name/description/type/run`.
  - Logar erros por arquivo e seguir carregando os demais.
  - Opcional: modo “produção” para registrar comandos globalmente (sem mudar Config.json; via env var).

### 6) Polimento geral
- Padronizar embeds (cores/títulos) num utilitário (`Utils/embeds.js`) e reutilizar em comandos principais.
- Tornar [messageCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/messageCreate.js) mais resiliente (sem flood de log em falha repetida de DB).
- Atualizar README com setup e variáveis (sem pedir para mudar Config.json).

## Verificação
- Subir localmente e validar:
  - Login e Mongo conectando.
  - Registro e execução de slash commands.
  - Hubs funcionando sem “Unknown Interaction”.
  - Inputs migrados para modal funcionando.
- Rodar `npm run gen:cmds` para checar integridade do catálogo de comandos.

## Nota de escopo
- Não farei upgrade para discord.js v14 nesta etapa (mudança grande). Se quiser, proponho uma fase 2 dedicada a isso.