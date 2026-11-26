import type { APIRoute } from 'astro';
import {absolute,asset} from '../lib/routes';
export const GET:APIRoute=({site})=>new Response('User-agent: *\nAllow: /\nSitemap: '+absolute(asset('sitemap.xml'),site)+'\n');
