## Diagnóstico (o que está causando “expira rápido”)
- **Timeout de interação (3s)**: muitos comandos fazem DB/IO (ex.: `getOrCreate`, queries grandes) antes de responder. Se não responder/deferir em ~3s, o Discord invalida a interação e o comando “morre”. Isso aparece como “parou do nada”.
- **Coletores com `idle: 120000` (2 min)**: hubs com menus/botões (help, polícia, mercado negro, facção, eleição, config) desativam rápido por causa do collector.
- **DB sobrecarregado → comandos ficam lentos**: o listener de `messageCreate` faz `updateOne` **a cada mensagem**, o que pode afogar o Mongo e aumentar latência dos comandos (aí eles passam de 3s e expiram).
- **RAM/cache**: o client ainda está com configuração agressiva (intents/caches) para o tamanho do projeto; dá para reduzir caches/sweepers no v14.

## Correções para não expirar
1. **Defer automático nos comandos lentos (sem quebrar os rápidos)**
   - Padronizar um comportamento: comandos com DB/IO devem **deferir logo no começo**.
   - Ajustar os hubs principais para usar `ensureDeferred`/`replyOrEdit` e parar de depender de `fetchReply` direto do `reply` quando necessário.
2. **Aumentar tempo dos menus**
   - Subir `idle` dos collectors de 2min para 10–15min (e manter o “menu expirado” ao final).

## Otimização de DB (ganho grande de estabilidade)
1. **Batch do contador de mensagens**
   - Trocar `updateOne` por mensagem (atual) por um **buffer em memória** (Map) + `bulkWrite` a cada X segundos.
   - Isso reduz brutalmente o número de writes e evita que o Mongo vire gargalo.

## Otimização de RAM/CPU (discord.js v14)
1. **Intents mínimos**
   - Usar só o necessário: `Guilds`, `GuildMessages`, `MessageContent` (e outros somente se algum evento realmente precisar).
2. **Limitar caches + sweepers**
   - Configurar `makeCache`/`sweepers` para não manter mensagens/membros desnecessários em memória.

## Observabilidade (pra parar de “morrer sem explicar”)
- Adicionar medição simples de tempo de execução por comando e logar warnings quando passar de 2s.
- Logar uso de memória periodicamente (ex.: a cada 5 min) com `rss/heapUsed`.

## Validação
- Regerar comandos.
- Subir o bot e testar:
  - `/help` (menu não expira em 2 min)
  - hubs (`/policia`, `/mercadonegro`, `/eleicao`, etc.)
  - comandos simples (`/ping`, `/atm`)
- Monitorar logs: sem “Unknown interaction”, sem expiração precoce, e com latência menor.
