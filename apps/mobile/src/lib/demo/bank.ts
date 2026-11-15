import type { BankKey, PaperQuestion } from './types';

/**
 * Key-free question bank, grouped by section type. Option order is fixed and
 * option IDs are stable, so a language switch preserves the selection. The
 * English section is English-only, as in the real exams.
 */

type BankQuestion = Omit<PaperQuestion, 'sectionId'>;

const o = (en: string, hi?: string) => (hi === undefined ? { en } : { en, hi });

const reasoning: BankQuestion[] = [
  {
    id: 'r1',
    topic: 'Number Series',
    stem: o('Find the next term: 2, 6, 12, 20, 30, ?', 'अगला पद ज्ञात करें: 2, 6, 12, 20, 30, ?'),
    options: [
      { id: 'A', text: o('40') },
      { id: 'B', text: o('42') },
      { id: 'C', text: o('44') },
      { id: 'D', text: o('46') },
    ],
  },
  {
    id: 'r2',
    topic: 'Classification',
    stem: o('Choose the odd one out.', 'असंगत को चुनें।'),
    options: [
      { id: 'A', text: o('Apple', 'सेब') },
      { id: 'B', text: o('Mango', 'आम') },
      { id: 'C', text: o('Potato', 'आलू') },
      { id: 'D', text: o('Banana', 'केला') },
    ],
  },
  {
    id: 'r3',
    topic: 'Coding-Decoding',
    stem: o(
      'If each letter is replaced by its position in the alphabet and summed, CAT = 24. What is DOG?',
      'यदि प्रत्येक अक्षर को वर्णमाला में उसके स्थान से बदलकर जोड़ा जाए तो CAT = 24 है। DOG का मान क्या होगा?',
    ),
    options: [
      { id: 'A', text: o('24') },
      { id: 'B', text: o('25') },
      { id: 'C', text: o('26') },
      { id: 'D', text: o('27') },
    ],
  },
  {
    id: 'r4',
    topic: 'Direction Sense',
    stem: o(
      'A man walks 5 km north, turns right and walks 3 km, then turns right again and walks 5 km. How far and in which direction is he from the start?',
      'एक व्यक्ति 5 किमी उत्तर चलता है, दाएँ मुड़कर 3 किमी चलता है, फिर दाएँ मुड़कर 5 किमी चलता है। वह प्रारंभिक बिंदु से कितनी दूर और किस दिशा में है?',
    ),
    options: [
      { id: 'A', text: o('3 km East', '3 किमी पूर्व') },
      { id: 'B', text: o('3 km West', '3 किमी पश्चिम') },
      { id: 'C', text: o('8 km North', '8 किमी उत्तर') },
      { id: 'D', text: o('5 km South', '5 किमी दक्षिण') },
    ],
  },
  {
    id: 'r5',
    topic: 'Blood Relations',
    stem: o(
      "Pointing to a photograph, Ravi said, 'She is the daughter of my grandfather's only son.' How is the woman related to Ravi?",
      "एक तस्वीर की ओर इशारा करते हुए रवि ने कहा, 'वह मेरे दादा के इकलौते पुत्र की पुत्री है।' वह महिला रवि से किस प्रकार संबंधित है?",
    ),
    options: [
      { id: 'A', text: o('Mother', 'माता') },
      { id: 'B', text: o('Sister', 'बहन') },
      { id: 'C', text: o('Aunt', 'बुआ') },
      { id: 'D', text: o('Cousin', 'चचेरी बहन') },
    ],
  },
  {
    id: 'r6',
    topic: 'Analogy',
    stem: o('Book : Pages :: Tree : ?', 'पुस्तक : पृष्ठ :: वृक्ष : ?'),
    options: [
      { id: 'A', text: o('Roots', 'जड़ें') },
      { id: 'B', text: o('Forest', 'वन') },
      { id: 'C', text: o('Leaves', 'पत्तियाँ') },
      { id: 'D', text: o('Wood', 'लकड़ी') },
    ],
  },
  {
    id: 'r7',
    topic: 'Coding-Decoding',
    stem: o('In a certain code, PEN is written as QFO. How is INK written in that code?', 'एक निश्चित कूट में PEN को QFO लिखा जाता है। उसी कूट में INK को कैसे लिखा जाएगा?'),
    options: [
      { id: 'A', text: o('JOL') },
      { id: 'B', text: o('HMJ') },
      { id: 'C', text: o('JOK') },
      { id: 'D', text: o('IOL') },
    ],
  },
  {
    id: 'r8',
    topic: 'Syllogism',
    stem: o(
      'Statements: All pens are tools. Some tools are heavy. Conclusions: I. Some pens are heavy. II. All tools are pens.',
      'कथन: सभी पेन उपकरण हैं। कुछ उपकरण भारी हैं। निष्कर्ष: I. कुछ पेन भारी हैं। II. सभी उपकरण पेन हैं।',
    ),
    options: [
      { id: 'A', text: o('Only I follows', 'केवल I अनुसरण करता है') },
      { id: 'B', text: o('Only II follows', 'केवल II अनुसरण करता है') },
      { id: 'C', text: o('Both follow', 'दोनों अनुसरण करते हैं') },
      { id: 'D', text: o('Neither follows', 'कोई अनुसरण नहीं करता') },
    ],
  },
  {
    id: 'r9',
    topic: 'Clocks',
    stem: o('What is the angle between the hour and minute hands at 3:00?', '3:00 बजे घंटे और मिनट की सुइयों के बीच का कोण क्या है?'),
    options: [
      { id: 'A', text: o('60°') },
      { id: 'B', text: o('75°') },
      { id: 'C', text: o('90°') },
      { id: 'D', text: o('120°') },
    ],
  },
  {
    id: 'r10',
    topic: 'Venn Diagrams',
    stem: o(
      'In a class of 40 students, 25 play cricket, 20 play football and 8 play both. How many play neither?',
      '40 विद्यार्थियों की एक कक्षा में 25 क्रिकेट, 20 फुटबॉल और 8 दोनों खेलते हैं। कितने विद्यार्थी कोई भी खेल नहीं खेलते?',
    ),
    options: [
      { id: 'A', text: o('3') },
      { id: 'B', text: o('5') },
      { id: 'C', text: o('7') },
      { id: 'D', text: o('13') },
    ],
  },
];

const ga: BankQuestion[] = [
  {
    id: 'g1',
    topic: 'World Geography',
    stem: o('What is the capital of Australia?', 'ऑस्ट्रेलिया की राजधानी क्या है?'),
    options: [
      { id: 'A', text: o('Sydney', 'सिडनी') },
      { id: 'B', text: o('Melbourne', 'मेलबर्न') },
      { id: 'C', text: o('Canberra', 'कैनबरा') },
      { id: 'D', text: o('Perth', 'पर्थ') },
    ],
  },
  {
    id: 'g2',
    topic: 'Books & Authors',
    stem: o("Who wrote 'The Discovery of India'?", "'द डिस्कवरी ऑफ इंडिया' किसने लिखी?"),
    options: [
      { id: 'A', text: o('Mahatma Gandhi', 'महात्मा गांधी') },
      { id: 'B', text: o('Jawaharlal Nehru', 'जवाहरलाल नेहरू') },
      { id: 'C', text: o('Rabindranath Tagore', 'रवींद्रनाथ टैगोर') },
      { id: 'D', text: o('B. R. Ambedkar', 'बी. आर. अंबेडकर') },
    ],
  },
  {
    id: 'g3',
    topic: 'Indian Polity',
    stem: o('The Constitution of India came into force on', 'भारत का संविधान किस दिन लागू हुआ?'),
    options: [
      { id: 'A', text: o('15 August 1947', '15 अगस्त 1947') },
      { id: 'B', text: o('26 November 1949', '26 नवंबर 1949') },
      { id: 'C', text: o('26 January 1950', '26 जनवरी 1950') },
      { id: 'D', text: o('2 October 1950', '2 अक्टूबर 1950') },
    ],
  },
  {
    id: 'g4',
    topic: 'Chemistry',
    stem: o('What is the chemical symbol of gold?', 'सोने का रासायनिक प्रतीक क्या है?'),
    options: [
      { id: 'A', text: o('Ag') },
      { id: 'B', text: o('Au') },
      { id: 'C', text: o('Gd') },
      { id: 'D', text: o('Go') },
    ],
  },
  {
    id: 'g5',
    topic: 'Indian Geography',
    stem: o("Which river is known as the 'Sorrow of Bihar'?", "किस नदी को 'बिहार का शोक' कहा जाता है?"),
    options: [
      { id: 'A', text: o('Gandak', 'गंडक') },
      { id: 'B', text: o('Son', 'सोन') },
      { id: 'C', text: o('Kosi', 'कोसी') },
      { id: 'D', text: o('Damodar', 'दामोदर') },
    ],
  },
  {
    id: 'g6',
    topic: 'Indian Polity',
    stem: o('Who was the first woman President of India?', 'भारत की पहली महिला राष्ट्रपति कौन थीं?'),
    options: [
      { id: 'A', text: o('Indira Gandhi', 'इंदिरा गांधी') },
      { id: 'B', text: o('Pratibha Patil', 'प्रतिभा पाटिल') },
      { id: 'C', text: o('Sarojini Naidu', 'सरोजिनी नायडू') },
      { id: 'D', text: o('Droupadi Murmu', 'द्रौपदी मुर्मू') },
    ],
  },
  {
    id: 'g7',
    topic: 'Indian Polity',
    stem: o('Article 21 of the Indian Constitution deals with', 'भारतीय संविधान का अनुच्छेद 21 किससे संबंधित है?'),
    options: [
      { id: 'A', text: o('Right to equality', 'समानता का अधिकार') },
      { id: 'B', text: o('Right to life and personal liberty', 'जीवन और व्यक्तिगत स्वतंत्रता का अधिकार') },
      { id: 'C', text: o('Right to education', 'शिक्षा का अधिकार') },
      { id: 'D', text: o('Freedom of religion', 'धर्म की स्वतंत्रता') },
    ],
  },
  {
    id: 'g8',
    topic: 'Biology',
    stem: o('Deficiency of Vitamin C causes', 'विटामिन C की कमी से कौन सा रोग होता है?'),
    options: [
      { id: 'A', text: o('Rickets', 'रिकेट्स') },
      { id: 'B', text: o('Beriberi', 'बेरीबेरी') },
      { id: 'C', text: o('Scurvy', 'स्कर्वी') },
      { id: 'D', text: o('Night blindness', 'रतौंधी') },
    ],
  },
  {
    id: 'g9',
    topic: 'Economy',
    stem: o('The headquarters of the Reserve Bank of India is in', 'भारतीय रिज़र्व बैंक का मुख्यालय कहाँ है?'),
    options: [
      { id: 'A', text: o('New Delhi', 'नई दिल्ली') },
      { id: 'B', text: o('Mumbai', 'मुंबई') },
      { id: 'C', text: o('Kolkata', 'कोलकाता') },
      { id: 'D', text: o('Chennai', 'चेन्नई') },
    ],
  },
  {
    id: 'g10',
    topic: 'Indian Geography',
    stem: o('The Tropic of Cancer passes through how many Indian states?', 'कर्क रेखा भारत के कितने राज्यों से होकर गुजरती है?'),
    options: [
      { id: 'A', text: o('6') },
      { id: 'B', text: o('7') },
      { id: 'C', text: o('8') },
      { id: 'D', text: o('9') },
    ],
  },
];

const quant: BankQuestion[] = [
  {
    id: 'q1',
    topic: 'Percentage',
    stem: o('What is 15% of 240?', '240 का 15% क्या है?'),
    options: [
      { id: 'A', text: o('32') },
      { id: 'B', text: o('34') },
      { id: 'C', text: o('36') },
      { id: 'D', text: o('38') },
    ],
  },
  {
    id: 'q2',
    topic: 'Average',
    stem: o('The average of the first 10 natural numbers is', 'प्रथम 10 प्राकृतिक संख्याओं का औसत है'),
    options: [
      { id: 'A', text: o('5') },
      { id: 'B', text: o('5.5') },
      { id: 'C', text: o('6') },
      { id: 'D', text: o('6.5') },
    ],
  },
  {
    id: 'q3',
    topic: 'Time, Speed & Distance',
    stem: o(
      'A 150 m long train crosses a pole in 15 seconds. What is its speed in km/h?',
      '150 मीटर लंबी एक ट्रेन 15 सेकंड में एक खंभे को पार करती है। उसकी गति किमी/घंटा में क्या है?',
    ),
    options: [
      { id: 'A', text: o('30') },
      { id: 'B', text: o('36') },
      { id: 'C', text: o('40') },
      { id: 'D', text: o('45') },
    ],
  },
  {
    id: 'q4',
    topic: 'Simple Interest',
    stem: o(
      'Find the simple interest on ₹5,000 at 8% per annum for 3 years.',
      '₹5,000 पर 8% वार्षिक दर से 3 वर्ष का साधारण ब्याज ज्ञात करें।',
    ),
    options: [
      { id: 'A', text: o('₹1,000') },
      { id: 'B', text: o('₹1,200') },
      { id: 'C', text: o('₹1,400') },
      { id: 'D', text: o('₹1,500') },
    ],
  },
  {
    id: 'q5',
    topic: 'Algebra',
    stem: o('If 3x − 7 = 11, then x =', 'यदि 3x − 7 = 11, तो x ='),
    options: [
      { id: 'A', text: o('4') },
      { id: 'B', text: o('5') },
      { id: 'C', text: o('6') },
      { id: 'D', text: o('7') },
    ],
  },
  {
    id: 'q6',
    topic: 'Ratio & Proportion',
    stem: o('Two numbers are in the ratio 3 : 5 and their sum is 64. The larger number is', 'दो संख्याएँ 3 : 5 के अनुपात में हैं और उनका योग 64 है। बड़ी संख्या है'),
    options: [
      { id: 'A', text: o('24') },
      { id: 'B', text: o('32') },
      { id: 'C', text: o('40') },
      { id: 'D', text: o('48') },
    ],
  },
  {
    id: 'q7',
    topic: 'Number System',
    stem: o('The LCM of 12, 18 and 24 is', '12, 18 और 24 का लघुत्तम समापवर्त्य है'),
    options: [
      { id: 'A', text: o('48') },
      { id: 'B', text: o('72') },
      { id: 'C', text: o('96') },
      { id: 'D', text: o('144') },
    ],
  },
  {
    id: 'q8',
    topic: 'Mensuration',
    stem: o('The area of a circle of radius 7 cm is (take π = 22/7)', '7 सेमी त्रिज्या वाले वृत्त का क्षेत्रफल है (π = 22/7 लें)'),
    options: [
      { id: 'A', text: o('44 cm²') },
      { id: 'B', text: o('154 cm²') },
      { id: 'C', text: o('308 cm²') },
      { id: 'D', text: o('616 cm²') },
    ],
  },
  {
    id: 'q9',
    topic: 'Profit & Loss',
    stem: o('An article costing ₹500 is sold at a profit of 20%. The selling price is', '₹500 की लागत वाली वस्तु 20% लाभ पर बेची जाती है। विक्रय मूल्य है'),
    options: [
      { id: 'A', text: o('₹550') },
      { id: 'B', text: o('₹580') },
      { id: 'C', text: o('₹600') },
      { id: 'D', text: o('₹620') },
    ],
  },
  {
    id: 'q10',
    topic: 'Simplification',
    stem: o('√0.0049 = ?', '√0.0049 = ?'),
    options: [
      { id: 'A', text: o('0.007') },
      { id: 'B', text: o('0.07') },
      { id: 'C', text: o('0.7') },
      { id: 'D', text: o('7') },
    ],
  },
];

const english: BankQuestion[] = [
  {
    id: 'e1',
    topic: 'Synonyms',
    stem: o("Choose the word closest in meaning to 'ABUNDANT'."),
    options: [
      { id: 'A', text: o('Scarce') },
      { id: 'B', text: o('Plentiful') },
      { id: 'C', text: o('Modest') },
      { id: 'D', text: o('Fragile') },
    ],
  },
  {
    id: 'e2',
    topic: 'Antonyms',
    stem: o("Choose the word opposite in meaning to 'TRANSPARENT'."),
    options: [
      { id: 'A', text: o('Clear') },
      { id: 'B', text: o('Opaque') },
      { id: 'C', text: o('Lucid') },
      { id: 'D', text: o('Visible') },
    ],
  },
  {
    id: 'e3',
    topic: 'Spotting Errors',
    stem: o("Identify the part with an error: 'She (A) / don't like (B) / coffee in the morning. (C) / No error (D)'"),
    options: [
      { id: 'A', text: o('She') },
      { id: 'B', text: o("don't like") },
      { id: 'C', text: o('coffee in the morning.') },
      { id: 'D', text: o('No error') },
    ],
  },
  {
    id: 'e4',
    topic: 'Fill in the Blanks',
    stem: o('He has been working here ______ 2015.'),
    options: [
      { id: 'A', text: o('for') },
      { id: 'B', text: o('from') },
      { id: 'C', text: o('since') },
      { id: 'D', text: o('by') },
    ],
  },
  {
    id: 'e5',
    topic: 'One Word Substitution',
    stem: o('A person who can speak many languages'),
    options: [
      { id: 'A', text: o('Linguist') },
      { id: 'B', text: o('Polyglot') },
      { id: 'C', text: o('Orator') },
      { id: 'D', text: o('Bilingual') },
    ],
  },
  {
    id: 'e6',
    topic: 'Idioms & Phrases',
    stem: o("What does the idiom 'to hit the nail on the head' mean?"),
    options: [
      { id: 'A', text: o('To injure oneself') },
      { id: 'B', text: o('To do or say exactly the right thing') },
      { id: 'C', text: o('To work very hard') },
      { id: 'D', text: o('To start a fight') },
    ],
  },
  {
    id: 'e7',
    topic: 'Spelling',
    stem: o('Choose the correctly spelt word.'),
    options: [
      { id: 'A', text: o('Accomodation') },
      { id: 'B', text: o('Acommodation') },
      { id: 'C', text: o('Accommodation') },
      { id: 'D', text: o('Accomadation') },
    ],
  },
  {
    id: 'e8',
    topic: 'Active & Passive Voice',
    stem: o("Change to passive voice: 'They built the bridge.'"),
    options: [
      { id: 'A', text: o('The bridge is built by them.') },
      { id: 'B', text: o('The bridge was built by them.') },
      { id: 'C', text: o('The bridge has been built by them.') },
      { id: 'D', text: o('The bridge had built by them.') },
    ],
  },
  {
    id: 'e9',
    topic: 'Subject-Verb Agreement',
    stem: o('Neither of the boys ______ present at the meeting.'),
    options: [
      { id: 'A', text: o('were') },
      { id: 'B', text: o('are') },
      { id: 'C', text: o('was') },
      { id: 'D', text: o('have been') },
    ],
  },
  {
    id: 'e10',
    topic: 'Synonyms',
    stem: o("Choose the word closest in meaning to 'CANDID'."),
    options: [
      { id: 'A', text: o('Secretive') },
      { id: 'B', text: o('Frank') },
      { id: 'C', text: o('Rude') },
      { id: 'D', text: o('Timid') },
    ],
  },
];

export const bank: Record<BankKey, BankQuestion[]> = { reasoning, ga, quant, english };
