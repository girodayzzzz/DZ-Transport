import { defineConfig } from '@playwright/test';

export default defineConfig({
 testDir:'./tests/browser',
 testMatch:'**/*.spec.mjs',
 fullyParallel:true,
 workers:2,
 reporter:'list',
 use:{
  browserName:'chromium',
  launchOptions:process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}
 }
});
