# Third-party notices

Sumatora PWA is licensed as a whole under AGPL-3.0-only. The following
components retain their own notices and licenses.

## SQLite and SQLite WASM

The bundled `public/sqlite3.wasm` and
`public/sqlite3-opfs-async-proxy.js` originate from SQLite's official WASM
distribution. SQLite's deliverable code is dedicated to the public domain.
The proxy source retains SQLite's public-domain blessing in its header.

The `@sqlite.org/sqlite-wasm` npm wrapper is licensed under Apache-2.0.

- https://www.sqlite.org/copyright.html
- https://github.com/sqlite/sqlite-wasm

## sqlite-wasm-http

`src/db/httpVfs.ts` is adapted from `mmomtchev/sqlite-wasm-http`, licensed
under the ISC License. The complete copyright and permission notice is
retained at the top of that source file.

- https://github.com/mmomtchev/sqlite-wasm-http

## JavaScript dependencies

Runtime dependencies are distributed under permissive open-source licenses:
React and React DOM (MIT), idb (ISC), and lru-cache (BlueOak-1.0.0). Build
dependencies are not part of the project's own source license; their package
metadata and license texts are available in their respective npm packages.

## Dictionary data

JMdict and related EDRDG dictionary files are copyright the Electronic
Dictionary Research and Development Group and are made available under
Creative Commons Attribution-ShareAlike 4.0. Dictionary data is published
separately by SumatoraIndex and fetched by this application at runtime.

- https://www.edrdg.org/edrdg/licence.html
