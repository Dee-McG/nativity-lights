# Sponsor an Animal – set-up guide

The page at **christmas-nativity-lights.ie/sponsors** (`sponsors.html`) lets businesses choose animals to sponsor. GitHub Pages can only show pages, so the form sends each sponsorship to a small Google Apps Script attached to a Google Sheet. The script:

- saves each sponsorship as a row in the **Sponsorships** sheet
- saves the sponsor's logo to a Google Drive folder
- emails the sponsor their animals, total and the iDonate link, and emails Tom the details
- holds the animals for 24 hours, sends a reminder at 20 hours, then releases them if no donation is marked
- emails the sponsor a thank-you when Tom sets the Status to **Donation received**
- tells the website which animals are reserved or sponsored, so they can't be picked twice

Emails are sent from the Google account that owns the sheet, with replies going to Tom. A personal Gmail account can send about 100 emails a day, which is plenty here.

Until it's connected, the page runs in **preview mode**: everything works on screen, but nothing is saved or emailed.

## One-time set-up (about 10 minutes)

Do this signed in to the Google account the emails should come from (Tom's Gmail, or a charity account).

1. **Create the sheet.** Go to [sheets.new](https://sheets.new) and name it *Sponsor an Animal 2026*.
2. **Add the script.** In the sheet, open **Extensions → Apps Script**. Delete what's in `Code.gs`, paste in the contents of [`Code.gs`](Code.gs) from this folder, and click **Save**.
3. **Check the settings** at the top of `Code.gs` (`CONFIG`): the email Tom's notifications go to, the iDonate link and the phone number.
4. **Run set-up.** In the toolbar, choose the `setup` function and click **Run**. Google will ask for permission to use the sheet, Drive and email: click **Review permissions**, choose the account, then **Advanced → Go to project (unsafe) → Allow**. (Google shows "unsafe" for any script that isn't published on its store. It's your own script.) This creates the sheet columns, the Status dropdown, the logo folder and the hourly timer.
5. **Deploy it.** Click **Deploy → New deployment**. Choose type **Web app**, then set:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**

   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
6. **Connect the website.** In `assets/js/sponsors.js`, paste the URL into `endpoint` at the top:

   ```js
   endpoint: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```

   Commit and push. GitHub Pages publishes it within a minute or two.
7. **Test it.** Optionally run `sendTestEmails` in the script editor to see each email in your inbox. Then reserve a cheap animal on the live page with your own email, check both emails arrive, and set that row's Status to **Cancelled** in the sheet so the animal is available again.

## Day to day (for Tom)

- Each new sponsorship emails Tom and appears as a new row with Status **Reserved**.
- When the donation shows up on iDonate, set Status to **Donation received**. The sponsor gets a thank-you email and their animals show as sponsored on the website.
- If no donation is marked after 24 hours, the row changes to **Released**, Tom gets an email, and the animals are available again. If they did pay, just set it back to **Donation received**.
- To free up an animal straight away, set Status to **Cancelled**.
- Logos are in the *Sponsor an Animal 2026 – Logos* folder in Google Drive, ready to print.

## Changing animals or prices

The list of animals and prices is in `ANIMALS` near the top of `Code.gs`. Once the site is connected, the page uses this list. To add an animal (for example the mice), add a line, click **Save**, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The web app URL stays the same.

Keep the same list in `assets/js/sponsors.js` up to date too. The page uses it in preview mode, or if the sheet can't be reached.

## Changing the script later

After any change to `Code.gs`, redeploy as a new version (as above) or the website will keep using the old one.
