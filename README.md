# Sumatora PWA

A progressive web application for searching Sumatora Japanese dictionaries,
online through SQLite HTTP range queries or offline with locally installed
dictionary packs.

The production application is available at
[dictionary.sumatora.workers.dev](https://dictionary.sumatora.workers.dev).

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Use `npm run build` for a production build and `npm run lint` for static
checks.

## Source and licensing

Copyright (C) 2026 Sumatora contributors.

Sumatora PWA is free software licensed under the
[GNU Affero General Public License version 3](LICENSE), with no option to use
a later version unless a copyright holder grants one. In SPDX notation:
`AGPL-3.0-only`.

Users interacting with the deployed application over a network can obtain its
Corresponding Source from
[github.com/HappyPeng2x/SumatoraPWA](https://github.com/HappyPeng2x/SumatoraPWA).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party
components and dictionary-data attribution.
