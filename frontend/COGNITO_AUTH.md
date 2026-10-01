# Amazon Cognito Auth setup

The frontend uses an Amazon Cognito User Pool with an authorization-code PKCE flow.
No Cognito client secret is sent to the browser.

1. Create or select an Amazon Cognito User Pool and enable email sign-in.
2. Assign a domain and an app client with authorization-code grant and PKCE.
3. Allow `openid email` scopes and add callback/sign-out URLs ending in `/auth.html`.
4. Copy `.env.example` to `.env` and set:

```text
VITE_COGNITO_DOMAIN=https://<domain>.auth.<region>.amazoncognito.com
VITE_COGNITO_CLIENT_ID=<public-app-client-id>
VITE_COGNITO_REDIRECT_URI=https://<host>/auth.html
VITE_COGNITO_LOGOUT_URI=https://<host>/auth.html
VITE_COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<user-pool-id>
VITE_COGNITO_SCOPES=openid email   # optional, this is the default
```

Never put a Cognito client secret or AWS credentials in `.env`, source, or any `VITE_` variable.
Without all five required values the auth and sign-up pages stay disabled and the dashboard
redirects to setup.

Implemented flows:

- Nexus-hosted multi-step sign-up at `signup.html` (name, contact, address, password, email code);
- on-page email/password sign-in via InitiateAuth (USER_PASSWORD_AUTH), no hosted-UI redirect;
- a fail-closed dashboard gate that hides the page before paint until the ID token verifies;
- authorization-code PKCE with state, nonce, and verifier checks;
- issuer, audience, token-use, nonce, and expiry checks on the ID token;
- RS256 signature verification against the user pool JWKS endpoint;
- sign-out that clears the session locally and revokes the refresh token.

## Sign-up (`signup.html`)

`cognito-signup.js` calls the user-pool API directly from the browser using only the public
app client id — `SignUp`, `ConfirmSignUp`, and `ResendConfirmationCode`, the three operations a
public client may call unauthenticated. There is no backend, no AWS credential, and no
`SecretHash`. The endpoint is derived from `VITE_COGNITO_ISSUER`, so it needs no extra variable.

The flow collects and submits these Cognito standard attributes:

| Field | Cognito attribute | Notes |
| --- | --- | --- |
| First name | `given_name` | |
| Last name | `family_name` | |
| Email | `email` + `Username` | Receives the verification code |
| Mobile number | `phone_number` | Normalised to E.164 before submission |
| Street, unit, city, region, postal code, country | `address` | Joined into the single OIDC `address.formatted` string |

After `ConfirmSignUp` succeeds, the page hands off to the normal PKCE sign-in with
`login_hint` set to the new email. The password is never persisted anywhere in the frontend.

### The app client must be PUBLIC (no client secret)

This is the single hard requirement, and it is currently **not met** by app client
`67ajqh4655tvb6a6g74sdang7g`. Cognito reports:

```text
Client 67ajqh4655tvb6a6g74sdang7g is configured with secret but SECRET_HASH was not received
```

Every user-pool call from a browser — `SignUp`, `InitiateAuth`, and the hosted-UI
`/oauth2/token` exchange — must be authenticated with a `SECRET_HASH` (or HTTP Basic) derived
from the client secret when the app client has one. That secret cannot ship in a frontend
bundle, so **no browser-only flow can work against a client with a secret**, hosted UI included.

Fix: create a second app client of type *Public client* with **no** client secret, give it the
same callback/sign-out URLs and auth flows, and point `VITE_COGNITO_CLIENT_ID` at it. Keep the
existing confidential client for any server-side use.

### Required app-client configuration

The sign-up page cannot create or change AWS resources. The pool and app client must already
allow all of the following, or Cognito rejects `SignUp` and the page shows its error verbatim:

- **No client secret on the app client** (see above — this is currently blocking). A secret requires a `SecretHash`, which cannot
  be computed in a browser without shipping the secret.
- **`given_name`, `family_name`, `phone_number`, and `address` writable by the app client.**
  Under *App client → Attribute read and write permissions*. An attribute that is required by
  the pool but not writable by the client fails with `InvalidParameterException`.
- **Self-service sign-up enabled** on the pool.
- **Email as the sign-in identifier**, matching `Username: <email>`.

Widening `VITE_COGNITO_SCOPES` to include `profile`, `phone`, or `address` puts those claims in
the ID token, but each one must first be allowed on the app client. The default stays
`openid email` so an unchanged pool keeps working.

## Trust boundary

The static frontend guard is a user-experience boundary. Any API or server-side protected
operation must independently verify the access token's issuer, client ID, token use, expiry,
and JWKS signature; never trust browser storage alone.
