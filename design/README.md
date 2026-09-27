# Claude Design source (reference only)

Exact copies of the Claude Design project "Rientro v2" (project `db2da769-780c-427a-a4dc-57e8693c580e`),
imported on 2026-09-27 via the Claude Design connection. Do not edit these files here: change the design in
Claude Design and re-import.

- `Rientro v2.dc.html`: index of all screen groups
- `Rientro 00 Sistema v2.dc.html`: design system (colours, type, component states)
- `Rientro 01`–`08 … v2.dc.html`: screens, each labelled with a code (e.g. 9a, 39a)
- `UI *.dc.html`: shared components; every screen imports these
- `support.js`: Claude Design's runtime that renders `.dc.html` files

`./.verify.sh` checks that every file still matches the byte size reported by Claude Design at import time.
