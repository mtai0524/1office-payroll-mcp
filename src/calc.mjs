// Deterministic salary calculation, audit and payslip comparison.
// Everything here is pure: input = fetched month data + config + options.

const pad = (n) => String(n).padStart(2, '0');
const round = (v, step) => Math.round(v / step) * step;
const r4 = (v) => Math.round(v * 10000) / 10000;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const WFH_RE = /home|online/i;
const SITE_RE = /công trình/i;
const OVERSEAS_RE = /nước ngoài|overseas/i;

const OVERRIDE_PRESETS = {
  CT: { hours: 8, mission: true, meal: false, note: 'công tác (có đơn)' },
  SITE: { hours: 8, site: true, meal: false, note: 'đi công trình (không có đơn công tác)' },
  WFH: { hours: 8, wfh: true, meal: false, note: 'làm online' },
  OFFICE: { hours: 8, meal: true, note: 'làm ở công ty' },
  OFF: { hours: 0, meal: false, note: 'nghỉ' },
};

function normalizeOverride(v) {
  if (typeof v === 'string') {
    const preset = OVERRIDE_PRESETS[v.toUpperCase()];
    if (!preset) throw new Error(`Override không hợp lệ "${v}" (dùng ${Object.keys(OVERRIDE_PRESETS).join('/')} hoặc object)`);
    return { ...preset };
  }
  if (typeof v === 'number') return { hours: v };
  return { ...v };
}

// Build the per-day model: timesheet + applications + assumptions + overrides.
export function buildDays(data, cfg, opts = {}) {
  const today = opts.today || todayIso();
  const hpd = cfg.salary.hoursPerDay;
  const assume = opts.assumeFutureDays ?? cfg.assumeFutureDays;
  const overrides = Object.fromEntries(
    Object.entries(opts.dayOverrides || {}).map(([k, v]) => [/^\d{1,2}$/.test(k) ? `${data.year}-${pad(data.month)}-${pad(k)}` : k, v]),
  );

  const byDate = {};
  for (const a of data.applications) {
    if (!a.approved) continue;
    for (const e of a.entries) (byDate[e.date] ||= []).push({ app: a, entry: e });
  }

  return data.timesheet.days.map((d) => {
    const apps = byDate[d.date] || [];
    const holiday = d.codes.includes('L');
    const off = d.codes.includes('N') || d.weekday === 0;
    const mission = apps.some((x) => x.app.type === 'mission');
    const wfh = apps.some((x) => x.app.type === 'inout' && WFH_RE.test(x.entry.reason || ''));
    const site = apps.some((x) => x.app.type === 'inout' && SITE_RE.test(x.entry.reason || ''));
    const leaveApps = apps.filter((x) => x.app.type === 'leave');
    const leaveDays = leaveApps.reduce((s, x) => s + (x.entry.days || 0), 0);
    const otHours = apps.filter((x) => x.app.type === 'overtime').reduce((s, x) => s + (x.entry.hours || 0), 0);

    let day = {
      date: d.date,
      day: Number(d.date.slice(8)),
      weekday: d.weekday,
      point: d.point,
      time: d.time,
      hours: d.hours,
      holiday,
      off,
      mission,
      wfh,
      site,
      leaveDays,
      hasLeaveApp: leaveApps.length > 0,
      otHours,
      absent: d.absent,
      source: 'timesheet',
      note: '',
    };

    const pending = d.date > today || (d.date === today && d.hours === 0);
    if (pending && !holiday && !off && assume !== 'none') {
      day = { ...day, ...normalizeOverride(assume === 'office' ? 'OFFICE' : assume), source: 'assumed' };
    }
    if (overrides[d.date] !== undefined) {
      day = { ...day, ...normalizeOverride(overrides[d.date]), source: 'override' };
    }
    if (day.meal === undefined) {
      day.meal = day.hours > 0 && !day.holiday && !day.off && !day.mission && !day.site && !day.wfh && day.leaveDays < 1;
    }
    day.hoursPerDay = hpd;
    return day;
  });
}

function standardDays(data, cfg) {
  if (cfg.salary.standardDays !== 'auto') return cfg.salary.standardDays;
  return data.timesheet.days.filter((d) => d.weekday !== 0).length;
}

export function calculate(data, cfg, opts = {}) {
  const days = buildDays(data, cfg, opts);
  const hpd = cfg.salary.hoursPerDay;
  const step = cfg.salary.roundTo;
  const std = standardDays(data, cfg);

  const totalHours = days.reduce((s, d) => s + d.hours, 0);
  const points = r4(totalHours / hpd);
  const baseSalary = round((cfg.salary.dailyWageSalary * points) / std, step);

  const missionDays = days.filter((d) => d.mission).length;
  const siteAllowance = missionDays * cfg.siteAllowancePerDay;

  const allowances = Object.entries(cfg.allowances).map(([label, a]) => ({
    label,
    amount: a.prorate ? round((a.amount * Math.min(points, std)) / std, step) : a.amount,
  }));

  const mealDays = days.filter((d) => d.meal).map((d) => d.day);
  const meals = opts.meals ?? mealDays.length;
  const mealDeduction = meals * cfg.mealPrice;
  const insurance = (cfg.insurance.base ?? 0) * cfg.insurance.employeeRate;
  const adjustments = (opts.adjustments || []).map((a) => ({ label: a.label, amount: Number(a.amount) }));

  const income = baseSalary + siteAllowance + allowances.reduce((s, a) => s + a.amount, 0);
  const rawNet = income + adjustments.reduce((s, a) => s + a.amount, 0) - insurance - mealDeduction;
  const net = round(rawNet, step);

  const lines = [
    { key: 'points', label: 'Tổng công thực tính', value: points, note: `${r4(totalHours)} giờ / ${hpd}` },
    { key: 'baseSalary', label: 'Lương CB thực nhận', value: baseSalary, note: `${cfg.salary.dailyWageSalary.toLocaleString('vi-VN')} × ${points} / ${std}` },
    { key: 'missionDays', label: 'Ngày công tác', value: missionDays },
    { key: 'siteAllowance', label: 'PCCT thực lãnh', value: siteAllowance, note: `${missionDays} × ${cfg.siteAllowancePerDay.toLocaleString('vi-VN')}` },
    ...allowances.map((a) => ({ key: `allowance:${a.label}`, label: a.label, value: a.amount })),
    ...adjustments.map((a) => ({ key: 'adjustment', label: a.label, value: a.amount })),
    { key: 'insurance', label: 'BHXH trừ vào lương', value: -insurance },
    { key: 'advance', label: 'Trừ cơm trưa (Tạm ứng)', value: -mealDeduction, note: `${meals} bữa × ${cfg.mealPrice.toLocaleString('vi-VN')}` },
    { key: 'net', label: 'THỰC LÃNH (NET)', value: net },
  ];

  return {
    month: data.month,
    year: data.year,
    standardDays: std,
    points,
    net,
    lines,
    meals: { count: meals, days: mealDays, overridden: opts.meals !== undefined },
    assumed: days.filter((d) => d.source === 'assumed').map((d) => d.day),
    overridden: days.filter((d) => d.source === 'override').map((d) => ({ day: d.day, hours: d.hours, note: d.note })),
    days: days.map((d) => ({
      day: d.day,
      point: d.point,
      hours: d.hours,
      tags: [
        d.holiday && 'lễ',
        d.off && 'nghỉ tuần',
        d.mission && 'công tác',
        d.site && 'công trình(IO)',
        d.wfh && 'online',
        d.leaveDays && `nghỉ ${d.leaveDays}`,
        d.otHours && `OT ${d.otHours}h`,
        d.absent && '×',
        d.meal && 'ăn cty',
        d.source !== 'timesheet' && d.source,
      ].filter(Boolean),
    })),
  };
}

// Problems worth fixing before payroll closes, with money impact where computable.
export function audit(data, cfg, opts = {}) {
  const today = opts.today || todayIso();
  const days = buildDays(data, cfg, { ...opts, dayOverrides: {}, assumeFutureDays: 'none' });
  const std = standardDays(data, cfg);
  const hpd = cfg.salary.hoursPerDay;
  const perHour = cfg.salary.dailyWageSalary / std / hpd;
  const issues = [];
  const minor = [];
  const add = (severity, day, message, loss = 0) => issues.push({ severity, day, message, estimatedLoss: Math.round(loss) });

  for (const d of days) {
    if (d.holiday || d.off || d.date >= today) continue;
    const covered = d.mission || d.wfh || d.site || d.hasLeaveApp;
    const expected = hpd - d.leaveDays * hpd;
    if ((d.hours === 0 || d.absent) && !covered) {
      add('high', d.day, `0 công, không có đơn nào (ô bảng công: "${d.point}")`, hpd * perHour);
    } else if (d.hours === 0 && (d.mission || d.wfh || d.site)) {
      add('high', d.day, 'Có đơn công tác/online nhưng bảng công vẫn 0 công, kiểm tra đơn đã được tính chưa', hpd * perHour);
    } else if (d.hours > 0 && d.hours < expected - 0.01) {
      const missing = expected - d.hours;
      if (missing >= 1) add('medium', d.day, `Thiếu ${r4(missing)} giờ (${d.hours}/${expected}), giờ ra vào ${d.time || '?'}`, missing * perHour);
      else minor.push({ day: d.day, missing });
    }
  }
  if (minor.length) {
    const total = minor.reduce((s, m) => s + m.missing, 0);
    add('low', minor.map((m) => m.day).join(', '), `Đi muộn/về sớm vài phút: tổng thiếu ${r4(total)} giờ`, total * perHour);
  }

  for (const a of data.applications) {
    const days = [...new Set(a.entries.map((e) => Number(e.date?.slice(8))))].join(', ');
    if (!a.approved) add('medium', days, `Đơn ${a.type} #${a.id} chưa duyệt (${a.status})`);
    if (a.type === 'leave' && a.entries.some((e) => !e.days || (e.fromTime === '00:00' && e.toTime === '00:00'))) {
      add('medium', days, `Đơn nghỉ #${a.id} (${a.reason}) có thời lượng 0 ngày / giờ 00:00–00:00, đơn nhập sai`);
    }
    if (a.type === 'mission' && OVERSEAS_RE.test(a.kind || '')) {
      add('low', days, `Đơn công tác #${a.id} ghi hình thức "${a.kind}" nhưng địa điểm "${a.place}", có thể chọn nhầm`);
    }
    if (a.type === 'inout' && a.entries.some((e) => e.penalty)) {
      add('low', days, `Đơn bổ sung chấm công #${a.id} bị tính phạt (${a.entries.map((e) => `${e.time} ${e.reason}`).join('; ')})`);
    }
    if (a.type === 'overtime') {
      for (const e of a.entries) {
        const d = days && data.timesheet.days.find((x) => x.date === e.date);
        if (d && d.hours < hpd + e.hours - 0.01 && !d.codes.includes('OT')) {
          add('low', Number(e.date.slice(8)), `Có đơn tăng ca ${e.hours}h nhưng bảng công chỉ ${d.hours} giờ`);
        }
      }
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { month: data.month, year: data.year, stats: data.timesheet.stats, issues };
}

// Compare our calculation against the published payslip, line by line.
export function comparePayslip(data, cfg, opts = {}) {
  const calc = calculate(data, cfg, opts);
  if (!data.payslip?.published) return { published: false, message: 'Phiếu lương tháng này chưa được công bố', calc };
  const ours = Object.fromEntries(calc.lines.map((l) => [l.key, l.value]));
  const rows = [];
  const matched = new Set();
  for (const line of data.payslip.lines) {
    const key = cfg.payslipLabelMap[line.label];
    if (!key) {
      rows.push({ label: line.label, payslip: line.amount ?? line.value, ours: null, diff: null, hint: line.hint });
      continue;
    }
    matched.add(key);
    let mine = ours[key];
    // Payslip shows deductions as positive numbers.
    if (key === 'insurance' || key === 'advance') mine = mine == null ? null : -mine;
    const diff = line.amount != null && mine != null ? r4(line.amount - mine) : null;
    rows.push({ label: line.label, key, payslip: line.amount, ours: mine, diff, hint: line.hint });
  }
  return {
    published: true,
    tables: data.payslip.tables,
    rows,
    mismatches: rows.filter((r) => r.diff),
    notOnPayslip: calc.lines.filter((l) => !matched.has(l.key) && l.key !== 'adjustment').map((l) => l.label),
    calc,
  };
}
