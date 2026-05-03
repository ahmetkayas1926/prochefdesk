# ProChefDesk — Disaster Recovery Playbook

> **Version:** 1.0  
> **Last verified:** 2026-05-03  
> **Owner:** Ahmet Kaya (hello@prochefdesk.com)  
> **Stack:** Cloudflare Pages + Supabase Free tier (PostgreSQL 17, project: `prochefdesk`, region: ap-northeast-1)

---

## TR Özet — Bu doküman ne işe yarar

Bir şey ciddi şekilde bozulduğunda (site çökme, veri kaybı, yanlış migration, hesap ihlali, auth kırılma) sakin kafayla açıp komutları kopyala-yapıştır yapacağın referans. Stres altında karar vermek zorunda kalmayasın diye yazıldı.

**5 senaryoyu kapsar:**
1. Site açılmıyor (Cloudflare Pages / DNS / build sorunu)
2. Kullanıcı verisi kaybolmuş görünüyor (silme kazası, soft-delete recovery)
3. Yanlış migration / SQL kazası (manuel backup'tan geri yükleme)
4. Auth çalışmıyor (Supabase auth servisi)
5. Hesap güvenliği ihlali (anahtar/şifre rotasyonu)

**Kritik gerçek:** Supabase Free tier otomatik backup tutmuyor. Bu yüzden **haftalık manuel `pg_dump` alman gerekiyor** — bu doküman nasılını gösteriyor. Yoksa felaket anında geri dönecek hiçbir şey yok.

**İletişim:** Kullanıcılara duyuru gerekirse `hello@prochefdesk.com` üstünden, aşağıda template'ler var.

---

## 1. Critical infrastructure reference

Keep this table accurate. Outdated values here means wrong commands during an incident.

| Component | Value |
|---|---|
| Production domain | `prochefdesk.com` |
| Hosting | Cloudflare Pages, branch `main` (auto-deploy on push) |
| Database | Supabase Free tier, project ref `muuwhrcogikpqylsfvgg` |
| Region | `ap-northeast-1` (Tokyo) |
| Direct DB host | `db.muuwhrcogikpqylsfvgg.supabase.co:5432` (IPv6, not reachable from most home IPv4 networks) |
| Session pooler host | `aws-1-ap-northeast-1.pooler.supabase.com:5432` (IPv4, use this) |
| DB user (pooler) | `postgres.muuwhrcogikpqylsfvgg` |
| DB user (direct) | `postgres` |
| DB password | Stored in operator's password manager. Never commit. |
| Operator email | `hello@prochefdesk.com` (Cloudflare Email Routing → personal Gmail) |
| Backup location | `C:\prochefdesk-backups\` (operator's Windows machine) |

---

## 2. Routine: Weekly manual backup

**Why this matters more than anything else in this document:** Free tier Supabase does not run automated backups. PITR is Pro-only. If you skip this routine, every other recovery procedure in this document depends on a backup that does not exist.

**Cadence:** Every Sunday morning. Set a phone reminder. Takes 60 seconds.

**Procedure:**

1. Open PowerShell on the operator machine
2. Run (paste the connection URL with the current password):

   ```powershell
   $stamp = Get-Date -Format "yyyy-MM-dd"
   pg_dump 'postgresql://postgres.muuwhrcogikpqylsfvgg:CURRENT_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require' -f "C:\prochefdesk-backups\prochefdesk-$stamp.sql"
   ```

   Replace `CURRENT_PASSWORD` with the actual password from your password manager.

3. Verify the file was written:

   ```powershell
   dir C:\prochefdesk-backups
   ```

   Expected: a new file named `prochefdesk-YYYY-MM-DD.sql`, several hundred KB to a few MB.

4. Verify backup integrity (not just size):

   ```powershell
   Select-String -Path "C:\prochefdesk-backups\prochefdesk-$stamp.sql" -Pattern "CREATE TABLE" | Measure-Object | Select-Object -ExpandProperty Count
   ```

   Expected: a number around 60-70 (20 public tables + Supabase system tables).

5. Retention: keep last 8 weekly backups locally. Delete older ones manually each month. For longer-term: copy one backup per month to Google Drive or another offsite location (the file is small, ~1 MB).

**If `pg_dump` fails:** see Section 6 (troubleshooting).

---

## 3. Scenario 1 — Site is down (`prochefdesk.com` returns 5xx or won't load)

**Symptoms:** users report the app won't load, browser shows a Cloudflare error page, or you get a generic 500/503/504.

**Triage in this order. Do not skip steps.**

### Step 1.1 — Is it just you?
Open `prochefdesk.com` in incognito mode and on mobile data (off Wi-Fi). If it works on one but not the other, it's a local network/cache issue, not a site outage. Do not panic.

### Step 1.2 — Check Cloudflare status
Visit https://www.cloudflarestatus.com — if Cloudflare itself is having issues, there is nothing to do but wait. Acknowledge to users (Section 7 template) and monitor.

### Step 1.3 — Check Cloudflare Pages deployment status
1. Cloudflare Dashboard → Workers & Pages → `prochefdesk` project
2. Look at the most recent deployment
3. If status is `Failed` or `Errored` → the latest push broke the build. Roll back (Step 1.4).
4. If status is `Success` but site still down → check Step 1.5.

### Step 1.4 — Roll back to a previous deployment
1. Cloudflare Dashboard → Workers & Pages → `prochefdesk` → Deployments tab
2. Find the most recent deployment with status `Success` (probably the one before the broken one)
3. Click the `...` menu → **Rollback to this deployment**
4. Confirm. Rollback takes ~30 seconds to propagate.
5. Hard reload `prochefdesk.com` (Ctrl+Shift+R) to verify.
6. Once confirmed working, fix the broken commit in your local repo. Do not push another broken commit.

### Step 1.5 — DNS issue
1. Cloudflare Dashboard → `prochefdesk.com` → DNS
2. Verify the root and `www` records are present and pointing to Pages
3. If something was accidentally deleted, recreate per Cloudflare Pages documentation
4. DNS propagation can take 5-60 minutes

### Step 1.6 — If everything looks healthy but users still can't load
- Check service worker in browser DevTools (Application → Service Workers)
- The PWA may be serving a stale broken version. Tell users to hard reload (Ctrl+Shift+R) or clear site data.

---

## 4. Scenario 2 — User data appears lost

**Symptoms:** user reports recipes/ingredients/menus missing. Could be: accidental delete, sync bug, workspace switch confusion, or a real loss.

### Step 2.1 — Confirm it's a real loss
Ask the user:
- Which workspace were they in?
- Did they recently delete or switch workspaces?
- Are they signed into the same email on this device?

Most "lost data" reports are actually workspace switches or sign-in confusion. Resolve those first before touching the database.

### Step 2.2 — Check soft-delete recovery (most data is recoverable!)
ProChefDesk uses soft-delete pattern across all tables. Deleted records remain in the database with `deleted_at` set, for 30 days (per privacy policy). Recovery is one SQL command per table.

In Supabase Dashboard → SQL Editor, run (replace `<USER_ID>` and `<TABLE>`):

```sql
-- See what's been deleted in the last 30 days for this user
SELECT id, workspace_id, deleted_at, data->>'name' as name
FROM <TABLE>
WHERE user_id = '<USER_ID>'
  AND deleted_at IS NOT NULL
  AND deleted_at > NOW() - INTERVAL '30 days'
ORDER BY deleted_at DESC;
```

Tables to check (one at a time): `recipes`, `ingredients`, `menus`, `events`, `suppliers`, `canvases`, `shopping_lists`, `checklist_templates`, `inventory`, `waste`, `checklist_sessions`, `stock_count_history`, `haccp_logs`, `haccp_units`, `haccp_readings`, `haccp_cook_cool`.

To get the user's UUID: ask them their email, then in Supabase Dashboard → Authentication → Users → search by email → copy the user's UUID.

### Step 2.3 — Restore a specific deleted record
```sql
UPDATE <TABLE>
SET deleted_at = NULL,
    updated_at = NOW()
WHERE user_id = '<USER_ID>'
  AND id = '<RECORD_ID>';
```

The user will see the record reappear after their next sync (within 1-2 seconds via realtime, or on next page reload).

Also remove the in-app `_deletedAt` flag if needed by also clearing it from the JSON `data` blob — but for most tables, `deleted_at` is the source of truth and the merge logic handles it. Test with the user.

### Step 2.4 — Restore a deleted workspace
```sql
-- Check if workspace tombstone exists
SELECT * FROM workspace_tombstones WHERE user_id = '<USER_ID>';

-- If yes and within 30 days, delete the tombstone first
DELETE FROM workspace_tombstones WHERE user_id = '<USER_ID>' AND workspace_id = '<WS_ID>';

-- Then restore the workspace record
UPDATE workspaces SET deleted_at = NULL, updated_at = NOW() WHERE user_id = '<USER_ID>' AND id = '<WS_ID>';
```

The user must reload to see the workspace and its data return (cascade-wipe in v2.6.81 means their local cache will not have it until reload).

### Step 2.5 — If the data is older than 30 days or was hard-deleted
Restore from the most recent weekly backup. See Scenario 3 procedure, but only restore the affected user's rows (do not full-restore the database). Example for one user's recipes:

```bash
# Extract just one user's recipes from the SQL dump
# This requires manual editing of the dump file or running pg_restore selectively
# Best done by importing the backup into a local Postgres, then SELECTing only the user's rows
```

If the data is older than 30 days **and** there's no relevant backup, the data is gone. Tell the user honestly. This is a key reason why weekly backups are non-negotiable.

---

## 5. Scenario 3 — Wrong migration / catastrophic SQL accident

**Symptoms:** you ran a `DELETE` or `UPDATE` without a `WHERE` clause, ran a wrong migration, dropped a table, or otherwise corrupted the database.

**Reaction time matters.** Do not run more SQL trying to fix it. Stop, breathe, follow this.

### Step 3.1 — Stop all writes
1. Put the site in maintenance mode if you can (or just acknowledge in Section 7)
2. Tell users not to use the app right now
3. This prevents new data on top of corrupted state

### Step 3.2 — Assess the damage
- What table(s) are affected?
- Is `deleted_at` set (soft-delete, recoverable via Scenario 2 procedure) or are rows gone?
- When was the most recent good backup taken? (Check `dir C:\prochefdesk-backups`)

### Step 3.3 — Restore from backup

**Full database restore (last resort, wipes anything newer than backup):**

1. Open PowerShell, set the connection password
2. Restore:

   ```powershell
   psql 'postgresql://postgres.muuwhrcogikpqylsfvgg:CURRENT_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require' -f 'C:\prochefdesk-backups\prochefdesk-YYYY-MM-DD.sql'
   ```

3. Watch for errors. Some errors about objects already existing are normal (the dump tries to recreate auth/storage tables that already exist). Errors on `public.*` tables are not normal.

**Partial restore (preferred, surgical):**

If only one table or a subset of rows is affected:

1. Spin up a local PostgreSQL (Docker or installed) — temporary, just for surgery
2. Import the backup into the local instance
3. `SELECT` the rows you need
4. Manually `INSERT` them into the production table via Supabase SQL Editor
5. Tear down the local instance

Detailed example (for restoring one user's `recipes` from backup):

```bash
# Local Postgres (Docker example)
docker run -d --name pg_restore_temp -e POSTGRES_PASSWORD=temp -p 5433:5432 postgres:17
docker exec -i pg_restore_temp psql -U postgres -c "CREATE DATABASE restored;"
docker exec -i pg_restore_temp psql -U postgres -d restored < C:\prochefdesk-backups\prochefdesk-YYYY-MM-DD.sql

# Inspect:
docker exec -it pg_restore_temp psql -U postgres -d restored
\dt public.*
SELECT id, data->>'name' FROM public.recipes WHERE user_id = '<USER_ID>';
\q

# Cleanup when done:
docker stop pg_restore_temp && docker rm pg_restore_temp
```

Then in Supabase SQL Editor, INSERT the specific rows back, taking care of conflicts with `ON CONFLICT (id) DO UPDATE`.

### Step 3.4 — Verify and resume
1. Verify with the user (Section 7 communication)
2. Take a fresh manual backup immediately after recovery
3. Document what went wrong in `CHANGELOG.md` so future-you doesn't repeat it

---

## 6. Scenario 4 — Auth not working (no one can sign in)

**Symptoms:** users get errors during login, JWT errors in browser console, or sign-up fails.

### Step 6.1 — Check Supabase status
Visit https://status.supabase.com — if Auth is degraded, wait it out. Communicate to users.

### Step 6.2 — Check Supabase project status
Supabase Dashboard → project home → look for any warnings (project paused, quota exceeded, billing issues).

**Free tier auto-pause:** if the project has had no activity for 7+ days, Supabase pauses it. First request will take 30-60s to wake it. This is normal — but in active operation it shouldn't happen.

### Step 6.3 — Check Auth settings
Dashboard → Authentication → Providers — verify email auth is still enabled. Check Authentication → URL Configuration — verify site URL is `https://prochefdesk.com`.

### Step 6.4 — Test directly
Open a fresh incognito window, try to sign up with a test email. Watch browser DevTools Network tab for the actual error response from Supabase. The error message tells you exactly what's wrong (rate limit, JWT expired, config error, etc.).

### Step 6.5 — If JWT secret was rotated
A rotated JWT secret invalidates all existing user sessions. They will all need to log in again. This is bad UX but not data loss. Acknowledge to users (Section 7).

---

## 7. Scenario 5 — Account / credential compromise

**Symptoms:** unfamiliar deployments in Cloudflare, unexpected SQL queries in Supabase logs, suspicious emails to `hello@prochefdesk.com`, login attempts from unusual locations.

**This is the highest-urgency scenario.** Move fast.

### Step 7.1 — Lock down Supabase
1. Supabase Dashboard → Settings → Database → **Reset password** (and click the Reset button — generating without clicking does nothing!)
2. Save new password to password manager immediately
3. Settings → API → reset `service_role` key (if used anywhere — ProChefDesk does not use it, but check)
4. **Do NOT reset the `anon` key** unless you can also push a code update with the new key. ProChefDesk has the anon key embedded in `js/core/config.js` — rotating it requires a code deploy.

### Step 7.2 — Lock down Cloudflare
1. Cloudflare Dashboard → My Profile → API Tokens → revoke any unused tokens
2. Change Cloudflare account password
3. Enable 2FA if not already on

### Step 7.3 — Lock down GitHub
1. GitHub → Settings → Password → change
2. Settings → Sessions → revoke all other sessions
3. Verify 2FA is still on
4. Review recent commits and pushes — anything you don't recognize?

### Step 7.4 — Check what was accessed
- Supabase Dashboard → Logs → Database → look for unusual queries
- Cloudflare Dashboard → Pages → Deployments → look for unfamiliar deploys
- GitHub → repo → Insights → Network → look for unauthorized branches or pushes

### Step 7.5 — Communicate to users
If user data may have been accessed, you have a legal obligation to notify users in many jurisdictions. Send the breach disclosure template (Section 8).

---

## 8. User communication templates

Send via `hello@prochefdesk.com`. Keep messages short, factual, no excuses.

### 8.1 — Site outage (in progress)

**Subject:** ProChefDesk service issue — we're on it

> Hi,
>
> We're aware that ProChefDesk is currently experiencing issues and we're investigating. Your data is safe in our database — this is a hosting/access issue only.
>
> We'll send an update within the hour. You can also check status at [status page if you have one] or reply to this email.
>
> Sorry for the disruption.
> — Ahmet

### 8.2 — Site outage (resolved)

**Subject:** ProChefDesk is back up

> Hi,
>
> The issue affecting ProChefDesk earlier today is resolved. The cause was [brief honest description, e.g., "a deployment that didn't pass our checks"]. We've rolled back and are reviewing how to prevent it from happening again.
>
> No data was lost. If anything looks off in your account, please reply and we'll fix it.
>
> Thanks for your patience.
> — Ahmet

### 8.3 — Data recovery (single user)

**Subject:** Your ProChefDesk data — restored

> Hi,
>
> I've restored the [recipes / workspace / ingredients] you reported as missing. Please reload the app and let me know if everything looks right.
>
> If anything is still missing, reply to this email with details (workspace name, item name, approximate date) and I'll dig further.
>
> — Ahmet

### 8.4 — Data breach disclosure (only if user data was actually exposed)

**Subject:** Important — security incident affecting your ProChefDesk account

> Hi,
>
> I'm writing to inform you about a security incident affecting ProChefDesk. On [DATE], an unauthorized party gained access to [SCOPE — be specific, e.g., "our database read access", "our Cloudflare account", etc.].
>
> What was potentially exposed: [LIST]
> What was NOT exposed: [LIST — e.g., passwords, since auth is via Supabase magic link with hashed tokens]
>
> Steps I've taken:
> - Rotated all credentials
> - Reviewed access logs
> - [Other concrete actions]
>
> Steps you should take:
> - [Specific user actions, if any]
>
> I'm sorry this happened. If you have questions, reply directly.
>
> — Ahmet Kaya
> hello@prochefdesk.com

---

## 9. Troubleshooting common issues

### `pg_dump: password authentication failed`
- The password in your command doesn't match what Supabase expects.
- Reset password in Supabase: Settings → Database → click **Reset password** button (not just Generate).
- Wait 3-5 minutes after reset for pooler to sync.
- Use the Session pooler URL, not Direct (Direct requires IPv6).

### `pg_dump: connection timed out`
- Direct connection to Supabase requires IPv6, most home networks are IPv4-only.
- Use the Session pooler endpoint: `aws-1-ap-northeast-1.pooler.supabase.com` instead of `db.muuwhrcogikpqylsfvgg.supabase.co`.

### `pg_dump: command not found`
- PostgreSQL client tools not installed or not in PATH.
- Reinstall via EDB installer (https://www.postgresql.org/download/windows/), enable only "Command Line Tools" component.
- Add `C:\Program Files\PostgreSQL\18\bin` to system PATH if needed.

### Backup file is suspiciously small (under 50 KB)
- Likely the dump aborted partway. Check the last few lines of the file for an error.
- Re-run with verbose flag: `pg_dump -v ...`

---

## 10. Maintenance checklist

**Weekly (every Sunday):**
- [ ] Run manual backup (Section 2)
- [ ] Verify file size and CREATE TABLE count
- [ ] Quick check: `prochefdesk.com` loads, can sign in

**Monthly:**
- [ ] Copy one backup to offsite location (Google Drive)
- [ ] Delete backups older than 8 weeks
- [ ] Review Supabase Dashboard → Logs for any unusual patterns
- [ ] Review Cloudflare Pages → recent deployments

**Quarterly:**
- [ ] Test restore procedure: spin up local Postgres, restore latest backup, verify data is intact
- [ ] Review and update this playbook — are infrastructure values still accurate?
- [ ] Rotate Supabase database password (good hygiene)

**On any major incident:**
- [ ] Update this playbook with what was learned
- [ ] Add a new section if a new failure mode was discovered

---

*End of playbook. Last verified by procedure walkthrough on 2026-05-03.*
