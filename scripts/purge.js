// Retention job. Schedule daily, e.g. `0 3 * * * npm run purge`.
import { openDb } from '../src/db.js';
import { purgeExpired } from '../src/privacy.js';

console.log(JSON.stringify({ purged: purgeExpired(openDb()), at: new Date().toISOString() }));
