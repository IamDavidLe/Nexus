# Cognito Hosted UI branding

Styles the Amazon Cognito Hosted UI (classic) to match the Nexus site: black banner with the Nexus
wordmark, white form panel, Nexus blue (`#1d4ed8`, hover `#0b1f5c`) for buttons, links and focus.

| File | What |
|------|------|
| `hosted-ui.css` | Upload as the Hosted UI CSS. Built from AWS's `CSS template.css`: same 18 classes and only the template's properties, 1.7 KB (limit 3 KB) |
| `nexus-logo.png` | Upload as the logo. 350×178 transparent PNG, white wordmark in Instrument Serif, 6 KB (limit 100 KB) |

## Does this affect sign-in?

No. Branding is cosmetic. Also, the app doesn't send people to the Hosted UI at all: sign-up and
sign-in run on our own `signup.html` and `auth.html` through the server proxy, and logout is local.
The Hosted UI only appears if someone opens the Cognito domain directly, and this keeps it on-brand
if they do.

## Why it's a light panel

AWS only accepts the template's properties, and the template has no label colour. Cognito's labels
default to dark grey, so a black panel would make them unreadable. Fonts, gradients, shadows and rounded
submit buttons aren't allowed either, so the wordmark lives in the logo image.

## Apply

The domain must use **Hosted UI (classic)** branding; the newer Managed Login editor ignores this file.

**Console:** Cognito → User pools → the pool → **Managed login** → Hosted UI settings → **Style** →
Edit → upload `nexus-logo.png` and `hosted-ui.css` → Save. Changes show within about a minute.

**CLI** (run from `frontend/`, after `aws login`):

```bash
ISS=$(grep '^VITE_COGNITO_ISSUER=' .env | cut -d= -f2-)
CLIENT=$(grep '^VITE_COGNITO_CLIENT_ID=' .env | cut -d= -f2-)
aws cognito-idp set-ui-customization --region us-west-2 \
  --user-pool-id "${ISS##*/}" --client-id "$CLIENT" \
  --css "$(cat cognito/hosted-ui.css)" \
  --image-file fileb://cognito/nexus-logo.png
```

Drop `--client-id` to set it as the default for every app client in the pool.

**Check:** open `https://<domain>/login?response_type=code&client_id=<client-id>&redirect_uri=<callback-url>`.

**Undo:** run the same command with the original `CSS template.css` content, or clear it in the console.
