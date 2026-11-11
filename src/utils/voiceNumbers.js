/**
 * voiceNumbers.js — spoken words → number, for the product-count mic.
 *
 * The worker can TYPE a count or TAP the mic and say it. Speech recognition
 * returns text ("पच्चीस", "twenty five", "125"…), and this module turns that
 * text into the integer it names, in any of the demo's five languages:
 * English, Hindi, Bengali, Punjabi and Telugu.
 *
 * How it works:
 *   1. normalizeSpeech()  — lowercase, strip punctuation, convert native
 *                           digits (०৫, ৫০, ੨੫, ౨౫…) to ASCII and drop the
 *                           nukta sign so ड़/ਜ਼ match their plain forms.
 *   2. digits in the text win ("125", "मुझे 50 चाहिए" → 125 / 50).
 *   3. otherwise every word is looked up in one merged word→value table
 *      (the five scripts never collide, so one map is enough). Unknown
 *      filler words ("pieces", "जमा", "and"…) are simply skipped.
 *   4. the values are combined: hundreds/thousands multiply, everything
 *      else adds — so "one hundred five" → 105 and "इक सौ पचास" → 150.
 *      A run of single digits is read as dictation: "one two five" → 125.
 *
 * Pure logic only (no window / no mic) so node tests can exercise it.
 */

/** BCP-47 locales the recogniser cycles through — the demo's five languages. */
export const SPEECH_LOCALES = ['en-IN', 'hi-IN', 'bn-IN', 'pa-IN', 'te-IN'];

/** UI language code (i18n.jsx) → the speech locale to try first. */
export const LOCALE_BY_LANG = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  pa: 'pa-IN',
  te: 'te-IN',
};

/* ### table-en */
const EN_WORDS = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

/* ### table-hi */
/* Hindi — every count 1-99 has its own word, so the table is complete.
   Keys are written WITHOUT the nukta (हजार not हज़ार) because
   normalizeSpeech() strips ़ before lookup. */
const HI_WORDS = {
  शून्य: 0,
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7,
  आठ: 8, नौ: 9, नौं: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, पन्द्रह: 15,
  सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  इक्कीस: 21, इकीस: 21, बाईस: 22, बाइस: 22, तेईस: 23, तेइस: 23,
  चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27, सत्ताइस: 27,
  अट्ठाईस: 28, अट्ठाइस: 28, उनतीस: 29, तीस: 30,
  इकतीस: 31, बत्तीस: 32, बतीस: 32, तैंतीस: 33, चौंतीस: 34, चौतीस: 34,
  पैंतीस: 35, छत्तीस: 36, छतीस: 36, सैंतीस: 37, अडतीस: 38, उनतालीस: 39,
  चालीस: 40,
  इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चवालीस: 44, पैंतालीस: 45,
  छियालीस: 46, सैंतालीस: 47, अडतालीस: 48, उनचास: 49, पचास: 50,
  इक्यावन: 51, बावन: 52, तिरपन: 53, चौवन: 54, पचपन: 55, छप्पन: 56,
  सत्तावन: 57, अट्ठावन: 58, अठावन: 58, उनसठ: 59, साठ: 60,
  इकसठ: 61, बासठ: 62, तिरसठ: 63, चौंसठ: 64, चौसठ: 64, पैंसठ: 65,
  छियासठ: 66, सडसठ: 67, अडसठ: 68, उनहत्तर: 69, सत्तर: 70,
  इकहत्तर: 71, बहत्तर: 72, तिहत्तर: 73, चौहत्तर: 74, पचहत्तर: 75,
  छिहत्तर: 76, सतहत्तर: 77, अठहत्तर: 78, उन्यासी: 79, उनयासी: 79,
  अस्सी: 80,
  इक्यासी: 81, बयासी: 82, तिरासी: 83, चौरासी: 84, पचासी: 85, छियासी: 86,
  सतासी: 87, अठासी: 88, नवासी: 89, नब्बे: 90,
  इक्यानवे: 91, बानवे: 92, तिरानवे: 93, चौरानवे: 94, पचानवे: 95,
  छियानवे: 96, सत्तानवे: 97, अट्ठानवे: 98, अठानवे: 98, निन्यानवे: 99,
  सौ: 100, हजार: 1000, लाख: 100000,
  /* Roman-script Hindi — an en-IN recogniser often transliterates Hindi
     speech instead of translating it, so the common counts are covered. */
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
  chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17,
  atharah: 18, unnees: 19, bees: 20, pachchees: 25, pachees: 25,
  tees: 30, chaalees: 40, chalis: 40, pachaas: 50, saath: 60,
  sattar: 70, assi: 80, nabbe: 90, sau: 100, hazaar: 1000,
};

/* ### table-bn */
/* Bengali — like Hindi, 1-99 each have a distinct word. ড়/ঢ়/য় are real
   letters (not nukta), so they are kept intact by normalizeSpeech(). */
const BN_WORDS = {
  শূন্য: 0,
  এক: 1, দুই: 2, তিন: 3, চার: 4, পাঁচ: 5, পাচ: 5, ছয়: 6, সাত: 7,
  আট: 8, নয়: 9, নৌ: 9, দশ: 10,
  এগারো: 11, বারো: 12, তেরো: 13, চৌদ্দ: 14, পনেরো: 15, ষোলো: 16,
  সোলো: 16, সতেরো: 17, আঠারো: 18, উনিশ: 19, উন্নিশ: 19, বিশ: 20,
  একুশ: 21, বাইশ: 22, তেইশ: 23, তেয়াশ: 23, চব্বিশ: 24, পঁচিশ: 25,
  পাঁচিশ: 25, ছাব্বিশ: 26, সাতাশ: 27, আটাশ: 28, উনত্রিশ: 29, ত্রিশ: 30,
  একত্রিশ: 31, বত্রিশ: 32, তেত্রিশ: 33, চৌত্রিশ: 34, পঁয়ত্রিশ: 35,
  ছত্রিশ: 36, সাঁইত্রিশ: 37, সাইত্রিশ: 37, আটত্রিশ: 38,
  উনচল্লিশ: 39, চল্লিশ: 40,
  একচল্লিশ: 41, বিয়াল্লিশ: 42, তেতাল্লিশ: 43, চুয়াল্লিশ: 44,
  পঁয়তাল্লিশ: 45, ছেচল্লিশ: 46, সাতচল্লিশ: 47, আটচল্লিশ: 48,
  উনপঞ্চাশ: 49, পঞ্চাশ: 50,
  একান্ন: 51, বায়ান্ন: 52, তিপ্পান্ন: 53, চুয়ান্ন: 54, পঞ্চান্ন: 55,
  ছাপ্পান্ন: 56, সাতান্ন: 57, আটান্ন: 58, উনষাট: 59, ষাট: 60,
  একষট্টি: 61, বাষট্টি: 62, তেষট্টি: 63, চৌষট্টি: 64, পঁয়ষট্টি: 65,
  ছেষট্টি: 66, সাতষট্টি: 67, আটষট্টি: 68, উনসত্তর: 69, সত্তর: 70,
  একাত্তর: 71, বাহাত্তর: 72, তিয়াত্তর: 73, চুয়াত্তর: 74,
  পঁচাত্তর: 75, ছিয়াত্তর: 76, সাতাত্তর: 77, আটাত্তর: 78,
  উনআশী: 79, আশী: 80,
  একাশী: 81, বিরাশী: 82, বিয়াশী: 82, তিরাশী: 83, চুরাশী: 84,
  পঁচাশী: 85, ছিয়াশী: 86, সাতাশী: 87, আটাশী: 88, উননব্বই: 89,
  নব্বই: 90,
  একানব্বই: 91, বিরানব্বই: 92, তিরানব্বই: 93, চুরানব্বই: 94,
  পঁচানব্বই: 95, ছিয়ানব্বই: 96, সাতানব্বই: 97, আটানব্বই: 98,
  নিরানব্বই: 99,
  শত: 100, একশো: 100, হাজার: 1000,
};

/* ### table-pa */
/* Punjabi (Gurmukhi) — 1-99 each have a distinct word. Keys are written
   WITHOUT the nukta (ਹਜਾਰ not ਹਜ਼ਾਰ) — normalizeSpeech() strips ਼. */
const PA_WORDS = {
  ਸਿਫ਼ਰ: 0, ਸਿਫਰ: 0,
  ਇੱਕ: 1, ਦੋ: 2, ਤਿੰਨ: 3, ਚਾਰ: 4, ਪੰਜ: 5, ਛੇ: 6, ਸੱਤ: 7, ਅੱਠ: 8,
  ਨੌਂ: 9, ਨੌ: 9, ਦਸ: 10,
  ਗਿਆਰਾਂ: 11, ਬਾਰਾਂ: 12, ਤੇਰਾਂ: 13, ਚੌਦਾਂ: 14, ਪੰਦਰਾਂ: 15,
  ਸੋਲਾਂ: 16, ਸਤਾਰਾਂ: 17, ਅਠਾਰਾਂ: 18, ਉੱਨੀ: 19, ਵੀਹ: 20,
  ਇੱਕੀ: 21, ਬਾਈ: 22, ਤੇਈ: 23, ਚੌਵੀ: 24, ਪੱਚੀ: 25, ਛੱਬੀ: 26,
  ਸਤਾਈ: 27, ਅਠਾਈ: 28, ਉਨੱਤੀ: 29, ਤੀਹ: 30,
  ਇਕੱਤੀ: 31, ਬੱਤੀ: 32, ਤੇਂਤੀ: 33, ਚੌਂਤੀ: 34, ਪੈਂਤੀ: 35, ਛੱਤੀ: 36,
  ਸੈਂਤੀ: 37, ਅੜਤੀ: 38, ਉਨਤਾਲੀ: 39, ਚਾਲੀ: 40,
  ਇਕਤਾਲੀ: 41, ਬਿਆਲੀ: 42, ਤਿਆਲੀ: 43, ਚੁਆਲੀ: 44, ਪੰਤਾਲੀ: 45,
  ਛਿਆਲੀ: 46, ਸੰਤਾਲੀ: 47, ਅਠਤਾਲੀ: 48, ਉਨੰਜਾ: 49, ਪੰਜਾਹ: 50,
  ਇਕਿਆਵਨ: 51, ਬਿਆਵਨ: 52, ਤਿਰਪਨ: 53, ਚੁਰਪਨ: 54, ਪਚਪਨ: 55,
  ਛਿਆਪਨ: 56, ਸਤਾਪਨ: 57, ਅਠਾਪਨ: 58, ਉਨਾਹਠ: 59, ਸਠ: 60,
  ਇਕਾਹਠ: 61, ਬਾਹਠ: 62, ਤਿਆਹਠ: 63, ਚੌਆਹਠ: 64, ਪੈਂਹਠ: 65,
  ਛਿਆਹਠ: 66, ਸੜਿਆਹਠ: 67, ਅੜਿਆਹਠ: 68, ਉਨੱਤਰ: 69, ਸੱਤਰ: 70,
  ਇਹੱਤਰ: 71, ਬਹੱਤਰ: 72, ਤਿਹੱਤਰ: 73, ਚੌਹੱਤਰ: 74, ਪੰਜਹੱਤਰ: 75,
  ਛਿਹੱਤਰ: 76, ਸਤਹੱਤਰ: 77, ਅਠਹੱਤਰ: 78, ਉਨੱਸੀ: 79, ਅੱਸੀ: 80,
  ਇੱਕਾਸੀ: 81, ਬਿਆਸੀ: 82, ਤਿਰਾਸੀ: 83, ਚੌਰਾਸੀ: 84, ਪਚਾਸੀ: 85,
  ਛਿਆਸੀ: 86, ਸਤਾਸੀ: 87, ਅਠਾਸੀ: 88, ਨਵਾਸੀ: 89, ਨੱਬੇ: 90,
  ਇੱਕਾਨਵੇਂ: 91, ਬਾਨਵੇਂ: 92, ਤਿਰਾਨਵੇਂ: 93, ਚੌਰਾਨਵੇਂ: 94,
  ਪਚਾਨਵੇਂ: 95, ਛਿਆਨਵੇਂ: 96, ਸਤਾਨਵੇਂ: 97, ਅਠਾਨਵੇਂ: 98,
  ਨਿੱਨਵੇਂ: 99, ਨੜਿੱਨਵੇਂ: 99,
  ਸੌ: 100, ਹਜਾਰ: 1000,
};

/* ### table-te */
/* Telugu — 11-19 have their own words, 20/30/…/90 are round tens, and
   everything between is spoken additively ("ఇరవై ఐదు" = 20 + 5 = 25),
   which the combiner already handles. */
const TE_WORDS = {
  సున్నా: 0, సున్న: 0,
  ఒకటి: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5, ఆరు: 6, ఏడు: 7,
  ఎనిమిది: 8, తొమ్మిది: 9, పది: 10,
  పదకొండు: 11, పన్నెండు: 12, పదమూడు: 13, పదుమూడు: 13,
  పధ్నాలుగు: 14, పద్నాలుగు: 14, పదిహేను: 15, పదహారు: 16,
  పదిహేడు: 17, పద్దెనిమిది: 18, పందొమ్మిది: 19, ఇరవై: 20,
  ఇరువది: 20,
  ముప్పై: 30, మువ్వై: 30, నలభై: 40, యాభై: 50, అరవై: 60, డెబ్భై: 70,
  ఎనభై: 80, తొంభై: 90, తొమ్భై: 90,
  వంద: 100, నూఱు: 100, వెయ్యి: 1000,
};

/** One merged map — the five scripts never share a word, so lookups are safe. */
const WORDS = { ...EN_WORDS, ...HI_WORDS, ...BN_WORDS, ...PA_WORDS, ...TE_WORDS };

/**
 * Clean a raw transcript into comparable tokens' source text:
 * lowercase, nukta-free, ASCII digits, no punctuation.
 */
export function normalizeSpeech(text) {
  return String(text || '')
    .normalize('NFKD')
    // Devanagari ़ + Gurmukhi ਼ only — Bengali ় is a real letter (ড়), keep it.
    .replace(/[\u093C\u0A3C]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x966)) // ०-९
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x9E6)) // ০-৯
    .replace(/[\u0A66-\u0A6F]/g, (d) => String(d.charCodeAt(0) - 0xA66)) // ੦-੯
    .replace(/[\u0C66-\u0C6F]/g, (d) => String(d.charCodeAt(0) - 0xC66)) // ౦-౯
    // \p{M} matters: Indic vowel signs (matras) are category M, not L —
  // without it "पाँच" would be shredded into "प ँ च" and never match.
  .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The number spoken in `raw`, or null when no number was heard.
 * NOTE: 0 is a valid answer ("zero") — callers must test against null,
 * never against falsiness.
 */
export function parseSpokenNumber(raw) {
  const text = normalizeSpeech(raw);
  if (!text) return null;

  // Digits anywhere in the transcript are the most reliable reading.
  const digits = text.match(/\d{1,6}/);
  if (digits) return Number(digits[0]);

  const values = [];
  for (const token of text.split(' ')) {
    const value = WORDS[token];
    if (value !== undefined) values.push(value);
    // unknown words (filler, product names…) are skipped
  }
  if (values.length === 0) return null;

  // A run of single digits is dictation, not addition: "one two five" → 125.
  if (values.length > 1 && values.every((v) => v >= 0 && v <= 9)) {
    return Number(values.join(''));
  }

  // hundreds / thousands multiply what came before, the rest adds up.
  let total = 0;
  let current = 0;
  for (const value of values) {
    if (value >= 1000) {
      total += (current || 1) * value;
      current = 0;
    } else if (value >= 100) {
      current = (current || 1) * value;
    } else {
      current += value;
    }
  }
  return total + current;
}
