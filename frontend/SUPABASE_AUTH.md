# Supabase Auth setup

The frontend uses Supabase Auth email/password flows only. It never contains a service-role key.

1. Create or select a Supabase project.
2. In Authentication → Providers, enable Email and configure confirmation/reset email URLs.
3. Add the local and deployed auth callback URLs, ending in `/auth.html`.
4. Copy `.env.example` to `.env` and set:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

The publishable key is safe for browser use; never put a `service_role` key in `.env`, source,
or any `VITE_` variable. Without both values the auth page remains disabled and the dashboard
redirects to setup instead of showing protected content.

Implemented flows:

- email/password sign-up with confirmation guidance;
- password sign-in and sign-out;
- reset-link request and recovery password update;
- session-change handling and fail-closed dashboard guard;
- generic credential/rate-limit errors without revealing account existence.
