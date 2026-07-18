# Deploying {{projectName}} to a VPS

The pattern: **CI builds, GHCR stores, the VPS pulls.** The VPS never checks out source
and never builds — it holds a compose file plus env files and runs `docker compose pull && up -d`.

- Push to `main` → GitHub Actions builds the images, pushes them to GHCR
  (tags: `staging` + immutable `sha-*`), then SSHes into the VPS and redeploys.
- Manual deploys / production: Actions → Deploy → Run workflow → pick the environment.

## One-time GitHub setup

Repo **Settings → Secrets and variables → Actions** — create these secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | Server IP or hostname |
| `VPS_USER` | Deploy user (must be in the `docker` group) |
| `VPS_SSH_PRIVATE_KEY` | Full PEM private key (BEGIN/END lines included) |
| `VPS_APP_DIR` | e.g. `/srv/{{projectName}}` |
| `VPS_PORT` | Optional, defaults to 22 |

For production gating: **Settings → Environments → production** → add a required reviewer.

## One-time VPS bootstrap

```sh
# 1. Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in afterwards

# 2. Let CI in: add the deploy public key
#    (the pair whose private half is the VPS_SSH_PRIVATE_KEY secret)
echo '<ci-public-key>' >> ~/.ssh/authorized_keys

# 3. App directory + files from this repo's deploy/ dir
sudo mkdir -p /srv/{{projectName}}/env && sudo chown -R $USER /srv/{{projectName}}
# copy deploy/docker-compose.vps.yml  ->  /srv/{{projectName}}/docker-compose.yml
# copy deploy/env.example             ->  /srv/{{projectName}}/.env   (edit image owner/repo!)
# app secrets (never in git)          ->  /srv/{{projectName}}/env/<service>.env

# 4. First start (after the first CI build has pushed images)
cd /srv/{{projectName}}
docker login ghcr.io    # a GitHub PAT with read:packages
docker compose pull && docker compose up -d

# 5. Nginx + TLS (configs in deploy/nginx/, replace YOUR_DOMAIN)
sudo apt install nginx certbot python3-certbot-nginx
sudo cp nginx configs to /etc/nginx/sites-available/ and enable them
sudo certbot --nginx

# 6. Firewall — the app ports stay closed; nginx is the only ingress
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Note: the compose file binds services to `127.0.0.1` on purpose — Docker's iptables rules
bypass UFW, so a plain `3000:3000` would expose the app to the whole internet.

## Two env files, deliberately split

- `/srv/{{projectName}}/.env` — read by Compose itself for `${VAR}` substitution
  (image tags). Never put app secrets here: a `$` in a secret gets eaten by substitution.
- `/srv/{{projectName}}/env/<service>.env` — handed to the container via `env_file:`;
  put app config/secrets here.

## Verify a deploy (a green workflow is not proof)

```sh
docker compose ps                    # every service Up, nothing restart-looping
docker compose logs --tail=50       # boot errors, missing env vars
curl -fsS https://api.YOUR_DOMAIN/health
```

## Rollback

Point the image var in `/srv/{{projectName}}/.env` at the immutable tag of the last good
commit (`ghcr.io/OWNER/REPO/<service>:sha-<commit>`), then `docker compose up -d`.
