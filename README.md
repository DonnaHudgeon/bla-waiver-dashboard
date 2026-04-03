# BLA Waiver Check-In Dashboard

A tablet-friendly web app that cross-references Rezdy bookings with Waiver Forever signed waivers, giving the BLA track team instant visibility of waiver status for each session.

## What It Does

- Pulls today's sessions and bookings from Rezdy
- Checks each guest's email against Waiver Forever for a signed waiver
- Displays a green/red status for every guest in a selected session
- Unsigned guests sort to the top with a "Sign Now" button
- Auto-refreshes every 2 minutes
- Protected by a simple team PIN

---

## Project Structure

```
bla-waiver-dashboard/
├── api/
│   ├── _auth.js           # PIN authentication helper
│   ├── sessions.js         # GET /api/sessions - fetches today's Rezdy sessions
│   ├── waiver-status.js    # POST /api/waiver-status - checks WaiverForever for signed waivers
│   └── sign-url.js         # GET /api/sign-url - generates on-site signing URL
├── public/
│   └── index.html          # Frontend dashboard (single page)
├── .env.example            # Environment variable template
├── .gitignore
├── package.json
├── vercel.json             # Vercel deployment configuration
└── README.md               # This file
```

---

## Deployment Guide

### Prerequisites

- A Vercel account (free tier is sufficient): https://vercel.com
- Node.js installed locally (for `vercel` CLI)
- Your three API credentials (see Step 2)

---

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

---

### Step 2: Gather Your Credentials

> **🔴 HUMAN ACTION REQUIRED**
>
> You need three credentials. Here's exactly where to find each one:

| Credential | Where to Find It |
|---|---|
| **Rezdy API Key** | Log into Rezdy → Settings → API Access → copy the API key |
| **Waiver Forever API Key** | Log into WaiverForever web console → Account Settings → Integrations → API Key section → Generate or copy key |
| **Waiver Forever Template ID** | Easiest: open your existing Zapier workflow → look at the WaiverForever action step → the template ID is in the configuration. OR: In WaiverForever, open your landsailing waiver template → Settings tab → turn on off-site signing → the ID is in the signing URL |

You will also need to choose a **Dashboard PIN** (any 4-6 digit number) that your track team will use to access the dashboard.

---

### Step 3: Deploy to Vercel

From the project directory:

```bash
cd bla-waiver-dashboard
npm install
vercel
```

Follow the prompts:
- Link to your Vercel account
- Set up and deploy: **Yes**
- Project name: `bla-waiver-dashboard` (or your choice)
- Framework: **Other**
- Root directory: `.` (current)

---

### Step 4: Add Environment Variables

> **🔴 HUMAN ACTION REQUIRED**
>
> Add your credentials to Vercel. You can do this via CLI or the Vercel dashboard.

**Option A: Via Vercel Dashboard (easiest)**

1. Go to https://vercel.com → your project → Settings → Environment Variables
2. Add these four variables for **Production** (and optionally Preview/Development):

| Name | Value |
|---|---|
| `REZDY_API_KEY` | Your Rezdy API key |
| `WAIVERFOREVER_API_KEY` | Your WaiverForever API key |
| `WAIVERFOREVER_TEMPLATE_ID` | Your WaiverForever template ID |
| `DASHBOARD_PIN` | Your chosen PIN (e.g. `5678`) |

3. Click Save

**Option B: Via CLI**

```bash
vercel env add REZDY_API_KEY production
vercel env add WAIVERFOREVER_API_KEY production
vercel env add WAIVERFOREVER_TEMPLATE_ID production
vercel env add DASHBOARD_PIN production
```

---

### Step 5: Redeploy with Environment Variables

After adding environment variables, redeploy:

```bash
vercel --prod
```

Your dashboard is now live at the URL Vercel provides (e.g. `bla-waiver-dashboard.vercel.app`).

---

### Step 6: Test

> **🔴 HUMAN ACTION REQUIRED**
>
> Test with real data:

1. Open the dashboard URL on a tablet or phone
2. Enter your PIN
3. You should see today's sessions from Rezdy
4. Tap a session to see the guest list with waiver status
5. Verify that guests who have signed their waiver show green
6. Test the "Sign Now" button opens the WaiverForever signing page

---

### Step 7 (Optional): Custom Domain

If you want a clean URL like `checkin.bonairelandsailing.com`:

1. In Vercel dashboard → your project → Settings → Domains
2. Add your custom domain
3. Update your DNS records as Vercel instructs

---

## Local Development

To run locally for testing:

```bash
cp .env.example .env.local
# Edit .env.local with your real credentials
npm install
vercel dev
```

Open http://localhost:3000

---

## How It Works

1. **Frontend** loads and shows a PIN screen
2. After PIN entry, calls `GET /api/sessions` which fetches today's bookings from Rezdy Supplier API, grouped by session time
3. When team selects a session, calls `POST /api/waiver-status` with guest emails
4. Backend searches WaiverForever for signed waivers matching each email + template ID (last 90 days)
5. Frontend displays merged results: guest name, email, booking ref, pax count, and signed/unsigned status
6. Auto-refreshes every 2 minutes; manual refresh available any time
7. "Sign Now" button calls `GET /api/sign-url` to get a pre-filled WaiverForever signing URL

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "No sessions found" | Check Rezdy API key is correct; check there are confirmed bookings for today |
| All guests show unsigned | Check WaiverForever API key and template ID; ensure the template ID matches the template used in your Zapier workflow |
| PIN rejected | Check DASHBOARD_PIN environment variable is set in Vercel |
| "Sign Now" link doesn't work | Check WaiverForever template has off-site signing enabled |

---

## Security Notes

- API keys are stored as Vercel environment variables (server-side only, never sent to browser)
- The PIN is a simple access control suitable for an internal team tool
- All API calls go through the serverless backend; the frontend never directly contacts Rezdy or WaiverForever
- No data is stored; everything is queried live from the two APIs
