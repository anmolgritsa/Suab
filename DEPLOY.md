# Deploying SUAB to GitHub Pages

The app is built from this private source repo (`anmolgritsa/Suab`) and
published to a separate **public** repo (`anmolgritsa/Suab-deploy`), which
GitHub Pages serves at:

    https://anmolgritsa.github.io/Suab-deploy/

Every push to `main` builds the app and republishes it automatically via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Manual runs
are also available from the **Actions** tab ("Deploy to GitHub Pages" →
"Run workflow").

## One-time setup

### 1. Create the deploy repository

Create a **public** repo named `Suab-deploy` under `anmolgritsa`
(github.com/new → Repository name `Suab-deploy` → Public → ✅ Add a README).
The initial commit matters: the workflow checks the repo out before
publishing, and an empty repo cannot be checked out.

### 2. Enable GitHub Pages on the deploy repo

In `Suab-deploy` → **Settings → Pages**:

- **Source**: Deploy from a branch
- **Branch**: `gh-pages`, folder `/ (root)` → **Save**

The `gh-pages` branch is created by the first workflow run, so it may not
appear in the dropdown yet — save the Pages settings after the first deploy
(or type `gh-pages` manually and save).

### 3. Create a Personal Access Token (PAT)

The built-in `GITHUB_TOKEN` is scoped to the source repo only and cannot
push to another repository, so a PAT is required.

GitHub → **Settings → Developer settings → Personal access tokens** →
**Generate new token**:

- Fine-grained token: **Repository access** → only `anmolgritsa/Suab-deploy`,
  **Permissions** → Contents → **Read and write**
  (a classic token with the **repo** scope also works)

Copy the token — it is shown only once.

### 4. Store the token as a secret in the SOURCE repo

In `Suab` (this repo) → **Settings → Secrets and variables → Actions** →
**New repository secret**:

- **Name**: `DEPLOY_TOKEN`
- **Secret**: the PAT from step 3

## Trigger a deploy

Push to `main` (or **Actions → Deploy to GitHub Pages → Run workflow**).
The first run creates the `gh-pages` branch in `Suab-deploy`; once Pages is
enabled the site goes live at the URL above (allow a minute or two for the
first Pages build).

## How it works

- `vite.config.js` sets `base: '/Suab-deploy/'`, so all built asset URLs
  match the Pages sub-path. Local dev, `vite preview` and the browser test
  scripts are unaffected — they read the resolved URL from the Vite server.
- The workflow checks out `Suab-deploy` with `DEPLOY_TOKEN`, wipes its
  `gh-pages` branch (except `.git`), copies in `dist/`, adds `.nojekyll`
  (serve files as-is, skip Jekyll) and pushes. Unchanged builds skip the
  commit entirely.
- Only read permission is granted to the source repo; the cross-repo push
  authenticates purely with the PAT.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Workflow fails with `401` / `Authentication failed` | `DEPLOY_TOKEN` missing, expired, or lacks **Contents: Read and write** on `Suab-deploy` |
| Workflow fails checking out `Suab-deploy` | The deploy repo has no commits — initialise it with a README (step 1) |
| 404 on the live site | Pages still points at the wrong branch (step 2), or the deploy ran before Pages was enabled — re-run the workflow |
| Assets 404 but the page loads | `base` in `vite.config.js` doesn't match the Pages path — keep it `/Suab-deploy/` |

## Alternative: deploy with an action

If you prefer a dedicated action over the manual checkout + push, steps 2–3
of the workflow can be replaced with `peaceiris/actions-gh-pages`:

```yaml
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v4
        with:
          personal_token: ${{ secrets.DEPLOY_TOKEN }}
          external_repository: anmolgritsa/Suab-deploy
          publish_branch: gh-pages
          publish_dir: ./dist
```

The same `DEPLOY_TOKEN` secret is used either way.
