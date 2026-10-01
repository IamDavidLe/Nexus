# Handoff — S2-02/S2-04 Cognito authentication

**From:** Builder  **To:** @rohitmaruriats/verifier @rohitmaruriats/breaker @rohitmaruriats/integrator
**Named product commit:** `c2b44325fc0f3fa95e84d45af9e1d6d6fa1c0d4e`
**Evidence commit:** recorded after the evidence archive commit; this packet is committed separately so the hash is auditable.

## Work item and criteria

S2-02 provider/config boundary and S2-04 session/request protection. The implementation uses
Cognito User Pool Managed Login with authorization-code PKCE, email scope only, fail-closed
configuration, state/verifier checks, issuer/audience/token-use/expiry checks, and RS256 JWKS
signature validation. No social or IAM authorization path is configured by the client.

## Files changed

Named commit `c2b4432` changes `.env.example`, `frontend/auth.html`, `frontend/auth.css`,
`frontend/auth-cognito.js`, `frontend/cognito.js`, `frontend/dashboard.js`,
`frontend/COGNITO_AUTH.md`, `frontend/package.json`, `frontend/package-lock.json`, and removes
the Supabase client/dependency.

## Commands and exact results

```text
npm run build
✓ 14 modules transformed.
dist/auth.html 1.78 kB
dist/assets/auth-BBo5uZdJ.js 0.75 kB
dist/assets/cognito-CbPX7eP6.js 3.30 kB
✓ built in 235ms

npm audit --omit=dev
found 0 vulnerabilities

node tools/viewport-check.mjs http://127.0.0.1:4173/Nexus/auth.html stage-2/evidence/S2-02-auth --wait-ms 300
phone 375px: ok (status 200, console errors 0, page errors 0, overflow 0px)
desktop 1280px: ok (status 200, console errors 0, page errors 0, overflow 0px)

python -m pytest -q -p no:cacheprovider stage-1/tests/test_acceptance_transfers.py stage-1/tests/test_acceptance_idempotency.py stage-1/tests/test_ledger_failures.py
.........................               [100%]
25 passed, 33 subtests passed in 5.59s

tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080 --cpus 1 --memory 512m --timeout 30
health answered: {"status":"ok"}
ok: no outbound network
PASS

provider/secret scan
provider/secret scan: no Supabase or secret-role references

git diff --check
exit code: 0
```

## Results and gaps

- Met/proven locally: build, dependency audit, no-secret/provider scan, PKCE code path, claim
  validation, JWKS signature path, responsive auth page, console/overflow check, Stage 1 targeted
  regression, and clean-container health/no-network check.
- Not run: independent Breaker adversarial suite, keyboard traversal evidence, the task-local
  Stage 2 contract suite, and a configured AWS account smoke test.
- Owner-only smoke skip: no Cognito domain, app-client, or user-pool values are available in this
  environment. Running a live smoke test would require owner configuration; no credentials were
  invented or committed. This is an explicit skip, not a pass.
- Builder claims no acceptance or sign-off. Verifier and Breaker must independently review the
  named product commit and this packet.

## How to reproduce

```text
git checkout c2b44325fc0f3fa95e84d45af9e1d6d6fa1c0d4e
cd frontend
npm ci
npm run build
cd ..
node tools/viewport-check.mjs http://127.0.0.1:4173/Nexus/auth.html stage-2/evidence/S2-02-auth
```

Configure the five `VITE_COGNITO_*` values from `.env.example` before an owner-run AWS smoke.
