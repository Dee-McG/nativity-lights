/* Sponsor an Animal page (sponsors.html)
 *
 * The page talks to a small Google Apps Script web app (see /sponsor-backend)
 * which saves each sponsorship to a Google Sheet, stores the logo in Google
 * Drive, sends the emails and releases unpaid holds after 24 hours.
 *
 * Set SPONSOR_CONFIG.endpoint to the web app URL once it is deployed.
 * While it is empty the page runs in preview mode: everything works on screen,
 * but nothing is saved or emailed.
 */
const SPONSOR_CONFIG = {
  endpoint: "", // e.g. "https://script.google.com/macros/s/XXXXXXXX/exec"
  idonateUrl: "https://www.idonate.ie/crowdfunder/nativitychristmaslightscrowd2026",
  goal: 16000,
  maxLogoBytes: 5 * 1024 * 1024,
};

/* Used in preview mode, and as a fallback if the sheet can't be reached.
   Once the backend is connected, the list in sponsor-backend/Code.gs is the
   one that counts (prices are checked there too). */
const SPONSOR_ANIMALS = [
  { id: "stable", name: "The Nativity Stable", price: 1000, tag: "Headline sponsor", star: true, blurb: "The heart of the display, with the top spot on the Sponsors board." },
  { id: "lights", name: "The Christmas Lights", price: 1000, tag: "Headline sponsor", star: true, blurb: "The full light display around the house and gardens." },
  { id: "shack", name: "Fermí & Wefí’s Shack", price: 750, tag: "Crowd favourite", star: true, blurb: "The farmer’s shack, packed with old farm tools and terrible puns." },
  { id: "dinky", name: "Dinky the Donkey", price: 750, tag: "This year’s host", star: true, blurb: "The star of the show and the face of all our promotion." },
  { id: "daisy", name: "Daisy the Donkey", price: 500, tag: "Mammy", blurb: "Dinky’s mammy, and the calm one of the family." },
  { id: "dinko", name: "Dinko the Donkey", price: 500, tag: "Daddy", blurb: "Dinky’s daddy. Watch him carry the bucket in his mouth." },
  { id: "toto", name: "Toto the Pony", price: 500, blurb: "A favourite with the smallest visitors." },
  { id: "alpacas", name: "Húna & Baby Búna", price: 350, tag: "Alpacas", blurb: "Our alpaca mammy and her baby. Fluffy, curious and very photogenic." },
  { id: "pigs", name: "Pil & Pal the Pigs", price: 350, blurb: "Two identical pigs, one sponsor. Ask Tom how to tell them apart." },
  { id: "ozzo", name: "Ozzo the Goat", price: 350, blurb: "One of our two billy goats." },
  { id: "ozzi", name: "Ozzi the Goat", price: 350, blurb: "One of our two billy goats." },
  { id: "yowne", name: "Yowné the Goat", price: 250, tag: "Last year’s host", blurb: "Born on the day of Storm Éowyn, and host of the 2025 display." },
  { id: "sheep", name: "The Sheep", price: 400, blurb: "Sé, Sí, Shigh and Sheba, our flock of four." },
  { id: "donnsa", name: "Donnsa the Hen", price: 100, blurb: "One of our three hens." },
  { id: "bansa", name: "Bánsa the Hen", price: 100, blurb: "One of our three hens." },
  { id: "dubhsa", name: "Dubhsa the Hen", price: 100, blurb: "One of our three hens." },
  { id: "rocky", name: "Rocky the Rooster", price: 100, blurb: "The loudest voice in the stable yard." },
  { id: "buzzbees", name: "The Buzzbees", price: 250, blurb: "One of our two bee families." },
  { id: "bizzbees", name: "The Bizzbees", price: 250, blurb: "One of our two bee families." },
];

(function () {
  const $ = (id) => document.getElementById(id);
  const eur = (n) => "€" + Number(n).toLocaleString("en-IE");
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const PREVIEW = !SPONSOR_CONFIG.endpoint;

  let animals = SPONSOR_ANIMALS.slice();
  let status = {}; // id -> { state: "reserved" | "sponsored", by?: string }
  let submitting = false;

  function notice(text) {
    const n = $("sp-notice");
    n.textContent = text || "";
    n.hidden = !text;
  }

  /* ---------- Load which animals are taken ---------- */
  async function loadStatus() {
    if (PREVIEW) {
      notice("Preview mode: the form works on screen, but nothing is saved or emailed until the sponsor sheet is connected.");
      render();
      return;
    }
    try {
      const res = await fetch(SPONSOR_CONFIG.endpoint + "?action=status&t=" + Date.now());
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "status");
      if (Array.isArray(data.animals) && data.animals.length) animals = data.animals;
      status = data.status || {};
    } catch (err) {
      notice("We couldn’t check which animals are already taken. You can still choose and we’ll confirm by email, or refresh the page in a minute.");
    }
    render();
  }

  /* ---------- Draw the animal cards ---------- */
  function render() {
    const pens = $("sp-pens");
    const keep = new Set([...document.querySelectorAll('input[name="animal"]:checked')].map((el) => el.value));
    pens.innerHTML = "";
    animals.forEach((a) => {
      const st = status[a.id];
      const taken = !!st;
      const tagClass = taken ? "taken" : a.star ? "star" : "open";
      const tagText = !taken ? a.tag || "Available" : st.state === "sponsored" ? "Sponsored" : "Reserved";
      const by =
        taken && st.state === "sponsored" && st.by
          ? `<span class="sp-by">Sponsored by ${esc(st.by)}</span>`
          : taken
          ? `<span class="sp-by">Reserved. Check back in 24 hours.</span>`
          : "";
      const d = document.createElement("div");
      d.className = "sp-pen";
      d.innerHTML = `<input type="checkbox" name="animal" id="sp-a-${a.id}" value="${a.id}" ${taken ? "disabled" : ""} ${
        !taken && keep.has(a.id) ? "checked" : ""
      }>
        <label for="sp-a-${a.id}">
          <span class="sp-tick" aria-hidden="true">✓</span>
          <span class="sp-tag ${tagClass}">${esc(tagText)}</span>
          <span class="sp-top"><span class="sp-name">${esc(a.name)}</span><span class="sp-price">${eur(a.price)}</span></span>
          <span class="sp-blurb">${esc(a.blurb || "")}</span>
          ${by}
        </label>`;
      pens.appendChild(d);
    });
    pens.removeAttribute("aria-busy");

    const sponsored = animals.filter((a) => status[a.id] && status[a.id].state === "sponsored").reduce((t, a) => t + a.price, 0);
    $("sp-raised").textContent = eur(sponsored);
    $("sp-fill").style.width = Math.min(100, (sponsored / SPONSOR_CONFIG.goal) * 100) + "%";
    summary();
  }

  function picked() {
    return [...document.querySelectorAll('input[name="animal"]:checked')]
      .map((el) => animals.find((a) => a.id === el.value))
      .filter(Boolean);
  }

  /* ---------- Summary panel ---------- */
  function summary() {
    const p = picked();
    const total = p.reduce((t, a) => t + a.price, 0);
    $("sp-s-animal").textContent = !p.length ? "No animals chosen yet" : p.length === 1 ? p[0].name : p.length + " animals";
    $("sp-s-list").innerHTML = p.length > 1 ? p.map((a) => `<li><span>${esc(a.name)}</span><span>${eur(a.price)}</span></li>`).join("") : "";
    $("sp-s-total").textContent = eur(total);
    $("sp-s-biz").textContent = $("sp-biz").value.trim() || "–";
    const ch = $("sp-charity");
    $("sp-s-charity").textContent = ch.selectedIndex === 0 ? "All 16, shared equally" : ch.value;
    if (!submitting) $("sp-go").textContent = !p.length ? "Choose an animal" : `Reserve and donate ${eur(total)}`;
  }

  document.addEventListener("input", summary);
  document.addEventListener("change", summary);

  /* ---------- Validation ---------- */
  function validate() {
    const p = picked();
    $("sp-err-animal").hidden = p.length > 0;
    const missing = [
      ["sp-biz", "business name"],
      ["sp-contact", "contact name"],
      ["sp-email", "email"],
    ]
      .filter(([id]) => !$(id).value.trim())
      .map((x) => x[1]);
    const email = $("sp-email").value.trim();
    const logo = $("sp-logo").files[0];
    let msg = "";
    if (missing.length) msg = "Add your " + missing.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) msg = "Check your email address. It should look like name@business.ie.";
    else if (logo && logo.size > SPONSOR_CONFIG.maxLogoBytes) msg = "Your logo file is over 5MB. Please choose a smaller file, or email it to us afterwards.";
    else if (!$("sp-consent").checked) msg = "Tick the box so we can show your logo on the Sponsors board and online.";
    $("sp-err-details").textContent = msg;
    $("sp-err-details").hidden = !msg;
    if (!p.length) {
      $("sp-pens").scrollIntoView({ behavior: "smooth", block: "start" });
      return null;
    }
    if (msg) {
      $("sp-err-details").scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }
    return p;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", data: String(r.result).split(",")[1] });
      r.onerror = () => reject(new Error("Could not read the logo file."));
      r.readAsDataURL(file);
    });
  }

  /* ---------- Submit ---------- */
  $("sp-go").addEventListener("click", async () => {
    if (submitting) return;
    const p = validate();
    if (!p) return;

    const payload = {
      animals: p.map((a) => a.id),
      business: $("sp-biz").value.trim(),
      contact: $("sp-contact").value.trim(),
      email: $("sp-email").value.trim(),
      phone: $("sp-phone").value.trim(),
      social: $("sp-social").value.trim(),
      charity: $("sp-charity").value,
      note: $("sp-note").value.trim(),
      website: $("sp-website").value, // honeypot
    };

    const btn = $("sp-go");
    submitting = true;
    btn.disabled = true;
    btn.textContent = "Reserving…";

    try {
      payload.logo = await readFile($("sp-logo").files[0]);
      let result;
      if (PREVIEW) {
        await new Promise((r) => setTimeout(r, 600));
        result = { ok: true, reference: "PREVIEW", total: p.reduce((t, a) => t + a.price, 0) };
      } else {
        const res = await fetch(SPONSOR_CONFIG.endpoint, { method: "POST", body: JSON.stringify(payload) });
        result = await res.json();
      }
      if (!result.ok) {
        if (result.error === "taken") {
          (result.taken || []).forEach((id) => (status[id] = { state: "reserved" }));
          render();
          $("sp-err-details").textContent =
            "Sorry, someone has just reserved " + (result.takenNames || []).join(" and ") + ". Please choose another animal.";
          $("sp-err-details").hidden = false;
          $("sp-pens").scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          $("sp-err-details").textContent = result.message || "Something went wrong saving your sponsorship. Please try again.";
          $("sp-err-details").hidden = false;
        }
        return;
      }
      showThanks(payload, p, result);
    } catch (err) {
      $("sp-err-details").textContent =
        "We couldn’t reach our sponsor list just now. Please check your connection and try again. If it keeps happening, call Tom on 086 068 6968.";
      $("sp-err-details").hidden = false;
    } finally {
      submitting = false;
      btn.disabled = false;
      summary();
    }
  });

  function showThanks(payload, p, result) {
    const total = result.total || p.reduce((t, a) => t + a.price, 0);
    const names = p.map((a) => a.name);
    const list = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    const message = payload.business + ": " + names.join(", ");
    const done = document.createElement("div");
    done.className = "sp-done";
    done.innerHTML = `<h2>Thank you, ${esc(payload.business)}!</h2>
      <p><b>${esc(list)}</b> ${names.length === 1 ? "is" : "are"} now reserved for you. Total: <b>${eur(total)}</b>.</p>
      <div class="sp-idonate">
        <p><b>One last step:</b> complete your donation of <b>${eur(total)}</b> on our iDonate page.
        In the donation message, please write <span class="sp-ref">${esc(message)}</span> so we can match it to your sponsorship.</p>
        <a class="sp-btn" href="${esc(SPONSOR_CONFIG.idonateUrl)}" target="_blank" rel="noopener">Donate ${eur(total)} on iDonate</a>
        <p class="sp-fine" style="text-align:left">We’ve emailed you this link too. Your animals are held for 24 hours.</p>
      </div>
      <div class="sp-signbox">
        <h3>Your place on the Sponsors board</h3>
        <p>Every sponsor goes up on the big Sponsors board at the gates of the stable, right beside the road.
        We’ll print your logo and the name of the animal you sponsored on an A4 sign, laminate it, and put it up for you.
        ${payload.logo ? "Thanks for sending your logo." : "Just reply to our email with your logo."}</p>
      </div>
      ${PREVIEW ? `<p class="sp-fine" style="text-align:left;margin-top:12px">Preview mode: nothing was saved or emailed.</p>` : ""}`;
    const form = $("sp-form");
    form.hidden = true;
    form.parentNode.insertBefore(done, form);
    $("sp-go").hidden = true;
    done.scrollIntoView({ behavior: "smooth", block: "start" });
    p.forEach((a) => (status[a.id] = { state: "reserved" }));
  }

  /* ---------- Starry header ---------- */
  (function stars() {
    const c = $("sp-stars");
    if (!c) return;
    const x = c.getContext("2d");
    function draw() {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 7;
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < Math.round(r.width / 9); i++) {
        x.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
        x.beginPath();
        x.arc(rnd() * r.width, rnd() * r.height, rnd() * 1.4 + 0.3, 0, Math.PI * 2);
        x.fill();
      }
      const px = r.width * 0.86, py = r.height * 0.3;
      x.fillStyle = "rgba(240,185,66,.95)";
      x.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4, rad = i % 2 ? 4 : 16;
        x.lineTo(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad);
      }
      x.closePath();
      x.fill();
    }
    draw();
    window.addEventListener("resize", draw);
  })();

  loadStatus();
})();
