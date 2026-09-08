# Jam phone linking

Sampla's Jam integration is isolated so a fork can remain inactive until the upstream Jam owner grants the required Firebase Hosting access. It uses the same Firebase users and Canvas API as the iOS app; it does not require a separate backend.

## User flow

1. Select **Connect** in Sampla.
2. A normal browser tab asks for the Jam phone number.
3. Firebase shows reCAPTCHA only when required, then sends the SMS code.
4. After the code is confirmed, the tab returns the Firebase ID token to Sampla.
5. Sampla exchanges it at `/canvas/auth/login-with-firebase`, stores the returned Jam session, and closes the tab.
6. **To Jam** uploads a WAV and registers it at `/canvas/me/created-objects` with that session.

The phone number stays inside the Jam sign-in tab. The return message must come from an allowlisted origin and match a random, ten-minute, single-use request ID.

## When upstream access is granted

The checked-in configuration already targets the upstream `bop-mobile` Firebase project. From the repository:

```bash
npx firebase-tools login
npm run jam:check
SAMPLA_FIREBASE_API_KEY='your-rotated-key' npm run jam:deploy
```

Then reload the unpacked extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** if it is not already enabled.
3. If Sampla is not installed, select **Load unpacked** and choose the repository root containing `manifest.json`.
4. If Sampla is already installed, click the reload button on its extension card.
5. Reload any browser page where Sampla was already open.

No backend or application-code change is required.

`npm run jam:deploy` validates the shared configuration and manifest before deploying only `integrations/jam-canvas/hosted/` to Firebase Hosting. It never deploys the extension repository or Canvas app.

## Configuration

Non-sensitive environment-specific JavaScript values live in one file:

`integrations/jam-canvas/hosted/sampla-auth/config.js`

It is loaded by the extension page, background worker, and hosted sign-in page. If Jam grants access to a different environment, update its API base, auth URL, Firebase project ID, and allowed origins. A different auth hostname must also be added to `externally_connectable.matches` in `manifest.json`, because Chrome requires that allowlist at install time.

Pass the Firebase Web API key through `SAMPLA_FIREBASE_API_KEY` when deploying. The deploy script writes an ignored `firebase-config.js` only for the duration of the Firebase deployment and removes it afterward. Firebase Web API keys are visible to browser clients by design, so restrict the key to the required Firebase APIs and authorized sites in Google Cloud, and rotate any key that was previously committed. Deployment still requires a Google account that the Jam owner has granted access to the configured Firebase project.

## Local UI testing

The production manifest and worker deliberately reject plaintext and localhost authentication origins. You can serve the hosted directory to inspect its layout, but end-to-end Firebase phone authentication requires an HTTPS domain authorized by the Firebase project. Do not weaken the production allowlists for local testing.

## Without upstream access

Do not attempt to deploy to `bop-mobile`. Use Sampla's local WAV export and import the file from Canvas on the iPad. Automatic account linking and **To Jam** registration require an upstream-issued Jam session.
