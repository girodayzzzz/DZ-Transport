import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/site.json' with {type:'json'};
import {assertConfiguration, configurationIssues} from '../src/lib/site-config.mjs';

test('confirmed operator details allow preview while production requires legal approval and endpoints',()=>{
 assert.doesNotThrow(()=>assertConfiguration('preview'));
 assert.throws(()=>assertConfiguration('production'), /privacy.retention.*contractualRole.*approvalReference.*endpoints.inquiry/);
 assert.throws(()=>assertConfiguration('unknown'), /DZ_SITE_MODE/);
});

test('production accepts distinct mock HTTPS endpoints and approved operator settings',()=>{
 const configured={
  ...config,
  operator:'Fixture operator',address:'Fixture address',registration:'Fixture registration',
  vatApplicable:false,email:'test@example.invalid',telephone:'+38640123456',businessHours:'Fixture hours',
  legal:{approvalReference:'Fixture approval',contractualRole:'Fixture role'},
  privacy:{retention:'Fixture retention',provider:'Fixture processor'},
  endpoints:{inquiry:'https://example.invalid/inquiry',partner:'https://example.invalid/partner'}
 };
 assert.deepEqual(configurationIssues(configured,'production',{siteUrl:'https://transport.example'}),[]);
 configured.endpoints.partner=configured.endpoints.inquiry;
 assert.deepEqual(configurationIssues(configured,'production',{siteUrl:'https://transport.example'}),['endpoints must be distinct']);
});
