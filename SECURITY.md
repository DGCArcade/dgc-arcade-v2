# Security Policy

## Reporting a Vulnerability

If you find a security issue, do not open a public issue. Contact the repository owner privately with:

- Affected route, feature, or file path
- Steps to reproduce
- Impact assessment
- Any relevant logs or screenshots with secrets removed

For payment, balance, authentication, or admin-access issues, treat the report as urgent.

## Secret Handling

Never commit real values for:

- `DATABASE_URL`
- `JWT_SECRET`
- `PLISIO_SECRET_KEY` / `PLISIO_API_KEY`
- `GITHUB_TOKEN`
- AI provider API keys
- Render deploy hooks

If any secret is exposed, rotate it immediately in the provider dashboard and redeploy affected services.
