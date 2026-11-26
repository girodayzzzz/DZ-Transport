import type { APIRoute } from 'astro';
import {defaultLanguage,enabledLanguages,pages,url,absolute} from '../lib/routes';
import {legalPages} from '../lib/site-config.mjs';
export const GET:APIRoute=({site})=>{
 const entries=enabledLanguages.flatMap(lang=>pages.filter(page=>import.meta.env.DZ_SITE_MODE === 'production' && !['missing','confirmation',...legalPages].includes(page)).map(page=>
  '<url><loc>'+absolute(url(lang,page),site)+'</loc>'+
  [...enabledLanguages,'x-default'].map(language=>'<xhtml:link rel="alternate" hreflang="'+language+'" href="'+absolute(url(language==='x-default'?defaultLanguage:language as typeof lang,page),site)+'"/>').join('')+'</url>'
 )).join('');
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+entries+'</urlset>',{headers:{'Content-Type':'application/xml'}});
};
