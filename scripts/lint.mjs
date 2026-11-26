import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import config from '../config/site.json' with {type:'json'};
import {endpoint} from '../src/lib/form-core.mjs';
import {cargo, cargoItem, recurringFields, oversized, companyFields, consents, countries, customer, grouping, location, partner, regulated, schedule, transport, types} from '../src/lib/form-schema.mjs';

for (const path of readdirSync('.', {recursive:false})) {
 if (!path.endsWith('.mjs')) continue;
 assert.equal(spawnSync(process.execPath,['--check',path],{stdio:'inherit'}).status,0,path);
}
for (const directory of ['src','scripts','tests']) {
 for (const entry of readdirSync(directory,{recursive:true})) {
  if (!/\.(mjs|ts|astro|css)$/.test(entry)) continue;
  const path=join(directory,entry);
  const source=readFileSync(path,'utf8');
  assert.ok(!source.includes('\t')&&!/[ \t]+$/m.test(source),path+' contains stray whitespace');
  if (path.endsWith('.mjs')) assert.equal(spawnSync(process.execPath,['--check',path],{stdio:'inherit'}).status,0,path);
 }
}
assert.ok(config.languages.includes(config.defaultLanguage));
assert.equal(new Set(config.languages).size,config.languages.length);
assert.ok(config.languages.every(lang=>['sl','en','de'].includes(lang)));
assert.ok(!config.analytics.enabled || (config.analytics.consentReviewed && /^[a-f0-9]{32}$/i.test(config.analytics.cloudflareToken)), 'Analytics requires an approved consent configuration and a valid Cloudflare token');
assert.ok(Object.values(config.endpoints).every(value=>!value||endpoint(value)));
assert.ok(!config.endpoints.inquiry || config.endpoints.inquiry!==config.endpoints.partner);
for(const field of [transport,...location('pickup'),...location('delivery'),...Object.values(cargo).flat(),regulated,oversized,...cargoItem,...recurringFields,...schedule,...customer,...companyFields,...partner,...consents]) {
 assert.equal(field.labels.length,3,field.key);
 assert.ok(field.labels.every(Boolean),field.key);
 assert.ok(field.options.every(option=>option.length===4&&option.every(Boolean)),field.key);
}
assert.equal(new Set(countries).size,countries.length);
assert.ok(types.every(([key])=>Object.hasOwn(cargo,grouping[key])));
console.log('Source, configuration and form dictionary checks passed.');
