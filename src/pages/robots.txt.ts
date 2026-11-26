import {isProduction} from '../lib/site-config.mjs';
import type { APIRoute } from 'astro';
import {absolute,asset} from '../lib/routes';
export const GET:APIRoute=({site})=>new Response(!isProduction ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nAllow: /\nSitemap: '+absolute(asset('sitemap.xml'),site)+'\n');
