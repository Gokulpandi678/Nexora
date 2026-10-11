import { redirectToAuthKit } from '@/lib/auth-redirect'

/** GET /auth/sign-in?returnTo=/path&email=hint */
export const GET = (req: Request): Promise<Response> => redirectToAuthKit(req, 'sign-in')
