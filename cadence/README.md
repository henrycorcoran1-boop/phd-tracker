# Cadence — PhD & Student Planner

A native iOS/Android app for planning your doctorate or academic year. Built with React Native + Expo.

## Design

- **Dark ink-navy** base (`#00243F`) matching InfraBuild's professional aesthetic
- **Gold accent** (`#C4873D`) for milestones and primary actions
- **Track colours** — teal (papers), rust (deadlines), slate (teaching), plum (fieldwork)
- Bottom-tab navigation with a Gantt chart view, list view, and dashboard

## Getting Started (Local Development)

```bash
cd cadence
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your iPhone, or press `i` to open the iOS Simulator.

## App Store Build (EAS Build)

### Prerequisites
1. Install EAS CLI: `npm install -g eas-cli`
2. Log in: `eas login`
3. Configure your Apple Developer account in `eas.json`

### Build for TestFlight
```bash
eas build --platform ios --profile preview
```

### Build for App Store
```bash
eas build --platform ios --profile production
eas submit --platform ios
```

## Project Structure

```
cadence/
├── App.js                    # Root — wraps providers + navigator
├── app.json                  # Expo config (bundle ID, version, etc.)
├── eas.json                  # EAS Build / Submit config
├── src/
│   ├── theme/index.js        # Design system (colours, type, shadows, spacing)
│   ├── data/
│   │   ├── tracks.js         # Track definitions (PhD + Student modes)
│   │   └── templates.js      # Default template data
│   ├── utils/dates.js        # Month-granularity date helpers
│   ├── context/PlanContext.js # State (useReducer) + AsyncStorage persistence
│   ├── navigation/index.js   # Bottom-tab navigator
│   ├── screens/
│   │   ├── DashboardScreen.js  # Overview: KPIs, phase progress, milestones
│   │   ├── TimelineScreen.js   # Gantt chart with year ribbon
│   │   ├── ItemsScreen.js      # Grouped list with track filter
│   │   └── SettingsScreen.js   # Plan metadata, mode, data management
│   └── components/
│       ├── AppHeader.js        # Wordmark + mode toggle
│       ├── GanttChart.js       # Horizontally scrollable Gantt
│       ├── AddItemModal.js     # Add / edit bottom sheet
│       ├── KPICard.js          # Stat card with coloured top border
│       ├── TrackBadge.js       # Coloured track pill
│       └── ... 
└── assets/
    └── icon.svg              # Replace with 1024×1024 PNG before App Store submission
```

## App Store Checklist

- [ ] Replace `assets/icon.svg` with a **1024×1024 PNG** (no transparency, no rounded corners — Apple adds them)
- [ ] Set your real `bundleIdentifier` in `app.json` (currently `com.cadence.phdplanner`)
- [ ] Fill `eas.json` `submit.production.ios` fields with your Apple ID + team
- [ ] Add a **Privacy Policy URL** in App Store Connect (required — app stores data on-device only)
- [ ] Set the App Store category: **Education** → **Reference**
- [ ] Screenshots: 6.7" (iPhone 15 Pro Max) and 12.9" (iPad Pro) if `supportsTablet: true`
