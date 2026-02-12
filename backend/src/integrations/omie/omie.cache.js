const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expireAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlMs) {
  cache.set(key, {
    value,
    expireAt: Date.now() + ttlMs
  });
}

module.exports = { getCache, setCache };
