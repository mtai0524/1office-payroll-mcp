import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ROOT = the package (code + shared rules). Under `npx` it lives in the npm cache,
// so personal data goes to DATA_DIR in the user's home instead.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.OFFICE_PAYROLL_HOME || path.join(os.homedir(), '.1office-payroll');
export const IS_CHECKOUT = fs.existsSync(path.join(ROOT, '.git'));

export const EXAMPLE_CONFIG_PATH = path.join(ROOT, 'config.example.json');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const NOTES_PATH = path.join(DATA_DIR, 'notes.md');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');

// Shared rules ship with the package. A local copy in DATA_DIR (written by update_rules
// when not running from a git checkout) takes precedence.
const LOCAL_RULES_PATH = path.join(DATA_DIR, 'rules.md');
const PACKAGE_RULES_PATH = path.join(ROOT, 'rules.md');
export const rulesPath = () => (fs.existsSync(LOCAL_RULES_PATH) ? LOCAL_RULES_PATH : PACKAGE_RULES_PATH);
export const rulesWritePath = () => (IS_CHECKOUT ? PACKAGE_RULES_PATH : LOCAL_RULES_PATH);

// config.json is personal; first run starts from the example.
export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(EXAMPLE_CONFIG_PATH, CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

export function readNotes() {
  return fs.existsSync(NOTES_PATH) ? fs.readFileSync(NOTES_PATH, 'utf8') : '';
}

export function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
