// Which GCO environment this process is. Production is the default and the ONLY thing that is true unless a staging
// deployment explicitly sets GCO_ENVIRONMENT=staging. Staging is a separate stack (own database, Redis, secrets) holding
// only fictional data; it has extra tools (client simulator) that must never exist in production.

/** Runtime check for server code. The staging tools additionally need dev adapters, which production refuses anyway. */
export const isStaging = (): boolean => process.env.GCO_ENVIRONMENT === 'staging'
export const stagingToolsEnabled = (): boolean => isStaging() && process.env.ALLOW_DEV_ADAPTERS === 'true'
export const environmentName = (): 'staging' | 'production' => (isStaging() ? 'staging' : 'production')

/** Compile-time constant (inlined by the build) so the banner and noindex cost nothing in production. */
export const IS_STAGING_BUILD = process.env.NEXT_PUBLIC_GCO_ENVIRONMENT === 'staging'
