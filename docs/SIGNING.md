# Signing the Android APK (local only)

Do **not** commit keystores or passwords.

1. Create `android/key.properties`:

```properties
storeFile=../ops-crypt-release.jks
storePassword=YOUR_PASSWORD
keyAlias=opscrypt
keyPassword=YOUR_PASSWORD
```

2. Place your `.jks` next to the `android/` folder or adjust `storeFile`.

3. Build:

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/`
