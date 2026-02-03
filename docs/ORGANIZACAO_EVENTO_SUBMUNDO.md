# GUIA DO EVENTO SUBMUNDO (FÁCIL, DETALHADO E SEM ENROLAÇÃO)

Este documento explica como organizar e tocar o evento **Mercado Negro x Polícia** do jeito mais simples possível, e como cada mecânica funciona.

## 1) Preparação do servidor (10 minutos)
### Canais recomendados
- `#avisos` — anúncio geral (use [AVISOS_SUBMUNDO.txt](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/docs/AVISOS_SUBMUNDO.txt) e [PRE_EVENTO_CHEFE_POLICIA.txt](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/docs/PRE_EVENTO_CHEFE_POLICIA.txt))
- `#anuncios-evento` — onde o bot solta eventos relâmpago do submundo
- `#submundo-chat` — negociação, propaganda, blefe, tretas do RP
- `#delegacia` — relatórios da polícia, prints de caso/captura
- `#territorios` — “intel” de facções: quem domina onde
- `#suporte-bot` — dúvidas e tutoriais

### Cargos (opcional, mas deixa o evento mais vivo)
- `👮 Polícia Econômica` (para oficiais aceitos)
- `🏴 Facção: <nome>` (um por gangue)
- `💣 Submundo` (para participantes)

## 2) Setup do bot (admin) — passo a passo
1) Configure o canal de anúncios do evento:
- `/mercadonegro configurar canal:#anuncios-evento ping_everyone:false`

2) Ative o evento:
- `/mercadonegro evento_ativar`

3) Defina o Chefe de Polícia:
- `/policia definir_chefe usuario:@Chefe`

4) Organize o “tesouro” para prêmios e recompensas:
- `/bancocentral status`
- `/bancocentral depositar valor:10000 motivo:Prêmios do evento`
- `/bancocentral pagar usuario:@X valor:5000 motivo:Premiação`

## 3) Como cada coisa funciona (explicado de um jeito fácil)
### 3.1 Mercado Negro (criminosos)
O Mercado Negro tem **NPCs vendedores** com estoque e restock. Você compra e vende **itens ilícitos** e isso muda sua reputação.

Comandos de criminoso (ordem recomendada):
1) `/mercadonegro status` (ver reputação, heat e se o evento está ativo)
2) `/mercadonegro vendedores` (ver NPCs, códigos de item, estoque e preços)
3) `/mercadonegro item_comprar` (comprar item)
4) `/mercadonegro item_vender` (vender item)
5) `/mercadonegro inventario` (ver seus itens)

### 3.2 Preço dinâmico (demanda)
Se a galera compra muito um item, o preço tende a subir. Se para de comprar, o preço alivia.
Isso cria meta de servidor: “bolha”, “pânico”, “manipulação”, estocar e vender na hora certa.

### 3.3 Risco, heat e interceptação
Toda transação do submundo tem uma chance de dar ruim.
- **Risco** vem do item + valor + seu heat + patrulha + checkpoints no distrito
- Se for interceptado: você perde a mercadoria e pode tomar ban econômico temporário
- Quem é pego perde reputação; quem passa liso sobe reputação

### 3.4 Reputação (acesso por nível)
Reputação é a “porta” do submundo:
- Níveis mais altos liberam itens melhores
- Apreensão derruba reputação
Isso evita que todo mundo chegue no topo no primeiro dia.

### 3.5 Polícia (investigação e casos)
A polícia funciona com **casos** que acumulam evidências. Casos podem nascer de:
- Interceptações do Mercado Negro
- Patrulhas que geram pistas
- Investigações em suspeitos

Comandos da polícia:
1) `/policia candidatar` (entrada, chefe/admin aprova)
2) `/policia patrulhar` (busca pistas e pode abrir/avançar casos)
3) `/policia checkpoint` (aumenta risco de interceptação no distrito)
4) `/policia casos` / `/policia caso_ver`
5) `/policia caso_investigar` (aumenta progresso)
6) `/policia caso_capturar` (finaliza o caso e paga recompensa se o tesouro tiver)
7) `/policia ranking`

### 3.6 Facções e territórios (guerra territorial)
Facções (gangues) permitem “organizar o crime” e disputar território.
- Criminosos ganham influência no distrito ao fazer runs (compra/venda)
- Polícia ganha influência quando fecha casos e apreende
- O território muda de “dono” conforme a influência acumula

Comandos:
- `/faccao criar` (criar gangue)
- `/faccao entrar` (entrar em gangue)
- `/faccao territorios` (ver controle)
- `/faccao influenciar` (comprar influência com dinheiro)

### 3.7 Missões (diárias e semanais)
Missões são o “motor” pra manter a disputa ativa todo dia:
- Criminosos: comprar/vender itens e completar runs
- Polícia: patrulhar, colocar checkpoint e capturar

Comandos:
- `/mercadonegro missoes` e `/mercadonegro missao_resgatar`
- `/policia missoes` e `/policia missao_resgatar`

### 3.8 “Evento relâmpago” (atração automática)
Às vezes o bot anuncia um leilão/discount temporário no `#anuncios-evento`.
Isso acelera a treta e muda o meta por alguns minutos.

## 4) Como manter rivalidade sem virar bagunça (do jeito que você quer)
- Incentive propaganda, blefes e alianças. É isso que cria história.
- Corte só o que quebra servidor: ameaça real, doxxing, assédio e spam tóxico.
- Se o crime dominar: a polícia coloca mais checkpoints e patrulha mais.
- Se a polícia travar geral: facções espalham rotas por distritos e alternam horários.

## 5) Dívidas e acordos entre jogadores (liberdade total)
Pra “dever” e fazer acordo de verdade, use:
- `/contrato` (acordo formal, com regras/multa)
- `/banco emprestimo_pedir` e `/banco emprestimo_pagar` (empréstimos)

## 6) Checklist rápido de “está funcionando?”
Admin:
- `/mercadonegro evento_ativar` responde OK
- `/mercadonegro vendedores` mostra NPCs e estoque
- `/policia definir_chefe` define o chefe
- `/policia patrulhar` roda para policiais aceitos

Jogador:
- Criminoso compra e aparece no `/mercadonegro inventario`
- Vende e recebe dinheiro
- Polícia vê casos em `/policia casos` depois de alguma interceptação/patrulha

