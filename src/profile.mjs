// Sync personal salary numbers (wage, allowances, insurance base) from 1Office into config.json.
import { fetchSalaryProfile, fetchPayslip } from './fetch.mjs';
import { loadConfig, saveConfig } from './config.mjs';

const WAGE_RE = /^Lương ngày công$|^Daily wage/i;
const SITE_RE = /công trình/i;
const INSURANCE_BASE_RE = /^Lương đóng bảo hiểm$/i;
const INSURANCE_RATE_RE = /trừ vào lương \(([\d.,]+)%\)/i;

export async function syncProfile({ payslipMonths = 3 } = {}) {
  const profile = await fetchSalaryProfile();
  const cfg = loadConfig();
  const changes = [];
  const set = (label, before, after) => {
    if (before !== after) changes.push({ field: label, before, after });
  };

  for (const [label, amount] of Object.entries(profile.items)) {
    if (WAGE_RE.test(label)) {
      set('salary.dailyWageSalary', cfg.salary.dailyWageSalary, amount);
      cfg.salary.dailyWageSalary = amount;
    } else if (SITE_RE.test(label)) {
      set('siteAllowancePerDay', cfg.siteAllowancePerDay, amount);
      cfg.siteAllowancePerDay = amount;
    } else {
      const prev = cfg.allowances[label];
      set(`allowances.${label}`, prev?.amount ?? null, amount);
      cfg.allowances[label] = { amount, prorate: prev?.prorate ?? false };
    }
  }
  // Allowances that disappeared from 1Office are removed.
  for (const label of Object.keys(cfg.allowances)) {
    if (!(label in profile.items)) {
      set(`allowances.${label}`, cfg.allowances[label].amount, null);
      delete cfg.allowances[label];
    }
  }

  // Insurance base/rate only appear on a published payslip: look back a few months.
  const now = new Date();
  let insuranceFrom = null;
  for (let i = 1; i <= payslipMonths && !insuranceFrom; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const slip = await fetchPayslip(d.getMonth() + 1, d.getFullYear());
    if (!slip.published) continue;
    const base = slip.lines.find((l) => INSURANCE_BASE_RE.test(l.label))?.amount;
    const rateLine = slip.lines.find((l) => INSURANCE_RATE_RE.test(l.label));
    if (base) {
      set('insurance.base', cfg.insurance.base, base);
      cfg.insurance.base = base;
      insuranceFrom = `${d.getMonth() + 1}/${d.getFullYear()}`;
    }
    if (rateLine) {
      const rate = Number(rateLine.label.match(INSURANCE_RATE_RE)[1].replace(',', '.')) / 100;
      set('insurance.employeeRate', cfg.insurance.employeeRate, rate);
      cfg.insurance.employeeRate = rate;
    }
  }

  cfg.profile = { syncedAt: new Date().toISOString(), effectiveFrom: profile.effectiveFrom, insuranceFrom };
  saveConfig(cfg);
  return { effectiveFrom: profile.effectiveFrom, olderEntries: profile.otherDates, insuranceFrom, changes, config: cfg };
}

// Calculation tools call this first so a fresh clone works without manual setup.
export async function ensureProfile() {
  const cfg = loadConfig();
  if (!cfg.profile) await syncProfile();
  return loadConfig();
}
