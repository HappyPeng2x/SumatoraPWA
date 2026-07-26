import { useState, useEffect } from 'react'
import { getInstalledDicts, getSetting } from '../db/DictionaryStore'
import { fetchCatalogue } from '../db/catalogue'
import { DbService } from '../db/DbService'
import type { DictMeta, InstalledDict, PackSource } from '../db/types'

export interface DbInitState {
  ready: boolean
  lang: string
  backupLang: string | null
  error: string | null
  noJmdict: boolean
  noLang: boolean
  hasKanji: boolean
  isRemote: boolean    // true when core and/or the active gloss pack is served remotely (Phase E) rather than from a local install
  releaseVersion: number
}

// Prefers a local install; falls back to the manifest's remote plain .db
// (Phase E) when nothing is installed. undefined when neither is available.
function packSourceFor(installed: InstalledDict | undefined, remote: DictMeta | undefined): PackSource | undefined {
  if (installed) return { local: true, filename: installed.filename }
  if (remote?.plainUri) return { local: false, url: remote.plainUri }
  return undefined
}

export function useDbInit(): DbInitState {
  const [state, setState] = useState<DbInitState>({
    ready: false, lang: 'eng', backupLang: null, error: null,
    noJmdict: false, noLang: false, hasKanji: false, isRemote: false, releaseVersion: 0,
  })
  const [trigger, setTrigger] = useState(0)

  useEffect(() => {
    const handler = () => setTrigger(t => t + 1)
    window.addEventListener('sumatora:dicts-changed', handler)
    window.addEventListener('sumatora:lang-changed', handler)
    return () => {
      window.removeEventListener('sumatora:dicts-changed', handler)
      window.removeEventListener('sumatora:lang-changed', handler)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const [dicts, catalogue] = await Promise.all([
          getInstalledDicts(),
          // No network / manifest unreachable just means no remote fallback —
          // not a fatal error as long as something is installed locally.
          fetchCatalogue().catch(() => [] as DictMeta[]),
        ])

        const core = packSourceFor(dicts.find(d => d.type === 'core'), catalogue.find(d => d.type === 'core'))
        if (!core) {
          if (!cancelled) setState(s => ({ ...s, ready: false, noJmdict: true, noLang: false }))
          return
        }

        const [savedLang, savedBackup] = await Promise.all([getSetting('lang'), getSetting('backupLang')])
        const installedGlosses = dicts.filter(d => d.type === 'gloss')
        const remoteGlosses = catalogue.filter(d => d.type === 'gloss')
        const preferredLang = savedLang ?? 'eng'

        const lang = installedGlosses.find(d => d.lang === preferredLang)?.lang
          ?? installedGlosses[0]?.lang
          ?? (remoteGlosses.some(d => d.lang === preferredLang) ? preferredLang : undefined)
          ?? remoteGlosses[0]?.lang

        if (!lang) {
          if (!cancelled) setState(s => ({ ...s, ready: false, noJmdict: false, noLang: true, lang: preferredLang }))
          return
        }

        const gloss = packSourceFor(
          installedGlosses.find(d => d.lang === lang),
          remoteGlosses.find(d => d.lang === lang),
        )!  // lang was only chosen above because one of these exists

        const backupLangCode = savedBackup && savedBackup !== lang ? savedBackup : undefined
        const backupGloss = backupLangCode
          ? packSourceFor(installedGlosses.find(d => d.lang === backupLangCode), remoteGlosses.find(d => d.lang === backupLangCode))
          : undefined

        const kanji = packSourceFor(dicts.find(d => d.type === 'kanji'), catalogue.find(d => d.type === 'kanji'))
        // The web-search/web-gloss packs are release-coupled, remote-only
        // acceleration artifacts. They are never shown as installable
        // dictionaries; sqlite.worker.ts only actually attaches web-gloss
        // for a language whose own gloss pack (like core) is remote.
        const webSearchMeta = catalogue.find(d => d.type === 'web-search')
        const webSearch = webSearchMeta?.plainUri
          ? { local: false as const, url: webSearchMeta.plainUri }
          : undefined
        const webGlossMeta = catalogue.find(d => d.type === 'web-gloss' && d.lang === lang)
        const webGloss = webGlossMeta?.plainUri
          ? { local: false as const, url: webGlossMeta.plainUri }
          : undefined
        const backupWebGlossMeta = backupLangCode
          ? catalogue.find(d => d.type === 'web-gloss' && d.lang === backupLangCode)
          : undefined
        const backupWebGloss = backupWebGlossMeta?.plainUri
          ? { local: false as const, url: backupWebGlossMeta.plainUri }
          : undefined
        const isRemote = !core.local || !gloss.local

        const result = await DbService.get().initDb({
          lang, backupLang: backupGloss ? backupLangCode : undefined,
          core, gloss, webSearch, webGloss, backupGloss, backupWebGloss, kanji,
        })
        if (!cancelled) setState({
          ready: true, lang, backupLang: result.backupLang, error: null,
          noJmdict: false, noLang: false, hasKanji: !!kanji, isRemote,
          releaseVersion: webSearchMeta?.version
            ?? dicts.find(d => d.type === 'core')?.version
            ?? catalogue.find(d => d.type === 'core')?.version
            ?? 0,
        })
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, ready: false, error: String(err) }))
      }
    }
    init()
    return () => { cancelled = true }
  }, [trigger])

  return state
}
