# RitiRiwaj — Cloudflare GitHub Deployment

This version is prepared for **GitHub → Cloudflare Pages** deployment. No terminal or Wrangler command is required.

## Part 1 — Upload this folder to GitHub

1. Sign in at `https://github.com`.
2. Click **New repository**.
3. Repository name: `ritiriwaj`.
4. Choose **Private** (recommended).
5. Create the repository.
6. Click **Add file → Upload files**.
7. Upload the **contents of this folder**, not the outer ZIP itself. The repository root must contain:

```text
public/
  _worker.js
  index.html
  app.js
  styles.css
  assets/
schema.sql
README.md
```

8. Click **Commit changes**.

## Part 2 — Create the Cloudflare D1 database

1. Sign in to Cloudflare Dashboard.
2. Open **Storage & Databases → D1 SQL Database**.
3. Click **Create database**.
4. Database name: `ritiriwaj-db`.
5. Open the newly created database.
6. Open its **Console** tab.
7. Open `schema.sql` from this repository, copy all of it, paste it into the D1 Console and click **Execute**.
8. Confirm that the `products` table contains 8 rows.

## Part 3 — Connect GitHub to Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages**.
2. Click **Create application → Pages → Connect to Git**.
3. Connect your GitHub account and select the `ritiriwaj` repository.
4. Use these build settings:

```text
Project name: ritiriwaj
Production branch: main
Framework preset: None
Build command: leave empty
Build output directory: public
Root directory: /
```

5. Click **Save and Deploy**.

Cloudflare will deploy the storefront and `public/_worker.js`, which securely handles every `/api/*` request while serving all other files as static assets.

## Part 4 — Connect the D1 binding

1. Open Cloudflare **Workers & Pages → ritiriwaj**.
2. Open **Settings → Bindings**.
3. Add a **D1 Database binding**.
4. Variable name must be exactly:

```text
DB
```

5. Select `ritiriwaj-db` and save.

## Part 5 — Add secure runtime secrets

Inside the same Cloudflare project, open **Settings → Variables and Secrets** and add these as encrypted secrets for Production:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
SESSION_SECRET
```

Values:

- `ADMIN_EMAIL`: your private admin email address
- `ADMIN_PASSWORD`: a unique password with 12+ characters
- `SESSION_SECRET`: a password-manager-generated random value with at least 32 characters

Do not put these values in GitHub files.

After saving the binding and secrets, open **Deployments** and retry/redeploy the latest deployment.

## Part 6 — Test the Cloudflare URL

Open:

```text
https://ritiriwaj.pages.dev
```

First open this health-check URL:

```text
https://ritiriwaj.pages.dev/api/health
```

It must return JSON containing `"ok": true`. If it returns 404, `_worker.js` was not deployed from the `public` output directory.

Then test these features:

1. Products load.
2. Sign in using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` secrets.
3. Change one product price.
4. Refresh the page and confirm the price remains changed.
5. Place a sample order and confirm it appears in Admin → Orders.

If products do not load, check that:

- D1 binding variable is exactly `DB`.
- `schema.sql` was executed.
- The latest deployment was redeployed after adding bindings.

## Part 7 — Connect `www.ritiriwaj.dpdns.org`

1. Cloudflare project → **Custom domains**.
2. Click **Set up a custom domain**.
3. Enter:

```text
www.ritiriwaj.dpdns.org
```

4. Complete Cloudflare's verification first.
5. In the DPDNS control panel, add the CNAME shown by Cloudflare. It will normally be:

```text
Type: CNAME
Name/Host: www.ritiriwaj (or the exact host requested by DPDNS)
Target: ritiriwaj.pages.dev
TTL: Auto
```

DPDNS must allow you to create or change a CNAME. If it does not, keep using `ritiriwaj.pages.dev` or use a domain whose DNS records you control.

## Part 8 — Google login

After the custom domain is active, add this in Google Cloud Console:

### Authorised JavaScript origin

```text
https://www.ritiriwaj.dpdns.org
```

Do not add a trailing slash. Redirect URI is not needed for this popup-based login.

Then sign in as admin, open **Login Settings**, paste the Google Web Client ID, add your trusted Gmail address under **Admin Google emails**, and save.

## Updating later

Edit or upload changed files to the GitHub repository and commit. Cloudflare automatically builds and deploys every commit to `main`.
