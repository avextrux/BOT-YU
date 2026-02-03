## Objetivo

* Organizar todos os comandos em formato “cascata” (hierarquia) tanto no arquivo de docs quanto no `/help`.

* Deixar os eventos do Submundo mais “maneiros” (mais tipos, mais impacto e mais clareza).

* Fazer uma varredura de bugs prováveis e corrigir os que podem quebrar o bot.

## 1) Comandos em “cascata” (organização)

* Atualizar [COMANDOS.txt](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/docs/COMANDOS.txt) para um formato hierárquico:

  * Categoria → Comando → (Subcomandos/Inputs) → (Ações do HUB)

* Melhorar o gerador [generateCommandsTxt.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/tools/generateCommandsTxt.js) para:

  * Listar todos os comandos por pasta (já faz) + incluir “Ações do HUB” quando o comando expuser um `hubActions` (array simples) no `module.exports`.

  * Ex.: `/mercadonegro` → Status, Vendedores, Comprar, Vender, Inventário, Missões, Ranking…

* Ajustar o `/help` para refletir a mesma hierarquia:

  * Home → (Evento Submundo | Comandos Gerais | Admin)

  * Evento Submundo → cards/menus com “HUBs principais” e suas ações

  * Comandos Gerais → Categoria → lista em cascata (evitar spam de fields > 25)

## 2) Eventos mais maneiros (Submundo)

* Consolidar os eventos aleatórios (já existem Promoção/Raid/Escassez/Superávit) para ficarem mais claros e configuráveis:

  * Anúncio de início + anúncio de fim do evento

  * “Cooldown” global para não acontecer evento em sequência

  * Clamp/validação de probabilidades (0–100%)

* Expandir eventos com impacto real:

  * “Denúncia/Informante”: cria um caso policial com pista leve

  * “Carga Perdida”: item aleatório aparece barato por X minutos em um distrito

  * “Operação de Checkpoints”: aumenta chance e duração de checkpoints

## 3) Desafios (reputação/território)

* Transformar o requisito de “mensagens enviadas” em um sistema configurável:

  * thresholds (ex.: 50/200/500) em config do evento

  * aplicar em itens por nível e/ou em ações específicas (comprar/vender/território)

* Garantir que o contador de mensagens realmente funcione (ver bugs abaixo).

## 4) Correções de bugs e robustez (erros prováveis)

* Corrigir o contador de mensagens:

  * Hoje [messageCreate.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/guild/messageCreate.js) não registra listener, então não roda.

  * Vou padronizar no estilo do projeto: arquivo “evento” já faz `client.on(...)` ao ser `require()`.

* Corrigir defaults que podem dar crash:

  * `/config_evento`: garantir `heatDecayPerHour`, `patrolBaseChance`, `checkpointBonus` antes de usar `.toString()`.

  * `/eleicao`: reforçar `ensureElectionDefaults` para preencher `active/endsAt/candidates/votes/paidVotes/voters/voteShop` mesmo em DB antiga.

* Tornar `/help` e leitura de pastas resilientes:

  * Trocar `./ComandosSlash/...` por paths absolutos via `path.join(__dirname, ...)` para não quebrar se mudar o `cwd`.

* Banco Central infinito de verdade:

  * Ajustar `/bancocentral pagar` para não falhar por tesouro insuficiente e não descontar (ou registrar como “emissão”), sem deixar tesouro negativo.

## 5) Verificação

* Rodar registro de comandos (`npm run gen:cmds`) e iniciar o bot para garantir que não há crash.

* Fazer uma checagem automática que dá `require()` em todos os comandos/eventos para capturar erros de sintaxe/import.

* Validar manualmente fluxos críticos: `/help`, `/config_evento`, `/eleicao` (votar + modal de compra), `/mercadonegro` (eventos e preços).

## Entregáveis

* Docs em cascata (COMANDOS.txt) + gerador atualizado.

* `/help` organizado por camadas (Home → Evento/Geral/Admin) e com cascatas.

* Eventos aleatórios melhorados + painel de config mais seguro.

* Correções dos erros prováveis (message counter, defaults, paths, bancocentral, eleicao).

