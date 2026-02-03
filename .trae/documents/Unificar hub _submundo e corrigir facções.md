## O que você quer (tradução em implementação)
- Executar **/faccao** (sem subcomando) e o bot mandar uma **mensagem bonitinha** + um **menu “Selecionar”** com ações (criar, entrar, listar, territórios, etc.).
- Fazer **a mesma coisa** para **/mercadonegro** e **/policia**.
- Corrigir e organizar o **/help** para não ficar repetido e para apontar os hubs.

## Decisões técnicas (pra ficar simples e funcionar no discord.js v13)
- Vou transformar cada comando principal em um **HUB interativo** (embed + SelectMenu + botões), e o próprio hub executa as ações.
- Para ações que precisam de “input” (ex.: ID da facção, quantidade, caseId), o hub vai usar **Modal** (caixa de texto) ou passos guiados.
- Vou manter (por um tempo) os subcomandos antigos como compatibilidade, mas o fluxo oficial vira “abrir hub e escolher no menu”.

## 1) Consertar facções “que não funcionam” (base antes do hub)
- Corrigir guardas de DB no comando de facção (garantir `client.userdb` sempre disponível quando cobrar dinheiro).
- Melhorar confiabilidade:
  - Entrada em facção com update mais “atômico” (reduzir corrida ao estourar 30 membros).
  - IDs de facção com entropia maior + tentativa de regenerar se colidir.
  - Mensagens de erro específicas (nome duplicado, facção cheia, etc.).
- Completar o que hoje causa frustração:
  - Transferir liderança (para o líder conseguir sair)
  - Expulsar membro (líder)
  - Deletar facção (líder/admin)

## 2) HUB /faccao (menu de ações)
- **/faccao** abre:
  - Embed: status do jogador (está em facção? qual? membros? cofre? territórios)
  - SelectMenu “O que você quer fazer?” com:
    - Minha facção
    - Listar facções
    - Criar facção
    - Entrar em facção
    - Sair
    - Ver territórios
    - Comprar influência
    - Transferir liderança
    - Expulsar membro
    - Deletar facção
- Fluxos:
  - Criar/Entrar/Influenciar/Transferir/Expulsar: usa Modal para pedir texto (ex.: ID do alvo).
  - Territórios: página com “dono + sua influência + polícia” e dicas do meta.

## 3) HUB /mercadonegro (menu de ações)
- **/mercadonegro** abre:
  - Status (rep/heat/patrulha/ban)
  - Ver vendedores (NPCs)
  - Comprar item (wizard em 2–3 passos)
  - Vender item (wizard)
  - Inventário
  - Missões + Resgatar
  - Ranking
  - Configurar anúncios (admin)
  - Ativar/Desativar evento (admin)
- Objetivo: o jogador não precisar decorar códigos; o hub mostra tudo e guia.

## 4) HUB /policia (menu de ações)
- **/policia** abre:
  - Status
  - Candidatar
  - Pedidos (chefe)
  - Patrulhar
  - Checkpoint
  - Casos (lista)
  - Ver caso (modal com caseId)
  - Investigar caso (modal)
  - Capturar caso (modal)
  - Missões + Resgatar
  - Ranking

## 5) Arrumar /help (sem abas repetidas + apontando pros hubs)
- Deduplicar opções e remover colisão de “Admin” vs “ADM”.
- Atualizar a aba do evento para instruir:
  - “Use /mercadonegro, /policia, /faccao (hubs com menu)”
- Garantir que o help não liste abas duplicadas e fique curto/bonito.

## 6) Verificação (pra você ter certeza que está funcionando)
- Subir o bot e conferir registro de comandos (sem “Invalid Form Body”).
- Teste manual mínimo (roteiro):
  - /faccao → criar → listar → entrar (outro user) → transferir líder → sair
  - /faccao → influenciar → /faccao territorios (confere influência)
  - /mercadonegro → vendedores → comprar → inventário → vender
  - /policia → candidatar/aceitar → patrulhar → casos → caso_investigar → caso_capturar
- Atualizar docs/COMANDOS.txt no final.

Se você aprovar, eu implemento exatamente isso (hubs com menu + correções de facção + help).