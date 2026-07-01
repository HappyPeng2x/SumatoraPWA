import type { DictMeta } from './types'

// Base URL for dictionary files.
// In dev: Vite proxies /dictionaries/* → http://localhost:8000/*
// In prod: change this to wherever you host the .db.gz files.
export const DICT_BASE_URL = '/dictionaries'

// Canonical list of available dictionaries.
// Mirrors the sumatora.happypeng.org v4 manifest structure.
export const CATALOGUE: DictMeta[] = [
  {
    lang: 'jmdict',
    type: 'main',
    description: 'JMDict (core index)',
    uri: `${DICT_BASE_URL}/jmdict.db.gz`,
    version: 4,
    date: 0,
  },
  { lang: 'eng', type: 'translation', description: 'English',    uri: `${DICT_BASE_URL}/eng.db.gz`, version: 4, date: 0 },
  { lang: 'ger', type: 'translation', description: 'German',     uri: `${DICT_BASE_URL}/ger.db.gz`, version: 4, date: 0 },
  { lang: 'rus', type: 'translation', description: 'Russian',    uri: `${DICT_BASE_URL}/rus.db.gz`, version: 4, date: 0 },
  { lang: 'spa', type: 'translation', description: 'Spanish',    uri: `${DICT_BASE_URL}/spa.db.gz`, version: 4, date: 0 },
  { lang: 'dut', type: 'translation', description: 'Dutch',      uri: `${DICT_BASE_URL}/dut.db.gz`, version: 4, date: 0 },
  { lang: 'hun', type: 'translation', description: 'Hungarian',  uri: `${DICT_BASE_URL}/hun.db.gz`, version: 4, date: 0 },
  { lang: 'swe', type: 'translation', description: 'Swedish',    uri: `${DICT_BASE_URL}/swe.db.gz`, version: 4, date: 0 },
  { lang: 'fre', type: 'translation', description: 'French',     uri: `${DICT_BASE_URL}/fre.db.gz`, version: 4, date: 0 },
  { lang: 'slv', type: 'translation', description: 'Slovenian',  uri: `${DICT_BASE_URL}/slv.db.gz`, version: 4, date: 0 },
]

export const JMDICT = CATALOGUE.find((d) => d.lang === 'jmdict')!
