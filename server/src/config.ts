import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  VAPID_SUBJECT: z.string().url(),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  BITBUCKET_API_BASE_URL: z.string().url().default('https://api.bitbucket.org/2.0'),
})

export const config = envSchema.parse(process.env)
