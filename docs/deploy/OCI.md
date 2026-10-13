# Deploy Wisemail **API** on Oracle Cloud (first time)

This guide deploys the **backend only** (Fastify + jobs + webhooks) on an **Oracle Cloud Infrastructure (OCI) VM**.

The **SPA frontend** goes on **Vercel** — see [`VERCEL.md`](./VERCEL.md).

| Piece | Role | Closest AWS name |
|---|---|---|
| **OCI Compute instance** | Linux VM running Node / Fastify | **EC2** |
| **VCN** | Private network for the VM | **VPC** |
| **Subnet** | Public subnet so the VM gets a public IP | **Subnet** |
| **Security list / NSG** | Who can reach ports 22 / 80 / 443 | **Security Group** |
| **Internet Gateway** | VCN → public internet | **Internet Gateway** |
| **Nginx** | TLS terminator + reverse proxy to Fastify | ALB (TLS) on the box |
| **PM2** | Keeps the API process alive | systemd / process manager |
| **MongoDB Atlas** | Managed MongoDB replica set | DocumentDB / “RDS for Mongo” |
| **Cloudflare R2** | Attachment object storage | **S3** |
| **Inngest Cloud** | Background jobs | SQS + Lambda / Step Functions |
| **Vercel** (separate) | Hosts the React SPA | Amplify / S3+CloudFront static |

You do **not** need Kubernetes or a second VM for a first API deploy.

---

## 0. Mental model

Recommended hostnames (same parent domain):

| Host | Where | Env |
|---|---|---|
| `https://app.example.com` | **Vercel** (SPA) | `APP_URL` |
| `https://api.example.com` | **OCI** (Fastify) | `BETTER_AUTH_URL` |

```
Browser (Vercel SPA)
   │  fetch / EventSource  (credentials, CORS)
   ▼
 DNS  api.example.com → OCI public IP
   │
   ▼
 OCI Security List  (22, 80, 443)
   │
   ▼
 Nginx (TLS)  →  Fastify 127.0.0.1:4000  (PM2)
                   │
                   ├── MongoDB Atlas
                   ├── Cloudflare R2
                   ├── Resend / Stripe / Inngest (outbound)
                   └── Inngest Cloud → POST https://api.example.com/api/inngest
```

**Cookies:** set `COOKIE_DOMAIN=.example.com` so the session cookie is shared by `app.` and `api.`.  
**CORS:** `APP_URL` (and optional `SPA_ORIGINS`) must list the Vercel origin(s).

**Why Nginx?** Browsers use HTTPS on 443. Fastify listens on localhost `:4000`. Nginx terminates TLS (like an ALB certificate) and proxies `/api` and `/health`. Node never faces the public internet.

**Why not serve the SPA from this VM?** You asked for Vercel for the frontend (CDN, previews, no static hosting on the box).

---

## 1. Accounts and DNS

1. **Oracle Cloud** — [cloud.oracle.com](https://cloud.oracle.com). Pick a home region and stick to it.
2. **Domain** — you will create:
   - `A` / `CNAME` for **`api.example.com`** → OCI VM (this guide)
   - `CNAME` for **`app.example.com`** → Vercel (frontend guide)
3. **MongoDB Atlas**, **Cloudflare R2**, **Resend**, **Inngest**, optional **Stripe** / **Sentry**.

SSH from your laptop (`ssh`). On Windows use WSL or PowerShell OpenSSH.

---

## 2. MongoDB Atlas (before the VM)

### 2.1 Cluster

1. Atlas → **New Project** → `wisemail`.
2. **Build a Database** → **M0 Free** (or larger later).
3. Region **near your OCI region** (e.g. OCI `eu-frankfurt-1` → Atlas Frankfurt).

**Cluster** ≈ managed DB deployment (like an RDS instance group).

### 2.2 Database user

**Database Access** → user e.g. `wisemail_app` + strong password → read/write.

### 2.3 Network access

**Network Access** → temporarily `0.0.0.0/0` for first bring-up, then lock to **`YOUR_VM_PUBLIC_IP/32`**.

### 2.4 URI

```text
mongodb+srv://<APP_NAME>:PASSWORD@<CLUSTER>/<DB_NAME>?retryWrites=true&w=majority
```

URL-encode special characters in the password. This is `MONGODB_URI`.

---

## 3. OCI: network + VM

### 3.1 Glossary (OCI ↔ AWS)

| OCI | Meaning | AWS |
|---|---|---|
| Tenancy | Your cloud account | AWS account |
| Compartment | Folder for resources | OU / resource group |
| Region / AD | Location / datacenter | Region / AZ |
| VCN | Private IP space | VPC |
| Public subnet | Routes `0.0.0.0/0` via Internet Gateway | Public subnet |
| Reserved public IP | Sticky IPv4 | Elastic IP |
| Security List / NSG | Firewall | Security Group |
| Shape / Image | Size / OS | Instance type / AMI |

### 3.2 VCN

**Networking → Virtual Cloud Networks → Start VCN Wizard → Create VCN with Internet Connectivity**  
Name: `wisemail-vcn`. Use the **public** subnet for the API VM.

### 3.3 Ingress rules

| Source | Protocol | Port | Why |
|---|---|---|---|
| Your IP `/32` (best) or `0.0.0.0/0` | TCP | **22** | SSH |
| `0.0.0.0/0` | TCP | **80** | HTTP + Let’s Encrypt |
| `0.0.0.0/0` | TCP | **443** | HTTPS API |

Do **not** open `4000` publicly.

### 3.4 SSH key + instance

```bash
ssh-keygen -t ed25519 -f ~/.ssh/wisemail_oci -C "wisemail-oci"
```

**Compute → Create instance**

| Field | Suggestion |
|---|---|
| Name | `wisemail-api` |
| Image | Ubuntu 24.04 |
| Shape | Always Free A1 Flex (e.g. 2 OCPU / 12 GB) or AMD micro |
| Network | Public subnet + public IPv4 |
| SSH key | paste `wisemail_oci.pub` |

Prefer a **Reserved public IP**. Then:

```bash
ssh -i ~/.ssh/wisemail_oci ubuntu@YOUR_PUBLIC_IP
```

---

## 4. Packages on the VM

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx git curl build-essential

curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@12.8.1 --activate
sudo npm install -g pm2
```

Node must be **≥ 24**.

---

## 5. App code + env (API only)

```bash
sudo mkdir -p /var/www/wisemail
sudo chown ubuntu:ubuntu /var/www/wisemail
cd /var/www/wisemail
git clone YOUR_GIT_URL .
git checkout react-migration   # or main when merged

pnpm install --ignore-scripts
pnpm --filter @wisemail/shared build
pnpm install
```

### 5.1 Environment

```bash
cp .env.example /var/www/wisemail/.env
chmod 600 /var/www/wisemail/.env
nano /var/www/wisemail/.env
```

**Split-deploy production values:**

```bash
NODE_ENV=production

# SPA on Vercel
APP_URL=https://app.example.com

# This API (OCI) — Better Auth + all /api routes
BETTER_AUTH_URL=https://api.example.com

# Shared session cookie across app. + api.
COOKIE_DOMAIN=.example.com

# Optional: extra Vercel preview origins (comma-separated)
# SPA_ORIGINS=https://wisemail-git-main-yourteam.vercel.app

MONGODB_URI=mongodb+srv://.../wisemail?retryWrites=true&w=majority
BETTER_AUTH_SECRET=          # openssl rand -base64 32
ENCRYPTION_KEK_CURRENT=      # openssl rand -base64 32
ENCRYPTION_KEK_ID=kek-1

API_HOST=127.0.0.1
API_PORT=4000
HOST=127.0.0.1
PORT=4000

RESEND_MODE=live
STORAGE_MODE=r2
AI_MODE=live                 # or fake until ready
INNGEST_DEV=false
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...

SYSTEM_RESEND_API_KEY=...
SYSTEM_FROM_EMAIL=Wisemail <noreply@example.com>

PLATFORM_ADMIN_EMAILS=you@example.com
BILLING_ENABLED=false
```

```bash
ln -sfn /var/www/wisemail/.env /var/www/wisemail/apps/web/.env.local
```

### 5.2 Build (no SPA / no Next on the server)

```bash
cd /var/www/wisemail
pnpm clean:next
pnpm --filter @wisemail/shared build
pnpm --filter @wisemail/api build
```

> Fastify still loads services from `apps/web` via path aliases until M8c. Deploy the **monorepo**, but you do **not** need `pnpm build` for the SPA on this VM.

---

## 6. PM2

Config: [`docs/deploy/ecosystem.config.cjs`](./ecosystem.config.cjs).

```bash
cd /var/www/wisemail
pm2 start docs/deploy/ecosystem.config.cjs
pm2 status
pm2 logs wisemail-api --lines 80
curl -sS http://127.0.0.1:4000/health
pm2 save
pm2 startup    # run the printed sudo command
```

---

## 7. Nginx + TLS

Config: [`docs/deploy/nginx-wisemail.conf`](./nginx-wisemail.conf) (API-only; no static SPA).

```bash
sudo cp /var/www/wisemail/docs/deploy/nginx-wisemail.conf /etc/nginx/sites-available/wisemail
sudo nano /etc/nginx/sites-available/wisemail   # api.example.com
sudo ln -sfn /etc/nginx/sites-available/wisemail /etc/nginx/sites-enabled/wisemail
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

DNS: **`A` record `api.example.com` → VM public IP**. Then:

```bash
sudo certbot --nginx -d api.example.com
curl -sS https://api.example.com/health
curl -sS https://api.example.com/api/v1/_meta
```

---

## 8. Wire external services → **api.** host

| Service | URL / note |
|---|---|
| **Inngest** sync | `https://api.example.com/api/inngest` |
| **Resend webhooks** | Registered as `BETTER_AUTH_URL/api/ingest/resend/<connectionId>` |
| **Stripe** (if billing) | `https://api.example.com/api/auth/stripe/webhook` and `.../api/billing/stripe-webhook` |
| **Atlas allowlist** | VM public IP `/32` only |

Then deploy the SPA on Vercel with `VITE_API_URL=https://api.example.com` ([`VERCEL.md`](./VERCEL.md)).

---

## 9. Update the API later

```bash
cd /var/www/wisemail
git pull
pnpm install
pnpm --filter @wisemail/shared build
pnpm --filter @wisemail/api build
pm2 restart wisemail-api
```

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| SPA login works locally, fails in prod | CORS / trustedOrigins / cookie domain | `APP_URL`, `SPA_ORIGINS`, `COOKIE_DOMAIN=.example.com`; restart API |
| `502` | Fastify down | `pm2 status`, `curl 127.0.0.1:4000/health` |
| Resend webhooks 404 on Vercel | Webhook pointed at APP_URL | Must hit **api.** (`BETTER_AUTH_URL`) |
| Atlas auth fail | IP allowlist / password encoding | Fix Network Access + URI-encode password |
| Certbot fail | DNS not pointing / port 80 closed | Fix A record + security list |

### Swap (small VMs)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 11. Security checklist

- [ ] SSH limited to your IP (or Bastion / Tailscale)
- [ ] Atlas = VM IP only
- [ ] `.env` mode `600`, not in git
- [ ] Fastify on `127.0.0.1` only
- [ ] Public ports: 22 / 80 / 443 only
- [ ] `COOKIE_DOMAIN` matches your parent domain (leading dot)
- [ ] Reserved public IP + DNS documented

---

## 12. What this guide skips

- Serving the SPA from Nginx (use Vercel)
- Docker
- Multi-region / load balancer
- Removing `apps/web` from the monorepo (M8c)
