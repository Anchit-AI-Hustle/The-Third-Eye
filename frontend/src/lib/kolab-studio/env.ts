// web/lib/env.ts
// SERVER-ONLY feature flags for the embedded Kolab Studio. Kolab runs on the app's own sign-in
// and database (lib/db.ts, `kolab` schema), so it has no connection settings of its own.

export const env = {
  devMode: () => (process.env.KOLAB_DEV_MODE ?? "false").toLowerCase() === "true",
};
