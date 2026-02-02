## Objetivo
Implementar um evento completo e escalável de **Mercado Negro x Polícia** (com rivalidade livre), com preços dinâmicos, interceptações, NPCs, reputação, investigação, patrulhas/checkpoints, missões, facções/territórios, leaderboards e anti-cheat. Também corrigir abas repetidas no /help, melhorar a ergonomia dos comandos e entregar textos prontos para anúncio.

## Estado atual do projeto (levantamento)
- Já existe um mini-mercado negro de “aposta” em [mercadonegro.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/mercadonegro.js) e um sistema de polícia básico em [policia.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/policia.js) + [investigar.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Economia/investigar.js).
- Há guardas de economia (ban/blackout) em [economyGuard.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Utils/economyGuard.js).
- O /help é dinâmico e tem abas especiais hardcoded em [help.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/ComandosSlash/Outros/help.js).

## Modelagem de dados (MongoDB/Mongoose)
1) **BlackMarketGuild** (por servidor)
- Vendors (NPCs), inventário, restock timers
- “Heat” global do servidor, intensidade de patrulha, checkpoints ativos
- Índice de demanda por item (EMA) para precificação dinâmica
- Config do evento: limites, cooldowns, caps de recompensa, balanceamento

2) **BlackMarketUser** (por usuário+servidor)
- Reputação criminosa (nível), “heat” individual, cooldowns, flags anti-cheat
- Stats (lucro, runs, apreensões sofridas)
- Facção/gang (opcional)

3) **PoliceGuild** (estender o schema atual)
- Ranking/XP por oficial
- Log de apreensões, prêmios pagos, checkpoints colocados

4) **PoliceCase**
- Casos abertos, suspeitos, evidências (transações, horários, locais)
- Progresso de investigação e estado (aberto/ativo/fechado)

5) **Factions/Territories**
- Facções (gangues) com membros, cofre, reputação e território
- Territórios com controle (%), disputas e bônus

## Mecânicas do Mercado Negro (implementação)
1) **Compra/venda de itens ilícitos**
- Itens com raridade, basePrice, repMin, risco base, cooldown
- Transações registradas (audit trail) e uso de atualizações atômicas ($inc + condições)

2) **Preço dinâmico por demanda**
- EMA de demanda por item: compras elevam demanda; restock reduz pressão
- Fórmula com limites (cap/floor):
  - price = base * (1 + demandFactor) * (1 + heatFactor) * (eventModifiers)
- Evita “explodir preço” com clamps e amortecimento

3) **Risco/procura e interceptação policial**
- Cada transação tem chance de interceptação:
  - p = baseRisk(item) + checkpointBonus + patrolBonus + userHeat + volumeBonus
- Em caso de interceptação: apreensão do item, multa/ban curto econômico (via restrictions), aumento de stats policiais

4) **NPCs vendedores**
- 4–6 NPCs com inventários únicos (ex.: Forjador, Contrabandista do Porto, Dealer da Rua, Armeiro)
- Restock com timers e chance de itens “limitados”
- “Vendedor especial” raro com janela curta (evento especial)

5) **Reputação e níveis de acesso**
- Níveis com nomes e gates (ex.: Desconhecido → Associado → Parceiro → Chefia)
- Reputação sobe por transações bem-sucedidas e missões; cai por apreensões

## Mecânicas Policiais (implementação)
1) **Investigação com pistas/evidências**
- Casos gerados por: transações interceptadas, denúncias, padrões suspeitos
- Comando de investigação consome “stamina”/cooldown e gera evidência probabilística

2) **Prêmios por capturas/apreensões**
- Recompensas proporcionais ao valor apreendido e dificuldade
- Pagamento preferencial pelo “tesouro” do servidor (política) ou fundo policial configurável

3) **Patrulhas automáticas e checkpoints**
- Ticker periódico (estilo [governance.js](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/Eventos/economia/governance.js)):
  - ativa/desativa checkpoints
  - ajusta intensidade de patrulha
- Oficiais podem colocar checkpoint (com limite e cooldown) em “distritos”

4) **Ranking de eficiência**
- Leaderboard policial: apreensões, casos fechados, valor recuperado, taxa de sucesso

## Competitividade e liberdade (rivalidade “solta”, mas balanceada)
1) **Leaderboards separadas**
- Criminosos: lucro líquido, runs bem-sucedidas, reputação
- Polícia: valor recuperado, apreensões, casos fechados

2) **Missões diárias/semanais**
- Missões por facção com recompensas escalonadas
- Rotação diária/semana via ticker; progresso persistido por usuário

3) **Clãs/facções e guerra territorial**
- Gangues criadas pelos jogadores, com cofre e controle de território
- Territórios mudam controle por ações (runs e apreensões)
- Bônus de território (ex.: desconto em vendor, chance de drop, etc.)

4) **Eventos especiais limitados**
- “Comboio”, “Leilão clandestino”, “Batida surpresa” com itens únicos e prêmios

## Anti-cheat e escalabilidade
- Cooldowns por ação + limites por janela (por ex. 10 transações/10min)
- Detecção de spam (padrões repetidos, valores extremos, burst) e “heat” automático
- Operações críticas atômicas (estoque, saldo, compra) para evitar race conditions
- Índices Mongo por guildId/userId/status/createdAt; queries com limit/lean
- Logs de auditoria e truncamento de histórico (últimos N eventos)

## Melhorias de comandos (UX)
- Consolidar em 2 comandos principais:
  - `/mercadonegro` (loja, vendors, comprar, vender, rota, reputacao, missões, ranking)
  - `/policia` (patrulhar, checkpoint, casos, investigar, ranking, recompensas)
- Manter compatibilidade: `/investigar` pode virar alias (chama o novo fluxo)
- Adicionar comandos de admin do evento:
  - configurar parâmetros, reset semanal, pausar/retomar evento, ajustar balanceamento

## Correção do /help (abas repetidas)
- Deduplicar opções por `value` e também evitar colisão de “Admin” (pasta) vs aba “ADM” hardcoded.
- Melhorar a aba de evento para refletir o novo evento Mercado Negro x Polícia.

## Conteúdo pronto (entregável junto da implementação)
- Embed promocional (≥ 500 palavras, Markdown) + mensagem curta para #avisos
- Checklist de organização do servidor: canais, cargos, regras e fluxo do evento

## Validação
- Subir bot e verificar registro de comandos
- Testar: compra/venda, interceptação, geração de casos, patrulhas, rankings, missões, facções, help
- Atualizar o arquivo `docs/COMANDOS.txt` após os novos comandos

---
### Textos (prévia imediata)
Na próxima etapa (após confirmar este plano), eu também entrego:
- Embed completo do evento (500+ palavras) pronto para colar
- Mensagem curta para #avisos
- “Como organizar” (canais/roles/regras) alinhado com suas exigências de liberdade e rivalidade