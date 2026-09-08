# Security

## Reporting a vulnerability

Do not open a public issue containing credentials, account data, or an exploitable vulnerability. Report it privately to the repository owner with reproduction steps, affected versions, and the smallest useful proof of concept.

## Security model

- Sampla injects its UI only after the user clicks the extension action.
- Network proxy requests are restricted to the exact configured HTTPS Jam API origin.
- Jam sign-in results must come from an allowlisted HTTPS origin and match a short-lived, single-use request created by the extension.
- Firebase web API keys are public client identifiers. Firebase deployment credentials, service-account keys, Jam sessions, and user tokens must never be committed.
- Jam session data is stored in Chrome extension storage on the local browser profile. Sign out before sharing a browser profile or extension data directory.

When changing hosts or auth origins, update the shared Jam configuration and the manifest together, then run `npm run jam:check` and `npm test`.
