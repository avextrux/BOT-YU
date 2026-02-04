const mongoose = require("mongoose");
const { getMongoUrl } = require("./Utils/config");

const mongoUrl = getMongoUrl();

console.log("Tentando conectar ao MongoDB...");
if (!mongoUrl) {
    console.error("❌ MongoURL ausente. Configure MONGO_URL/MONGODB_URI ou Config.json.");
    process.exit(1);
}
console.log("URL:", mongoUrl.replace(/:([^:@]+)@/, ":****@"));

mongoose.connect(mongoUrl)
    .then(() => {
        console.log("✅ Conexão com MongoDB bem sucedida!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Erro ao conectar no MongoDB:", err.message);
        process.exit(1);
    });
