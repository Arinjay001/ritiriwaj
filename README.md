# RitiRiwaj — Direct Cloudflare Worker Deployment

This package is made for the exact Cloudflare **Workers Builds** screen shown in your screenshot. It uses:

- Deploy command: `npx wrangler deploy`
- Cloudflare Worker for `/api/*`
- Cloudflare Static Assets from `public/`
- Automatically provisioned Cloudflare D1 database
- Secure runtime secrets for admin authentication

No local terminal is required when deploying through a Git-connected Cloudflare Worker.

## Fix the current failed `ritiriwajshop` deployment

The error “Could not detect a directory containing static files” happened because the repository did not contain a Worker assets configuration. This package now has:

```text
wrangler.toml
[assets]
directory = "./public"
```

### 1. Replace the GitHub repository contents

Extract the ZIP and upload its **contents** to the root of the same GitHub repository connected to `ritiriwajshop`.

The GitHub repository root must look exactly like this:

```text
public/
src/
wrangler.toml
package.json
schema.sql
README.md
```

Do not upload the ZIP as one file and do not put these files inside another folder.

Commit the changes to the branch connected to Cloudflare, normally `main`.

### 2. Confirm Cloudflare build settings

Cloudflare Dashboard → **Workers & Pages → ritiriwajshop → Settings → Build**:

```text
Build command: leave empty
Deploy command: npx wrangler deploy
Root directory: /
Production branch: main
```

Save. A new GitHub commit should automatically trigger deployment. Otherwise open **Deployments** and click **Retry deployment**.

Wrangler now finds `public/`, uploads all static images/CSS/JS, deploys `src/worker.js`, and provisions the `ritiriwaj-db` D1 binding named `DB`.

### 3. Check the deployment

After the deployment succeeds, open:

```text
https://www.ritiriwaj.dpdns.org/api/health
```

Expected result:

```json
{"ok":true,"platform":"Cloudflare Workers + D1"}
```

On the first API request, the Worker automatically creates all D1 tables and inserts the 8 starter products.

### 4. Add the three private secrets

Cloudflare Dashboard → **Workers & Pages → ritiriwajshop → Settings → Variables and Secrets**.

Add these as encrypted secrets:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
SESSION_SECRET
```

Use:

- `ADMIN_EMAIL`: your private admin email
- `ADMIN_PASSWORD`: your own unique password with 12+ characters
- `SESSION_SECRET`: a password-manager-generated random value of at least 32 characters

Do not save any of these values in GitHub. `keep_vars = true` is enabled so dashboard variables remain available on future Git deployments.

After adding secrets, deploy/retry once more if Cloudflare asks.

### 5. Test login

Open:

```text
https://www.ritiriwaj.dpdns.org
```

Use the values you entered under `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Do not use the old preview password unless you deliberately used it as the Cloudflare secret.

### 6. Google login

After email login works, open Admin → **Login Settings** and paste the Google Web Client ID.

Google Cloud authorised JavaScript origin:

```text
https://www.ritiriwaj.dpdns.org
```

Do not add a trailing slash. Add only trusted Gmail addresses under **Admin Google emails**.

## If D1 is not automatically shown

Open the Worker’s **Bindings** tab. Confirm a D1 binding named exactly `DB` exists. Wrangler normally provisions `ritiriwaj-db` automatically from `wrangler.toml`. If it does not, create a D1 database named `ritiriwaj-db`, add it as the `DB` binding, and retry deployment.
