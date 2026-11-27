import settings from '../../config/site.json' with {type:'json'};
import {httpsOrigin} from './site-origin.mjs';
import {endpoint, phoneValid} from './form-core.mjs';

export const siteMode = process.env.DZ_SITE_MODE || 'preview';
export const siteUrl = process.env.SITE_URL || (siteMode === 'production' ? '' : 'https://localhost');

export const isProduction = siteMode === 'production';
export const legalPages = ['privacy', 'terms', 'cookies'];

export function configurationIssues(config, mode, options = {}) {
 const issues = [];
 const origin = httpsOrigin(options.siteUrl ?? process.env.SITE_URL);
 if (!origin) issues.push('SITE_URL');
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
 const inquiry = options.guestIntake ? origin && origin + '/api/inquiry' : endpoint(config.endpoints.inquiry);
 if (!inquiry) issues.push('endpoints.inquiry');
 const partner = options.guestPartnerIntake ? origin && origin + '/api/partner-application' : endpoint(config.endpoints.partner);
 if (!partner) issues.push('endpoints.partner');
 if (inquiry && inquiry === partner) issues.push('endpoints must be distinct');
 return issues;
}

export function assertConfiguration(mode, config = settings, options = {}) {
 const issues = configurationIssues(config, mode, options);
 if (issues.length) throw new Error('DZ Transport configuration requires: ' + issues.join(', '));
}
