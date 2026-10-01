const required = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI,
  issuer: import.meta.env.VITE_COGNITO_ISSUER,
};

export const isCognitoConfigured = Object.values(required).every(Boolean);
const sessionKey = 'nexus-cognito-session';
const verifierKey = 'nexus-cognito-pkce-verifier';
const stateKey = 'nexus-cognito-pkce-state';
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (length = 64) => base64url(crypto.getRandomValues(new Uint8Array(length)));
async function challenge(verifier) { return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
function endpoint(path) { return `${required.domain.replace(/\/$/, '')}${path}`; }

export async function startLogin({ signup = false } = {}) {
  if (!isCognitoConfigured) throw new Error('Cognito is not configured.');
  const verifier = random(); const state = random(32);
  sessionStorage.setItem(verifierKey, verifier); sessionStorage.setItem(stateKey, state);
  const params = new URLSearchParams({ response_type: 'code', client_id: required.clientId, redirect_uri: required.redirectUri, scope: 'openid email', code_challenge_method: 'S256', code_challenge: await challenge(verifier), state });
  if (signup) params.set('screen_hint', 'signup');
  window.location.assign(`${endpoint('/oauth2/authorize')}?${params}`);
}

export async function finishLogin() {
  const query = new URLSearchParams(window.location.search); const code = query.get('code');
  if (!code) return getSession();
  if (query.get('state') !== sessionStorage.getItem(stateKey)) throw new Error('Invalid Cognito login state.');
  const verifier = sessionStorage.getItem(verifierKey);
  if (!verifier) throw new Error('Missing Cognito PKCE verifier.');
  const response = await fetch(endpoint('/oauth2/token'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: required.clientId, code, redirect_uri: required.redirectUri, code_verifier: verifier }) });
  if (!response.ok) throw new Error('Cognito token exchange failed.');
  const tokens = await response.json(); const claims = validateIdToken(tokens.id_token);
  sessionStorage.setItem(sessionKey, JSON.stringify({ ...tokens, claims })); sessionStorage.removeItem(verifierKey); sessionStorage.removeItem(stateKey);
  history.replaceState({}, document.title, window.location.pathname); return { ...tokens, claims };
}

function decode(token) {
  const parts = token?.split('.'); if (parts?.length !== 3) throw new Error('Malformed Cognito ID token.');
  const decodePart = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '=='), (char) => char.charCodeAt(0));
  return { header: JSON.parse(new TextDecoder().decode(decodePart(parts[0]))), claims: JSON.parse(new TextDecoder().decode(decodePart(parts[1]))), signature: decodePart(parts[2]), signingInput: `${parts[0]}.${parts[1]}` };
}
export async function validateIdToken(token) {
  const { header, claims, signature, signingInput } = decode(token);
  if (claims.iss !== required.issuer || claims.aud !== required.clientId || claims.token_use !== 'id' || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Cognito ID token claims are invalid.');
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
