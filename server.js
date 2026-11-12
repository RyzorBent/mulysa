// Entry point.
//
// - Locally: `npm start` runs this file and it listens on http://localhost:3000.
// - On Vercel: Vercel imports this file and uses the default export. It does not
//   call listen(); Vercel handles the HTTP side itself.

import { pathToFileURL } from 'node:url';
import { createApp } from './lib/app.js';

const app = createApp();
export default app;

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly && !process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Mock reference demo running at http://localhost:${port}`);
  });
}
