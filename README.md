# RitiRiwaj — Cloudflare Edition

Production-ready Cloudflare package for the RitiRiwaj rakhi store.

## Architecture

- **Frontend:** Cloudflare Pages static assets
- **API:** Cloudflare Pages Functions
- **Database:** Cloudflare D1
- **Authentication:** Signed sessions, PBKDF2 password hashing, Google Identity Services support
- **Domain:** Prepared for `ritiriwaj.dpdns.org`

## Start here

Read **[DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)** and follow the steps in order.

The first commands are:

```bash
npm install
npx wrangler login
npx wrangler d1 create ritiriwaj-db
```

Do not drag only the `public` folder into Cloudflare if you need admin, accounts and orders. Deploy the complete project with Wrangler so Pages Functions and D1 are connected.
