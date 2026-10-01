import { cognitoClientId, idpOrigin, isCognitoConfigured } from './cognito.js';

/* Amazon Cognito user-pool API calls that a public app client may make unauthenticated:
   SignUp, ConfirmSignUp, ResendConfirmationCode. No client secret and no AWS
   credentials are involved — adding either to this bundle would ship it to the browser.
   A pool whose app client has a secret cannot be used from here: it would require a
   SecretHash, which is exactly the thing that must not reach the browser. */
const operations = {
  signUp: 'AWSCognitoIdentityProviderService.SignUp',
  confirmSignUp: 'AWSCognitoIdentityProviderService.ConfirmSignUp',
  resendCode: 'AWSCognitoIdentityProviderService.ResendConfirmationCode',
};

/* Cognito's own message is the only accurate explanation of a pool-policy rejection
   (password policy, unwritable attribute, alias already taken), so surface it rather
   than a guess. These codes get friendlier wording because users see them routinely. */
const friendly = {
  UsernameExistsException: 'An account with this email already exists. Try signing in instead.',
  CodeMismatchException: 'That verification code is not correct. Check the code and try again.',
  ExpiredCodeException: 'That verification code has expired. Send yourself a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes before trying again.',
  TooManyRequestsException: 'Too many attempts. Wait a few minutes before trying again.',
  NotAuthorizedException: 'This account is already confirmed. Try signing in instead.',
};

export class CognitoError extends Error {
  constructor(code, message) { super(message); this.name = 'CognitoError'; this.code = code; }
}

async function call(operation, payload) {
  if (!isCognitoConfigured) throw new CognitoError('NotConfigured', 'Cognito is not configured.');
  let response;
  try {
    response = await fetch(`${idpOrigin()}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': operations[operation] },
      body: JSON.stringify({ ClientId: cognitoClientId, ...payload }),
    });
  } catch {
    throw new CognitoError('NetworkError', 'Could not reach Amazon Cognito. Check your connection and try again.');
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  /* __type looks like "com.amazonaws.cognitoidp#UsernameExistsException". */
  const code = String(body.__type || '').split('#').pop() || `Http${response.status}`;
  throw new CognitoError(code, friendly[code] || body.message || `Cognito rejected the request (${code}).`);
}

/* Cognito requires E.164. Accept what people actually type and normalise, rather than
   rejecting "(555) 010-1234" for punctuation. Returns '' when it cannot be normalised. */
export function toE164(input, countryCode = '1') {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && countryCode === '1') return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1') && countryCode === '1') return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${countryCode}${digits}` : '';
}

/* Cognito's standard `address` attribute is a single formatted string (OIDC
   address.formatted), so the structured fields are joined for storage. */
export function formatAddress({ line1 = '', line2 = '', city = '', region = '', postalCode = '', country = '' }) {
  const street = [line1, line2].map((part) => part.trim()).filter(Boolean).join(', ');
  const locality = [city.trim(), [region.trim(), postalCode.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, locality, country.trim()].filter(Boolean).join('\n');
}

export async function signUp({ email, password, firstName, lastName, phone, address }) {
  const attributes = [
    { Name: 'email', Value: email },
    { Name: 'given_name', Value: firstName },
    { Name: 'family_name', Value: lastName },
  ];
  if (phone) attributes.push({ Name: 'phone_number', Value: phone });
  if (address) attributes.push({ Name: 'address', Value: address });
  /* Email as username keeps sign-up and the hosted sign-in screen on the same identifier. */
  const result = await call('signUp', { Username: email, Password: password, UserAttributes: attributes });
  return { confirmed: Boolean(result.UserConfirmed), deliveryTo: result.CodeDeliveryDetails?.Destination || '' };
}

export async function confirmSignUp({ email, code }) {
  await call('confirmSignUp', { Username: email, ConfirmationCode: code.trim() });
}

export async function resendCode({ email }) {
  const result = await call('resendCode', { Username: email });
  return { deliveryTo: result.CodeDeliveryDetails?.Destination || '' };
}
