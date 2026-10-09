'use strict';

const fs = require('fs');
const path = require('path');

const EMPTY_MARKERS = ['PASTE_', 'COLE_AQUI'];

function sessionFile(folder) {
  return path.join(folder, 'session.json');
}

function normalizeSession({ hglogin, xsrf }) {
  let token = String(hglogin ?? '').trim().replace(/^hglogin=/, '');
  if (token.startsWith('yJ')) token = 'e' + token;
  return { hglogin: token, xsrf: String(xsrf ?? '').trim().replace(/^X-Hourglass-XSRF-Token=/, '') };
}

const isPlaceholder = value => EMPTY_MARKERS.some(marker => value.startsWith(marker));

function isSessionFilled(session) {
  return Boolean(session?.hglogin && session?.xsrf && !isPlaceholder(session.hglogin) && !isPlaceholder(session.xsrf));
}

function loadSession(folder) {
  const file = sessionFile(folder);
  if (!fs.existsSync(file)) return null;
  const session = normalizeSession(JSON.parse(fs.readFileSync(file, 'utf8')));
  return isSessionFilled(session) ? session : null;
}

function saveSession(folder, session) {
  fs.writeFileSync(sessionFile(folder), JSON.stringify(session, null, 2) + '\n');
}

function expiration(hglogin) {
  try {
    const payload = JSON.parse(Buffer.from(hglogin.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

module.exports = { loadSession, saveSession, normalizeSession, isSessionFilled, expiration };
