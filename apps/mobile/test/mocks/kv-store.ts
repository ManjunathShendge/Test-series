/** In-memory stand-in for expo-sqlite/kv-store in unit tests. */
const map = new Map<string, string>();

const Storage = {
  getItem: async (key: string) => map.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    map.set(key, value);
  },
  removeItem: async (key: string) => {
    map.delete(key);
  },
  multiRemove: async (keys: string[]) => {
    for (const k of keys) map.delete(k);
  },
  clear: async () => map.clear(),
};

export default Storage;
