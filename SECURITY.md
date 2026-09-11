# Security

## Reporting a vulnerability

Do not open a public issue containing credentials, account data, or an exploitable vulnerability. Report it privately to the repository owner with reproduction steps, affected versions, and the smallest useful proof of concept.

## Security model

- Sampla injects its UI only after the user clicks the extension action.
- Recordings and preferences are stored locally in Chrome extension storage.
- Credentials, service-account keys, and user tokens must never be committed.
