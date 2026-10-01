# Amazon Cognito Auth setup

The frontend uses Amazon Cognito User Pools Managed Login with an authorization-code PKCE flow.
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
```

Never put a Cognito client secret or AWS credentials in `.env`, source, or any `VITE_` variable.
Without all five values the auth page remains disabled and the dashboard redirects to setup.

Implemented flows:

- Cognito-managed email/password sign-in and sign-up;
- Cognito-managed password reset;
- authorization-code PKCE with state and verifier checks;
- issuer, audience, token-use, and expiry checks on the ID token;
- RS256 signature verification against the user pool JWKS endpoint;
- Cognito logout and a fail-closed dashboard guard.

The static frontend guard is a user-experience boundary. Any API or server-side protected
operation must independently verify the access token's issuer, client ID, token use, expiry,
and JWKS signature; never trust browser storage alone.
