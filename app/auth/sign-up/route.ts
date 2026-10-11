import { redirectToAuthKit } from '@/lib/auth-redirect'

/** GET /auth/sign-up?returnTo=/path&email=hint */
export const GET = (req: Request): Promise<Response> => redirectToAuthKit(req, 'sign-up')
