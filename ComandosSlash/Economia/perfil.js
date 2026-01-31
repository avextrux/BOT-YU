const Discord = require('discord.js')
const Canvas = require('canvas')

// Registro de fonte centralizado e com tratamento de erro
try {
    Canvas.registerFont('./Font.otf', { family: 'Uniform' })
} catch (e) {
    console.warn("⚠️ Fonte 'Uniform' não encontrada ou inválida. Usando fonte padrão.");
}

module.exports = {
    name: "perfil",
    description: "ver a sua atm ou a de alguém",
    type: 'CHAT_INPUT',
    options: [
        {
         name: "user",
         description: "usuário que você quer ver a atm.",
         type: "USER",
         required: false
        },
        ],
    run: async (client, interaction) => {
    
    // Defer a resposta para evitar erro "Unknown interaction" se o canvas demorar
    await interaction.deferReply();

    try {
        const user = interaction.options.getUser("user") || interaction.user

        // Usa o getOrCreate que criamos antes, ou fallback para findOne
        let userdb = await client.userdb.findOne({ userID: user.id });
        if (!userdb) {
            // Se não existir, cria um objeto dummy para visualização (ou cria no banco se preferir)
            userdb = { 
                economia: { 
                    marry: { casado: false }, 
                    banco: 0, 
                    money: 0, 
                    sobremim: "Use /sobremim para alterar este texto."
                }
            };
            // Opcional: criar usuário se não existir
            if (client.userdb.getOrCreate) {
                userdb = await client.userdb.getOrCreate(user.id);
            }
        }

        const canvas = Canvas.createCanvas(850, 550)
        const ctx = canvas.getContext("2d")

        const background = await Canvas.loadImage("https://i.imgur.com/vFqyhnK.png")
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height)

        const layout = await Canvas.loadImage("https://i.imgur.com/NPR3ALW.png")
        ctx.drawImage(layout, 0, 0, canvas.width, canvas.height)

        // Verifica se a fonte carregou, senão usa Arial
        const fontBase = 'Uniform, "Segoe UI", Arial, sans-serif';

        ctx.font = `30px ${fontBase}`;
        ctx.fillStyle = '#F8F8F8';
        ctx.fillText(`${user.username}`, 149 - user.username.length * 7, 37)

        ctx.font = `22px ${fontBase}`;
        ctx.fillStyle = '#F8F8F8';

        const sobremim = userdb.economia.sobremim || "Sem descrição.";
        drawWrappedText(ctx, sobremim, 60, 455, 730, 26, 3);
        
        ctx.font = `23px ${fontBase}`;
        ctx.fillStyle = '#F8F8F8';
        ctx.fillText(`${abreviar(userdb.economia.money || 0)}`, 717, 229)
        ctx.fillText(`${abreviar(userdb.economia.banco || 0)}`, 690, 268)
        ctx.fillText(`${abreviar((userdb.economia.banco || 0) + (userdb.economia.money || 0))}`, 672, 312)

        ctx.save()
        
        if(userdb.economia.marry && userdb.economia.marry.casado && userdb.economia.marry.com){
            try {
                const img = await Canvas.loadImage("https://i.imgur.com/JI5SfCN.png")
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

                const marryUser = await client.users.fetch(userdb.economia.marry.com).catch(() => null);
                
                if (marryUser) {
                    ctx.font = `20px ${fontBase}`;
                    ctx.fillStyle = '#F8F8F8';
                    ctx.fillText(`${marryUser.username}`, 690 - marryUser.username.length * 7.4, 74)

                    if (userdb.economia.marry.since) {
                        const sinceText = new Date(userdb.economia.marry.since).toLocaleDateString('pt-BR');
                        ctx.font = `16px ${fontBase}`;
                        ctx.fillStyle = '#F8F8F8';
                        ctx.fillText(`Desde: ${sinceText}`, 610, 146)
                    }
                
                    const avatarUser = marryUser.displayAvatarURL({ format: "png", size: 1024 });

                    ctx.beginPath();
                    ctx.arc(688, 111, 33, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip();
                
                    const marryAvatar = await Canvas.loadImage(avatarUser)
                    ctx.drawImage(marryAvatar, 656, 79, 65, 65)
                }
            } catch (err) {
                console.error("Erro ao carregar dados do casamento:", err);
            }
        }

        if (!userdb.economia.marry || !userdb.economia.marry.casado) {
            ctx.font = `18px ${fontBase}`;
            ctx.fillStyle = '#F8F8F8';
            ctx.fillText(`Solteiro(a)`, 610, 74);
        }

        ctx.restore()
        
        ctx.beginPath();
        ctx.arc(206, 100, 53, 4.7, Math.PI * 0);
        ctx.arc(206, 205, 53, 6.35, Math.PI * 0.52);
        ctx.arc(101, 205, 53, 1.65, Math.PI * 1);
        ctx.arc(101, 100, 53, 3.3, Math.PI * 1.5);
        ctx.closePath();
        ctx.clip();

        const avatar = user.displayAvatarURL({ format: "png", size: 1024 });

        const userAvatar = await Canvas.loadImage(avatar)
        ctx.drawImage(userAvatar, 45, 45, 218, 218)
        
        const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'perfil.png')
        
        // Usa editReply porque já demos deferReply
        await interaction.editReply({ files: [attachment] })        

    } catch (err) {
        console.error(err);
        // Tenta responder com erro se ainda não respondeu, ou edita se já respondeu
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "Ocorreu um erro ao gerar o perfil." }).catch(() => {});
        } else {
            await interaction.reply({ content: "Ocorreu um erro ao gerar o perfil.", ephemeral: true }).catch(() => {});
        }
    }

}
}

function abreviar(number, precision=2) {
  return number.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: precision })
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/g);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }

    if (line) lines.push(line);
    line = w;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && line) lines.push(line);

  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const isLast = i === maxLines - 1 && lines.length > maxLines;
    const t = isLast ? (lines[i].slice(0, 70) + "...") : lines[i];
    ctx.fillText(t, x, y + i * lineHeight);
  }
}
