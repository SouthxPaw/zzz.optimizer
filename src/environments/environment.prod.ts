import packageJson from '../../package.json';

export const environment = {
  production: true,
  appVersion: packageJson.version,
  // Cloudflare Worker URL for Enka API proxy
  enkaProxyUrl: 'https://zzzoptimizer.southxpaw.workers.dev'
};
