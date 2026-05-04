# PrintNC Tool Library

React/TypeScript frontend for GitHub Pages plus a Cloudflare Worker/D1 backend for public CNC tool recipes, user tool lists, GitHub/Google sign-in, votes, and Fusion/BearSender JSON import/export.

## Local setup

```sh
pnpm install
pnpm db:migrate:local
pnpm worker:dev
pnpm dev
```

The Vite dev server proxies `/api` and `/auth` to the Worker on `127.0.0.1:8787`.

Local Worker commands require a Wrangler-compatible Node version. Deploys can be handled entirely by GitHub Actions, so local Node/Wrangler are optional if you only want to edit and push.

## Cloudflare setup

1. Create a D1 database named `printnc-tool-library`.
2. Put its `database_id` into `wrangler.toml`.
3. Configure GitHub and Google OAuth apps with callback URLs:
   - `https://YOUR_WORKER_DOMAIN/auth/github/callback`
   - `https://YOUR_WORKER_DOMAIN/auth/google/callback`
4. Add secrets with `pnpm wrangler secret put ...` for each secret listed in `wrangler.toml`.
5. Run `pnpm db:migrate` and `pnpm worker:deploy`.

## Frontend deployment

The included GitHub Actions workflow builds the app with `GITHUB_PAGES=true` and publishes `dist` to GitHub Pages.

Set this GitHub repository variable for the Pages build:

- `VITE_API_ORIGIN`: your deployed Worker origin, for example `https://printnc-tool-library-api.YOUR_SUBDOMAIN.workers.dev`

## CI/CD

- `.github/workflows/ci.yml` runs `pnpm check` and `pnpm build` on pushes and pull requests.
- `.github/workflows/pages.yml` deploys the frontend to GitHub Pages from `main`.
- `.github/workflows/worker.yml` applies D1 migrations and deploys the Cloudflare Worker from `main`.

Add these GitHub repository secrets before enabling Worker deploys:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare Worker secrets can be entered manually in the Cloudflare dashboard or with Wrangler outside CI:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`

## Import/export support

BearSender export uses the local BearSender `version: 1` tool schema. Fusion export mirrors BearSender's current Fusion-compatible JSON converter. Real Fusion sample libraries can be added later as fixtures to harden the parser.
