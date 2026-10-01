const crypto = require('crypto');

const ACCESS_TTL_SECONDS = 60 * 15;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
const JWT_SECRET = process.env.JWT_SECRET || 'gestao-despesas-development-secret-change-me';
const revokedRefreshTokens = new Set();

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signJwt(payload, expiresInSeconds, type) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    type,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    jti: crypto.randomUUID(),
  }));
  const unsignedToken = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsignedToken).digest('base64url');
  return `${unsignedToken}.${signature}`;
}

function verifyJwt(token, expectedType) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.type !== expectedType || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (expectedType === 'refresh' && revokedRefreshTokens.has(payload.jti)) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function createTokenPair(user) {
  return {
    accessToken: signJwt({ userId: String(user.id), perfil: user.perfil }, ACCESS_TTL_SECONDS, 'access'),
    refreshToken: signJwt({ userId: String(user.id) }, REFRESH_TTL_SECONDS, 'refresh'),
  };
}

function getTokenFromRequest(req, cookieName, headerName) {
  const headerValue = req.headers[headerName] || '';
  if (headerValue.startsWith('Bearer ')) {
    return headerValue.slice(7).trim();
  }

  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : null;
}

function getAccessPayload(req) {
  return verifyJwt(getTokenFromRequest(req, 'accessToken', 'authorization'), 'access');
}

function getRefreshPayload(req) {
  return verifyJwt(getTokenFromRequest(req, 'refreshToken', 'x-refresh-token'), 'refresh');
}

function getRefreshToken(req) {
  return getTokenFromRequest(req, 'refreshToken', 'x-refresh-token');
}

function revokeRefreshToken(token) {
  const payload = verifyJwt(token, 'refresh');
  if (payload?.jti) {
    revokedRefreshTokens.add(payload.jti);
  }
}

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  createTokenPair,
  getAccessPayload,
  getRefreshPayload,
  getRefreshToken,
  revokeRefreshToken,
  verifyJwt,
};
