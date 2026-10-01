import { isSupabaseConfigured, requireSupabase } from './supabase.js';

const $ = (selector) => document.querySelector(selector);
const form = $('[data-auth-form]');
const copy = $('[data-auth-copy]');
const status = $('[data-auth-status]');
const submit = $('[data-submit]');
const password = $('#password');
const confirmPassword = $('#confirm-password');
const passwordLabel = $('[data-password-label]');
const links = $('.auth-links');
const back = $('[data-mode="signin"]');
let mode = 'signin';
const recovery = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

function showStatus(message, kind = '') { status.hidden = !message; status.textContent = message; status.dataset.kind = kind; }
function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  const update = mode === 'update';
  const reset = mode === 'reset';
  copy.textContent = signup ? 'Create your Nexus account with email and a password.' : update ? 'Choose a new password for your Nexus account.' : reset ? 'We’ll send a secure password reset link to your email.' : 'Sign in to continue to your Nexus dashboard.';
  submit.textContent = signup ? 'Create account' : update ? 'Update password' : reset ? 'Send reset link' : 'Sign in';
  password.hidden = reset; password.required = !reset; passwordLabel.hidden = reset;
  confirmPassword.hidden = !signup && !update; confirmPassword.required = signup || update; $('.auth-confirm').hidden = !signup && !update;
  links.hidden = signup || reset || update; back.hidden = !signup && !reset && !update; showStatus();
}
function friendlyError(error) {
  if (/invalid login credentials/i.test(error?.message || '')) return 'The email or password is incorrect.';
  if (/rate limit|too many/i.test(error?.message || '')) return 'Too many attempts. Please wait a moment and try again.';
  return error?.message || 'Authentication failed. Please try again.';
}

if (!isSupabaseConfigured) {
  showStatus('Authentication is unavailable until VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured.', 'error');
  form.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
} else {
  const supabase = requireSupabase();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setMode('update');
    else if (session && mode !== 'reset' && !recovery) window.location.replace('./dashboard.html');
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (recovery) setMode('update');
    else if (session) window.location.replace('./dashboard.html');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); showStatus();
    const email = form.elements.email.value.trim(); const pass = form.elements.password.value;
    if ((mode !== 'update' && !email) || (mode !== 'reset' && pass.length < 8)) return showStatus('Enter a valid email and a password with at least 8 characters.', 'error');
    if ((mode === 'signup' || mode === 'update') && pass !== form.elements.confirmPassword.value) return showStatus('Passwords do not match.', 'error');
    submit.disabled = true;
    try {
      let result;
      if (mode === 'signup') result = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (mode === 'signin') result = await supabase.auth.signInWithPassword({ email, password: pass });
      if (mode === 'reset') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}` });
      if (mode === 'update') result = await supabase.auth.updateUser({ password: pass });
      if (result.error) throw result.error;
      if (mode === 'signup') showStatus('Check your email to confirm your account, then sign in.', 'success');
      else if (mode === 'reset') showStatus('If an account exists for that email, a reset link is on its way.', 'success');
      else if (mode === 'update') { showStatus('Password updated. You can now sign in.', 'success'); await supabase.auth.signOut(); setMode('signin'); }
      else window.location.replace('./dashboard.html');
    } catch (error) { showStatus(friendlyError(error), 'error'); } finally { submit.disabled = false; }
  });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  setMode('signin');
}
