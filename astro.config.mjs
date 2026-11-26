import { defineConfig } from 'astro/config';
import company from './config/site.json' with {type:'json'};

import {assertConfiguration, siteMode, siteUrl} from './src/lib/site-config.mjs';

const guestIntake = process.env.PUBLIC_DZ_GUEST_INTAKE === 'true';
assertConfiguration(siteMode, company, {guestIntake});

export default defineConfig({
  site: siteUrl,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' }
});
