import { spawnSync } from 'child_process'
import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { hashPassword, validateStaffPassword, PUBLISHED_SEED_PASSWORD, BCRYPT_COST } from '@/lib/auth/password'
import { DEMO_ACCOUNTS } from '@/lib/auth/staffAccounts'
import { assertSeedAllowed } from '../../prisma/seedGuard'

describe('staff password policy', () => {
  const email = 'cristian.owner@example.com'
  it.each([
    ['short', 'Ab1!xyz'], ['published seed password', PUBLISHED_SEED_PASSWORD], ['seed password, any case', 'demopassword123!!'], ['contains email name', 'xx-cristian.owner-xx-99'],
    ['all one character', 'aaaaaaaaaaaaaaaa'], ['common', 'password12345'], ['leading space', ' correct-horse-battery'], ['over 72 bytes', 'a1!'.repeat(30)],
  ])('refuses %s', (_n, pw) => expect(validateStaffPassword(pw, email)).toEqual(expect.any(String)))
  it('accepts a long, varied passphrase', () => {
    expect(validateStaffPassword('correct horse battery staple 41', email)).toBeNull()
    expect(validateStaffPassword('Tr0ub4dor&3-and-more-words', email)).toBeNull()
  })
})

describe('hashing matches the application (bcrypt, cost 12) and never stores the plaintext', () => {
  it('hash verifies, has the right cost, and differs on every call', async () => {
    const h1 = await hashPassword('a-very-private-passphrase-1')
    const h2 = await hashPassword('a-very-private-passphrase-1')
    expect(BCRYPT_COST).toBe(12)
    expect(h1).toMatch(/^\$2[aby]\$12\$/)
    expect(h1).not.toBe(h2)
    expect(h1).not.toContain('a-very-private')
    expect(await bcrypt.compare('a-very-private-passphrase-1', h1)).toBe(true)
    expect(await bcrypt.compare('another-passphrase-2', h1)).toBe(false)
  })
})

describe('the demo seed cannot run in production by accident', () => {
  it('is allowed in development / test / CI (NODE_ENV not production)', () => {
    for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }]) expect(() => assertSeedAllowed(env)).not.toThrow()
  })
  it('refuses in a production-mode process, with or without a vague flag', () => {
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', GCO_ALLOW_DEMO_SEED: 'true' }, { NODE_ENV: 'production', GCO_ALLOW_DEMO_SEED: '1' }, { NODE_ENV: 'production', GCO_ALLOW_DEMO_SEED: 'yes' }]) {
      expect(() => assertSeedAllowed(env), JSON.stringify(env)).toThrow(/published password/)
    }
  })
  it('only the explicit staging phrase opens it', () => expect(() => assertSeedAllowed({ NODE_ENV: 'production', GCO_ALLOW_DEMO_SEED: 'yes-this-is-staging-not-production' })).not.toThrow())
})

describe('the pinned demo-account table', () => {
  it('is exactly the five demo accounts, by immutable id, each a distinct role', () => {
    expect(DEMO_ACCOUNTS).toHaveLength(5)
    expect(new Set(DEMO_ACCOUNTS.map((a) => a.id)).size).toBe(5)
    expect(DEMO_ACCOUNTS.map((a) => a.role).sort()).toEqual(['CEO_ADMIN', 'CLIENT', 'HUNTER', 'MANAGER', 'OPERATOR'])
    for (const a of DEMO_ACCOUNTS) {
      expect(a.id).toMatch(/^c[a-z0-9]{20,}$/)
      expect(a.email.endsWith('@demo.gco')).toBe(true)
    }
  })
})

describe('the operator CLI never takes or reads a password from anywhere but a private terminal prompt', () => {
  const run = (args: string[]) => spawnSync('npx', ['tsx', 'prisma/ops/staff-account.ts', ...args], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_ENV: 'development' } })
  it.each([['--password'], ['--new-password'], ['--passwd'], ['--pwd'], ['--secret'], ['--token'], ['--password=hunter2-hunter2-hunter2']])('refuses %s as an argument', (flag) => {
    const r = run(['--role', 'CEO_ADMIN', ...(flag.includes('=') ? [flag] : [flag, 'hunter2-hunter2-hunter2'])])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/never accepted as arguments/)
    expect(r.stdout + r.stderr).not.toContain('hunter2-hunter2-hunter2')
  })
  it('refuses to run without an interactive terminal (no pipes, no scripted passwords)', () => {
    const r = run(['--role', 'CEO_ADMIN'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/interactive terminal/)
  })
  it('refuses an unknown role and unknown arguments', () => {
    expect(run(['--role', 'OPERATOR']).stderr).toMatch(/--role is required/)
    expect(run(['--role', 'CEO_ADMIN', '--bogus']).stderr).toMatch(/Unknown argument/)
  })
})

describe('the seed script itself refuses to run in a production-mode process (no database is touched)', () => {
  it('exits non-zero with the explanation, before any database access', () => {
    const r = spawnSync('npx', ['tsx', 'prisma/seed.ts'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_ENV: 'production', GCO_ALLOW_DEMO_SEED: '' } })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/Refusing to run the DEMO seed in a production-mode process/)
    expect(r.stdout).not.toMatch(/Seeding demo data/)
  })
})
