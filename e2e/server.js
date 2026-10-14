// The site for the end-to-end tests (npm run e2e) and the exploring agents: its own empty database
// on port 3020, launched (LAUNCHED=1), the login code shown on the page, no email sent, no limits on
// signing in (the bots all come from one address), any email domain accepted. Never the real data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'e2e');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
Object.assign(process.env, {
  PORT: process.env.E2E_PORT || '3020', BASE_URL: `http://localhost:${process.env.E2E_PORT || '3020'}`,
  DB_PATH: path.join(dir, 'rientro.db'), UPLOAD_DIR: path.join(dir, 'uploads'),
  LAUNCHED: '1', ADMIN_EMAILS: 'admin@rientro.local', BREVO_API_KEY: '', NODE_ENV: 'development',
});

const { config } = await import('../src/config.js');
const { createApp } = await import('../src/server.js');

const { server } = createApp({
  loginLimits: { ip: 100_000, email: 1_000 },
  emailDomainCheck: async () => {},
  sendWelcome: async () => {},
});
server.listen(config.port, '127.0.0.1', () => console.log(`Rientro e2e su ${config.baseUrl}`));
