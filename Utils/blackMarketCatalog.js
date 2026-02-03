const DISTRICTS = [
    { id: "central", name: "Centro" },
    { id: "docks", name: "Porto" },
    { id: "industrial", name: "Zona Industrial" },
    { id: "suburbs", name: "Subúrbios" },
    { id: "slums", name: "Baixada" },
];

const REP_LEVELS = [
    { level: 0, name: "Desconhecido", minScore: 0 },
    { level: 1, name: "Contato", minScore: 250 },
    { level: 2, name: "Associado", minScore: 600 },
    { level: 3, name: "Operador", minScore: 1200 },
    { level: 4, name: "Chefão", minScore: 2000 },
];

const ITEMS = {
    CIGS: { id: "CIGS", name: "Cigarros", basePrice: 120, minLevel: 0, risk: 0.10, buyback: 0.75 },
    WEED: { id: "WEED", name: "Erva", basePrice: 250, minLevel: 0, risk: 0.15, buyback: 0.72 },
    DOCS: { id: "DOCS", name: "Docs Falsos", basePrice: 450, minLevel: 1, risk: 0.18, buyback: 0.70 },
    CHIPS: { id: "CHIPS", name: "Chip Clonado", basePrice: 680, minLevel: 1, risk: 0.20, buyback: 0.68 },
    MEDS: { id: "MEDS", name: "Remédios", basePrice: 900, minLevel: 2, risk: 0.26, buyback: 0.65 },
    COKE: { id: "COKE", name: "Pó Branco", basePrice: 1500, minLevel: 2, risk: 0.35, buyback: 0.60 },
    ART: { id: "ART", name: "Arte Roubada", basePrice: 1400, minLevel: 2, risk: 0.30, buyback: 0.62 },
    METH: { id: "METH", name: "Cristais", basePrice: 2800, minLevel: 3, risk: 0.40, buyback: 0.55 },
    ARMS: { id: "ARMS", name: "Peças de Arma", basePrice: 2200, minLevel: 3, risk: 0.38, buyback: 0.58 },
    DATA: { id: "DATA", name: "Dossiê", basePrice: 3100, minLevel: 3, risk: 0.42, buyback: 0.56 },
    RELIC: { id: "RELIC", name: "Relíquia", basePrice: 5200, minLevel: 4, risk: 0.55, buyback: 0.52 },
};

const VENDORS = [
    {
        vendorId: "RATO",
        name: "Rato do Asfalto",
        restockEveryMs: 45 * 60 * 1000,
        pool: [
            { itemId: "CIGS", max: 30 },
            { itemId: "WEED", max: 20 },
            { itemId: "DOCS", max: 10 },
            { itemId: "CHIPS", max: 8 },
        ],
    },
    {
        vendorId: "PORTO",
        name: "Contrabandista do Porto",
        restockEveryMs: 60 * 60 * 1000,
        pool: [
            { itemId: "CIGS", max: 40 },
            { itemId: "MEDS", max: 10 },
            { itemId: "COKE", max: 10 },
            { itemId: "ART", max: 6 },
        ],
    },
    {
        vendorId: "FERRUGEM",
        name: "Ferrugem (Sucata & Peças)",
        restockEveryMs: 75 * 60 * 1000,
        pool: [
            { itemId: "CHIPS", max: 12 },
            { itemId: "ARMS", max: 6 },
            { itemId: "METH", max: 8 },
            { itemId: "DATA", max: 4 },
        ],
    },
    {
        vendorId: "MUSEU",
        name: "Curadora Sombria",
        restockEveryMs: 90 * 60 * 1000,
        pool: [
            { itemId: "ART", max: 8 },
            { itemId: "DATA", max: 6 },
            { itemId: "RELIC", max: 2 },
        ],
    },
];

module.exports = {
    DISTRICTS,
    REP_LEVELS,
    ITEMS,
    VENDORS,
};

