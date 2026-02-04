const { getJson } = require("./http");
const { getGiphyKey: getGiphyKeyFromConfig } = require("./config");

const cache = new Map();

async function getRandomGifUrl(query, { rating = "pg-13" } = {}) {
  const apiKey = getGiphyKeyFromConfig();
  if (!apiKey) return null;

  const cacheKey = `${query}::${rating}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.urls.length) {
    return cached.urls[Math.floor(Math.random() * cached.urls.length)];
  }

  const offset = Math.floor(Math.random() * 50);
  const url =
    "https://api.giphy.com/v1/gifs/search" +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=25` +
    `&offset=${offset}` +
    `&rating=${encodeURIComponent(rating)}` +
    `&lang=pt`;

  const json = await getJson(url);
  const data = Array.isArray(json?.data) ? json.data : [];

  const candidates = [];
  for (const d of data) {
    const images = d?.images || {};
    const picks = [
      images?.fixed_height?.url,
      images?.fixed_width?.url,
      images?.fixed_height_downsampled?.url,
      images?.fixed_width_downsampled?.url,
      images?.downsized_medium?.url,
      images?.downsized?.url,
      images?.original?.url,
    ];
    for (const u of picks) {
      if (typeof u === "string") candidates.push(u);
    }
  }

  const urls = candidates
    .filter((u) => u.startsWith("http"))
    .map((u) => u.split("#")[0])
    .map((u) => u.split("?")[0])
    .filter((u) => u.toLowerCase().endsWith(".gif"))
    .filter((u) => u.includes("giphy.com"))
    .filter((u, i, arr) => arr.indexOf(u) === i);

  cache.set(cacheKey, { expiresAt: now + 10 * 60 * 1000, urls });
  if (!urls.length) return null;
  return urls[Math.floor(Math.random() * urls.length)];
}

module.exports = { getRandomGifUrl };
