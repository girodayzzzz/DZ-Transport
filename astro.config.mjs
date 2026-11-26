import { defineConfig } from 'astro/config';
import company from './config/site.json' with {type:'json'};

import {assertConfiguration} from './src/lib/site-config.mjs';

const mode = process.env.DZ_SITE_MODE || 'preview';
assertConfiguration(mode);

export default defineConfig({
  vite: { define: { 'import.meta.env.DZ_SITE_MODE': JSON.stringify(mode) } },
  site: process.env.SITE_URL || company.productionDomain,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' }
});
