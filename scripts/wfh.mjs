// Usage: node wfh.mjs [--submit]   (without --submit: fill and read back only)
import { withPage } from '../src/browser.mjs';

const DATE = '10/10/2026';
const TIMES = ['08:00', '17:00'];
const DESC = 'wfh';
const SUBMIT = process.argv.includes('--submit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addRow() {
  document.querySelector('[v="form.plus"] .form-plus-footer .icon-plus').click();
  return document.querySelectorAll('input[name$="[time]"]').length;
}

function fillRow(i, date, time) {
  const q = (f) => document.querySelector(`[name="inoutinfo[${i}][${f}]"]`);
  const set = (el, v) => {
    el.value = v;
    $(el).trigger('input').trigger('change').trigger('blur');
  };
  set(q('date'), date);
  set(q('time'), time);
  $(q('reason')).val('REASON_INOUT_107').trigger('change');
  return !!q('time');
}

function setDesc(text) {
  const ta = document.querySelector('textarea[name="desc"]');
  const ed = ta.closest('[v="form.editor"]').querySelector('[contenteditable]');
  if (ed) {
    ed.focus();
    ed.innerHTML = '<p>' + text + '</p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new Event('keyup', { bubbles: true }));
    ed.blur();
  }
  ta.value = '<p>' + text + '</p>';
  $(ta).trigger('change');
}

function readBack() {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const q = (f) => document.querySelector(`[name="inoutinfo[${i}][${f}]"]`);
    if (!q('date')) continue;
    const r = q('reason');
    const s = q('shift_id');
    rows.push({ i, date: q('date').value, time: q('time').value, reason: r.options[r.selectedIndex]?.text, shift: s?.options[s.selectedIndex]?.text, penance: q('penance')?.value });
  }
  const btns = [...document.querySelectorAll('button, .btn')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter(Boolean);
  const person = document.querySelector('select[name="personnel_id"]');
  return { rows, desc: document.querySelector('[v="form.editor"] [contenteditable]')?.innerText, person: person?.options[person.selectedIndex]?.text || '', btns };
}

function clickSave() {
  const b = [...document.querySelectorAll('button, .btn')].find((x) => x.offsetParent && /^(Cập nhật|Lưu|Gửi)$/.test(x.textContent.trim()));
  if (b) b.click();
  return b ? b.textContent.trim() : null;
}

function result() {
  const f = [...document.querySelectorAll('.detail-field-label')].map((l) => l.textContent.trim() + ': ' + (l.nextElementSibling?.innerText || '').replace(/\s+/g, ' ').trim());
  const rows = [...document.querySelectorAll('table tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /\d{2}\/\d{2}\/\d{4}/.test(t));
  return location.href + '\n' + f.join('\n') + '\n' + rows.join('\n');
}

const run = (fn, ...a) => `(${fn.toString()})(...${JSON.stringify(a)})`;

const out = await withPage(async (p) => {
  await p.goto('https://kimsontien.1office.vn/apps/approval-inout-inout/add', `document.querySelector('[name="inoutinfo[0][time]"]') && typeof $==='function'`, 40000);
  // wait for the form to finish loading (save button replaces "Đang tải dữ liệu")
  await p.waitFor(`[...document.querySelectorAll('button,.btn')].some(b=>b.offsetParent && /^(Cập nhật|Lưu|Gửi)$/.test(b.textContent.trim()))`, 30000);
  await p.eval(run(fillRow, 0, DATE, TIMES[0]));
  await sleep(800);
  await p.eval(run(addRow));
  await sleep(1200);
  await p.eval(run(fillRow, 1, DATE, TIMES[1]));
  await p.eval(run(setDesc, DESC));
  await sleep(2000);
  const back = await p.eval(run(readBack));
  const ok = back.rows.length === 2 && back.rows.every((r, k) => r.date === DATE && r.time === TIMES[k] && /Work from home/.test(r.reason || '')) && back.desc?.includes(DESC);
  if (!SUBMIT || !ok) return { submitted: false, ok, back };
  const clicked = await p.eval(run(clickSave));
  await p.waitFor(`/view[?]ID=/.test(location.href)`, 25000);
  await sleep(3000);
  return { submitted: true, clicked, result: await p.eval(run(result)) };
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
