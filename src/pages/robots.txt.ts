import type { APIRoute } from 'astro';
import {absolute,asset} from '../lib/routes';
export const GET:APIRoute=({site})=>new Response(import.meta.env.DZ_SITE_MODE !== 'production' ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nAllow: /\nSitemap: '+absolute(asset('sitemap.xml'),site)+'\n');
