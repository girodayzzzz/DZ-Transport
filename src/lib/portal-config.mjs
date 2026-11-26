export function portalConfiguration(env, production) {
 if (!production || env.PUBLIC_DZ_PORTAL !== 'true') return null;
 const url = env.PUBLIC_SUPABASE_URL;
 const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if (url==='https://project-ref.supabase.co' || key==='sb_publishable_replace_me' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url || '') || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '')) {
  throw new Error('Portal requires a hosted Supabase URL and a publishable key');
 }
 return {url, key, google:env.PUBLIC_DZ_GOOGLE === 'true', manager:env.PUBLIC_DZ_MANAGER === 'true',
  partner:env.PUBLIC_DZ_PARTNER === 'true', onboarding:env.PUBLIC_DZ_CUSTOMER_ONBOARDING === 'true'};
}
