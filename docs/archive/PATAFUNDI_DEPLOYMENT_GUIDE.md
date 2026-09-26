# PataFundi Mobile Apps - Deployment Guide

**Last Updated:** July 14, 2026  
**Apps:** Customer Mobile & Fundi Mobile  
**Platform:** React Native with Expo SDK 51

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Building for iOS App Store](#building-for-ios-app-store)
4. [Building for Android Play Store](#building-for-android-play-store)
5. [Building for Web/Laptop](#building-for-weblaptop)
6. [Testing Builds](#testing-builds)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com
   - Required for iOS App Store deployment

2. **Google Play Console Account** ($25 one-time)
   - Sign up at https://play.google.com/console
   - Required for Android Play Store deployment

3. **Expo Account** (Free)
   - Sign up at https://expo.dev
   - Required for EAS Build and Submit

### Required Software

- Node.js v18+ (currently using v25.9.0)
- npm or yarn
- Git
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`

### Environment Setup

```bash
# Install Expo CLI
npm install -g expo-cli

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
expo login

# Login to EAS
eas login
```

---

## Development Setup

### Install Dependencies

```bash
# Customer Mobile
cd apps/customer-mobile
npm install --legacy-peer-deps

# Fundi Mobile
cd apps/fundi-mobile
npm install --legacy-peer-deps
```

### Start Development Servers

```bash
# Customer Mobile (Port 8081)
cd apps/customer-mobile
npx expo start --clear

# Fundi Mobile (Port 8082)
cd apps/fundi-mobile
npx expo start --clear --port 8082
```

### Development Modes

**Expo Go (Physical Device):**
```bash
npx expo start --clear --lan
```
- Requires Windows Firewall configuration
- Run as Administrator: `netsh advfirewall firewall add rule name="Expo Metro" dir=in action=allow protocol=TCP localport=8081,8082`

**Web Mode (Laptop/Browser):**
```bash
npx expo start --web
```
- Opens at http://localhost:8081 (customer) or http://localhost:8082 (fundi)

**iOS Simulator:**
```bash
npx expo start --ios
```
- Requires Xcode (macOS only)

**Android Emulator:**
```bash
npx expo start --android
```
- Requires Android Studio

---

## Building for iOS App Store

### Step 1: Configure Apple Developer Account

1. Log in to https://developer.apple.com
2. Create an App ID with bundle identifier:
   - Customer: `com.patafundi.customer`
   - Fundi: `com.patafundi.fundi`
3. Enable required capabilities:
   - Push Notifications
   - Location Services (When in Use)
   - Camera Access
   - Photo Library Access

### Step 2: Update EAS Configuration

Edit `apps/customer-mobile/eas.json` and `apps/fundi-mobile/eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      }
    }
  }
}
```

Replace with your actual Apple Developer credentials.

### Step 3: Configure Provisioning Profile

```bash
cd apps/customer-mobile
eas build:configure
```

This will:
- Create provisioning profiles
- Configure app signing
- Set up App Store Connect integration

### Step 4: Build for iOS

**Development Build (Testing):**
```bash
eas build --profile development --platform ios
```

**Preview Build (Internal Testing):**
```bash
eas build --profile preview --platform ios
```

**Production Build (App Store):**
```bash
eas build --profile production --platform ios
```

### Step 5: Submit to App Store

```bash
eas submit --platform ios --profile production
```

### Step 6: Complete App Store Submission

1. Log in to App Store Connect
2. Select your app
3. Add screenshots, descriptions, and metadata
4. Submit for review
5. Wait for Apple approval (typically 1-3 days)

---

## Building for Android Play Store

### Step 1: Configure Google Play Console

1. Log in to https://play.google.com/console
2. Create a new app:
   - Customer: `com.patafundi.customer`
   - Fundi: `com.patafundi.fundi`
3. Complete store listing:
   - App name
   - Description
   - Screenshots
   - Icon
   - Privacy policy URL

### Step 2: Set Up Service Account

1. Go to Google Play Console → Settings → API Access
2. Create a service account
3. Download JSON key file
4. Save as `google-service-account.json` in app directory

### Step 3: Update EAS Configuration

Edit `apps/customer-mobile/eas.json` and `apps/fundi-mobile/eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json"
      }
    }
  }
}
```

### Step 4: Build for Android

**Development Build (Testing):**
```bash
eas build --profile development --platform android
```

**Preview Build (Internal Testing):**
```bash
eas build --profile preview --platform android
```

**Production Build (Play Store - APK):**
```bash
eas build --profile production --platform android
```

**Production Build (Play Store - AAB):**
Edit `eas.json` to change `"buildType": "apk"` to `"buildType": "app-bundle"` for production.

### Step 5: Submit to Play Store

```bash
eas submit --platform android --profile production
```

### Step 6: Complete Play Store Submission

1. Log in to Google Play Console
2. Select your app
3. Upload the built APK/AAB
4. Complete store listing
5. Submit for review
6. Wait for Google approval (typically 1-7 days)

---

## Building for Web/Laptop

### Step 1: Build Static Web App

```bash
# Customer Mobile
cd apps/customer-mobile
npx expo export:web

# Fundi Mobile
cd apps/fundi-mobile
npx expo export:web
```

### Step 2: Deploy to Hosting

**Option A: Vercel (Recommended)**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd apps/customer-mobile
vercel --prod
```

**Option B: Netlify**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd apps/customer-mobile
netlify deploy --prod --dir=dist
```

**Option C: GitHub Pages**
```bash
# Build
npx expo export:web

# Deploy to gh-pages
npx gh-pages -d dist
```

### Step 3: Configure Custom Domain

1. Add custom domain in your hosting provider
2. Update DNS records (CNAME or A record)
3. Enable SSL/HTTPS

---

## Testing Builds

### Testing Development Builds

**iOS:**
```bash
# Install TestFlight on your device
# Download development build from EAS
# Install via TestFlight
```

**Android:**
```bash
# Enable USB debugging on device
# Install via ADB:
adb install <build-file.apk>
```

### Testing Preview Builds

**Internal Testing (TestFlight/Play Console Internal):**
- Add tester email addresses
- Send invitation links
- Testers install via TestFlight (iOS) or Play Store (Android)

### Testing Production Builds

**Beta Testing:**
- iOS: TestFlight Beta Testing
- Android: Play Console Closed Testing or Open Testing

**Production Release:**
- iOS: App Store (requires Apple approval)
- Android: Play Store (requires Google approval)

---

## Troubleshooting

### Common Issues

**1. Build Fails - "Missing Credentials"**
```bash
# Reconfigure EAS
eas build:configure
```

**2. iOS Build Fails - "Provisioning Profile Error"**
- Check Apple Developer account status
- Verify bundle identifier matches App ID
- Ensure team ID is correct in `eas.json`

**3. Android Build Fails - "Keystore Error"**
- Generate new keystore:
```bash
keytool -genkey -v -keystore patafundi.keystore -alias patafundi -keyalg RSA -keysize 2048 -validity 10000
```
- Update `eas.json` with keystore credentials

**4. Web Build Blank Screen**
- Clear Metro cache: `npx expo start --clear`
- Check browser console for errors
- Verify font loading (added fallbacks in theme.ts)

**5. Location Permission Denied**
- Check `app.json` permission configurations
- Verify iOS Info.plist descriptions
- Verify Android permissions in `app.json`

**6. Expo Go Connection Failed**
- Configure Windows Firewall (run as Administrator):
```powershell
netsh advfirewall firewall add rule name="Expo Metro" dir=in action=allow protocol=TCP localport=8081,8082
```
- Use tunnel mode if LAN fails: `npx expo start --tunnel`

### Getting Help

- Expo Documentation: https://docs.expo.dev
- EAS Build Documentation: https://docs.expo.dev/build/introduction
- React Native Documentation: https://reactnative.dev
- Stack Overflow: Tag questions with `expo`, `react-native`, `eas-build`

---

## Quick Reference Commands

### Customer Mobile

```bash
cd apps/customer-mobile

# Development
npx expo start --clear
npx expo start --web
npx expo start --ios
npx expo start --android

# Building
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile production --platform ios
eas build --profile production --platform android

# Submitting
eas submit --platform ios --profile production
eas submit --platform android --profile production

# Web Export
npx expo export:web
```

### Fundi Mobile

```bash
cd apps/fundi-mobile

# Development
npx expo start --clear --port 8082
npx expo start --web --port 8082

# Building
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile production --platform ios
eas build --profile production --platform android

# Submitting
eas submit --platform ios --profile production
eas submit --platform android --profile production

# Web Export
npx expo export:web
```

---

## Configuration Files Summary

### app.json (Both Apps)
- Bundle identifiers
- Permissions (camera, location, storage)
- iOS Info.plist descriptions
- Android permissions
- Web configuration
- Asset bundle patterns

### eas.json (Both Apps)
- Build profiles (development, preview, production)
- iOS configuration (bundle ID, build number)
- Android configuration (package, version code)
- Submit configuration (Apple ID, Google service account)

### package.json (Both Apps)
- Dependencies
- Scripts
- Expo SDK version (~51.0.28)
- React Native version (0.74.5)

---

## Next Steps

1. **Set up developer accounts** (Apple & Google)
2. **Configure EAS credentials** in `eas.json`
3. **Test development builds** on physical devices
4. **Create app store listings** (screenshots, descriptions)
5. **Build and submit preview builds** for internal testing
6. **Address any feedback** from internal testers
7. **Build and submit production builds** for app stores
8. **Monitor app performance** after launch

---

## Support

For issues specific to PataFundi:
- Check backend API status: https://patafundi-9bhsw1.onrender.com
- Verify API configuration in `app.json` under `extra.API_URL`

For Expo/EAS issues:
- Expo Forums: https://forums.expo.dev
- EAS Support: https://expo.dev/contact

---

**Document Version:** 1.0  
**Last Updated:** July 14, 2026  
**Maintained By:** PataFundi Development Team
