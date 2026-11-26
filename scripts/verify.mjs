import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import config from '../config/site.json' with {type:'json'};

const dir='dist';
const base=(process.env.BASE_PATH||'/').replace(/\/$/,'');
const origin=new URL(process.env.SITE_URL||config.productionDomain).origin;
const files=readdirSync(dir,{recursive:true}).filter(file=>file.endsWith('.html'));
const ids=new Map();
for (const file of files) {
 const html=readFileSync(join(dir,file),'utf8');
 const matches=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(matches).size,matches.length,file+' duplicate id');
 ids.set(file,new Set(matches));
}
const count={sl:0,en:0,de:0};
for (const file of files) {
 const html=readFileSync(join(dir,file),'utf8');
 const lang=html.match(/<html lang="(sl|en|de)"/)?.[1];
 assert.ok(lang,file+' language');
 assert.equal([...html.matchAll(/<h1[ >]/g)].length,1,file+' h1');
 assert.match(html,/<meta name="description" content="[^"]+/);
 assert.match(html,/<meta property="og:image" content="https:\/\//);
 const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 if(canonical){
  assert.equal(canonical,origin+base+'/'+file.replace(/index\.html$/,''));
  assert.equal([...html.matchAll(/hreflang="[^"]+" href="https:\/\//g)].length,config.languages.length+1,file);
  count[lang]++;
 } else assert.match(html,/noindex,follow/);
 const links=[...html.matchAll(/\b(href|src|srcset|action)="([^"]*)"/g)].flatMap(([,attribute,value])=>
  attribute==='srcset' ? value.split(',').map(entry=>entry.trim().split(/\s+/)[0]) : [value]
 );
 for(const link of links){
  const value=link.replaceAll('&amp;','&');
  if(value.startsWith('#')) {
   assert.ok(ids.get(file).has(value.slice(1)),file+' broken fragment '+value);
   continue;
  }
  if(!value.startsWith('/')&&!value.startsWith(origin)) continue;
  const resolved=new URL(value,origin);
  assert.ok(!base||resolved.pathname.startsWith(base+'/'),file+' missing base '+value);
  let target=decodeURIComponent(resolved.pathname.slice(base.length+1));
  if(!target||target.endsWith('/')) target+='index.html';
  const destination=join(dir,target);
  assert.ok(existsSync(destination)&&statSync(destination).isFile(),file+' broken link '+value);
 }
 for(const match of html.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.get(file).has(match[1]),file+' missing label target');
}
const indexable = process.env.DZ_SITE_MODE === 'production' ? 19 : 0;
for(const language of config.languages) assert.equal(count[language],indexable,language+' indexable routes');
const sitemap=readFileSync(join(dir,'sitemap.xml'),'utf8');
assert.equal([...sitemap.matchAll(/<loc>/g)].length,indexable*config.languages.length);
assert.equal(readFileSync(join(dir,'robots.txt'),'utf8').includes(origin+base+'/sitemap.xml'), Boolean(indexable));
console.log('Verified '+files.length+' HTML routes, sitemap, robots, canonical URLs, assets, labels, and internal links.');
