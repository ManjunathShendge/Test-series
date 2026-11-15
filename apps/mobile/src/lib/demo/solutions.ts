import type { Bilingual } from './types';

/**
 * Keys and worked solutions, kept apart from the paper on purpose. In the real
 * system this material comes from a separate authenticated review endpoint
 * after the attempt is terminal; nothing here is ever merged into `bank.ts`.
 */

export interface SolutionEntry {
  correctOptionId: string;
  solution: Bilingual;
  /** Cohort aggregates shown in review, per docs/RESULTS.md. */
  averageTimeSeconds: number;
  percentCorrect: number;
}

const s = (correctOptionId: string, en: string, hi: string | undefined, averageTimeSeconds: number, percentCorrect: number): SolutionEntry => ({
  correctOptionId,
  solution: hi === undefined ? { en } : { en, hi },
  averageTimeSeconds,
  percentCorrect,
});

export const solutions: Record<string, SolutionEntry> = {
  r1: s('B', 'Differences are 4, 6, 8, 10, so the next difference is 12: 30 + 12 = 42.', 'अंतर 4, 6, 8, 10 हैं, अतः अगला अंतर 12 है: 30 + 12 = 42।', 38, 81),
  r2: s('C', 'Apple, mango and banana are fruits; potato is a vegetable.', 'सेब, आम और केला फल हैं; आलू एक सब्ज़ी है।', 14, 94),
  r3: s('C', 'D = 4, O = 15, G = 7. Sum = 26.', 'D = 4, O = 15, G = 7। योग = 26।', 41, 72),
  r4: s('A', 'North 5, East 3, then South 5 brings him level with the start, 3 km to the east.', 'उत्तर 5, पूर्व 3, फिर दक्षिण 5 उसे प्रारंभ बिंदु की सीध में 3 किमी पूर्व में लाता है।', 52, 66),
  r5: s('B', "Grandfather's only son is Ravi's father; the father's daughter is Ravi's sister.", 'दादा का इकलौता पुत्र रवि का पिता है; पिता की पुत्री रवि की बहन है।', 44, 70),
  r6: s('C', 'A book is made up of pages; a tree is covered in leaves.', 'पुस्तक पृष्ठों से बनी होती है; वृक्ष पत्तियों से ढका होता है।', 18, 88),
  r7: s('A', 'Each letter moves one step forward: I→J, N→O, K→L.', 'प्रत्येक अक्षर एक स्थान आगे बढ़ता है: I→J, N→O, K→L।', 29, 83),
  r8: s('D', 'Some tools being heavy says nothing about pens; all tools being pens reverses the first statement. Neither follows.', 'कुछ उपकरण भारी होने से पेन के बारे में कुछ नहीं कहा जा सकता; सभी उपकरण पेन होना पहले कथन का उलटा है। कोई अनुसरण नहीं करता।', 61, 48),
  r9: s('C', 'At 3:00 the hands are a quarter turn apart: 90°.', '3:00 पर सुइयाँ एक चौथाई चक्र दूर हैं: 90°।', 12, 92),
  r10: s('A', 'At least one game: 25 + 20 − 8 = 37. Neither: 40 − 37 = 3.', 'कम से कम एक खेल: 25 + 20 − 8 = 37। कोई नहीं: 40 − 37 = 3।', 55, 63),

  g1: s('C', 'Canberra is the capital; Sydney and Melbourne are larger cities.', 'कैनबरा राजधानी है; सिडनी और मेलबर्न बड़े शहर हैं।', 11, 77),
  g2: s('B', 'Nehru wrote it in Ahmednagar Fort prison during 1942-46.', 'नेहरू ने इसे 1942-46 के दौरान अहमदनगर किले की जेल में लिखा।', 13, 85),
  g3: s('C', 'Adopted on 26 November 1949, it came into force on 26 January 1950.', '26 नवंबर 1949 को अंगीकृत, यह 26 जनवरी 1950 को लागू हुआ।', 9, 91),
  g4: s('B', "Au, from the Latin 'aurum'. Ag is silver.", "Au, लैटिन 'aurum' से। Ag चाँदी है।", 8, 89),
  g5: s('C', 'The Kosi changes course frequently and floods north Bihar.', 'कोसी बार-बार मार्ग बदलती है और उत्तर बिहार में बाढ़ लाती है।', 15, 74),
  g6: s('B', 'Pratibha Patil served from 2007 to 2012.', 'प्रतिभा पाटिल ने 2007 से 2012 तक कार्य किया।', 10, 86),
  g7: s('B', 'Article 21: protection of life and personal liberty.', 'अनुच्छेद 21: जीवन और व्यक्तिगत स्वतंत्रता का संरक्षण।', 12, 79),
  g8: s('C', 'Scurvy results from lack of ascorbic acid (Vitamin C).', 'स्कर्वी एस्कॉर्बिक अम्ल (विटामिन C) की कमी से होता है।', 10, 82),
  g9: s('B', 'RBI moved its central office from Kolkata to Mumbai in 1937.', 'RBI ने 1937 में अपना केंद्रीय कार्यालय कोलकाता से मुंबई स्थानांतरित किया।', 9, 88),
  g10: s('C', 'Gujarat, Rajasthan, Madhya Pradesh, Chhattisgarh, Jharkhand, West Bengal, Tripura and Mizoram.', 'गुजरात, राजस्थान, मध्य प्रदेश, छत्तीसगढ़, झारखंड, पश्चिम बंगाल, त्रिपुरा और मिज़ोरम।', 21, 58),

  q1: s('C', '15% of 240 = 0.15 × 240 = 36.', '240 का 15% = 0.15 × 240 = 36।', 22, 90),
  q2: s('B', 'Sum 1..10 = 55; 55 ÷ 10 = 5.5.', '1..10 का योग = 55; 55 ÷ 10 = 5.5।', 19, 84),
  q3: s('B', 'Speed = 150 m / 15 s = 10 m/s = 10 × 18/5 = 36 km/h.', 'गति = 150 मी / 15 से = 10 मी/से = 10 × 18/5 = 36 किमी/घंटा।', 47, 71),
  q4: s('B', 'SI = P × R × T / 100 = 5000 × 8 × 3 / 100 = ₹1,200.', 'SI = P × R × T / 100 = 5000 × 8 × 3 / 100 = ₹1,200।', 31, 86),
  q5: s('C', '3x = 18, so x = 6.', '3x = 18, अतः x = 6।', 16, 93),
  q6: s('C', 'Parts total 8; one part = 64 ÷ 8 = 8. Larger = 5 × 8 = 40.', 'कुल भाग 8; एक भाग = 64 ÷ 8 = 8। बड़ी संख्या = 5 × 8 = 40।', 33, 80),
  q7: s('B', '12 = 2²·3, 18 = 2·3², 24 = 2³·3. LCM = 2³·3² = 72.', '12 = 2²·3, 18 = 2·3², 24 = 2³·3। ल.स. = 2³·3² = 72।', 36, 76),
  q8: s('B', 'Area = πr² = (22/7) × 49 = 154 cm².', 'क्षेत्रफल = πr² = (22/7) × 49 = 154 सेमी²।', 27, 85),
  q9: s('C', 'SP = 500 × 1.20 = ₹600.', 'SP = 500 × 1.20 = ₹600।', 20, 89),
  q10: s('B', '0.0049 = 49 × 10⁻⁴, so the root is 7 × 10⁻² = 0.07.', '0.0049 = 49 × 10⁻⁴, अतः वर्गमूल 7 × 10⁻² = 0.07।', 25, 73),

  e1: s('B', 'Abundant means existing in large quantities: plentiful.', undefined, 12, 87),
  e2: s('B', 'Transparent (see-through) is opposed by opaque (not see-through).', undefined, 11, 84),
  e3: s('B', "Third-person singular 'she' takes 'doesn't', not 'don't'.", undefined, 24, 69),
  e4: s('C', "'Since' marks the starting point of a period that continues to now.", undefined, 15, 78),
  e5: s('B', 'A polyglot speaks several languages; a linguist studies language.', undefined, 17, 62),
  e6: s('B', 'To hit the nail on the head is to be exactly right.', undefined, 13, 81),
  e7: s('C', 'Double c, double m: accommodation.', undefined, 14, 57),
  e8: s('B', 'Simple past active becomes was/were + past participle: was built.', undefined, 26, 75),
  e9: s('C', "'Neither of' is singular, so the verb is 'was'.", undefined, 22, 54),
  e10: s('B', 'Candid means truthful and straightforward: frank.', undefined, 12, 80),
};
