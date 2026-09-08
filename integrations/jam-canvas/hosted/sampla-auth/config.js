// Shared by the Sampla extension, its background worker, and the hosted phone
// sign-in page. If Jam grants access to a different environment, this is the
// only JavaScript configuration file that needs to change.
globalThis.SamplaJamConfig = Object.freeze({
  apiBaseUrl: "https://api.shibuyaaa.com",
  authPageUrl: "https://bop-mobile.web.app/sampla-auth/",
  firebaseProjectId: "bop-mobile",
  authAllowedOrigins: Object.freeze([
    "https://bop-mobile.web.app",
    "https://bop-mobile.firebaseapp.com",
  ]),
  authRequestTtlMs: 10 * 60 * 1000,
});
