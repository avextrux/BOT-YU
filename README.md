
## Bot-YU

Bot em Discord.js v13 com Slash Commands e MongoDB (Mongoose).

O projeto possui múltiplas categorias de comandos (Economia, Evento/Submundo, Moderação, Diversão, Loja, Utilidade). Para ver a lista completa, rode `npm run gen:cmds` (gera `docs/COMANDOS.txt`).

## Dependências principais
- discord.js 13.x
- mongoose 9.x
- canvas 3.x
- moment 2.x

Versões exatas em [package.json](file:///c:/Users/Micro/Downloads/Telegram%20Desktop/BOT-YU/package.json).

## Configuração
Você pode configurar por variáveis de ambiente (recomendado) ou pelo arquivo `Config.json` (fallback local).

Variáveis de ambiente:
- `BOT_TOKEN` (ou `DISCORD_TOKEN`)
- `MONGO_URL` (ou `MONGODB_URI`)
- `GIPHY_KEY` (ou `GIPHY_API_KEY` / `GIPHY_SDK_KEY`) (opcional, para comandos de gif)
- `LOG_LEVEL` (`debug|info|warn|error`, padrão `info`)
- `SLASH_REGISTER_SCOPE` (`guild|global`, padrão `guild`)

Fallback via `Config.json` (não é necessário alterar este arquivo se você usar env vars):
```json
{
    "BotToken": "Seu Token Aqui",
    "MongoURL": "A String de conexão do MongoDB aqui."
}
```
***(Caso você não saiba pegar a A String de conexão do MongoDB, [veja este video](https://youtu.be/6hYXX4A1cyY) até mais ou menos o minuto 3 que ele ensina como pega-la e configurar as opções lá no site do MongoDB.)***

## Como rodar
```bash
npm install
npm start
```

## Replit
[![Ver o projeto na Replit](https://img.shields.io/badge/Ver--o--projeto--na--replit-000000?style=for-the-badge&logo=replit&logoColor=white)](https://replit.com/@AubreyFBG/Discord-bot-v13-com-MongoDB)
[![Dar Fork na Replit](https://img.shields.io/badge/dar--fork--na--replit-000000?style=for-the-badge&logo=replit&logoColor=white)](https://repl.it/github/AubreyFBG/Bot-para-Discord-com-MongoDB)

## 🍡・Pré-view de alguns comandos:
<img  src="https://i.imgur.com/Urwug5a.jpg"> 
<img  src="https://i.imgur.com/CQwSpts.jpg"> 
<img  src="https://i.imgur.com/OxHsc7X.jpg"> 

## Créditos
Bot feito por: misss_aubrey
