import { defineConfig } from 'astro/config';
import company from './config/site.json' with {type:'json'};

export default defineConfig({
  site: process.env.SITE_URL || company.productionDomain,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' }
});
