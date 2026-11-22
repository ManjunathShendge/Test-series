/*
 * Landing page copy. Claims stay inside decided product scope (PRD 1, 6 and 12, DECISIONS):
 * no prices, revenue shares, pass rates, test counts, ratings or testimonials, because
 * those are open owner decisions (O01-O04) or do not exist yet.
 */

export const steps = [
  {
    n: '01',
    title: 'Pick your exam',
    body: 'Choose your target exams, language and preparation stage. Your first free test is ready straight away.',
  },
  {
    n: '02',
    title: 'Take a timed mock',
    body: 'Section timers, a five-state question palette, mark for review and a language toggle. Answers save as you go, even if your connection drops.',
  },
  {
    n: '03',
    title: 'See where to improve',
    body: 'Score, rank and percentile, a section-wise breakdown, comparison with the topper, and worked solutions for every question.',
  },
] as const;

export const exams = [
  { name: 'SSC', body: 'Staff Selection Commission exams, starting with the Combined Graduate Level Tier 1.' },
  { name: 'Banking', body: 'Bank recruitment exams, starting with the IBPS PO Preliminary.' },
  { name: 'Railways', body: 'Railway recruitment exams, starting with the RRB NTPC CBT 1.' },
] as const;

export const examinerPoints = [
  'Build tests in a rich editor with maths, tables and images, or upload them from Excel',
  'Pre-submit checks catch duplicates and pattern gaps before review',
  'A subject reviewer approves every test before it goes live',
  'Earn from every sale, with monthly payouts and statements',
] as const;

export const faqs = [
  {
    q: 'Is there a free test?',
    a: 'Yes. When you create an account and choose your exam, one free mock test is unlocked so you can try the full experience before buying anything.',
  },
  {
    q: 'Who writes the questions?',
    a: 'Verified examiners and institutes who teach for these exams. Each examiner passes a sample review and identity checks before they can publish.',
  },
  {
    q: 'How do you make sure questions are not copied or wrong?',
    a: 'Automated checks flag repeats of other tests and previous papers, then a human subject reviewer verifies every answer key and solution. Nothing goes live without that approval.',
  },
  {
    q: 'Can I practise on my phone?',
    a: 'Yes. MakeMePrepare runs on Android, iPhone and the web with one account, so you can start on one device and review results on another. An account can be active on up to two devices.',
  },
  {
    q: 'Are tests available in Hindi?',
    a: 'Every test is in English, and many also offer Hindi. When a test offers Hindi, every question has both versions and you can switch language during the test.',
  },
  {
    q: 'What happens if my internet drops during a test?',
    a: 'Your answers are saved on your device first and sync when the connection returns. If the app closes, you resume at the same question with the same time left.',
  },
] as const;
