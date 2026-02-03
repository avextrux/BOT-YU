const Discord = require("discord.js");

function formatMoney(amount) {
  const n = Math.floor(Number(amount) || 0);
  return `R$ ${n.toLocaleString("pt-BR")}`;
}

function clampInt(n, min, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return null;
  if (v < min) return null;
  if (v > max) return max;
  return v;
}

function parseAmountInput(input, { max } = {}) {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (["all", "tudo", "td"].includes(raw)) return { kind: "all" };
  if (["half", "metade"].includes(raw)) return { kind: "half" };

  const cleaned = raw.replace(/\./g, "").replace(/,/g, ".");
  const num = clampInt(cleaned, 1, typeof max === "number" ? max : Number.MAX_SAFE_INTEGER);
  if (!num) return null;
  return { kind: "number", value: num };
}

function tx(type, walletDelta, bankDelta, meta) {
  return {
    at: Date.now(),
    type,
    walletDelta: Math.floor(walletDelta || 0),
    bankDelta: Math.floor(bankDelta || 0),
    meta: meta || null,
  };
}

async function pushTx(model, userId, txItem, { session } = {}) {
  await model.updateOne(
    { userID: userId },
    {
      $push: {
        "economia.transactions": {
          $each: [txItem],
          $slice: -50,
        },
      },
    },
    session ? { session } : undefined
  );
}

async function creditWallet(model, userId, amount, type, meta, { session } = {}) {
  const inc = Math.floor(amount);
  if (!Number.isFinite(inc) || inc <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId },
    {
      $inc: { "economia.money": inc },
      $push: {
        "economia.transactions": {
          $each: [tx(type, inc, 0, meta)],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function debitWalletIfEnough(model, userId, amount, type, meta, { session } = {}) {
  const dec = Math.floor(amount);
  if (!Number.isFinite(dec) || dec <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId, "economia.money": { $gte: dec } },
    {
      $inc: { "economia.money": -dec },
      $push: {
        "economia.transactions": {
          $each: [tx(type, -dec, 0, meta)],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function debitBankIfEnough(model, userId, amount, type, meta, { session } = {}) {
  const dec = Math.floor(amount);
  if (!Number.isFinite(dec) || dec <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId, "economia.banco": { $gte: dec } },
    {
      $inc: { "economia.banco": -dec },
      $push: {
        "economia.transactions": {
          $each: [tx(type, 0, -dec, meta)],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function transferWalletToBank(model, userId, amount, meta, { session } = {}) {
  const v = Math.floor(amount);
  if (!Number.isFinite(v) || v <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId, "economia.money": { $gte: v } },
    {
      $inc: { "economia.money": -v, "economia.banco": v },
      $push: {
        "economia.transactions": {
          $each: [tx("deposit", -v, v, meta)],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function transferBankToWallet(model, userId, amount, meta, { session } = {}) {
  const v = Math.floor(amount);
  if (!Number.isFinite(v) || v <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId, "economia.banco": { $gte: v } },
    {
      $inc: { "economia.banco": -v, "economia.money": v },
      $push: {
        "economia.transactions": {
          $each: [tx("withdraw", v, -v, meta)],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function creditDirtyMoney(model, userId, amount, type, meta, { session } = {}) {
  const inc = Math.floor(amount);
  if (!Number.isFinite(inc) || inc <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId },
    {
      $inc: { "economia.dirtyMoney": inc },
      $push: {
        "economia.transactions": {
          $each: [tx(type, 0, 0, { ...(meta || null), dirtyDelta: inc })],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

async function debitDirtyMoneyIfEnough(model, userId, amount, type, meta, { session } = {}) {
  const dec = Math.floor(amount);
  if (!Number.isFinite(dec) || dec <= 0) return null;

  const updated = await model.findOneAndUpdate(
    { userID: userId, "economia.dirtyMoney": { $gte: dec } },
    {
      $inc: { "economia.dirtyMoney": -dec },
      $push: {
        "economia.transactions": {
          $each: [tx(type, 0, 0, { ...(meta || null), dirtyDelta: -dec })],
          $slice: -50,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) }
  );

  return updated;
}

function errorEmbed(text) {
  return new Discord.MessageEmbed().setColor("RED").setDescription(text);
}

function successEmbed(title, text) {
  return new Discord.MessageEmbed().setColor("GREEN").setTitle(title).setDescription(text);
}

module.exports = {
  formatMoney,
  parseAmountInput,
  tx,
  pushTx,
  creditWallet,
  creditDirtyMoney,
  debitWalletIfEnough,
  debitBankIfEnough,
  debitDirtyMoneyIfEnough,
  transferWalletToBank,
  transferBankToWallet,
  errorEmbed,
  successEmbed,
};

