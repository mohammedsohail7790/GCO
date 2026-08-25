import { PrismaClient } from '@prisma/client'

declare global {
  var __gcoPrisma: PrismaClient | undefined
}

export const db =
  global.__gcoPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  global.__gcoPrisma = db
}
