import settings from '../../config/site.json' with {type:'json'};
import {httpsOrigin} from './site-origin.mjs';
import {endpoint, phoneValid} from './form-core.mjs';

export const siteMode = process.env.DZ_SITE_MODE || 'preview';
export const siteUrl = process.env.SITE_URL || (siteMode === 'preview' ? 'https://localhost' : '');

export const isProduction = siteMode === 'production';
export const isPilot = siteMode === 'pilot';
export const interactive = isProduction || isPilot;
export const legalPages = ['privacy', 'terms', 'cookies'];

export function localizedDisclosure(value,language) {
 const text=typeof value==='string' ? value : value?.[language];
 return typeof text==='string' ? text.trim() : '';
}

function completeDisclosure(value) {
 return ['sl','en','de'].every(language=>localizedDisclosure(value,language));
}

export function configurationIssues(config, mode, options = {}) {
 const issues = [];
 const origin = httpsOrigin(options.siteUrl ?? process.env.SITE_URL);
 if (!origin) issues.push('SITE_URL');
 if (!['preview', 'pilot', 'production'].includes(mode)) return ['DZ_SITE_MODE'];
 if (mode === 'preview') return issues;
 if (mode === 'pilot') {
  const branch = options.pagesBranch ?? process.env.CF_PAGES_BRANCH;
  const pages = options.pages ?? process.env.CF_PAGES;
  const base = options.basePath ?? process.env.BASE_PATH;
  if (pages !== '1' || !branch || branch === 'main') issues.push('Cloudflare Pages preview branch');
  const alias = branch?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!origin || !alias || alias === 'main' || origin !== `https://${alias}.dz-transport.pages.dev`) {
   issues.push('SITE_URL must match the DZ Transport preview branch alias');
  }
  if (base && base !== '/') issues.push('BASE_PATH=/');
  return issues;
 }
 for (const key of ['operator', 'address', 'registration', 'businessHours']) {
  if (!config[key]?.trim()) issues.push(key);
 }
 if (!config.vat?.trim() && config.vatApplicable !== false) issues.push('vat');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) issues.push('email');
 if (!phoneValid(config.telephone)) issues.push('telephone');
 if (!completeDisclosure(config.privacy.retention)) issues.push('privacy.retention');
 if (!completeDisclosure(config.privacy.provider)) issues.push('privacy.provider');
 if (!completeDisclosure(config.legal.contractualRole)) issues.push('legal.contractualRole');
 if (!config.legal.approvalReference?.trim()) issues.push('legal.approvalReference');
 const inquiry = options.guestIntake ? origin && origin + '/api/inquiry' : endpoint(config.endpoints.inquiry);
 if (!inquiry) issues.push('endpoints.inquiry');
 const partner = options.guestPartnerIntake ? origin && origin + '/api/partner-application' : endpoint(config.endpoints.partner);
 if (!partner) issues.push('endpoints.partner');
 if (inquiry && inquiry === partner) issues.push('endpoints must be distinct');
 return issues;
}

// These variables are visible at build time. Protected Function credentials are checked
// at runtime, where Cloudflare binds them, and are never included in the build output.
export function pagesDeploymentIssues(env) {
 if(env.CF_PAGES!=='1' || !['production','pilot'].includes(env.DZ_SITE_MODE)) return [];
 const issues=[];
 const origin=httpsOrigin(env.SITE_URL);
 if(env.DZ_SITE_MODE==='production' && (env.CF_PAGES_BRANCH!=='main' || origin!=='https://dz-transport.eu'))
  issues.push('Cloudflare production requires main and SITE_URL=https://dz-transport.eu');
 if(env.BASE_PATH && env.BASE_PATH!=='/') issues.push('BASE_PATH=/');
 const publicPortal=env.PUBLIC_DZ_PORTAL==='true';
 if(!publicPortal && ['PUBLIC_DZ_MANAGER','PUBLIC_DZ_PARTNER'].some(name=>env[name]==='true'))
  issues.push('PUBLIC_DZ_PORTAL=true is required for manager and carrier panels');
 const forms=[['PUBLIC_DZ_GUEST_INTAKE','DZ_GUEST_INTAKE'],['PUBLIC_DZ_GUEST_PARTNER_INTAKE','DZ_GUEST_PARTNER_INTAKE']];
 const formsEnabled=forms.some(([name])=>env[name]==='true');
 for(const [build,runtime] of forms) {
  if((env[build]==='true')!==(env[runtime]==='true')) issues.push(build+' and '+runtime+' must agree');
 }
 if(formsEnabled && (!origin || httpsOrigin(env.DZ_SITE_ORIGIN)!==origin))
  issues.push('DZ_SITE_ORIGIN must match SITE_URL');
 if(formsEnabled && publicPortal && env.PUBLIC_SUPABASE_URL!==env.SUPABASE_URL)
  issues.push('SUPABASE_URL must match PUBLIC_SUPABASE_URL');
 if(env.DZ_SITE_MODE==='production') {
  const projectUrl='https://hgnwrtqpjxhidzeemaqb.supabase.co';
  if(publicPortal && env.PUBLIC_SUPABASE_URL!==projectUrl) issues.push('PUBLIC_SUPABASE_URL must use the DZ Transport project');
  if(formsEnabled && env.SUPABASE_URL!==projectUrl) issues.push('SUPABASE_URL must use the DZ Transport project');
 }
 return issues;
}

export function assertConfiguration(mode, config = settings, options = {}) {
 const issues = configurationIssues(config, mode, options);
 if (issues.length) throw new Error('DZ Transport configuration requires: ' + issues.join(', '));
}
