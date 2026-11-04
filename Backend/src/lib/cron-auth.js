"use strict";

const crypto = require("crypto");

function isAuthorizedCronRequest(authorization, expectedToken) {
  if (typeof expectedToken !== "string" || !expectedToken.trim()) return false;
  if (typeof authorization !== "string") return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return false;
  const received = crypto.createHash("sha256").update(match[1]).digest();
  const expected = crypto.createHash("sha256").update(expectedToken).digest();
  return crypto.timingSafeEqual(received, expected);
}

module.exports = { isAuthorizedCronRequest };
