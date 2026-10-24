/* =====================================================================
   Core Dynamics — public site configuration
   Everything in this file is visible to every visitor. NEVER put
   passwords, API secrets, tokens or spreadsheet IDs/keys in here.
   ===================================================================== */
window.CD_CONFIG = {

  /* Public business email shown on the page and used as the fallback when online
     submission is unavailable. Change it to your Core Dynamics business email once
     that mailbox is active. Leave "" to hide email links entirely. */
  CONTACT_EMAIL: "ncoreopc@gmail.com",

  /* Google Apps Script web-app URL (ends in /exec). See apps-script/SETUP.md.
     While this is "", the form does NOT claim to send anything: it tells the
     visitor online submission isn't switched on and offers an email instead. */
  ENQUIRY_ENDPOINT: "https://docs.google.com/spreadsheets/d/1njewnQiNd28sBUCCHSqIMTt2J1qHFo19aAJdHXG3DH0/edit?usp=drivesdk",

  /* Optional Cloudflare Turnstile SITE key (the public one). Leave "" to disable.
     The matching SECRET key goes in Apps Script > Project Settings > Script
     Properties as TURNSTILE_SECRET, never here. */
  TURNSTILE_SITE_KEY: "",

  /* Live site controls from your admin app (banner / hero headline / maintenance
     mode). Kept as before. Set to "" to switch the feature off. */
  FIREBASE_DB_URL: "https://coredynamics-ea139-default-rtdb.firebaseio.com",

  /* Old behaviour: also copy each enquiry into Firebase /leads for the admin app.
     OFF by default because that stores personal details in a database that
     accepts public writes. Turn on only after you have locked the database rules. */
  FIREBASE_LEAD_MIRROR: false
};
