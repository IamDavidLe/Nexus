const required = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI,
  issuer: import.meta.env.VITE_COGNITO_ISSUER,
};

export const isCognitoConfigured = Object.values(required).every(Boolean);
export const cognitoClientId = required.clientId;
/* Allowed OIDC scopes are an app-client setting. Keep the default to what the pool
   already grants; widen it with VITE_COGNITO_SCOPES only after allowing the extra
   scopes on the app client, or /oauth2/authorize rejects the request. */
export const cognitoScopes = (import.meta.env.VITE_COGNITO_SCOPES || 'openid email').trim();
const sessionKey = 'nexus-cognito-session';
const verifierKey = 'nexus-cognito-pkce-verifier';
const stateKey = 'nexus-cognito-pkce-state';
const nonceKey = 'nexus-cognito-nonce';
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (length = 64) => base64url(crypto.getRandomValues(new Uint8Array(length)));
async function challenge(verifier) { return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
function endpoint(path) { return `${required.domain.replace(/\/$/, '')}${path}`; }
/* The user-pool API shares an origin with the issuer: https://cognito-idp.<region>.amazonaws.com */
export function idpOrigin() {
  if (!required.issuer) throw new Error('Cognito is not configured.');
  return new URL(required.issuer).origin;
}
function clearPkce() { sessionStorage.removeItem(verifierKey); sessionStorage.removeItem(stateKey); sessionStorage.removeItem(nonceKey); }

export async function startLogin({ signup = false, loginHint = '' } = {}) {
  if (!isCognitoConfigured) throw new Error('Cognito is not configured.');
  const verifier = random(); const state = random(32); const nonce = random(32);
  sessionStorage.setItem(verifierKey, verifier); sessionStorage.setItem(stateKey, state); sessionStorage.setItem(nonceKey, nonce);
  const params = new URLSearchParams({ response_type: 'code', client_id: required.clientId, redirect_uri: required.redirectUri, scope: cognitoScopes, code_challenge_method: 'S256', code_challenge: await challenge(verifier), state, nonce });
  if (signup) params.set('screen_hint', 'signup');
  if (loginHint) params.set('login_hint', loginHint);
  window.location.assign(`${endpoint('/oauth2/authorize')}?${params}`);
}

export async function finishLogin() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  /* Cognito reports a failed authorize as ?error=..., which must not look like "no attempt". */
  if (query.get('error')) {
    clearPkce();
    history.replaceState({}, document.title, window.location.pathname);
    throw new Error(`Cognito sign-in failed: ${query.get('error_description') || query.get('error')}`);
  }
  if (!code) return getSession();
  try {
    if (query.get('state') !== sessionStorage.getItem(stateKey)) throw new Error('Invalid Cognito login state.');
    const verifier = sessionStorage.getItem(verifierKey);
    if (!verifier) throw new Error('Missing Cognito PKCE verifier.');
    const response = await fetch(endpoint('/oauth2/token'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: required.clientId, code, redirect_uri: required.redirectUri, code_verifier: verifier }) });
    if (!response.ok) throw new Error('Cognito token exchange failed.');
    const tokens = await response.json();
    /* Must await: an unawaited validation returns a truthy promise and would admit an
       unverified token while the rejection escapes as an unhandled promise rejection. */
    const claims = await validateIdToken(tokens.id_token, { nonce: sessionStorage.getItem(nonceKey) });
    const session = { ...tokens, claims };
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  } finally {
    /* A single-use code and its PKCE artifacts must not survive a failed exchange. */
    clearPkce();
    history.replaceState({}, document.title, window.location.pathname);
  }
}

function decode(token) {
  const parts = token?.split('.'); if (parts?.length !== 3) throw new Error('Malformed Cognito ID token.');
  const decodePart = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '=='), (char) => char.charCodeAt(0));
  return { header: JSON.parse(new TextDecoder().decode(decodePart(parts[0]))), claims: JSON.parse(new TextDecoder().decode(decodePart(parts[1]))), signature: decodePart(parts[2]), signingInput: `${parts[0]}.${parts[1]}` };
}
export async function validateIdToken(token, { nonce = '' } = {}) {
  const { header, claims, signature, signingInput } = decode(token);
  if (claims.iss !== required.issuer || claims.aud !== required.clientId || claims.token_use !== 'id' || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Cognito ID token claims are invalid.');
  /* Only checked on the exchange that minted the nonce; a stored session re-check has none. */
  if (nonce && claims.nonce !== nonce) throw new Error('Cognito ID token nonce does not match.');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Cognito ID token algorithm is invalid.');
  const keys = await fetch(`${required.issuer.replace(/\/$/, '')}/.well-known/jwks.json`).then((response) => response.ok ? response.json() : Promise.reject(new Error('Cognito JWKS request failed.')));
  const jwk = keys.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Cognito signing key is unknown.');
  const cryptoKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, new TextEncoder().encode(signingInput))) throw new Error('Cognito ID token signature is invalid.');
  return claims;
}
export async function getSession() {
  try { const session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); if (!session?.id_token) return null; await validateIdToken(session.id_token); return session; }
  catch { sessionStorage.removeItem(sessionKey); return null; }
}
export function signOut() { sessionStorage.removeItem(sessionKey); window.location.assign(`${endpoint('/logout')}?${new URLSearchParams({ client_id: required.clientId, logout_uri: required.logoutUri })}`); }
