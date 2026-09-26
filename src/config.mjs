import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'config.json');
export const EXAMPLE_CONFIG_PATH = path.join(ROOT, 'config.example.json');
export const RULES_PATH = path.join(ROOT, 'rules.md');
export const NOTES_PATH = path.join(ROOT, 'notes.md');
export const CACHE_DIR = path.join(ROOT, 'cache');

// config.json is personal (gitignored); first run starts from the example.
export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fs.copyFileSync(EXAMPLE_CONFIG_PATH, CONFIG_PATH);
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

export function readNotes() {
  return fs.existsSync(NOTES_PATH) ? fs.readFileSync(NOTES_PATH, 'utf8') : '';
}

export function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

// Deep-merge `patch` into the config (null deletes a key).
export function patchConfig(patch) {
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v === null) delete a[k];
      else if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v);
      else a[k] = v;
    }
    return a;
  };
  const cfg = merge(loadConfig(), patch);
  saveConfig(cfg);
  return cfg;
}

export function readCache(name) {
  const p = path.join(CACHE_DIR, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

export function writeCache(name, data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data, null, 2));
}
