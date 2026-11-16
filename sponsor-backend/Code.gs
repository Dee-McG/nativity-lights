/**
 * Sponsor an Animal – Google Apps Script backend
 * Tom Giblin Nativity & Christmas Lights
 *
 * Runs inside a Google Sheet (Extensions > Apps Script). It:
 *  - tells the website which animals are reserved or sponsored (GET ?action=status)
 *  - saves each sponsorship as a row in the "Sponsorships" sheet (POST)
 *  - saves the sponsor's logo to a Google Drive folder
 *  - emails the sponsor (with the iDonate link) and emails Tom
 *  - sends a reminder after 20 hours and releases unpaid holds after 24 hours
 *  - emails the sponsor a confirmation when Status is set to "Donation received"
 *
 * Set-up steps are in README.md in this folder.
 */

/* ===================== SETTINGS: edit these ===================== */
const CONFIG = {
  // Where Tom's notifications go
  NOTIFY_EMAIL: 'tggiblin@gmail.com',
  // Shown as the sender name on every email
  SENDER_NAME: 'Tom Giblin Nativity & Christmas Lights',
  IDONATE_URL: 'https://www.idonate.ie/crowdfunder/nativitychristmaslightscrowd2026',
  SITE_URL: 'https://christmas-nativity-lights.ie/sponsors',
  TOM_PHONE: '086 068 6968',
  HOLD_HOURS: 24,
  REMINDER_HOURS: 20,
  LOGO_FOLDER_NAME: 'Sponsor an Animal 2026 – Logos',
  TIMEZONE: 'Europe/Dublin',
};

/* The animals and prices. This list is the master copy once the website is
   connected: the page shows what's here, and totals are worked out from here.
   To add an animal later (e.g. the mice), add a line and redeploy. */
const ANIMALS = [
  { id: 'stable',   name: 'The Nativity Stable',  price: 1000, tag: 'Headline sponsor', star: true, blurb: 'The heart of the display, with the top spot on the Sponsors board.' },
  { id: 'lights',   name: 'The Christmas Lights', price: 1000, tag: 'Headline sponsor', star: true, blurb: 'The full light display around the house and gardens.' },
  { id: 'shack',    name: 'Fermí & Wefí’s Shack', price: 750,  tag: 'Crowd favourite',  star: true, blurb: 'The farmer’s shack, packed with old farm tools and terrible puns.' },
  { id: 'dinky',    name: 'Dinky the Donkey',     price: 750,  tag: 'This year’s host', star: true, blurb: 'The star of the show and the face of all our promotion.' },
  { id: 'daisy',    name: 'Daisy the Donkey',     price: 500,  tag: 'Mammy', blurb: 'Dinky’s mammy, and the calm one of the family.' },
  { id: 'dinko',    name: 'Dinko the Donkey',     price: 500,  tag: 'Daddy', blurb: 'Dinky’s daddy. Watch him carry the bucket in his mouth.' },
  { id: 'toto',     name: 'Toto the Pony',        price: 500,  blurb: 'A favourite with the smallest visitors.' },
  { id: 'alpacas',  name: 'Húna & Baby Búna',     price: 350,  tag: 'Alpacas', blurb: 'Our alpaca mammy and her baby. Fluffy, curious and very photogenic.' },
  { id: 'pigs',     name: 'Pil & Pal the Pigs',   price: 350,  blurb: 'Two identical pigs, one sponsor. Ask Tom how to tell them apart.' },
  { id: 'ozzo',     name: 'Ozzo the Goat',        price: 350,  blurb: 'One of our two billy goats.' },
  { id: 'ozzi',     name: 'Ozzi the Goat',        price: 350,  blurb: 'One of our two billy goats.' },
  { id: 'yowne',    name: 'Yowné the Goat',       price: 250,  tag: 'Last year’s host', blurb: 'Born on the day of Storm Éowyn, and host of the 2025 display.' },
  { id: 'sheep',    name: 'The Sheep',            price: 400,  blurb: 'Sé, Sí, Shigh and Sheba, our flock of four.' },
  { id: 'donnsa',   name: 'Donnsa the Hen',       price: 100,  blurb: 'Our brown hen.' },
  { id: 'bansa',    name: 'Bansa the Hen',        price: 100,  blurb: 'Our white hen.' },
  { id: 'dubsa',   name: 'Dubsa the Hen',       price: 100,  blurb: 'Our black hen.' },
  { id: 'rocky',    name: 'Rocky the Rooster',    price: 100,  blurb: 'The loudest voice in the stable yard.' },
  { id: 'buzzbees', name: 'The Buzzbees',         price: 250,  blurb: 'One of our two bee families.' },
  { id: 'bizzbees', name: 'The Bizzbees',         price: 250,  blurb: 'One of our two bee families.' },
];
/* ================================================================ */

const SHEET_NAME = 'Sponsorships';
const STATUS = { RESERVED: 'Reserved', RECEIVED: 'Donation received', RELEASED: 'Released', CANCELLED: 'Cancelled' };
const HEADERS = [
  'Reference', 'Submitted', 'Business', 'Contact', 'Email', 'Phone', 'Facebook / Instagram',
  'Charity', 'Animal IDs', 'Animals', 'Total (€)', 'Logo', 'Note', 'Status', 'Reminder sent', 'Updated',
];
const COL = {}; HEADERS.forEach((h, i) => (COL[h] = i + 1));

/* ---------------- Web app endpoints ---------------- */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'status') {
    return json_({ ok: true, animals: ANIMALS, status: takenMap_() });
  }
  return ContentService.createTextOutput('Sponsor an Animal backend is running.');
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request', message: 'Something went wrong sending the form. Please try again.' });
  }

  // Honeypot: real people never fill this in
  if (data.website) return json_({ ok: true, reference: 'OK', total: 0 });

  const v = validate_(data);
  if (v) return json_({ ok: false, error: 'invalid', message: v });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return json_({ ok: false, error: 'busy', message: 'We’re very busy right now. Please try again in a moment.' });
  }
  try {
    const taken = takenMap_();
    const clash = data.animals.filter((id) => taken[id]);
    if (clash.length) {
      return json_({ ok: false, error: 'taken', taken: clash, takenNames: clash.map((id) => animal_(id).name) });
    }

    const chosen = data.animals.map(animal_);
    const total = chosen.reduce((t, a) => t + a.price, 0);
    const ref = 'SP-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMdd') + '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    let logoUrl = '';
    if (data.logo && data.logo.data) {
      try {
        const bytes = Utilities.base64Decode(data.logo.data);
        const blob = Utilities.newBlob(bytes, data.logo.type || 'application/octet-stream',
          ref + ' – ' + clean_(data.business, 60) + ' – ' + clean_(data.logo.name || 'logo', 80));
        logoUrl = logoFolder_().createFile(blob).getUrl();
      } catch (err) {
        logoUrl = 'Upload failed: ask the sponsor to email it';
      }
    }

    const now = new Date();
    sheet_().appendRow([
      ref, now, clean_(data.business, 120), clean_(data.contact, 120), clean_(data.email, 160),
      clean_(data.phone, 40), clean_(data.social, 160), clean_(data.charity, 120),
      data.animals.join(', '), chosen.map((a) => a.name).join(', '), total, logoUrl,
      clean_(data.note, 1000), STATUS.RESERVED, '', now,
    ]);
    SpreadsheetApp.flush();
    lock.releaseLock();

    const row = { ref: ref, business: data.business, contact: data.contact, email: data.email, phone: data.phone,
      social: data.social, charity: data.charity, animals: chosen, total: total, logo: logoUrl, note: data.note };
    try { emailSponsorReserved_(row); } catch (err) { console.error('Sponsor email failed', err); }
    try { emailTomNew_(row); } catch (err) { console.error('Tom email failed', err); }

    return json_({ ok: true, reference: ref, total: total });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/* ---------------- Which animals are taken ---------------- */

function takenMap_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const now = Date.now();
  rows.forEach((r) => {
    const status = r[COL['Status'] - 1];
    const submitted = r[COL['Submitted'] - 1];
    const ids = String(r[COL['Animal IDs'] - 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    let state = null;
    if (status === STATUS.RECEIVED) state = 'sponsored';
    else if (status === STATUS.RESERVED && submitted instanceof Date &&
      now - submitted.getTime() < CONFIG.HOLD_HOURS * 3600 * 1000) state = 'reserved';
    if (!state) return;
    ids.forEach((id) => {
      if (state === 'sponsored') map[id] = { state: 'sponsored', by: String(r[COL['Business'] - 1]) };
      else if (!map[id]) map[id] = { state: 'reserved' };
    });
  });
  return map;
}

/* ---------------- Hourly: reminders and releases ---------------- */

function processHolds() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const now = Date.now();
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (r[COL['Status'] - 1] !== STATUS.RESERVED) return;
    const submitted = r[COL['Submitted'] - 1];
    if (!(submitted instanceof Date)) return;
    const hours = (now - submitted.getTime()) / 3600000;
    const row = rowObject_(r);

    if (hours >= CONFIG.HOLD_HOURS) {
      sh.getRange(rowNum, COL['Status']).setValue(STATUS.RELEASED);
      sh.getRange(rowNum, COL['Updated']).setValue(new Date());
      try { emailTomReleased_(row); } catch (err) { console.error(err); }
    } else if (hours >= CONFIG.REMINDER_HOURS && !r[COL['Reminder sent'] - 1]) {
      try { emailSponsorReminder_(row); } catch (err) { console.error(err); }
      sh.getRange(rowNum, COL['Reminder sent']).setValue(new Date());
    }
  });
}

/* ---------------- When Tom marks a donation as received ---------------- */

function onStatusEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET_NAME || e.range.getColumn() !== COL['Status'] || e.range.getRow() < 2) return;
  if (e.value !== STATUS.RECEIVED) return;
  const r = sh.getRange(e.range.getRow(), 1, 1, HEADERS.length).getValues()[0];
  sh.getRange(e.range.getRow(), COL['Updated']).setValue(new Date());
  try { emailSponsorConfirmed_(rowObject_(r)); } catch (err) { console.error(err); }
}

/* ---------------- One-off set-up (run once from the editor) ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  const sh = sheet_();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#152038').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange(2, COL['Submitted'], sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange(2, COL['Updated'], sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange(2, COL['Reminder sent'], sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange(2, COL['Total (€)'], sh.getMaxRows() - 1, 1).setNumberFormat('€#,##0');
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS.RESERVED, STATUS.RECEIVED, STATUS.RELEASED, STATUS.CANCELLED], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1).setDataValidation(rule);
  const green = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.RECEIVED)
    .setBackground('#e3f1ea').setRanges([sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1)]).build();
  const amber = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.RESERVED)
    .setBackground('#fbf1da').setRanges([sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1)]).build();
  sh.setConditionalFormatRules([green, amber]);
  [100, 130, 180, 140, 200, 120, 160, 200, 140, 220, 80, 200, 220, 140, 130, 130].forEach((w, i) => sh.setColumnWidth(i + 1, w));

  logoFolder_();

  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processHolds').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(ss).onEdit().create();

  console.log('Set-up complete. Now deploy as a web app (see README.md).');
}

/* Send yourself one of each email to check how they look. */
function sendTestEmails() {
  const me = Session.getActiveUser().getEmail() || CONFIG.NOTIFY_EMAIL;
  const row = { ref: 'SP-TEST', business: 'Test Business Ltd', contact: 'Test Person', email: me, phone: '087 000 0000',
    social: '@testbusiness', charity: 'All 16 charities, shared equally', animals: [animal_('dinky'), animal_('rocky')],
    total: 850, logo: '', note: 'This is a test.' };
  emailSponsorReserved_(row);
  emailSponsorReminder_(row);
  emailSponsorConfirmed_(row);
  const tomRow = Object.assign({}, row);
  const saved = CONFIG.NOTIFY_EMAIL;
  CONFIG.NOTIFY_EMAIL = me;
  emailTomNew_(tomRow);
  emailTomReleased_(tomRow);
  CONFIG.NOTIFY_EMAIL = saved;
}

/* ---------------- Emails ---------------- */

function emailSponsorReserved_(row) {
  const msg = row.business + ': ' + row.animals.map((a) => a.name).join(', ');
  const body = `
    <p>Hi ${esc_(firstName_(row.contact))},</p>
    <p>Thank you so much for sponsoring at the Tom Giblin Nativity &amp; Christmas Lights this year. We’ve reserved the following for <b>${esc_(row.business)}</b>:</p>
    ${animalTable_(row)}
    <p><b>One last step:</b> please complete your donation of <b>€${row.total.toLocaleString('en-IE')}</b> on our iDonate page. In the donation message, please write:</p>
    <p style="background:#f5f6f9;border:1px solid #dde1ea;border-radius:6px;padding:10px 12px;font-weight:bold">${esc_(msg)}</p>
    ${button_('Donate €' + row.total.toLocaleString('en-IE') + ' on iDonate', CONFIG.IDONATE_URL)}
    <p>Your animals are held for ${CONFIG.HOLD_HOURS} hours while your donation comes through. iDonate will email you a receipt for your records.</p>
    <p><b>Your place on the Sponsors board:</b> we’ll print your logo and the name of the animal you sponsored on an A4 sign and put it up on the Sponsors board at the gates of the stable. ${row.logo ? 'Thanks for sending your logo.' : 'Just reply to this email with your logo (PNG or JPG).'}</p>
    <p>Your charity choice: <b>${esc_(row.charity)}</b></p>
    <p>Thank you again. Every euro goes to the 16 charities.</p>
    <p>Tom Giblin<br>${CONFIG.TOM_PHONE}</p>
    <p style="color:#5d6577;font-size:12px">Reference: ${esc_(row.ref)}</p>`;
  send_(row.email, 'You’re sponsoring ' + listNames_(row.animals) + ' – one last step', body, CONFIG.NOTIFY_EMAIL);
}

function emailSponsorReminder_(row) {
  const msg = row.business + ': ' + row.animals.map((a) => a.name).join(', ');
  const hoursLeft = CONFIG.HOLD_HOURS - CONFIG.REMINDER_HOURS;
  const body = `
    <p>Hi ${esc_(firstName_(row.contact))},</p>
    <p>Just a friendly reminder that <b>${esc_(listNames_(row.animals))}</b> ${row.animals.length === 1 ? 'is' : 'are'} reserved for <b>${esc_(row.business)}</b> for about ${hoursLeft} more hours.</p>
    <p>If you’ve already donated, thank you, and please ignore this email. If not, you can donate <b>€${row.total.toLocaleString('en-IE')}</b> here, with <b>${esc_(msg)}</b> in the message:</p>
    ${button_('Donate on iDonate', CONFIG.IDONATE_URL)}
    <p>Any questions, just reply or call Tom on ${CONFIG.TOM_PHONE}.</p>
    <p>Tom Giblin</p>
    <p style="color:#5d6577;font-size:12px">Reference: ${esc_(row.ref)}</p>`;
  send_(row.email, 'Reminder: your sponsorship is held for a few more hours', body, CONFIG.NOTIFY_EMAIL);
}

function emailSponsorConfirmed_(row) {
  const body = `
    <p>Hi ${esc_(firstName_(row.contact))},</p>
    <p>We’ve received your donation. Thank you! <b>${esc_(row.business)}</b> is now the official sponsor of:</p>
    ${animalTable_(row)}
    <p>You’re now shown as the sponsor on our website, and your A4 sign will go up on the Sponsors board at the stable gates.${row.logo ? '' : ' If you haven’t sent your logo yet, just reply to this email with it.'}</p>
    <p>We’d love to get a photo of you with your animal to share on Facebook. Call in any time while we’re open, or reply and we’ll arrange a time.</p>
    <p>Thank you for supporting the 16 charities this Christmas.</p>
    <p>Tom Giblin<br>${CONFIG.TOM_PHONE}</p>`;
  send_(row.email, 'Thank you! You’re now the sponsor of ' + listNames_(row.animals), body, CONFIG.NOTIFY_EMAIL);
}

function emailTomNew_(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const body = `
    <p><b>New sponsorship reserved</b> (held for ${CONFIG.HOLD_HOURS} hours).</p>
    ${animalTable_(row)}
    <table cellpadding="4" style="border-collapse:collapse;font-size:14px">
      ${detail_('Business', row.business)}${detail_('Contact', row.contact)}${detail_('Email', row.email)}
      ${detail_('Phone', row.phone)}${detail_('Facebook / Instagram', row.social)}${detail_('Charity', row.charity)}
      ${detail_('Note', row.note)}${detail_('Reference', row.ref)}
    </table>
    <p>${row.logo && /^https?:/.test(row.logo) ? '<a href="' + row.logo + '">Open their logo</a>' : 'No logo uploaded yet.'}</p>
    <p>When the donation shows up on iDonate, open the sheet and set the Status to <b>Donation received</b>. The sponsor gets a thank-you email automatically.</p>
    ${button_('Open the sponsor sheet', ss.getUrl())}`;
  send_(CONFIG.NOTIFY_EMAIL, 'New sponsor: ' + row.business + ' – ' + listNames_(row.animals) + ' (€' + row.total + ')', body, row.email);
}

function emailTomReleased_(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const body = `
    <p>The ${CONFIG.HOLD_HOURS}-hour hold for <b>${esc_(row.business)}</b> has ended without a donation being marked as received, so these are available again on the website:</p>
    ${animalTable_(row)}
    <p>If they did donate, just set the Status back to <b>Donation received</b> in the sheet. You may want to give them a call: ${esc_(row.contact)}, ${esc_(row.phone || row.email)}.</p>
    ${button_('Open the sponsor sheet', ss.getUrl())}`;
  send_(CONFIG.NOTIFY_EMAIL, 'Hold released: ' + row.business + ' – ' + listNames_(row.animals), body, row.email);
}

/* ---------------- Helpers ---------------- */

function send_(to, subject, inner, replyTo) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#18213a;max-width:560px">
    <div style="background:#152038;color:#ffffff;padding:14px 18px;border-radius:8px 8px 0 0">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e3a92b;font-weight:bold">Sponsor an Animal</div>
      <div style="font-size:18px;font-weight:bold">Tom Giblin Nativity &amp; Christmas Lights</div>
    </div>
    <div style="border:1px solid #dde1ea;border-top:0;padding:18px;border-radius:0 0 8px 8px">${inner}</div>
  </div>`;
  const opts = { to: to, subject: subject, htmlBody: html, name: CONFIG.SENDER_NAME };
  if (replyTo) opts.replyTo = replyTo;
  MailApp.sendEmail(opts);
}

function animalTable_(row) {
  const lines = row.animals.map((a) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef0f4">${esc_(a.name)}</td><td style="padding:6px 10px;border-bottom:1px solid #eef0f4;text-align:right">€${a.price.toLocaleString('en-IE')}</td></tr>`).join('');
  return `<table cellspacing="0" style="border-collapse:collapse;min-width:280px;margin:8px 0 14px;font-size:15px">${lines}
    <tr><td style="padding:8px 10px;font-weight:bold">Total</td><td style="padding:8px 10px;text-align:right;font-weight:bold">€${row.total.toLocaleString('en-IE')}</td></tr></table>`;
}

function detail_(label, value) {
  if (!value) return '';
  return `<tr><td style="color:#5d6577;padding-right:12px">${label}</td><td>${esc_(value)}</td></tr>`;
}

function button_(label, url) {
  return `<p><a href="${url}" style="display:inline-block;background:#e3a92b;color:#2a1d00;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:8px">${esc_(label)}</a></p>`;
}

function rowObject_(r) {
  const ids = String(r[COL['Animal IDs'] - 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ref: r[COL['Reference'] - 1], business: String(r[COL['Business'] - 1]), contact: String(r[COL['Contact'] - 1]),
    email: String(r[COL['Email'] - 1]), phone: String(r[COL['Phone'] - 1]), social: String(r[COL['Facebook / Instagram'] - 1]),
    charity: String(r[COL['Charity'] - 1]), animals: ids.map(animal_).filter(Boolean),
    total: Number(r[COL['Total (€)'] - 1]) || 0, logo: String(r[COL['Logo'] - 1] || ''), note: String(r[COL['Note'] - 1] || ''),
  };
}

function validate_(d) {
  if (!d || !Array.isArray(d.animals) || !d.animals.length) return 'Please choose at least one animal.';
  const ids = {};
  for (const id of d.animals) {
    if (!animal_(id)) return 'One of the animals you chose is no longer available. Please refresh the page.';
    if (ids[id]) return 'Please choose each animal only once.';
    ids[id] = true;
  }
  if (!d.business || !String(d.business).trim()) return 'Please add your business name.';
  if (!d.contact || !String(d.contact).trim()) return 'Please add a contact name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email || '').trim())) return 'Please check your email address.';
  if (d.logo && d.logo.data && d.logo.data.length > 7 * 1024 * 1024) return 'Your logo file is too large. Please email it to us instead.';
  return '';
}

function animal_(id) { return ANIMALS.find((a) => a.id === id) || null; }

function listNames_(animals) {
  const n = animals.map((a) => a.name);
  return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

function firstName_(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

function clean_(s, max) {
  // Strip characters a spreadsheet would treat as a formula
  let v = String(s == null ? '' : s).trim().slice(0, max || 500);
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return v;
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

function logoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('LOGO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  const folder = DriveApp.createFolder(CONFIG.LOGO_FOLDER_NAME);
  props.setProperty('LOGO_FOLDER_ID', folder.getId());
  return folder;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
