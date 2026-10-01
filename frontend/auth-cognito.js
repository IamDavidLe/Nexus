import { finishLogin, isCognitoConfigured, startLogin } from './cognito.js';

const status = document.querySelector('[data-auth-status]');
const button = document.querySelector('[data-login]');
const signup = document.querySelector('[data-signup]');
const setup = 'Configure VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REDIRECT_URI, VITE_COGNITO_LOGOUT_URI, and VITE_COGNITO_ISSUER.';

function show(message, kind = '') { status.hidden = !message; status.textContent = message; status.dataset.kind = kind; }

if (!isCognitoConfigured) {
  show(`Authentication is unavailable. ${setup}`, 'error');
  button.disabled = true; signup.disabled = true;
} else {
  finishLogin().then((session) => { if (session) window.location.replace('./dashboard.html'); }).catch((error) => show(error.message, 'error'));
  button.addEventListener('click', () => startLogin().catch((error) => show(error.message, 'error')));
  signup.addEventListener('click', () => startLogin({ signup: true }).catch((error) => show(error.message, 'error')));
}
