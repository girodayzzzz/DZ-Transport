import { defineConfig } from 'astro/config';
import company from './config/site.json' with {type:'json'};

import {assertConfiguration, pagesDeploymentIssues, siteMode, siteUrl} from './src/lib/site-config.mjs';

const guestIntake = process.env.PUBLIC_DZ_GUEST_INTAKE === 'true';
const guestPartnerIntake = process.env.PUBLIC_DZ_GUEST_PARTNER_INTAKE === 'true';
assertConfiguration(siteMode, company, {guestIntake, guestPartnerIntake});
const issues=pagesDeploymentIssues(process.env);
if(issues.length) throw new Error('DZ Transport Pages configuration requires: '+issues.join(', '));
if(process.env.CF_PAGES==='1' && process.env.CF_PAGES_BRANCH==='main' && siteMode==='preview')
  console.info('DZ Transport is building main in preview mode. Portal and public form submissions are unavailable.');

export default defineConfig({
  site: siteUrl,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' }
});
