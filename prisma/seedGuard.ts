// The demo seed creates accounts with the PUBLISHED password (DemoPassword123!). It is for local development, CI and
// explicitly-labelled staging only. In a production-mode process it refuses to run unless the operator sets an explicit,
// deliberately awkward flag - so a stray `npm run seed` / `tsx prisma/seed.ts` on the production host cannot recreate them.
export function assertSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV === 'production' && env.GCO_ALLOW_DEMO_SEED !== 'yes-this-is-staging-not-production') {
    throw new Error(
      'Refusing to run the DEMO seed in a production-mode process: it creates accounts with a published password. ' +
        'For an explicitly non-production staging database set GCO_ALLOW_DEMO_SEED=yes-this-is-staging-not-production.',
    )
  }
}
