import { useState, useEffect } from 'react'
import { getInstalledDicts, getSetting } from '../db/DictionaryStore'
import { DbService } from '../db/DbService'

export interface DbInitState {
  ready: boolean
  lang: string
  backupLang: string | null
  error: string | null
  noJmdict: boolean
  noLang: boolean
}

export function useDbInit(): DbInitState {
  const [state, setState] = useState<DbInitState>({
    ready: false, lang: 'eng', backupLang: null, error: null, noJmdict: false, noLang: false,
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
        const dicts = await getInstalledDicts()
        const jmdictInstalled = dicts.some(d => d.lang === 'jmdict')
        if (!jmdictInstalled) {
          if (!cancelled) setState(s => ({ ...s, ready: false, noJmdict: true, noLang: false }))
          return
        }

        const [savedLang, savedBackup] = await Promise.all([getSetting('lang'), getSetting('backupLang')])
        const translations = dicts.filter(d => d.type === 'translation')
        const preferredLang = savedLang ?? 'eng'
        const lang = translations.find(d => d.lang === preferredLang)?.lang
          ?? translations[0]?.lang

        if (!lang) {
          if (!cancelled) setState(s => ({ ...s, ready: false, noJmdict: false, noLang: true, lang: preferredLang }))
          return
        }

        const backupLang = savedBackup && savedBackup !== lang
          ? translations.find(d => d.lang === savedBackup)?.lang ?? undefined
          : undefined

        const result = await DbService.get().initDb(lang, backupLang)
        if (!cancelled) setState({ ready: true, lang, backupLang: result.backupLang, error: null, noJmdict: false, noLang: false })
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, ready: false, error: String(err) }))
      }
    }
    init()
    return () => { cancelled = true }
  }, [trigger])

  return state
}
