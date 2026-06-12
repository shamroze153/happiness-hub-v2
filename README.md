# Happiness Hub v2 🎉

## What's Already Done
- ✅ Google Sheet connected
- ✅ Apps Script backend deployed
- ✅ API URL already set inside `frontend/lib/lib/hh.js`
- ✅ Admin = one click, no password needed

## Deploy Steps

### 1. Create new GitHub repo
- Go to github.com → New repository → name it `happiness-hub-v2` → Public → Create

### 2. Upload everything
- Click **"uploading an existing file"**
- Drag the **entire contents** of this unzipped folder (frontend/, backend/, vercel.json) into the upload box
- Commit changes

### 3. Deploy on Vercel
- vercel.com → Add New Project → Import `happiness-hub-v2` → Deploy

### 4. Done!
- Homepage: `yoursite.vercel.app`
- Admin: `yoursite.vercel.app/admin/login.html` → click "Enter Dashboard"
- Agent: `yoursite.vercel.app/agent-login.html`
- Seller: `yoursite.vercel.app/seller-login.html`
- Track: `yoursite.vercel.app/track.html`

## First Steps in Admin
1. Go to Sellers → Add a seller
2. Go to Products → Add a product (use the seller ID)
3. Go to Agents → Add an agent → copy their referral link
4. Share your site!
