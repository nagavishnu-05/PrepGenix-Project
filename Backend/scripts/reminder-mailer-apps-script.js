function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeMailSender() {
  MailApp.getRemainingDailyQuota();
}

function doPost(event) {
  let payload;
  try {
    payload = JSON.parse(event.postData.contents);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." });
  }

  const expectedToken = PropertiesService.getScriptProperties().getProperty("REMINDER_MAIL_TOKEN");
  if (!payload || typeof payload !== "object"
    || !expectedToken
    || typeof payload.token !== "string"
    || payload.token !== expectedToken) {
    return jsonResponse({ ok: false, error: "Unauthorized." });
  }

  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  if (!to
    || typeof payload.subject !== "string"
    || typeof payload.text !== "string"
    || typeof payload.html !== "string"
    || !payload.subject
    || !payload.text
    || !payload.html) {
    return jsonResponse({ ok: false, error: "Missing email fields." });
  }

  try {
    MailApp.sendEmail({
      to,
      subject: String(payload.subject),
      body: String(payload.text),
      htmlBody: String(payload.html),
      name: "PrepGenix",
    });
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ ok: false, error: "Google could not send the email." });
  }
}

if (typeof module !== "undefined") module.exports = { doPost };
