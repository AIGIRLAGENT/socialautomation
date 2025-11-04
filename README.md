# Social Automation

Automate how your brands show up on X (Twitter). Social Automation lets you manage unlimited brands, connect as many social accounts as you need, and keep a consistent posting cadence with smart scheduling, bulk media uploads, and drag-and-drop control—all powered by Firebase and Twitter’s API.

> **Privacy first:** Each customer provides their own X API keys directly in the web UI. Keys are sent to Firebase Functions, stored securely with the account, and never committed or bundled in the client.

## Feature Highlights

- **Unlimited brands & accounts** – Segment work into brand “groups” and attach multiple Twitter accounts per group, each with its own credentials.
- **Google-authenticated workspace** – One-click sign-in with Google through Firebase Authentication.
- **Smart auto-scheduling** – Tweets fill the next available hourly slot between 4:00 AM and 7:00 PM Dubai time (16 slots per day) without manual guesswork.
- **Bulk media automation** – Drop up to 60 images or vertical videos (100 MB each). The app shuffles media, generates placeholder tweets, and schedules them across open slots automatically.
- **Visual calendar** – Month view highlights daily capacity, letting you drill into any day to review or adjust posts.
- **Drag-and-drop timeline** – Reorder scheduled tweets instantly with keyboard and pointer support via dnd-kit.
- **Tweet editing workflow** – Update copy, swap media, strip attachments, or duplicate content (“Retweet”) with one click.
- **Manual/queue controls** – Toggle single tweets between automated, queued, manual-only, or mark as posted; trigger “Send now” for urgent publishes.
- **Realtime updates** – Firestore listeners keep the dashboard, calendar, and queues in sync across devices without refreshes.
- **Secure media pipeline** – Assets upload to Firebase Storage, link back into tweets, and are cleaned up when no longer used.

## Architecture Overview

- **Frontend** – React 19 + TypeScript + Vite, with date-fns/date-fns-tz for slot math and dnd-kit for drag sorting.
- **Firebase services** – Authentication (Google), Firestore (brands, accounts, tweets), Storage (media), and Cloud Functions (tweet publishing + legacy imports).
- **Scheduling engine** – `getNextScheduleSlot(s)` ensures consistent hourly spacing, while bulk uploads pull batches via `getNextScheduleSlots`.
- **Tweet delivery** – Cloud Functions wrap the `twitter-api-v2` client, upload media, and post tweets on behalf of the authenticated user.

## Data Privacy & Key Handling

- Users enter their Twitter consumer key/secret and access token/secret in the dashboard when connecting an account.
- Credentials are sent directly to Firebase via HTTPS, stored under the user’s Firestore document, and never exposed in the client bundle or repository.
- For global app keys (if used), set them with `firebase functions:config:set` or environment variables—never commit secrets.
- If keys are ever exposed or rotated, update the stored values through the UI or via Firestore admin tools, then redeploy Cloud Functions.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Authentication, Firestore, Storage, and Cloud Functions enabled

### 1. Clone & install

```bash
git clone https://github.com/AIGIRLAGENT/socialautomation.git
cd socialautomation
npm install
cd functions
npm install
cd ..
```

### 2. Configure Firebase web SDK

Create `.env.local` (or update `src/env.d.ts` variables) at the project root:

```bash
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=messaging-sender-id
VITE_FIREBASE_APP_ID=app-id
```

### 3. Initialize Firebase locally

```bash
firebase login
firebase use your-project-id
```

Ensure the following Firebase products are enabled:

- Authentication → Sign-in method → Enable Google
- Firestore → Start in production mode
- Storage → Create default bucket
- Cloud Functions → Billing enabled if you plan to call external APIs (Twitter)

### 4. Provide Twitter API config (optional)

If you use global app keys inside Cloud Functions, set them with runtime config:

```bash
firebase functions:config:set twitter.api_key="your-consumer-key" twitter.api_secret="your-consumer-secret"
```

> Individual account credentials are still entered per user within the app UI.

### 5. Run locally

```bash
npm run dev
```

Open `http://localhost:5173`, sign in with Google, add a brand, connect a Twitter account, and start scheduling.

### 6. Deploy

```bash
npm run build
firebase deploy --only hosting
cd functions
npm run build
firebase deploy --only functions
```

> Deploying Cloud Functions that call external APIs requires an upgraded Firebase (Blaze) plan because outbound networking needs billing enabled.

## Available Scripts

- `npm run dev` – Start Vite dev server with HMR
- `npm run build` – Type-check and generate production assets
- `npm run preview` – Preview built assets locally
- `npm run lint` – Run ESLint across the repo
- `cd functions && npm run build` – Compile TypeScript functions
- `cd functions && npm run deploy` – Build and deploy only the Cloud Functions

## Roadmap

- Integrate additional social networks alongside Twitter
- Provide analytics for delivered vs. queued tweets
- Expand slot rules to support custom timezones and cadences per brand
- Secret rotation tooling and audit logs for credential changes

## Security Checklist

- ✅ Secrets kept out of source control (`functions/.runtimeconfig.json` is ignored)
- ✅ Credentials submitted through HTTPS endpoints only
- ✅ Firestore rules lock data to the authenticated owner (ensure you deploy rules in `firestore.rules`)
- ✅ Media stored per user in Storage and cleaned up on deletion

## License

The project currently ships without an explicit license file. If you plan to open-source or distribute it, add the license that fits your needs (MIT, Apache 2.0, proprietary, etc.) before publishing.
