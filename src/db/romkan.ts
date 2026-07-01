// TypeScript port of JRomkan (Romkan.java + RomkanData.java)
// Copyright (C) 2026 Nicolas Centa — GPL v3

const ROMKAN: Record<string, string> = {
  "xa":"ァ","a":"ア","xi":"ィ","i":"イ","xu":"ゥ","u":"ウ",
  "vu":"ヴ","va":"ヴァ","vi":"ヴィ","ve":"ヴェ","vo":"ヴォ",
  "xe":"ェ","e":"エ","xo":"ォ","o":"オ",
  "ka":"カ","ga":"ガ","ki":"キ","kya":"キャ","kyu":"キュ","kyo":"キョ",
  "gi":"ギ","gya":"ギャ","gyu":"ギュ","gyo":"ギョ",
  "ku":"ク","gu":"グ","ke":"ケ","ge":"ゲ","ko":"コ","go":"ゴ",
  "sa":"サ","za":"ザ","si":"シ","sya":"シャ","syu":"シュ","syo":"ショ","sye":"シェ",
  "zi":"ジ","zya":"ジャ","zyu":"ジュ","zyo":"ジョ",
  "su":"ス","zu":"ズ","se":"セ","ze":"ゼ","so":"ソ","zo":"ゾ",
  "ta":"タ","da":"ダ","ti":"チ","tya":"チャ","tyu":"チュ","tyo":"チョ",
  "di":"ヂ","dya":"ヂャ","dyu":"ヂュ","dyo":"ヂョ",
  "xtu":"ッ","vvu":"ッヴ","vva":"ッヴァ","vvi":"ッヴィ","vve":"ッヴェ","vvo":"ッヴォ",
  "kka":"ッカ","gga":"ッガ","kki":"ッキ","kkya":"ッキャ","kkyu":"ッキュ","kkyo":"ッキョ",
  "ggi":"ッギ","ggya":"ッギャ","ggyu":"ッギュ","ggyo":"ッギョ",
  "kku":"ック","ggu":"ッグ","kke":"ッケ","gge":"ッゲ","kko":"ッコ","ggo":"ッゴ",
  "ssa":"ッサ","zza":"ッザ","ssi":"ッシ",
  "ssya":"ッシャ","ssyu":"ッシュ","ssyo":"ッショ","ssye":"ッシェ",
  "zzi":"ッジ","zzya":"ッジャ","zzyu":"ッジュ","zzyo":"ッジョ",
  "ssu":"ッス","zzu":"ッズ","sse":"ッセ","zze":"ッゼ","sso":"ッソ","zzo":"ッゾ",
  "tta":"ッタ","dda":"ッダ","tti":"ッティ",
  "ttya":"ッチャ","ttyu":"ッチュ","ttyo":"ッチョ",
  "ddi":"ッヂ","ddya":"ッヂャ","ddyu":"ッヂュ","ddyo":"ッヂョ",
  "ttu":"ッツ","ddu":"ッドゥ","tte":"ッテ","dde":"ッデ","tto":"ット","ddo":"ッド",
  "hha":"ッハ","bba":"ッバ","ppa":"ッパ","hhi":"ッヒ",
  "hhya":"ッヒャ","hhyu":"ッヒュ","hhyo":"ッヒョ",
  "bbi":"ッビ","bbya":"ッビャ","bbyu":"ッビュ","bbyo":"ッビョ",
  "ppi":"ッピ","ppya":"ッピャ","ppyu":"ッピュ","ppyo":"ッピョ",
  "hhu":"ッフ","ffu":"ッフュ","ffa":"ッファ","ffi":"ッフィ","ffe":"ッフェ","ffo":"ッフォ",
  "bbu":"ッブ","ppu":"ップ","hhe":"ッヘ","bbe":"ッベ","ppe":"ッペ","hho":"ッホ","bbo":"ッボ","ppo":"ッポ",
  "yya":"ッヤ","yyu":"ッユ","yyo":"ッヨ",
  "rra":"ッラ","rri":"ッリ","rrya":"ッリャ","rryu":"ッリュ","rryo":"ッリョ",
  "rru":"ッル","rre":"ッレ","rro":"ッロ",
  "tu":"ツ","du":"ヅ","te":"テ","de":"デ","to":"ト","do":"ド",
  "na":"ナ","ni":"ニ","nya":"ニャ","nyu":"ニュ","nyo":"ニョ",
  "nu":"ヌ","ne":"ネ","no":"ノ",
  "ha":"ハ","ba":"バ","pa":"パ","hi":"ヒ","hya":"ヒャ","hyu":"ヒュ","hyo":"ヒョ",
  "bi":"ビ","bya":"ビャ","byu":"ビュ","byo":"ビョ",
  "pi":"ピ","pya":"ピャ","pyu":"ピュ","pyo":"ピョ",
  "hu":"フ","fa":"ファ","fi":"フィ","fe":"フェ","fo":"フォ","fu":"フ",
  "bu":"ブ","pu":"プ","he":"ヘ","be":"ベ","pe":"ペ","ho":"ホ","bo":"ボ","po":"ポ",
  "ma":"マ","mi":"ミ","mya":"ミャ","myu":"ミュ","myo":"ミョ",
  "mu":"ム","me":"メ","mo":"モ",
  "xya":"ャ","ya":"ヤ","xyu":"ュ","yu":"ユ","xyo":"ョ","yo":"ヨ",
  "ra":"ラ","ri":"リ","rya":"リャ","ryu":"リュ","ryo":"リョ",
  "ru":"ル","re":"レ","ro":"ロ",
  "xwa":"ヮ","wa":"ワ","wi":"ウィ","we":"ウェ","wo":"ヲ",
  "n":"ン","n'":"ン","dyi":"ディ","-":"ー",
  "tye":"チェ","ttye":"ッチェ","zye":"ジェ",
  "shi":"シ","sha":"シャ","shu":"シュ","sho":"ショ","she":"シェ",
  "ji":"ジ","ja":"ジャ","ju":"ジュ","jo":"ジョ",
  "chi":"チ","cha":"チャ","chu":"チュ","cho":"チョ",
  "xtsu":"ッ","sshi":"ッシ","ssha":"ッシャ","sshu":"ッシュ","ssho":"ッショ","sshe":"ッシェ",
  "jji":"ッジ","jja":"ッジャ","jju":"ッジュ","jjo":"ッジョ",
  "cchi":"ッチ","ccha":"ッチャ","cchu":"ッチュ","ccho":"ッチョ",
  "ttsu":"ッツ","tsu":"ツ","che":"チェ","cche":"ッチェ","je":"ジェ",
}

const KANROM: Record<string, string> = {
  "ァ":"xa","ア":"a","ィ":"xi","イ":"i","ゥ":"xu","ウ":"u",
  "ヴ":"vu","ヴァ":"va","ヴィ":"vi","ヴェ":"ve","ヴォ":"vo",
  "ェ":"xe","エ":"e","ォ":"xo","オ":"o",
  "カ":"ka","ガ":"ga","キ":"ki","キャ":"kya","キュ":"kyu","キョ":"kyo",
  "ギ":"gi","ギャ":"gya","ギュ":"gyu","ギョ":"gyo",
  "ク":"ku","グ":"gu","ケ":"ke","ゲ":"ge","コ":"ko","ゴ":"go",
  "サ":"sa","ザ":"za","シ":"shi","シャ":"sha","シュ":"shu","ショ":"sho","シェ":"she",
  "ジ":"ji","ジャ":"ja","ジュ":"ju","ジョ":"jo",
  "ス":"su","ズ":"zu","セ":"se","ゼ":"ze","ソ":"so","ゾ":"zo",
  "タ":"ta","ダ":"da","チ":"chi","チャ":"cha","チュ":"chu","チョ":"cho",
  "ヂ":"di","ヂャ":"dya","ヂュ":"dyu","ヂョ":"dyo","ティ":"ti",
  "ッ":"xtsu","ッヴ":"vvu","ッヴァ":"vva","ッヴィ":"vvi","ッヴェ":"vve","ッヴォ":"vvo",
  "ッカ":"kka","ッガ":"gga","ッキ":"kki","ッキャ":"kkya","ッキュ":"kkyu","ッキョ":"kkyo",
  "ッギ":"ggi","ッギャ":"ggya","ッギュ":"ggyu","ッギョ":"ggyo",
  "ック":"kku","ッグ":"ggu","ッケ":"kke","ッゲ":"gge","ッコ":"kko","ッゴ":"ggo",
  "ッサ":"ssa","ッザ":"zza","ッシ":"sshi","ッシャ":"ssha","ッシュ":"sshu","ッショ":"ssho","ッシェ":"sshe",
  "ッジ":"jji","ッジャ":"jja","ッジュ":"jju","ッジョ":"jjo",
  "ッス":"ssu","ッズ":"zzu","ッセ":"sse","ッゼ":"zze","ッソ":"sso","ッゾ":"zzo",
  "ッタ":"tta","ッダ":"dda","ッチ":"cchi","ッティ":"tti",
  "ッチャ":"ccha","ッチュ":"cchu","ッチョ":"ccho",
  "ッヂ":"ddi","ッヂャ":"ddya","ッヂュ":"ddyu","ッヂョ":"ddyo",
  "ッツ":"ttsu","ッヅ":"ddu","ッテ":"tte","ッデ":"dde","ット":"tto","ッド":"ddo","ッドゥ":"ddu",
  "ッハ":"hha","ッバ":"bba","ッパ":"ppa","ッヒ":"hhi",
  "ッヒャ":"hhya","ッヒュ":"hhyu","ッヒョ":"hhyo",
  "ッビ":"bbi","ッビャ":"bbya","ッビュ":"bbyu","ッビョ":"bbyo",
  "ッピ":"ppi","ッピャ":"ppya","ッピュ":"ppyu","ッピョ":"ppyo",
  "ッフ":"ffu","ッフュ":"ffu","ッファ":"ffa","ッフィ":"ffi","ッフェ":"ffe","ッフォ":"ffo",
  "ッブ":"bbu","ップ":"ppu","ッヘ":"hhe","ッベ":"bbe","ッペ":"ppe","ッホ":"hho","ッボ":"bbo","ッポ":"ppo",
  "ッヤ":"yya","ッユ":"yyu","ッヨ":"yyo",
  "ッラ":"rra","ッリ":"rri","ッリャ":"rrya","ッリュ":"rryu","ッリョ":"rryo",
  "ッル":"rru","ッレ":"rre","ッロ":"rro",
  "ツ":"tsu","ヅ":"du","テ":"te","デ":"de","ト":"to","ド":"do","ドゥ":"du",
  "ナ":"na","ニ":"ni","ニャ":"nya","ニュ":"nyu","ニョ":"nyo",
  "ヌ":"nu","ネ":"ne","ノ":"no",
  "ハ":"ha","バ":"ba","パ":"pa","ヒ":"hi","ヒャ":"hya","ヒュ":"hyu","ヒョ":"hyo",
  "ビ":"bi","ビャ":"bya","ビュ":"byu","ビョ":"byo",
  "ピ":"pi","ピャ":"pya","ピュ":"pyu","ピョ":"pyo",
  "フ":"fu","ファ":"fa","フィ":"fi","フェ":"fe","フォ":"fo","フュ":"fu",
  "ブ":"bu","プ":"pu","ヘ":"he","ベ":"be","ペ":"pe","ホ":"ho","ボ":"bo","ポ":"po",
  "マ":"ma","ミ":"mi","ミャ":"mya","ミュ":"myu","ミョ":"myo",
  "ム":"mu","メ":"me","モ":"mo",
  "ャ":"xya","ヤ":"ya","ュ":"xyu","ユ":"yu","ョ":"xyo","ヨ":"yo",
  "ラ":"ra","リ":"ri","リャ":"rya","リュ":"ryu","リョ":"ryo",
  "ル":"ru","レ":"re","ロ":"ro",
  "ヮ":"xwa","ワ":"wa","ウィ":"wi","ヰ":"wi","ヱ":"we","ウェ":"we","ヲ":"wo","ウォ":"wo",
  "ン":"n'","ディ":"di","ー":"-","チェ":"che","ッチェ":"cche","ジェ":"je",
}

const KANROM_H: Record<string, string> = {
  "ぁ":"xa","あ":"a","ぃ":"xi","い":"i","ぅ":"xu","う":"u",
  "う゛":"vu","う゛ぁ":"va","う゛ぃ":"vi","う゛ぇ":"ve","う゛ぉ":"vo",
  "ぇ":"xe","え":"e","ぉ":"xo","お":"o",
  "か":"ka","が":"ga","き":"ki","きゃ":"kya","きゅ":"kyu","きょ":"kyo",
  "ぎ":"gi","ぎゃ":"gya","ぎゅ":"gyu","ぎょ":"gyo",
  "く":"ku","ぐ":"gu","け":"ke","げ":"ge","こ":"ko","ご":"go",
  "さ":"sa","ざ":"za","し":"shi","しゃ":"sha","しゅ":"shu","しょ":"sho",
  "じ":"ji","じゃ":"ja","じゅ":"ju","じょ":"jo",
  "す":"su","ず":"zu","せ":"se","ぜ":"ze","そ":"so","ぞ":"zo",
  "た":"ta","だ":"da","ち":"chi","ちゃ":"cha","ちゅ":"chu","ちょ":"cho",
  "ぢ":"di","ぢゃ":"dya","ぢゅ":"dyu","ぢょ":"dyo",
  "っ":"xtsu","っう゛":"vvu","っう゛ぁ":"vva","っう゛ぃ":"vvi","っう゛ぇ":"vve","っう゛ぉ":"vvo",
  "っか":"kka","っが":"gga","っき":"kki","っきゃ":"kkya","っきゅ":"kkyu","っきょ":"kkyo",
  "っぎ":"ggi","っぎゃ":"ggya","っぎゅ":"ggyu","っぎょ":"ggyo",
  "っく":"kku","っぐ":"ggu","っけ":"kke","っげ":"gge","っこ":"kko","っご":"ggo",
  "っさ":"ssa","っざ":"zza","っし":"sshi","っしゃ":"ssha","っしゅ":"sshu","っしょ":"ssho",
  "っじ":"jji","っじゃ":"jja","っじゅ":"jju","っじょ":"jjo",
  "っす":"ssu","っず":"zzu","っせ":"sse","っぜ":"zze","っそ":"sso","っぞ":"zzo",
  "った":"tta","っだ":"dda","っち":"cchi","っちゃ":"ccha","っちゅ":"cchu","っちょ":"ccho",
  "っぢ":"ddi","っぢゃ":"ddya","っぢゅ":"ddyu","っぢょ":"ddyo",
  "っつ":"ttsu","っづ":"ddu","って":"tte","っで":"dde","っと":"tto","っど":"ddo",
  "っは":"hha","っば":"bba","っぱ":"ppa","っひ":"hhi",
  "っひゃ":"hhya","っひゅ":"hhyu","っひょ":"hhyo",
  "っび":"bbi","っびゃ":"bbya","っびゅ":"bbyu","っびょ":"bbyo",
  "っぴ":"ppi","っぴゃ":"ppya","っぴゅ":"ppyu","っぴょ":"ppyo",
  "っふ":"ffu","っふぁ":"ffa","っふぃ":"ffi","っふぇ":"ffe","っふぉ":"ffo",
  "っぶ":"bbu","っぷ":"ppu","っへ":"hhe","っべ":"bbe","っぺ":"ppe","っほ":"hho","っぼ":"bbo","っぽ":"ppo",
  "っや":"yya","っゆ":"yyu","っよ":"yyo",
  "っら":"rra","っり":"rri","っりゃ":"rrya","っりゅ":"rryu","っりょ":"rryo",
  "っる":"rru","っれ":"rre","っろ":"rro",
  "つ":"tsu","づ":"du","て":"te","で":"de","と":"to","ど":"do",
  "な":"na","に":"ni","にゃ":"nya","にゅ":"nyu","にょ":"nyo",
  "ぬ":"nu","ね":"ne","の":"no",
  "は":"ha","ば":"ba","ぱ":"pa","ひ":"hi","ひゃ":"hya","ひゅ":"hyu","ひょ":"hyo",
  "び":"bi","びゃ":"bya","びゅ":"byu","びょ":"byo",
  "ぴ":"pi","ぴゃ":"pya","ぴゅ":"pyu","ぴょ":"pyo",
  "ふ":"fu","ふぁ":"fa","ふぃ":"fi","ふぇ":"fe","ふぉ":"fo",
  "ぶ":"bu","ぷ":"pu","へ":"he","べ":"be","ぺ":"pe","ほ":"ho","ぼ":"bo","ぽ":"po",
  "ま":"ma","み":"mi","みゃ":"mya","みゅ":"myu","みょ":"myo",
  "む":"mu","め":"me","も":"mo",
  "ゃ":"xya","や":"ya","ゅ":"xyu","ゆ":"yu","ょ":"xyo","よ":"yo",
  "ら":"ra","り":"ri","りゃ":"rya","りゅ":"ryu","りょ":"ryo",
  "る":"ru","れ":"re","ろ":"ro",
  "ゎ":"xwa","わ":"wa","ゐ":"wi","ゑ":"we","を":"wo",
  "ん":"n'","でぃ":"dyi","ー":"-","ちぇ":"che","っちぇ":"cche","じぇ":"je",
}

// Normalizes non-standard romanizations to Hepburn (e.g. "si"→"shi", "zi"→"ji")
const TO_HEPBURN: Record<string, string> = {
  "xa":"xa","a":"a","xi":"xi","i":"i","xu":"xu","u":"u",
  "vu":"vu","va":"va","vi":"vi","ve":"ve","vo":"vo","xe":"xe","e":"e","xo":"xo","o":"o",
  "ka":"ka","ga":"ga","ki":"ki","kya":"kya","kyu":"kyu","kyo":"kyo","gi":"gi","gya":"gya","gyu":"gyu","gyo":"gyo",
  "ku":"ku","gu":"gu","ke":"ke","ge":"ge","ko":"ko","go":"go","sa":"sa","za":"za",
  "si":"shi","sya":"sha","syu":"shu","syo":"sho","sye":"she",
  "zi":"ji","zya":"ja","zyu":"ju","zyo":"jo",
  "su":"su","zu":"zu","se":"se","ze":"ze","so":"so","zo":"zo","ta":"ta","da":"da",
  "ti":"chi","tya":"cha","tyu":"chu","tyo":"cho",
  "di":"di","dya":"dya","dyu":"dyu","dyo":"dyo","xtu":"xtsu",
  "vvu":"vvu","vva":"vva","vvi":"vvi","vve":"vve","vvo":"vvo",
  "kka":"kka","gga":"gga","kki":"kki","kkya":"kkya","kkyu":"kkyu","kkyo":"kkyo","ggi":"ggi","ggya":"ggya","ggyu":"ggyu","ggyo":"ggyo",
  "kku":"kku","ggu":"ggu","kke":"kke","gge":"gge","kko":"kko","ggo":"ggo","ssa":"ssa","zza":"zza",
  "ssi":"sshi","ssya":"ssha","ssyu":"sshu","ssyo":"ssho","ssye":"sshe",
  "zzi":"jji","zzya":"jja","zzyu":"jju","zzyo":"jjo",
  "ssu":"ssu","zzu":"zzu","sse":"sse","zze":"zze","sso":"sso","zzo":"zzo","tta":"tta","dda":"dda","tti":"tti",
  "ttya":"ccha","ttyu":"cchu","ttyo":"ccho",
  "ddi":"ddi","ddya":"ddya","ddyu":"ddyu","ddyo":"ddyo","ttu":"ttsu","ddu":"ddu","tte":"tte","dde":"dde","tto":"tto","ddo":"ddo",
  "hha":"hha","bba":"bba","ppa":"ppa","hhi":"hhi","hhya":"hhya","hhyu":"hhyu","hhyo":"hhyo",
  "bbi":"bbi","bbya":"bbya","bbyu":"bbyu","bbyo":"bbyo","ppi":"ppi","ppya":"ppya","ppyu":"ppyu","ppyo":"ppyo",
  "hhu":"ffu","ffu":"ffu","ffa":"ffa","ffi":"ffi","ffe":"ffe","ffo":"ffo",
  "bbu":"bbu","ppu":"ppu","hhe":"hhe","bbe":"bbe","ppe":"ppe","hho":"hho","bbo":"bbo","ppo":"ppo",
  "yya":"yya","yyu":"yyu","yyo":"yyo","rra":"rra","rri":"rri","rrya":"rrya","rryu":"rryu","rryo":"rryo","rru":"rru","rre":"rre","rro":"rro",
  "tu":"tsu","du":"du","te":"te","de":"de","to":"to","do":"do",
  "na":"na","ni":"ni","nya":"nya","nyu":"nyu","nyo":"nyo","nu":"nu","ne":"ne","no":"no",
  "ha":"ha","ba":"ba","pa":"pa","hi":"hi","hya":"hya","hyu":"hyu","hyo":"hyo",
  "bi":"bi","bya":"bya","byu":"byu","byo":"byo","pi":"pi","pya":"pya","pyu":"pyu","pyo":"pyo",
  "hu":"fu","fa":"fa","fi":"fi","fe":"fe","fo":"fo","fu":"fu",
  "bu":"bu","pu":"pu","he":"he","be":"be","pe":"pe","ho":"ho","bo":"bo","po":"po",
  "ma":"ma","mi":"mi","mya":"mya","myu":"myu","myo":"myo","mu":"mu","me":"me","mo":"mo",
  "xya":"xya","ya":"ya","xyu":"xyu","yu":"yu","xyo":"xyo","yo":"yo",
  "ra":"ra","ri":"ri","rya":"rya","ryu":"ryu","ryo":"ryo","ru":"ru","re":"re","ro":"ro",
  "xwa":"xwa","wa":"wa","wi":"wi","we":"we","wo":"wo","n":"n","n'":"n'","dyi":"di","-":"-",
  "tye":"che","ttye":"cche","zye":"je",
}

function buildPat(map: Record<string, string>): RegExp {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length)
  return new RegExp(keys.join('|'), 'gu')
}

const rompat = buildPat(ROMKAN)
const kanpat = buildPat(KANROM)
const kanpat_h = buildPat(KANROM_H)
const heppat = buildPat(TO_HEPBURN)

const NN_RE = /nn/gu
const N_APOS_RE = /n'(?=[^aiueoyn]|$)/gu

export function normalizeDoubleN(s: string): string {
  return s.replace(NN_RE, "n'").replace(N_APOS_RE, 'n')
}

export function toKatakana(s: string): string {
  rompat.lastIndex = 0
  const lower = normalizeDoubleN(s.toLowerCase())
  return lower.replace(rompat, (m) => ROMKAN[m] ?? m)
}

// Converts katakana characters to hiragana (U+30A1-U+30F6 → U+3041-U+3096)
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export function toHepburn(s: string): string {
  kanpat.lastIndex = 0
  const ret1 = s.replace(kanpat, (m) => KANROM[m] ?? m)
  kanpat_h.lastIndex = 0
  const ret2 = ret1.replace(kanpat_h, (m) => KANROM_H[m] ?? m)
  const ret = ret2.replace(N_APOS_RE, 'n')
  // If nothing changed, treat input as romaji and normalize to Hepburn
  if (ret === s) {
    const norm = normalizeDoubleN(s.toLowerCase())
    heppat.lastIndex = 0
    return norm.replace(heppat, (m) => TO_HEPBURN[m] ?? m)
  }
  return ret
}
