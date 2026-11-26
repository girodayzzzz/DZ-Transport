import settings from '../../config/site.json' with {type:'json'};
import {endpoint, phoneValid} from './form-core.mjs';

export const siteMode = process.env.DZ_SITE_MODE || 'preview';
export const isProduction = siteMode === 'production';
export const legalPages = ['privacy', 'terms', 'cookies'];

export function configurationIssues(config, mode) {
 const issues = [];
 if (!['preview', 'production'].includes(mode)) return ['DZ_SITE_MODE'];
 if (mode === 'preview') return issues;
 for (const key of ['operator', 'address', 'registration', 'businessHours']) {
  if (!config[key]?.trim()) issues.push(key);
 }
 if (!config.vat?.trim() && config.vatApplicable !== false) issues.push('vat');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) issues.push('email');
 if (!phoneValid(config.telephone)) issues.push('telephone');
 if (!config.privacy.retention?.trim()) issues.push('privacy.retention');
 if (!config.privacy.provider?.trim()) issues.push('privacy.provider');
 if (!config.legal.contractualRole?.trim()) issues.push('legal.contractualRole');
 if (!config.legal.approvalReference?.trim()) issues.push('legal.approvalReference');
 for (const kind of ['inquiry', 'partner']) {
  if (!endpoint(config.endpoints[kind])) issues.push('endpoints.' + kind);
 }
 if (config.endpoints.inquiry && endpoint(config.endpoints.inquiry) === endpoint(config.endpoints.partner)) issues.push('endpoints must be distinct');
 return issues;
}

export function assertConfiguration(mode, config = settings) {
 const issues = configurationIssues(config, mode);
 if (issues.length) throw new Error('DZ Transport configuration requires: ' + issues.join(', '));
}
