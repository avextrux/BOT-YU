const mongoose = require("mongoose");
const config = require("./Config.json");

const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || config.MongoURL;

console.log("Tentando conectar ao MongoDB...");
console.log("URL:", mongoUrl.replace(/:([^:@]+)@/, ":****@")); // Esconde a senha no log

mongoose.connect(mongoUrl)
    .then(() => {
        console.log("✅ Conexão com MongoDB bem sucedida!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Erro ao conectar no MongoDB:", err.message);
        process.exit(1);
    });
