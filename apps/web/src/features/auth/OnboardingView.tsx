'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ExamList, type ExamSummary, type Language, type PreparationStage, type Profile } from '@exam-prep/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api/http';
import { updateMe } from '@/lib/api/identity';
import { track } from '@/lib/analytics';
import { homeFor, safeNext, useAuth } from './AuthProvider';
import { RequireSession } from './RequireSession';
import { Alert, BusyButton, Field, Waiting } from './ui';
import styles from './auth.module.css';

const STAGES: { value: PreparationStage; title: string; body: string }[] = [
  { value: 'starting', title: 'Just starting', body: 'Learning the pattern and basics' },
  { value: 'revising', title: 'Revising', body: 'Covered most topics, practising' },
  { value: 'final-lap', title: 'Final lap', body: 'Exam is close, full mocks daily' },
];
const LANGUAGES: { value: Language; title: string }[] = [
  { value: 'en', title: 'English' },
  { value: 'hi', title: 'हिन्दी (Hindi)' },
];

export function OnboardingView() {
  return <RequireSession allowIncompleteOnboarding>{(profile) => <OnboardingForm profile={profile} />}</RequireSession>;
}

/** First-run preferences (PATCH /v1/me). Also used later to edit them from the account page. */
function OnboardingForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { setProfile } = useAuth();
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(profile.fullName);
  const [targets, setTargets] = useState<string[]>(profile.targetExamIds);
  const [stage, setStage] = useState<PreparationStage | null>(profile.preparationStage);
  const [language, setLanguage] = useState<Language>(profile.preferredLanguage);
  // Asked once per account (PRD 12); after that it is on record and not shown again.
  const [adult, setAdult] = useState(profile.ageConfirmed);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'targets' | 'stage' | 'adult', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    apiRequest('GET', '/exams', { schema: ExamList })
      .then((r) => live && setExams(r.items))
      .catch(() => live && setLoadError('Could not load the exam list. Check your connection and reload the page.'));
    return () => {
      live = false;
    };
  }, []);

  const toggle = (id: string) => {
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
    setErrors(({ targets: _t, ...rest }) => rest);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Enter your name.';
    if (!targets.length) found.targets = 'Pick at least one exam.';
    if (!stage) found.stage = 'Choose where you are in your preparation.';
    if (!adult) found.adult = 'MakeMePrepare is for people aged 18 or older. Confirm to continue.';
    setErrors(found);
    if (Object.keys(found).length || !stage) {
      setFormError('Please complete the highlighted questions.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const updated = await updateMe({
        fullName: name.trim(),
        targetExamIds: targets,
        preparationStage: stage,
        preferredLanguage: language,
        ...(profile.ageConfirmed ? {} : { ageConfirmed: true as const }),
      });
      if (!profile.onboarded) track('onboarding_completed', { targetExamCount: targets.length, language });
      setProfile(updated);
      router.replace(next ?? homeFor(updated));
    } catch (e) {
      setFormError(e instanceof ApiRequestError ? e.message : 'Could not save. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <p className="eyebrow eyebrow-static">{profile.onboarded ? 'Your preferences' : 'Welcome'}</p>
        <h1 className="t-title">{profile.onboarded ? 'Update your preferences' : 'Set up your practice'}</h1>
        <p className="t-secondary">We use this to show the right tests first. You can change it any time.</p>
      </div>
      <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />

        <fieldset className={styles.fieldset} aria-describedby={errors.targets ? 'targets-error' : undefined}>
          <legend className={styles.legend}>Which exams are you preparing for?</legend>
          {loadError ? <Alert>{loadError}</Alert> : null}
          {!exams && !loadError ? <Waiting label="Loading exams…" /> : null}
          {exams ? (
            <div className={styles.choices}>
              {exams.map((e) => (
                <label key={e.id} className={styles.choice}>
                  <input type="checkbox" checked={targets.includes(e.id)} onChange={() => toggle(e.id)} />
                  <span className={styles.choiceTitle}>{e.name}</span>
                  <span className="t-small t-secondary">
                    {e.category.name}
                    {e.stage ? ` · ${e.stage}` : ''}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {errors.targets ? (
            <p id="targets-error" className={styles.fieldError}>
              {errors.targets}
            </p>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset} aria-describedby={errors.stage ? 'stage-error' : undefined}>
          <legend className={styles.legend}>Where are you in your preparation?</legend>
          <div className={styles.choices}>
            {STAGES.map((s) => (
              <label key={s.value} className={styles.choice}>
                <input
                  type="radio"
                  name="stage"
                  checked={stage === s.value}
                  onChange={() => {
                    setStage(s.value);
                    setErrors(({ stage: _s, ...rest }) => rest);
                  }}
                />
                <span className={styles.choiceTitle}>{s.title}</span>
                <span className="t-small t-secondary">{s.body}</span>
              </label>
            ))}
          </div>
          {errors.stage ? (
            <p id="stage-error" className={styles.fieldError}>
              {errors.stage}
            </p>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Question language</legend>
          <div className={styles.choices}>
            {LANGUAGES.map((l) => (
              <label key={l.value} className={styles.choice}>
                <input type="radio" name="language" checked={language === l.value} onChange={() => setLanguage(l.value)} />
                <span className={styles.choiceTitle} lang={l.value}>
                  {l.title}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {profile.ageConfirmed ? null : (
          <div className={styles.field}>
            <label className={`${styles.check} ${errors.adult ? styles.checkInvalid : ''}`}>
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => {
                  setAdult(e.target.checked);
                  setErrors(({ adult: _a, ...rest }) => rest);
                }}
                aria-invalid={errors.adult ? true : undefined}
                aria-describedby={errors.adult ? 'adult-error' : undefined}
              />
              <span>I confirm I am 18 years or older.</span>
            </label>
            {errors.adult ? (
              <p id="adult-error" className={styles.fieldError}>
                {errors.adult}
              </p>
            ) : null}
          </div>
        )}

        {formError ? <Alert>{formError}</Alert> : null}
        <BusyButton busy={busy} type="submit">
          {profile.onboarded ? 'Save preferences' : 'Start practising'}
        </BusyButton>
      </form>
    </div>
  );
}
