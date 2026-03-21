import type { SocialProviderId } from '@/services/socialAuth';

export const STUDENT_PACK_BONUS_CS = 1000;

export const STUDENT_PACK_ELIGIBLE_PROVIDERS = Object.freeze([
  'github.com',
  'google.com',
] as SocialProviderId[]);
