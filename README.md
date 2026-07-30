# ⚡ DashDash — Personal Work Dashboard

<div align="center">
  <img src="./public/icons/icon-192.png" width="96" height="96" alt="DashDash application icon" />
</div>

<div align="center">
  <img src="https://img.shields.io/badge/React-UI-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Vercel-Deployment-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/PWA-Installable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="Progressive Web App" />
  <img src="https://img.shields.io/badge/RTL-Hebrew-0F172A?style=for-the-badge" alt="Hebrew RTL" />
  <img src="https://img.shields.io/badge/Storage-localStorage-2563EB?style=for-the-badge&logo=googlechrome&logoColor=white" alt="LocalStorage" />
  <img src="https://img.shields.io/badge/Tests-Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest" />
</div>

<div align="center">
  <p><strong>A local-first, mobile-friendly, RTL workspace for personal timers, quick notes, drawing, clipboard correction, and reusable work shortcuts.</strong></p>
  <p>
    <a href="https://dashdash-tau.vercel.app"><strong>Live Application</strong></a>
    ·
    <a href="https://dashdash-git-test-sushiteimushi.vercel.app"><strong>Test Preview</strong></a>
    ·
    <a href="https://github.com/Dovshmi/DashDash"><strong>GitHub Repository</strong></a>
  </p>
</div>

---

## Overview

**DashDash** is a personal productivity dashboard designed for fast daily work from both desktop and mobile devices. It combines several small utilities inside one customizable workspace while keeping most user data entirely inside the browser.

The dashboard supports independent desktop and mobile layouts, draggable and resizable widgets, per-widget position locks, repeatable notes and drawing boards, configurable timer presets, session history, optional Gmail alerts, and an installable Progressive Web App experience.

The interface is written for Hebrew users with full RTL behavior, while technical controls such as timers, URLs, and clipboard conversion remain direction-aware where needed.

---

## Product Goals

- Keep frequently used work tools available in one lightweight dashboard.
- Provide a clean phone-first experience without sacrificing desktop flexibility.
- Store personal content locally instead of requiring accounts or a database.
- Make dashboard layout, widget selection, and timer behavior user-configurable.
- Keep the production deployment simple through GitHub and Vercel.
- Separate experimental work from production through dedicated `test` and `main` branches.

---

## Core Features

### Customizable Dashboard

- **Draggable widgets** using dedicated drag handles.
- **Resizable widgets** from the southeast resize handle.
- **Automatic vertical compaction** to reduce empty gaps.
- **Independent desktop and mobile layouts** stored separately in the browser.
- **Add and remove tools** directly from the dashboard.
- **Repeatable widgets** for notes and drawing boards.
- **Per-widget locking** that freezes the current position and size.
- **Dashboard reset** for restoring the default layout.

### Configurable Personal Timer

- Default presets:
  - `זמן אישי` — `06:00`
  - `זמן הפסקה` — `26:00`
- Add custom timer presets with a custom name.
- Separate minute and second fields, so users do not need to type a colon.
- Button-style preset selector optimized for touch devices.
- Preset selection and editing are locked while the timer is running.
- The active preset remains visually locked during the session.
- Completed sessions are stored with start time, end time, duration, and preset name.
- Daily total is calculated from completed sessions.
- Individual history entries can be deleted.

### Optional Email Alerts

- A recipient email can be configured from the timer settings panel.
- The selected timer preset is used as the alert threshold.
- One notification is sent per active timer session.
- Email delivery is handled by a Vercel Function through Gmail SMTP and Nodemailer.
- Requests are protected by origin validation.
- Email alerts work only while the application remains open and the timer is active.

### Keyboard Layout Correction

- Reads text from the browser Clipboard API.
- Converts text typed with the wrong Hebrew or English keyboard layout.
- Copies the corrected result back to the clipboard.
- Stores a local conversion history with timestamps.
- Supports deletion of individual history records.

Example:

```text
tbh rumv kf,uc  →  אני רוצה לכתוב
```

### Notes

- Quick browser-based scratchpad.
- Automatic saving on every change.
- Multiple independent note widgets can be added.
- Each note instance keeps its own content.

### Drawing Board

- HTML Canvas drawing with mouse, pen, or touch input.
- Adjustable color and stroke width.
- Persistent drawing storage as a PNG data URL.
- Multiple independent drawing widgets.
- Clear action with user confirmation.

### Adaptive Work Shortcuts

- **Desktop:** opens the configured internal `BSMART` address.
- **Mobile:** replaces the desktop shortcut with a button for `הפלא`:
  - `https://b-pele.bezeq.com/local/dashboardplus/view.php`

The desktop BSMART URL is currently configured in `src/App.jsx`:

```js
const BSMART_URL = 'https://smartest/';
```

---

## Tech Stack

| Area | Technology |
| :--- | :--- |
| Frontend | React |
| Language | Modern JavaScript with ES modules |
| Build Tool | Vite |
| Dashboard Layout | React Grid Layout |
| Styling | Custom responsive CSS |
| Client Storage | Browser `localStorage` |
| Drawing | HTML Canvas API |
| Clipboard | Browser Clipboard API |
| PWA | Web App Manifest + Service Worker |
| Serverless API | Vercel Functions |
| Email | Nodemailer + Gmail SMTP |
| Tests | Vitest + jsdom |
| Deployment | Vercel |

---

## Application Architecture

```text
Browser
├── React dashboard
│   ├── Timer and preset management
│   ├── Notes and drawing widgets
│   ├── Clipboard keyboard conversion
│   ├── Desktop/mobile grid layouts
│   └── Widget add, remove, resize, drag, and lock controls
├── localStorage
│   ├── User content
│   ├── Histories
│   ├── Timer settings
│   └── Desktop/mobile layout state
├── Service Worker
│   └── Network-first loading with cache fallback
└── POST /api/send-time-alert
    ├── Request validation
    ├── Origin validation
    ├── Nodemailer
    └── Gmail SMTP
```

DashDash has no user-account system and no application database. The only optional server interaction is the timer email notification request.

---

## Project Structure

```text
DashDash/
├── api/
│   ├── request-origin.js          # Validates the request Origin/Referer
│   └── send-time-alert.js         # Vercel Function for Gmail alerts
├── public/
│   ├── icons/                     # Browser, PWA, and maskable icons
│   ├── manifest.webmanifest       # PWA metadata and install configuration
│   └── sw.js                      # Service Worker and cache behavior
├── scripts/
│   └── generate-icons.mjs         # Generates application icon sizes
├── src/
│   ├── App.jsx                    # Main dashboard state and widget UI
│   ├── main.jsx                   # React entry point and Service Worker registration
│   ├── utils.js                   # Layout, time, translation, and history helpers
│   ├── styles.css                 # Base dashboard and responsive styling
│   ├── test-heading-cleanup.css   # Compact widget-heading and mobile UI overrides
│   ├── popup-layer-fix.css        # Popup stacking and final responsive overrides
│   ├── timer-preset-select.js     # Touch-safe button-style timer preset selector
│   └── widget-locks.js            # Per-widget layout lock controls
├── tests/
│   └── utils.test.js              # Unit tests for shared helper functions
├── .env.example                   # Example email environment variables
├── index.html                     # HTML shell and PWA metadata links
├── package.json                   # Scripts and dependencies
├── package-lock.json              # Locked npm dependency tree
├── vercel.json                    # Vercel Vite deployment configuration
└── README.md
```

---

## Getting Started

### Prerequisites

Use a current Node.js release. **Node.js 20 or newer is recommended** for the current Vite dependency tree.

### 1. Clone the repository

```bash
git clone https://github.com/Dovshmi/DashDash.git
cd DashDash
```

### 2. Install dependencies

```bash
npm ci
```

Use `npm install` when intentionally updating the dependency lockfile.

### 3. Start the development server

```bash
npm run dev
```

Vite normally serves the application at:

```text
http://localhost:5173
```

> The frontend works with the normal Vite development server. The `/api/send-time-alert` endpoint requires a Vercel-compatible function environment and configured SMTP variables.

### 4. Build for production

```bash
npm run build
```

### 5. Preview the production bundle

```bash
npm run preview
```

---

## Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run icons` | Regenerates the browser and PWA icon files. |
| `npm run dev` | Generates icons and starts the Vite development server. |
| `npm run build` | Generates icons and creates the production bundle in `dist/`. |
| `npm run preview` | Serves the production bundle locally. |
| `npm test` | Runs the Vitest unit test suite once. |

The `predev` and `prebuild` hooks automatically run the icon generator before development and production builds.

---

## Local Data Storage

DashDash is designed as a local-first application. Most state is stored under browser `localStorage` keys.

| Storage Key | Content |
| :--- | :--- |
| `work-tools:notes` | Note content keyed by widget ID. |
| `work-tools:personal-sessions` | Completed timer sessions and metadata. |
| `work-tools:translation-history` | Clipboard conversion history. |
| `work-tools:drawing` | Primary drawing canvas data. |
| `work-tools:drawing:<widget-id>` | Additional drawing widget data. |
| `work-tools:dashboard-layout-v3` | Desktop widget positions, sizes, and lock state. |
| `work-tools:active-widgets-v1` | Enabled desktop widgets. |
| `work-tools:mobile-dashboard-layout-v2` | Mobile widget positions, sizes, and lock state. |
| `work-tools:mobile-active-widgets-v1` | Enabled mobile widgets. |
| `work-tools:time-alert-settings-v1` | Recipient email, timer presets, and current selection. |

Important behavior:

- Data is scoped to the current browser profile and site origin.
- Desktop and mobile dashboard arrangements are intentionally separate.
- Clearing browser site data removes notes, drawings, settings, histories, and layout state.
- Data is not synchronized automatically between devices.

---

## Timer Presets and Alert Flow

```text
User selects a timer preset
        ↓
User starts the timer
        ↓
Preset selection and editing are locked
        ↓
Elapsed time reaches the selected preset duration
        ↓
DashDash sends one POST request to /api/send-time-alert
        ↓
The Vercel Function validates the request and origin
        ↓
Nodemailer sends the notification through Gmail SMTP
        ↓
User stops the timer
        ↓
The completed session is added to local history
```

The serverless endpoint currently accepts alert durations up to `86,400` seconds (`24` hours).

---

## Email Configuration

DashDash uses a Gmail account and a Google App Password for notification delivery.

Copy the variable names from `.env.example` into the Vercel project environment settings.

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `GMAIL_SMTP_USER` | Yes | Gmail account used to send notifications. |
| `GMAIL_SMTP_APP_PASSWORD` | Yes | Google App Password for the sending account. |
| `APP_ORIGIN` | Recommended | Allowed production origin without a trailing slash. |
| `MAIL_FROM` | No | Optional custom sender display value. |

Example:

```env
GMAIL_SMTP_USER=notifications@example.com
GMAIL_SMTP_APP_PASSWORD=replace-with-a-google-app-password
APP_ORIGIN=https://dashdash-tau.vercel.app
MAIL_FROM=DashDash <notifications@example.com>
```

Configuration steps:

1. Use a dedicated Gmail account for application notifications.
2. Enable two-step verification on that Google account.
3. Generate a Google App Password.
4. Add the variables in **Vercel → Project → Settings → Environment Variables**.
5. Redeploy the project after saving the variables.

Never commit real passwords, App Passwords, private keys, or production secrets.

---

## PWA and Offline Behavior

DashDash includes:

- A Web App Manifest with Hebrew RTL metadata.
- Standard and maskable application icons.
- Standalone display mode for installed applications.
- Service Worker registration from `src/main.jsx`.
- Network-first navigation requests.
- Cached fallback for previously loaded application resources.

The PWA cache improves resilience, but it is not a full offline synchronization system. Content created in one browser remains local to that browser.

When testing a newly deployed build on mobile, a complete tab close or application restart may be required if an older Service Worker is still active.

---

## Deployment and Branch Workflow

The repository uses two primary branches:

| Branch | Purpose | Vercel Environment |
| :--- | :--- | :--- |
| `main` | Stable production code | Production |
| `test` | Development and phone testing | Preview |

Production URL:

```text
https://dashdash-tau.vercel.app
```

Test preview URL:

```text
https://dashdash-git-test-sushiteimushi.vercel.app
```

Recommended workflow:

```text
Create changes on test
        ↓
Review the Vercel Preview on desktop and mobile
        ↓
Confirm timer, layout, locking, popup, and persistence behavior
        ↓
Fast-forward test into main
        ↓
Vercel deploys the production build automatically
```

The Vercel configuration is already defined in `vercel.json`:

| Setting | Value |
| :--- | :--- |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

---

## Testing and Quality

Run the unit tests:

```bash
npm test
```

Run the production build validation:

```bash
npm run build
```

The current unit test suite covers:

- Hebrew/English keyboard layout conversion.
- Dashboard layout normalization.
- Desktop and mobile default layout generation.
- Repeatable widget ID validation.
- History item deletion.
- Email validation.
- Timer alert parsing and formatting.
- Single-alert threshold behavior.
- Duration, session, date, and daily-total helpers.

The live project is also built automatically by Vercel when changes are pushed to `main` or `test`.

---

## Security and Privacy

- Notes, drawings, histories, layouts, and timer settings stay in the browser.
- DashDash does not currently use user accounts or a backend database.
- The recipient email is sent to the server only when an active timer reaches its configured threshold.
- The email API accepts only `POST` requests.
- The request origin is validated before an email is sent.
- Gmail credentials are read only from server-side environment variables.
- Clipboard access requires browser permission and a secure HTTPS context.
- The drawing canvas and note widgets do not upload content to the server.

---

## Important Developer Notes

- The responsive breakpoint is currently `700px`.
- Desktop and mobile widget lists and layouts use different storage keys.
- Interactive controls inside a drag handle must stop pointer propagation, or mobile taps may be interpreted as grid dragging.
- The custom timer selector wraps the native `<select>` with a touch-safe button and option menu.
- On mobile, the timer selector replaces the small timer heading instead of creating a duplicate label.
- Widget locking stores React Grid Layout `static`, `isDraggable`, and `isResizable` values in the current layout.
- Lock changes reload the page once so React Grid Layout receives the persisted static state cleanly.
- Timer settings and preset selection must remain disabled while a timer session is active.
- Popup stacking rules must remain above widget remove, lock, and settings controls.
- Test Service Worker behavior carefully after every cache-related change.

---

## Maintenance Checklist

Before promoting `test` to `main`:

- [ ] Open the test preview on a desktop browser.
- [ ] Open the test preview on a mobile browser.
- [ ] Confirm the timer preset button opens and selects options.
- [ ] Confirm preset selection locks while the timer runs.
- [ ] Confirm custom timer presets can be added and removed.
- [ ] Confirm the settings popup appears above all widget controls.
- [ ] Confirm each widget can be locked and unlocked.
- [ ] Confirm locked widgets cannot move or resize.
- [ ] Confirm desktop and mobile layouts remain independent.
- [ ] Confirm notes remain after a page reload.
- [ ] Confirm drawings remain after a page reload.
- [ ] Confirm clipboard translation works under HTTPS permission rules.
- [ ] Confirm the desktop BSMART shortcut and mobile Pele shortcut open correctly.
- [ ] Confirm the PWA loads the newest deployed version.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

---

## Current Limitations

- Email alerts require the application to remain open.
- Local data does not automatically synchronize between browsers or devices.
- Clearing site storage permanently removes locally saved dashboard data.
- Clipboard access depends on browser support, HTTPS, and user permission.
- The desktop BSMART address may require access to the relevant internal network or DNS environment.
- The current test suite focuses on utility logic and does not yet include full browser end-to-end tests.

---

## Future Improvements

Potential next steps:

- Add export and import for local workspace data.
- Add optional encrypted device synchronization.
- Add browser end-to-end tests for mobile touch interactions.
- Move DOM enhancement helpers into dedicated React components.
- Add automated accessibility checks.
- Add a backup and restore flow for timer history, notes, and drawings.
- Add a visual changelog or release history.

---

<div align="center">
  Built as a fast personal workspace for everyday tools.<br />
  Developed by <strong>Rony Shmidov</strong>.
</div>
