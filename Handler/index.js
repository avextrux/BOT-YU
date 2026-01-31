const fs = require("fs");

module.exports = async (client) => {
    //====Handler das Slash====\\
    const SlashsArray = [];

    // Carregar Slash Commands
    try {
        const pastas = fs.readdirSync('./ComandosSlash/');
        for (const subpasta of pastas) {
            const arquivos = fs.readdirSync(`./ComandosSlash/${subpasta}/`).filter(arquivo => arquivo.endsWith('.js'));
            
            for (const arquivo of arquivos) {
                try {
                    const comando = require(`../ComandosSlash/${subpasta}/${arquivo}`);
                    if (comando.name) {
                        client.slashCommands.set(comando.name, comando);
                        SlashsArray.push(comando);
                    } else {
                        console.warn(`[AVISO] O comando em ${subpasta}/${arquivo} não possui um nome exportado.`);
                    }
                } catch (e) {
                    console.error(`[ERRO] Falha crítica ao carregar comando ${subpasta}/${arquivo}:`, e);
                }
            }
        }
    } catch (e) {
        console.error("[ERRO] Falha ao ler diretório ComandosSlash:", e);
    }

    client.on("ready", async () => {
        try {
            console.log(`[SLASH] Iniciando registro de ${SlashsArray.length} comandos...`);
            
            // Estratégia de Registro Robusta:
            // Tenta registrar na guilda atual para desenvolvimento instantâneo.
            // Se falhar (bot não estiver em guildas ou sem permissão), tenta global.
            
            const guilds = client.guilds.cache;
            
            if (guilds.size > 0) {
                guilds.forEach(async guild => {
                   try {
                       await guild.commands.set(SlashsArray);
                       console.log(`[SLASH] ✅ Comandos registrados com sucesso na guilda: ${guild.name}`);
                   } catch (e) {
                       console.error(`[SLASH] ⚠️ Falha ao registrar na guilda ${guild.name} (Verifique permissões 'applications.commands'):`, e.message);
                   }
                });
            } else {
                console.log("[SLASH] Bot não está em nenhuma guilda ainda. Aguardando entrada...");
            }
            
            // Opcional: Descomente abaixo para registrar globalmente também (para produção)
            // await client.application.commands.set(SlashsArray);

        } catch (e) {
            console.error("[ERRO FATAL] Falha no processo de registro de comandos:", e);
        }
    });

    //====Handler dos Eventos====\\
    try {
        if (fs.existsSync('./Eventos/')) {
            const pastasEventos = fs.readdirSync('./Eventos/');
            for (const subpasta of pastasEventos) {
                if (fs.lstatSync(`./Eventos/${subpasta}`).isDirectory()) {
                    const arquivos = fs.readdirSync(`./Eventos/${subpasta}/`).filter(arquivo => arquivo.endsWith('.js'));
                    
                    for (const arquivo of arquivos) {
                        try {
                            require(`../Eventos/${subpasta}/${arquivo}`);
                        } catch (e) {
                            console.error(`[ERRO] Falha ao carregar evento ${subpasta}/${arquivo}:`, e);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("[ERRO] Falha ao ler diretório Eventos:", e);
    }
};
