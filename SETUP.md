# Core Dynamics — Enquiry system setup

Website form → Google Apps Script (your own Google account) → private Google Sheet.
No servers, no paid services, nothing secret in the website code.

## What's in the project

| File | Purpose |
|---|---|
| `index.html` | Existing site. Contact section replaced by the new enquiry form + privacy notice; styles added; old Firebase lead code removed. |
| `site-config.js` | **New.** The only file you edit on the website: business email, Apps Script URL, optional settings. |
| `enquiry.js` | **New.** Form validation, loading/error/success states, spam traps. |
| `apps-script/Code.gs` | **New.** Backend. Pasted into Google Apps Script (not run by GitHub Pages). |
| `SETUP.md` | This guide. |
| `logo.png` | Unchanged. |

## 1. Create the private Sheet
1. Sign in to the Google account that should own the leads (ideally your business account).
2. Create a new Google Sheet named **Core Dynamics Enquiries**.
3. **Do not share it** with "Anyone with the link". Leave it private. The website never edits the sheet directly; only the script, running as you, does.

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete the sample code, paste the full contents of `apps-script/Code.gs`, click **Save**.
3. In the function dropdown choose **`setup`** and click **Run**.
4. Google asks for permission: **Review permissions → choose your account → Advanced → "Go to … (unsafe)" → Allow.** (The "unverified app" warning appears because you wrote the script yourself.) The script asks to: edit this spreadsheet, and send email (only used if you set `NOTIFY_EMAIL`).
5. Open the Sheet: you now have an **Enquiries** tab with a header row, a **Lead status** dropdown (New / Contacted / In Discussion / Won / Lost) with colours, a frozen header, and a filter.

## 3. Deploy as a web app
1. In Apps Script: **Deploy → New deployment → ⚙ → Web app**.
2. Description: `Enquiry form v1`. **Execute as: Me.** **Who has access: Anyone.**
   ("Anyone" only lets people *send an enquiry to this URL*. It does not expose the Sheet.)
3. Click **Deploy** (authorize again if asked) and copy the **Web app URL**, which ends in `/exec`.
4. Check it: open the URL in a browser. You should see `{"ok":true,"service":"Core Dynamics enquiry endpoint",…}`.

**Changing the script later:** edit → **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same. (Saving alone does *not* update the live version.)

## 4. Connect the website
Edit `site-config.js`:
```js
CONTACT_EMAIL: "ncoreopc@gmail.com",   // → your Core Dynamics business email once it's active
ENQUIRY_ENDPOINT: "https://script.google.com/macros/s/XXXXXXXX/exec",
```
That's all the configuration there is. There are no environment variables, because a static site can't hold secrets. Everything in this file is public by design.

Until `ENQUIRY_ENDPOINT` is filled in, the form tells visitors online enquiries aren't switched on and falls back to opening their email app. It never claims to have sent anything.

## 5. Deploy to your existing GitHub Pages site
Nothing about the domain, DNS or Pages settings changes. Copy these into the repo root next to the existing `index.html`/`logo.png`, then:
```bash
git add index.html site-config.js enquiry.js apps-script/ SETUP.md
git commit -m "Add client enquiry form backed by Google Sheets"
git push origin main
```
Pages rebuilds in about a minute. (The `apps-script/` folder will be publicly visible on the site; it contains no secrets. Add it to a `.gitignore` if you'd rather not publish it.)

## 6. Optional extras
**Email notification on each enquiry** (off until you set it): Apps Script → ⚙ **Project Settings → Script Properties → Add** `NOTIFY_EMAIL` = your address. Then submit a real test enquiry and confirm the email arrives, including spam folder. The website never promises instant notifications.

**Cloudflare Turnstile** (stronger bot protection, free): Cloudflare dashboard → Turnstile → add site `n-core.in` → put the **site key** in `TURNSTILE_SITE_KEY` in `site-config.js` and the **secret key** in Script Properties as `TURNSTILE_SECRET` (redeploy a new version). *This path is implemented but could not be tested live; test it before relying on it.*

**Firebase admin app:** enquiries are no longer written to Firebase by default, because that database accepts public writes. Banner / headline / maintenance controls from your admin app still work. To also mirror leads there, set `FIREBASE_LEAD_MIRROR: true`, but lock your Firebase rules first.

## 7. Managing leads in the Sheet
- Every enquiry is a new row with **Lead status = New**.
- Change status with the dropdown in column B. Use **Notes (internal)** (column M) for follow-ups; it's never shown to clients.
- Use the header filter (e.g. Lead status = New) as your to-do list. Sort by date to see the latest.
- Columns: Submitted (IST), Lead status, Name, Email, Phone, Company, Service, Package of interest, Budget, Project description, Preferred contact, Best time to call, Notes, Page.

## 8. Test checklist
**Successful submission**
- [ ] Fill every field, tick consent, send → button shows "Sending…", then a green "received" message; form clears.
- [ ] A new row appears in the Enquiries tab with status *New* and the right values.
- [ ] Minimal submission (only required fields) also works.
- [ ] Choosing "Scheduled callback" reveals "Best time to call" and is saved.
- [ ] Clicking **Select Plan** in pricing pre-fills *Package of interest*.

**Invalid fields**
- [ ] Empty submit → red messages on name, phone, email, service, description, consent; nothing sent.
- [ ] Bad email (`abc`), bad phone (`abc`), 5-character description, unticked consent are each rejected.

**Failure handling**
- [ ] Temporarily set a wrong `ENQUIRY_ENDPOINT` → red error message with an "email us directly" link, typed data kept, no false success.
- [ ] Submit twice with the same email within 2 minutes → second shows the "wait a few minutes" message.

**Spam**
- [ ] In dev tools, type in the hidden `hp_url` field, then submit → site shows success but **no row** is added.
- [ ] Submit within 3 seconds of loading the page → no row added.
- [ ] A cell like `=1+1` in the name field is stored as text, not calculated.

**Mobile**
- [ ] On a phone (or 390px wide window): single-column form, no sideways scrolling, 16px+ inputs don't zoom, buttons tappable.

**Privacy**
- [ ] No phone number appears anywhere on the page or in page source.
- [ ] Sheet sharing shows "Restricted".
- [ ] "How we use them" / footer "Privacy" opens the privacy notice.
- [ ] View source: no keys, tokens or sheet IDs (only the public `/exec` URL).

## 9. Limitations of the free setup
- The `/exec` URL is public, so anyone who finds it can post to it. The honeypot, time-trap, server validation, per-email limit (2 min), hourly cap (120) and optional Turnstile reduce abuse but cannot eliminate it. A determined attacker could fill the sheet; there is no reliable way to restrict an Apps Script endpoint to your domain only.
- Apps Script has daily quotas (script run time, and emails: about 100 recipients/day on a free Gmail account, more on Google Workspace). These limits are ample for a small agency, but Google can change them. Check Google's current quota page.
- First request after idle can take 1–3 seconds (cold start). Responses are slower than a dedicated server.
- Notifications are off until you configure and test them; Google may mark them as spam.
- The Sheet isn't a CRM: no automatic reminders, assignment or reporting beyond filters and formulas.
- Data lives in your Google account; you are responsible for retention and deletion requests. Edit the privacy notice in `index.html` if your practice differs (it currently says "ask us to correct or delete").
- Free Google accounts can send a limited number of emails from the script, and Google can change quotas.
