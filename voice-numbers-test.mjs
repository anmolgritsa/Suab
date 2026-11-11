/**
 * voice-numbers-test.mjs — node check of the spoken-number parser that
 * powers the product-count mic.
 * Run with:  node voice-numbers-test.mjs
 * (Not part of the app bundle — just a developer sanity check.)
 */

import {
  LOCALE_BY_LANG,
  SPEECH_LOCALES,
  normalizeSpeech,
  parseSpokenNumber,
} from './src/utils/voiceNumbers.js'

let failures = 0

function t(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(ok ? 'PASS' : 'FAIL', label, '->', JSON.stringify(actual))
}

/* ---- locale wiring ---- */
t('five speech locales', SPEECH_LOCALES.length, 5)
t('locales cover the demo languages', SPEECH_LOCALES.join(','), 'en-IN,hi-IN,bn-IN,pa-IN,te-IN')
t('ui language → locale (en)', LOCALE_BY_LANG.en, 'en-IN')
t('ui language → locale (hi)', LOCALE_BY_LANG.hi, 'hi-IN')
t('ui language → locale (bn)', LOCALE_BY_LANG.bn, 'bn-IN')
t('ui language → locale (pa)', LOCALE_BY_LANG.pa, 'pa-IN')
t('ui language → locale (te)', LOCALE_BY_LANG.te, 'te-IN')

/* ---- normalizeSpeech ---- */
t('lowercase + punctuation', normalizeSpeech('Twenty-Five!'), 'twenty five')
t('devanagari digits', normalizeSpeech('५०'), '50')
t('bengali digits', normalizeSpeech('২৫'), '25')
t('gurmukhi digits', normalizeSpeech('੨੫'), '25')
t('telugu digits', normalizeSpeech('౨౫'), '25')
t('nukta stripped (हज़ार → हजार)', normalizeSpeech('हज़ार'), 'हजार')
t('nukta stripped (ਹਜ਼ਾਰ → ਹਜਾਰ)', normalizeSpeech('ਹਜ਼ਾਰ'), 'ਹਜਾਰ')
t('bengali ড় kept intact', normalizeSpeech('আটাশ'), 'আটাশ')

/* ---- digits in the transcript win ---- */
t('plain digits', parseSpokenNumber('125'), 125)
t('digits with filler', parseSpokenNumber('मुझे 50 चाहिए'), 50)
t('first number wins', parseSpokenNumber('5 10 3'), 5)

/* ---- English ---- */
t('five', parseSpokenNumber('five'), 5)
t('twenty', parseSpokenNumber('twenty'), 20)
t('twenty five', parseSpokenNumber('twenty five'), 25)
t('twenty-five (hyphen)', parseSpokenNumber('twenty-five'), 25)
t('one hundred five', parseSpokenNumber('one hundred five'), 105)
t('one hundred and five', parseSpokenNumber('one hundred and five'), 105)
t('hundred alone', parseSpokenNumber('hundred'), 100)
t('two hundred fifty', parseSpokenNumber('two hundred fifty'), 250)
t('one thousand two hundred five', parseSpokenNumber('one thousand two hundred five'), 1205)
t('digit dictation one two five', parseSpokenNumber('one two five'), 125)
t('filler around the number', parseSpokenNumber('I made five pieces today'), 5)
t('zero is a valid count', parseSpokenNumber('zero'), 0)

/* ---- Hindi ---- */
t('पाँच', parseSpokenNumber('पाँच'), 5)
t('पांच (variant)', parseSpokenNumber('पांच'), 5)
t('पच्चीस', parseSpokenNumber('पच्चीस'), 25)
t('पचास', parseSpokenNumber('पचास'), 50)
t('इक सौ पचास', parseSpokenNumber('इक सौ पचास'), 150)
t('दो सौ', parseSpokenNumber('दो सौ'), 200)
t('सौ alone', parseSpokenNumber('सौ'), 100)
t('एक हजार दो सौ पाँच', parseSpokenNumber('एक हजार दो सौ पाँच'), 1205)
t('उन्नीस', parseSpokenNumber('उन्नीस'), 19)
t('अड़तीस (nukta in input)', parseSpokenNumber('अड़तीस'), 38)
t('अडतीस (plain)', parseSpokenNumber('अडतीस'), 38)
t('नब्बे', parseSpokenNumber('नब्बे'), 90)
t('hindi sentence with filler', parseSpokenNumber('आज पच्चीस पीस बने'), 25)
t('romanized paanch', parseSpokenNumber('paanch'), 5)
t('romanized pachchees', parseSpokenNumber('pachchees'), 25)

/* ---- Bengali ---- */
t('পাঁচ', parseSpokenNumber('পাঁচ'), 5)
t('পঁচিশ', parseSpokenNumber('পঁচিশ'), 25)
t('পঞ্চাশ', parseSpokenNumber('পঞ্চাশ'), 50)
t('উনপঞ্চাশ', parseSpokenNumber('উনপঞ্চাশ'), 49)
t('একশো', parseSpokenNumber('একশো'), 100)
t('দুই শত', parseSpokenNumber('দুই শত'), 200)
t('নব্বই', parseSpokenNumber('নব্বই'), 90)

/* ---- Punjabi ---- */
t('ਪੰਜ', parseSpokenNumber('ਪੰਜ'), 5)
t('ਪੱਚੀ', parseSpokenNumber('ਪੱਚੀ'), 25)
t('ਪੰਜਾਹ', parseSpokenNumber('ਪੰਜਾਹ'), 50)
t('ਉਨੰਜਾ', parseSpokenNumber('ਉਨੰਜਾ'), 49)
t('ਸੌ alone', parseSpokenNumber('ਸੌ'), 100)
t('ਦੋ ਸੌ', parseSpokenNumber('ਦੋ ਸੌ'), 200)
t('ਨੱਬੇ', parseSpokenNumber('ਨੱਬੇ'), 90)
t('ਹਜ਼ਾਰ (nukta in input)', parseSpokenNumber('ਇੱਕ ਹਜ਼ਾਰ'), 1000)

/* ---- Telugu ---- */
t('ఐదు', parseSpokenNumber('ఐదు'), 5)
t('ఇరవై ఐదు (compound)', parseSpokenNumber('ఇరవై ఐదు'), 25)
t('యాభై', parseSpokenNumber('యాభై'), 50)
t('వంద', parseSpokenNumber('వంద'), 100)
t('రెండు వందలు → రెండు వంద', parseSpokenNumber('రెండు వంద'), 200)
t('తొంభై', parseSpokenNumber('తొంభై'), 90)
t('వెయ్యి', parseSpokenNumber('వెయ్యి'), 1000)

/* ---- graceful failures ---- */
t('no number at all', parseSpokenNumber('no numbers here'), null)
t('empty transcript', parseSpokenNumber(''), null)
t('null transcript', parseSpokenNumber(null), null)
t('only filler', parseSpokenNumber('products pieces'), null)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
