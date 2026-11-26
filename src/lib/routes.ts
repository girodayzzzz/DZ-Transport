import {portalTitles} from './portal-copy';
import {corridors} from './corridors';
import settings from '../../config/site.json';

export const languages = ['sl', 'en', 'de'] as const;
export type Lang = typeof languages[number];
export const services = ['vehicle','pallet','cargo','moving','express','special'] as const;
export const slugs = {
  germany:corridors.germany.slugs, austria:corridors.austria.slugs, italy:corridors.italy.slugs, croatia:corridors.croatia.slugs,
  home:['','',''], services:['storitve','services','leistungen'],
  vehicle:['prevoz-vozil','vehicle-transport','fahrzeugtransport'],
  pallet:['prevoz-palet','pallet-transport','palettentransport'],
  cargo:['prevoz-tovora','general-cargo','stueckguttransport'],
  moving:['selitve','moving','umzug'],
  express:['ekspresni-prevoz','express-transport','expresstransport'],
  special:['posebni-prevozi','special-transport','spezialtransport'],
  inquiry:['povprasevanje','inquiry','anfrage'],
  business:['podjetja','business','geschaeftskunden'],
  partners:['partnerji','partners','partner'],
  process:['kako-deluje','how-it-works','ablauf'],
  faq:['pogosta-vprasanja','faq','haeufige-fragen'],
  about:['o-nas','about','ueber-uns'], contact:['kontakt','contact','kontakt'],
  privacy:['zasebnost','privacy','datenschutz'],
  terms:['pogoji','terms','bedingungen'],
  cookies:['piskotki','cookies','cookies'],
  confirmation:['potrditev','confirmation','bestaetigung'],
  login:['prijava','login','anmelden'],
  register:['registracija','register','registrieren'],
  forgot:['pozabljeno-geslo','forgot-password','passwort-vergessen'],
  reset:['ponastavitev-gesla','reset-password','passwort-zuruecksetzen'],
  verify:['potrditev-e-poste','verify-email','e-mail-bestaetigen'],
  callback:['prijava-potrditev','auth-callback','anmeldung-abschliessen'],
  account:['racun','account','konto'],
  logout:['odjava','logout','abmelden'],
  deletion:['izbris-racuna','account-deletion','kontoloeschung'],
  customer:['portal-stranke','customer-portal','kundenportal'],
  carrier:['portal-prevozniki','partner-portal','partnerportal'],
  manager:['upravljanje','transport-manager','transport-manager'],
  missing:['404','404','404']
};
export type Page = keyof typeof slugs;
export type PortalPage = keyof typeof portalTitles;
export const isPortal = (page:Page):page is PortalPage => Object.hasOwn(portalTitles,page);
export const pages = Object.keys(slugs) as Page[];
export const enabledLanguages = languages.filter(language => settings.languages.includes(language));
export const defaultLanguage = languages.find(language => language === settings.defaultLanguage) ?? 'sl';
export const position = (lang:Lang) => languages.indexOf(lang);
export const base = () => import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (lang:Lang, page:Page) => {
  if (page === 'missing' && lang === defaultLanguage) return base() + '/404.html';
  const parts = [lang === defaultLanguage ? '' : lang, slugs[page][position(lang)]].filter(Boolean);
  return base() + '/' + (parts.length ? parts.join('/') + '/' : '');
};
export const asset = (path:string) => base() + '/' + path;
export const absolute = (path:string, site?:URL) => new URL(path,site || settings.productionDomain).href;
export const localized = (lang:Lang, values:readonly string[]) => values[position(lang)];
