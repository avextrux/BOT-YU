## O que ainda dá para otimizar com segurança
- O bot já está mais estável, mas ainda existem **gargalos de DB/CPU/RAM** que podem voltar a causar lentidão (e aí comandos “expiram”). Os piores são tickers que salvam documentos sem necessidade, padrões N+1 no Mongo e estruturas em memória sem limite.

## 1) Reduzir escrita no Mongo (maior impacto)
- **Mercado Negro ticker** ([blackMarketTicker.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/economia/blackMarketTicker.js))
  - Implementar `dirty` flag: só chamar `g.save()` quando algo mudou (heat/patrol/checkpoints/vendors/eventos).
  - Remover o `await g.save()` “sempre” no final do loop e manter saves apenas em blocos que alteram.
- **Governança ticker** ([governance.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/economia/governance.js))
  - Aumentar o `setInterval` (30s → 2–5 min) porque a query já filtra `endsAt <= now`.
  - Em `expireCrises`, trocar loop+`save()` por `updateMany` com `$set` (mesmo efeito, menos IO).
- **Contratos** ([contracts.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/economia/contracts.js))
  - Remover `getOrCreate()` (2 leituras por contrato) e usar `findOneAndUpdate` com `upsert:true` + `setDefaultsOnInsert:true` + `$setOnInsert:{userID}`.
  - (Opcional) Agrupar as duas atualizações de usuários em `bulkWrite` por lote.

## 2) Remover padrão N+1 no ticker da polícia
- **policeTicker** ([policeTicker.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/economia/policeTicker.js))
  - Trocar `for guild -> findOne(police)` por:
    - coletar `guildIDs` das guilds ativas
    - buscar todas polícias com `$in`
    - montar `Map(guildID -> police)`
  - Isso reduz de até 101 queries para 2 por tick.

## 3) Controlar memória onde cresce sem limite
- **/lembrete** ([lembrete.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Utilidade/lembrete.js))
  - Impor limite global e por usuário (ex.: 1000 globais / 5 por usuário).
  - Guardar metadados no Map (userId/createdAt) para conseguir limpar e aplicar limites.
  - Em caso de excesso, negar com mensagem clara e não criar `setTimeout`.
- **Batch de messagesSent** ([messageCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/messageCreate.js))
  - Chunk no `bulkWrite` (ex.: 500 ops por vez) para evitar picos quando o buffer fica grande.

## 4) Pequenas otimizações de CPU/rate-limit
- Subir o intervalo do status/presença de 15s para 60–180s em [ready.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/client/ready.js) para reduzir tráfego e overhead.

## 5) Validação sem introduzir erros
- Parar o processo do bot, aplicar mudanças, rodar geração de comandos, subir novamente.
- Verificar logs:
  - sem exceções
  - sem spam de save/update
  - memória estabilizando (logs periódicos)
- Testar rapidamente: `/help`, `/mercadonegro`, `/policia`, `/contrato`, `/lembrete`.
