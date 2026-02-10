# Google Workspace DNS Configuration

**Created:** February 1, 2026
**Domains:** aiaimate.com, goodflippinvibes.com, goodflippindesign.com

## Current Status

### ✅ goodflippindesign.com - FULLY CONFIGURED

All Google Workspace MX and SPF records are in place. Ready to use!

### ❌ aiaimate.com - NEEDS CONFIGURATION

No MX records configured. Email routing not set up.

### ⚠️ goodflippinvibes.com - USING CLOUDFLARE EMAIL ROUTING

Currently pointing to Cloudflare's email routing. Must migrate to Google Workspace.

---

## DNS Changes Required

### For: **aiaimate.com**

#### 1. Add MX Records (in Cloudflare DNS)

Go to: https://dash.cloudflare.com → aiaimate.com → DNS → Records

**Add 5 MX Records:**

```
Type: MX | Name: @ | Content: aspmx.l.google.com | Priority: 1 | Proxy: DNS only (gray cloud)
Type: MX | Name: @ | Content: alt1.aspmx.l.google.com | Priority: 5 | Proxy: DNS only
Type: MX | Name: @ | Content: alt2.aspmx.l.google.com | Priority: 5 | Proxy: DNS only
Type: MX | Name: @ | Content: alt3.aspmx.l.google.com | Priority: 10 | Proxy: DNS only
Type: MX | Name: @ | Content: alt4.aspmx.l.google.com | Priority: 10 | Proxy: DNS only
```

#### 2. Add SPF Record

```
Type: TXT | Name: @ | Content: v=spf1 include:_spf.google.com ~all | Proxy: DNS only
```

#### 3. Add Domain Verification TXT Record

1. Go to: https://admin.google.com/ac/domains
2. Click "Add domain" → Enter: aiaimate.com
3. Copy the verification code (format: `google-site-verification=XXXXX`)
4. Add to Cloudflare:
   ```
   Type: TXT | Name: @ | Content: [paste verification code] | Proxy: DNS only
   ```
5. Wait 10 minutes
6. Click "Verify" in Google Admin Console

---

### For: **goodflippinvibes.com**

#### 1. DELETE Cloudflare Email Routing MX Records

Go to: https://dash.cloudflare.com → goodflippinvibes.com → DNS → Records

**Delete these 3 records:**

```
❌ MX | @ | route1.mx.cloudflare.net | Priority: 100
❌ MX | @ | route2.mx.cloudflare.net | Priority: 57
❌ MX | @ | route3.mx.cloudflare.net | Priority: 83
```

#### 2. ADD Google Workspace MX Records

```
Type: MX | Name: @ | Content: aspmx.l.google.com | Priority: 1 | Proxy: DNS only
Type: MX | Name: @ | Content: alt1.aspmx.l.google.com | Priority: 5 | Proxy: DNS only
Type: MX | Name: @ | Content: alt2.aspmx.l.google.com | Priority: 5 | Proxy: DNS only
Type: MX | Name: @ | Content: alt3.aspmx.l.google.com | Priority: 10 | Proxy: DNS only
Type: MX | Name: @ | Content: alt4.aspmx.l.google.com | Priority: 10 | Proxy: DNS only
```

#### 3. ADD/Update SPF Record

```
Type: TXT | Name: @ | Content: v=spf1 include:_spf.google.com ~all | Proxy: DNS only
```

---

## Google Admin Console Setup

### After DNS Changes (wait 15 minutes)

1. **Add aiaimate.com Domain**
   - https://admin.google.com/ac/domains
   - "Add domain" → aiaimate.com
   - Follow verification steps above
   - Click "Activate Gmail"

2. **Create Admin Users**
   - https://admin.google.com/ac/users
   - "Add new user"
   - Create: `getsome@aiaimate.com`
   - Assign role: "Super Admin"

3. **Configure Email Aliases** (Recommended)
   - Go to: Users → getsome@goodflippinvibes.com
   - User information → Email aliases
   - Add aliases:
     - `getsome@goodflippindesign.com`
     - `getsome@aiaimate.com`
   - Now you can login with ANY of these emails!

4. **Alternative: Multiple Admin Accounts**
   - Create separate users:
     - `getsome@goodflippinvibes.com` (primary)
     - `getsome@goodflippindesign.com` (super admin)
     - `getsome@aiaimate.com` (super admin)
   - Each can be a full admin account

---

## Verification Commands

After making DNS changes, verify with PowerShell:

```powershell
# Check MX records
nslookup -type=MX aiaimate.com
nslookup -type=MX goodflippinvibes.com

# Check SPF records
nslookup -type=TXT aiaimate.com
nslookup -type=TXT goodflippinvibes.com

# Should see Google's MX servers in the output
```

---

## DKIM Setup (After Email Activation)

Once Google Workspace email is activated:

1. **Generate DKIM Key**
   - Admin Console → Apps → Google Workspace → Gmail
   - "Authenticate email"
   - Click "Generate new record"
   - Copy the TXT record value

2. **Add to Cloudflare DNS**

   ```
   Type: TXT
   Name: google._domainkey
   Content: [paste DKIM value from Google]
   Proxy: DNS only
   ```

3. **Start Authentication** in Google Admin Console

---

## Timeline

| Step                          | Time Required                         |
| ----------------------------- | ------------------------------------- |
| DNS record changes            | 5-10 minutes                          |
| DNS propagation               | 15-30 minutes                         |
| Domain verification in Google | Instant (after propagation)           |
| Email activation              | Instant                               |
| DKIM setup                    | 5 minutes                             |
| DKIM propagation              | 24-48 hours (for full authentication) |

---

## Troubleshooting

### "Domain verification failed"

- Wait 30 minutes for DNS propagation
- Verify TXT record is correct: `nslookup -type=TXT aiaimate.com`
- Check there's no typo in verification code

### "MX records not found"

- Ensure Priority is set correctly (1, 5, 5, 10, 10)
- Verify "Proxy status" is OFF (gray cloud, not orange)
- Wait longer for propagation (up to 1 hour)

### "Can't send/receive email"

- Check all 5 MX records are added
- Verify SPF record is present
- Ensure old Cloudflare MX records are deleted (goodflippinvibes.com)

---

## API Token Permissions Needed

If using Cloudflare API for automation, the token needs:

- **Zone.DNS** - Edit permission
- **Zone.Zone** - Read permission
- Include all zones: aiaimate.com, goodflippinvibes.com, goodflippindesign.com

To create new token:

1. https://dash.cloudflare.com/profile/api-tokens
2. "Create Token"
3. Use "Edit zone DNS" template
4. Scope to specific zones
5. Save token to: `$env:CLOUDFLARE_API_TOKEN`

---

## Quick Checklist

### aiaimate.com

- [ ] Add 5 Google MX records in Cloudflare
- [ ] Add SPF TXT record
- [ ] Get verification code from Google Admin Console
- [ ] Add verification TXT record in Cloudflare
- [ ] Wait 15 minutes
- [ ] Click "Verify" in Google Admin Console
- [ ] Create getsome@aiaimate.com user
- [ ] Assign Super Admin role

### goodflippinvibes.com

- [ ] Delete 3 Cloudflare Email Routing MX records
- [ ] Add 5 Google MX records
- [ ] Update SPF TXT record
- [ ] Disable Cloudflare Email Routing
- [ ] Wait 15 minutes
- [ ] Test email delivery

### goodflippindesign.com

- [x] Already configured! ✅
- [ ] Create getsome@goodflippindesign.com user if needed
- [ ] Assign Super Admin role

---

**Next Steps:**

1. Make the DNS changes in Cloudflare Dashboard (links above)
2. Wait 15-30 minutes for propagation
3. Verify domains in Google Admin Console
4. Create admin user accounts
5. Test email sending/receiving
