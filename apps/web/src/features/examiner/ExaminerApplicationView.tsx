'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  CreateExaminerApplicationRequest,
  missingHindiFields,
  parseRichText,
  type ExaminerApplication,
  type ExaminerSample,
} from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { ApiRequestError } from '@/lib/api/http';
import { Alert } from '@/features/auth/ui';
import { messageOf } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { ImageList } from './ImageList';
import { PageHead, useExaminer } from './ExaminerShell';
import { uploadExaminerFile } from './upload';
import styles from './examiner.module.css';

const OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
const KYC = [
  { field: 'photo', label: 'Profile photo', accept: 'image/jpeg,image/png,image/webp' },
  { field: 'pan', label: 'PAN document', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { field: 'bank', label: 'Bank proof', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { field: 'business', label: 'Business proof', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
] as const;
type KycField = (typeof KYC)[number]['field'];
type Upload = { status: 'uploading' | 'done' | 'failed'; name: string; id?: string; message?: string };

type SampleDraft = Omit<ExaminerSample, 'examId' | 'subjectId' | 'topicId'> & {
  subjectId: string;
  topicId: string;
};
type Errors = Record<string, string>;

const blankSample = (position: number, subjectId = '', topicId = ''): SampleDraft => ({
  position,
  subjectId,
  topicId,
  stemEn: '',
  options: OPTION_IDS.map((id) => ({ id, textEn: '' })),
  correctOption: 'A',
  solutionEn: '',
  difficulty: 'medium',
  imageAssetIds: [],
});

/** Stable element id for a field key such as `samples.2.options.1.textEn`. */
const fieldId = (key: string) => `f-${key.replace(/\./g, '-')}`;

/** A short label for the error summary. */
function labelOf(key: string): string {
  const sample = /^samples\.(\d+)\.(.+)$/.exec(key);
  if (sample) {
    const [, index, rest] = sample;
    const option = /^options\.(\d+)\.textEn$/.exec(rest!);
    const part = option
      ? `Option ${OPTION_IDS[Number(option[1])]}`
      : ({ subjectId: 'Subject', topicId: 'Topic', stemEn: 'Question', solutionEn: 'Solution', options: 'Options' } as Record<string, string>)[
          rest!
        ] ?? 'Question';
    return `Sample ${Number(index) + 1} · ${part}`;
  }
  return (
    ({
      examId: 'Exam',
      bio: 'Short bio',
      instituteName: 'Institute name',
      experienceYears: 'Experience',
      agreement: 'Agreement',
      uploads: 'Uploads',
    } as Record<string, string>)[key] ?? 'Application'
  );
}

function contentError(text: string): string | undefined {
  const issue = parseRichText(text).issues[0];
  return issue ? `Fix the formatting: ${issue}` : undefined;
}

export function ExaminerApplicationView() {
  const { options, application, setApplication } = useExaminer();
  if (application && application.status !== 'rejected') return <ApplicationStatus application={application} />;
  if (!options.exams.length) {
    return (
      <>
        <PageHead title="Apply to become an examiner" />
        <div className={admin.state} role="status">
          <h2>No exams are open for applications yet</h2>
          <p>Our team is publishing exam patterns. Please check back soon.</p>
        </div>
      </>
    );
  }
  return <ApplicationForm key={application?.id ?? 'new'} previous={application} onSubmitted={setApplication} />;
}

function ApplicationStatus({ application }: { application: ExaminerApplication }) {
  const approved = application.status === 'approved';
  return (
    <div className={styles.stack}>
      <PageHead title="Your examiner application" lead="Where your application stands and what to do next." />
      <section className={`${admin.card} ${styles.section}`} aria-labelledby="status-title">
        <h2 id="status-title">
          Application {approved ? 'approved' : 'pending'}{' '}
          <span className={`${admin.badge} ${approved ? admin.badgeOn : admin.badgeDraft}`}>
            {approved ? 'Approved' : 'In review'}
          </span>
        </h2>
        <p className={styles.lead}>
          {approved
            ? 'You can now write questions and build tests. Every question and test still goes through QC review before students see it.'
            : 'Our team is reviewing your profile and ten sample questions. You will be able to build tests once you are approved.'}
        </p>
        <p className={admin.helper}>
          Submitted {new Date(application.createdAt).toLocaleString('en-IN')} · Agreement {application.agreementVersion ?? 'not recorded'}
        </p>
        <div className={admin.actions}>
          {approved ? (
            <>
              <Link className="btn btn-primary" href="/examiner/tests">
                Create a test
              </Link>
              <Link className="btn btn-secondary" href="/examiner/series">
                Create a test series
              </Link>
            </>
          ) : (
            <Link className="btn btn-secondary" href="/examiner">
              Back to overview
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function ApplicationForm({
  previous,
  onSubmitted,
}: {
  previous: ExaminerApplication | null;
  onSubmitted: (application: ExaminerApplication) => void;
}) {
  const { options } = useExaminer();
  const [accountType, setAccountType] = useState<'individual' | 'institute'>(previous?.accountType ?? 'individual');
  const [instituteName, setInstituteName] = useState(previous?.instituteName ?? '');
  const [bio, setBio] = useState(previous?.bio ?? '');
  const [experienceYears, setExperienceYears] = useState(
    previous?.experienceYears === null || previous?.experienceYears === undefined ? '' : String(previous.experienceYears),
  );
  const [examId, setExamId] = useState(previous?.examIds[0] ?? (options.exams.length === 1 ? options.exams[0]!.id : ''));
  const [samples, setSamples] = useState<SampleDraft[]>(() => {
    if (previous) return previous.samples.map((sample) => ({ ...sample, options: sample.options.map((option) => ({ ...option })) }));
    const subject = options.exams.length === 1 ? options.exams[0]!.subjects[0] : undefined;
    return Array.from({ length: 10 }, (_, index) => blankSample(index + 1, subject?.id, subject?.topics[0]?.id));
  });
  const [kyc, setKyc] = useState<Partial<Record<KycField, Upload>>>(() => {
    const done = (id: string | null | undefined): Upload | undefined => (id ? { status: 'done', name: 'Uploaded earlier', id } : undefined);
    return {
      ...(done(previous?.photoAssetId) ? { photo: done(previous?.photoAssetId)! } : {}),
      ...(done(previous?.panDocAssetId) ? { pan: done(previous?.panDocAssetId)! } : {}),
      ...(done(previous?.bankProofAssetId) ? { bank: done(previous?.bankProofAssetId)! } : {}),
      ...(done(previous?.businessProofAssetId) ? { business: done(previous?.businessProofAssetId)! } : {}),
    };
  });
  const [sampleUploads, setSampleUploads] = useState<Record<number, Upload | undefined>>({});
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const exam = options.exams.find((item) => item.id === examId);
  const uploading = Object.values(kyc).some((item) => item?.status === 'uploading') || Object.values(sampleUploads).some((item) => item?.status === 'uploading');
  const errorKeys = Object.keys(errors);

  useEffect(() => {
    if (errorKeys.length || formError) summaryRef.current?.focus();
    // Focus once per failed submit, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, formError]);

  const clearError = (...keys: string[]) =>
    setErrors((current) => {
      if (!keys.some((key) => key in current)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  const changeSample = (index: number, patch: Partial<SampleDraft>, ...keys: string[]) => {
    setSamples((current) => current.map((sample, i) => (i === index ? { ...sample, ...patch } : sample)));
    clearError(...keys.map((key) => `samples.${index}.${key}`));
  };
  const sampleErrors = (index: number) => errorKeys.filter((key) => key.startsWith(`samples.${index}.`)).length;

  async function attachKyc(field: KycField, file: File) {
    setKyc((current) => ({ ...current, [field]: { status: 'uploading', name: file.name } }));
    try {
      const id = await uploadExaminerFile(file, 'examiner_kyc');
      setKyc((current) => ({ ...current, [field]: { status: 'done', name: file.name, id } }));
    } catch (caught) {
      setKyc((current) => ({
        ...current,
        [field]: { status: 'failed', name: file.name, message: caught instanceof ApiRequestError ? messageOf(caught) : caught instanceof Error ? caught.message : 'Upload failed.' },
      }));
    }
  }

  async function attachSampleImage(index: number, file: File) {
    setSampleUploads((current) => ({ ...current, [index]: { status: 'uploading', name: file.name } }));
    try {
      const id = await uploadExaminerFile(file, 'question_asset');
      setSamples((current) => current.map((sample, i) => (i === index ? { ...sample, imageAssetIds: [...sample.imageAssetIds, id] } : sample)));
      setSampleUploads((current) => ({ ...current, [index]: { status: 'done', name: file.name, id } }));
    } catch (caught) {
      setSampleUploads((current) => ({
        ...current,
        [index]: { status: 'failed', name: file.name, message: caught instanceof ApiRequestError ? messageOf(caught) : caught instanceof Error ? caught.message : 'Upload failed.' },
      }));
    }
  }

  function validate(): Errors {
    const found: Errors = {};
    if (!exam) found['examId'] = 'Choose the exam you want to write questions for.';
    if (accountType === 'institute' && !instituteName.trim()) found['instituteName'] = 'Enter the institute name.';
    if (experienceYears && Number(experienceYears) > 80) found['experienceYears'] = 'Enter a number of years from 0 to 80.';
    if (bio.trim().length < 20) found['bio'] = 'Write at least 20 characters about your teaching or subject experience.';
    samples.forEach((sample, index) => {
      const key = (part: string) => `samples.${index}.${part}`;
      if (!sample.subjectId) found[key('subjectId')] = 'Choose a subject.';
      if (!sample.topicId) found[key('topicId')] = 'Choose a topic.';
      const stem = sample.stemEn.trim();
      if (!stem) found[key('stemEn')] = 'Write the question.';
      else if (contentError(stem)) found[key('stemEn')] = contentError(stem)!;
      sample.options.forEach((option, optionIndex) => {
        const text = option.textEn.trim();
        if (!text) found[key(`options.${optionIndex}.textEn`)] = `Write option ${option.id}.`;
        else if (contentError(text)) found[key(`options.${optionIndex}.textEn`)] = contentError(text)!;
      });
      const texts = sample.options.map((option) => option.textEn.trim().toLowerCase()).filter(Boolean);
      if (texts.length === 4 && new Set(texts).size !== 4) found[key('options')] = 'Each option must be different.';
      const solution = sample.solutionEn.trim();
      if (!solution) found[key('solutionEn')] = 'Explain the answer in the solution.';
      else if (contentError(solution)) found[key('solutionEn')] = contentError(solution)!;
      if (missingHindiFields(sample).length) found[key('stemEn')] ??= 'Hindi is partial: add Hindi to every field or remove it.';
    });
    if (!agreementAccepted) found['agreement'] = 'Read and accept the agreement to submit.';
    if (Object.values(kyc).some((item) => item?.status === 'failed')) found['uploads'] = 'A document failed to upload. Upload it again or remove it.';
    return found;
  }

  function showErrors(found: Errors) {
    setErrors(found);
    const withErrors = new Set(
      Object.keys(found)
        .map((key) => /^samples\.(\d+)\./.exec(key)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number),
    );
    if (withErrors.size) setOpen((current) => new Set([...current, ...withErrors]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!options.agreementVersion || !options.agreementText) {
      setFormError('Applications are unavailable until an approved agreement is configured.');
      return;
    }
    const found = validate();
    if (Object.keys(found).length || !exam) return showErrors(found);
    const assetId = (field: KycField) => (kyc[field]?.status === 'done' ? kyc[field]!.id : undefined);
    const request = {
      accountType,
      ...(accountType === 'institute' ? { instituteName: instituteName.trim() } : {}),
      bio: bio.trim(),
      ...(experienceYears ? { experienceYears: Number(experienceYears) } : {}),
      socialLinks: {},
      examIds: [exam.id],
      subjectIds: [...new Set(samples.map((sample) => sample.subjectId))],
      ...(assetId('photo') ? { photoAssetId: assetId('photo') } : {}),
      ...(assetId('pan') ? { panDocAssetId: assetId('pan') } : {}),
      ...(assetId('bank') ? { bankProofAssetId: assetId('bank') } : {}),
      ...(assetId('business') ? { businessProofAssetId: assetId('business') } : {}),
      agreementVersion: options.agreementVersion,
      samples: samples.map((sample) => ({
        ...sample,
        examId: exam.id,
        stemEn: sample.stemEn.trim(),
        solutionEn: sample.solutionEn.trim(),
        options: sample.options.map((option) => ({ ...option, textEn: option.textEn.trim() })),
      })),
    };
    // The same contract the API enforces; anything it still rejects is shown on its field.
    const parsed = CreateExaminerApplicationRequest.safeParse(request);
    if (!parsed.success) {
      return showErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])));
    }
    setBusy(true);
    try {
      onSubmitted(await adminApi.submitExaminerApplication(parsed.data));
      window.scrollTo({ top: 0 });
    } catch (caught) {
      const issues = (caught instanceof ApiRequestError ? (caught.details as { issues?: { path?: string; message?: string }[] } | undefined)?.issues : undefined) ?? [];
      const mapped = Object.fromEntries(issues.filter((issue) => issue.path && issue.message).map((issue) => [issue.path!, issue.message!]));
      if (Object.keys(mapped).length) showErrors(mapped);
      else setFormError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p className={styles.fieldError} id={`${fieldId(key)}-error`}>
        {errors[key]}
      </p>
    ) : null;
  const control = (key: string) => ({
    id: fieldId(key),
    className: `${admin.control} ${errors[key] ? styles.invalid : ''}`,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${fieldId(key)}-error` : undefined,
  });

  return (
    <div className={styles.stack}>
      <PageHead
        title={previous ? 'Revise your examiner application' : 'Apply to become an examiner'}
        lead="Tell us about yourself and write ten sample questions. Our team reviews every application."
      />
      {previous?.rejectionReason ? (
        <div className={admin.card}>
          <b>Review feedback:</b> {previous.rejectionReason}
        </div>
      ) : null}

      {errorKeys.length || formError ? (
        <div className={styles.summary} ref={summaryRef} tabIndex={-1} role="alert">
          <h2>{formError ? 'We could not submit your application' : `Fix ${errorKeys.length} ${errorKeys.length === 1 ? 'problem' : 'problems'} to submit`}</h2>
          {formError ? <p>{formError}</p> : null}
          {errorKeys.length ? (
            <ul>
              {errorKeys.slice(0, 12).map((key) => (
                <li key={key}>
                  <a href={`#${fieldId(key)}`}>
                    {labelOf(key)}: {errors[key]}
                  </a>
                </li>
              ))}
              {errorKeys.length > 12 ? <li>and {errorKeys.length - 12} more, marked below.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form className={styles.stack} onSubmit={(event) => void submit(event)} noValidate>
        <section className={`${admin.card} ${styles.section}`} aria-labelledby="profile-title">
          <h2 id="profile-title">Your profile</h2>
          <div className={`${admin.formGrid} ${admin.formGrid2}`}>
            <label className={admin.field}>
              <span>Account type</span>
              <select className={admin.control} value={accountType} onChange={(event) => setAccountType(event.target.value as 'individual' | 'institute')}>
                <option value="individual">Individual</option>
                <option value="institute">Institute</option>
              </select>
            </label>
            {accountType === 'institute' ? (
              <label className={admin.field}>
                <span>Institute name</span>
                <input {...control('instituteName')} value={instituteName} maxLength={200} onChange={(event) => { setInstituteName(event.target.value); clearError('instituteName'); }} />
                {fieldError('instituteName')}
              </label>
            ) : null}
            <label className={admin.field}>
              <span>Experience (years, optional)</span>
              <input
                {...control('experienceYears')}
                inputMode="numeric"
                value={experienceYears}
                onChange={(event) => {
                  setExperienceYears(event.target.value.replace(/\D/g, '').slice(0, 2));
                  clearError('experienceYears');
                }}
              />
              {fieldError('experienceYears')}
            </label>
            <label className={admin.field}>
              <span>Exam you will write for</span>
              <select
                {...control('examId')}
                value={examId}
                onChange={(event) => {
                  const next = options.exams.find((item) => item.id === event.target.value);
                  const subject = next?.subjects[0];
                  setExamId(event.target.value);
                  clearError('examId');
                  setSamples((current) => current.map((sample) => ({ ...sample, subjectId: subject?.id ?? '', topicId: subject?.topics[0]?.id ?? '' })));
                }}
              >
                <option value="">Select an exam</option>
                {options.exams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {fieldError('examId')}
            </label>
          </div>
          <label className={admin.field}>
            <span>Short bio</span>
            <textarea {...control('bio')} rows={4} maxLength={4000} value={bio} onChange={(event) => { setBio(event.target.value); clearError('bio'); }} />
            <span className={admin.helper}>{bio.trim().length} / 20 characters minimum. Shown to students on your examiner page.</span>
            {fieldError('bio')}
          </label>
        </section>

        <section className={`${admin.card} ${styles.section}`} aria-labelledby="kyc-title">
          <h2 id="kyc-title">Documents (optional for now)</h2>
          <p className={styles.lead}>
            KYC is optional until the KYC policy is approved. Files are private and malware-scanned; a clean scan is not KYC verification. JPEG, PNG, WebP or PDF, up to 10 MB.
          </p>
          <div className={styles.uploads} id={fieldId('uploads')}>
            {KYC.map(({ field, label, accept }) => {
              const upload = kyc[field];
              return (
                <div className={styles.upload} key={field}>
                  <label className={admin.field}>
                    <b>{label}</b>
                    <input
                      type="file"
                      accept={accept}
                      disabled={busy || upload?.status === 'uploading'}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void attachKyc(field, file);
                        clearError('uploads');
                      }}
                    />
                  </label>
                  <div role="status">
                    {upload?.status === 'uploading' ? <p className={styles.uploadBusy}>Uploading and scanning {upload.name}…</p> : null}
                    {upload?.status === 'done' ? <p className={styles.uploadOk}>✓ {upload.name} · scanned</p> : null}
                    {upload?.status === 'failed' ? <p className={styles.fieldError}>{upload.message}</p> : null}
                  </div>
                  {upload && upload.status !== 'uploading' ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setKyc((current) => { const next = { ...current }; delete next[field]; return next; })}>
                      Remove
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {fieldError('uploads')}
        </section>

        <section className={`${admin.card} ${styles.section}`} aria-labelledby="samples-title">
          <h2 id="samples-title">Ten sample questions</h2>
          <p className={styles.lead}>
            Each needs a question, four different options, the correct answer and a solution. The subjects you use here are the subjects you can write for after approval. Math: <code>{String.raw`\(x^2\)`}</code>.
          </p>
          {!exam ? <p className={admin.helper}>Choose an exam above to pick subjects and topics.</p> : null}
          <div className={styles.section}>
            {samples.map((sample, index) => {
              const subject = exam?.subjects.find((item) => item.id === sample.subjectId);
              const issues = sampleErrors(index);
              const complete = sample.stemEn.trim() && sample.solutionEn.trim() && sample.options.every((option) => option.textEn.trim());
              const upload = sampleUploads[index];
              return (
                <details
                  key={sample.position}
                  className={styles.sample}
                  data-invalid={issues ? 'true' : undefined}
                  open={open.has(index)}
                  onToggle={(event) => {
                    const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                    setOpen((current) => {
                      if (current.has(index) === isOpen) return current;
                      const next = new Set(current);
                      if (isOpen) next.add(index);
                      else next.delete(index);
                      return next;
                    });
                  }}
                >
                  <summary>
                    Sample {sample.position}
                    {issues ? (
                      <span className={`${admin.badge} ${admin.badgeOff}`}>{issues} to fix</span>
                    ) : complete ? (
                      <span className={`${admin.badge} ${admin.badgeOn}`}>Complete</span>
                    ) : (
                      <small>Not started</small>
                    )}
                  </summary>
                  <div className={styles.sampleBody}>
                    <div className={`${admin.formGrid} ${admin.formGrid3}`}>
                      <Field label="Subject" error={fieldError(`samples.${index}.subjectId`)}>
                        <select
                          {...control(`samples.${index}.subjectId`)}
                          value={sample.subjectId}
                          disabled={!exam}
                          onChange={(event) => {
                            const next = exam?.subjects.find((item) => item.id === event.target.value);
                            changeSample(index, { subjectId: event.target.value, topicId: next?.topics[0]?.id ?? '' }, 'subjectId', 'topicId');
                          }}
                        >
                          <option value="">Select subject</option>
                          {exam?.subjects.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Topic" error={fieldError(`samples.${index}.topicId`)}>
                        <select {...control(`samples.${index}.topicId`)} value={sample.topicId} disabled={!subject} onChange={(event) => changeSample(index, { topicId: event.target.value }, 'topicId')}>
                          <option value="">Select topic</option>
                          {subject?.topics.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Difficulty">
                        <select className={admin.control} value={sample.difficulty} onChange={(event) => changeSample(index, { difficulty: event.target.value as SampleDraft['difficulty'] })}>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Question (English)" error={fieldError(`samples.${index}.stemEn`)}>
                      <textarea {...control(`samples.${index}.stemEn`)} rows={3} maxLength={20_000} value={sample.stemEn} onChange={(event) => changeSample(index, { stemEn: event.target.value }, 'stemEn')} />
                    </Field>
                    <div className={styles.options} id={fieldId(`samples.${index}.options`)}>
                      {sample.options.map((option, optionIndex) => (
                        <Field key={option.id} label={`Option ${option.id}`} error={fieldError(`samples.${index}.options.${optionIndex}.textEn`)}>
                          <input
                            {...control(`samples.${index}.options.${optionIndex}.textEn`)}
                            maxLength={10_000}
                            value={option.textEn}
                            onChange={(event) =>
                              changeSample(
                                index,
                                { options: sample.options.map((item, i) => (i === optionIndex ? { ...item, textEn: event.target.value } : item)) },
                                `options.${optionIndex}.textEn`,
                                'options',
                              )
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    {fieldError(`samples.${index}.options`)}
                    <div className={`${admin.formGrid} ${admin.formGrid3}`}>
                      <Field label="Correct option">
                        <select className={admin.control} value={sample.correctOption} onChange={(event) => changeSample(index, { correctOption: event.target.value as SampleDraft['correctOption'] })}>
                          {OPTION_IDS.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label="Solution (English)" error={fieldError(`samples.${index}.solutionEn`)}>
                      <textarea {...control(`samples.${index}.solutionEn`)} rows={3} maxLength={20_000} value={sample.solutionEn} onChange={(event) => changeSample(index, { solutionEn: event.target.value }, 'solutionEn')} />
                    </Field>
                    <div className={styles.upload}>
                      <label className={admin.field}>
                        <b>Question image (optional)</b>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy || upload?.status === 'uploading' || sample.imageAssetIds.length >= 20}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void attachSampleImage(index, file);
                          }}
                        />
                      </label>
                      <div role="status">
                        {upload?.status === 'uploading' ? <p className={styles.uploadBusy}>Uploading and scanning {upload.name}…</p> : null}
                        {upload?.status === 'failed' ? <p className={styles.fieldError}>{upload.message}</p> : null}
                      </div>
                      <ImageList ids={sample.imageAssetIds} onRemove={(id) => changeSample(index, { imageAssetIds: sample.imageAssetIds.filter((item) => item !== id) })} />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className={`${admin.card} ${styles.section}`} aria-labelledby="agreement-title">
          <h2 id="agreement-title">Agreement</h2>
          {options.agreementText && options.agreementVersion ? (
            <>
              <p className={styles.lead}>{options.agreementText}</p>
              <label className={styles.check} id={fieldId('agreement')}>
                <input
                  type="checkbox"
                  checked={agreementAccepted}
                  aria-invalid={errors['agreement'] ? true : undefined}
                  onChange={(event) => {
                    setAgreementAccepted(event.target.checked);
                    clearError('agreement');
                  }}
                />
                <span>I have read and accept version {options.agreementVersion}.</span>
              </label>
              {fieldError('agreement')}
            </>
          ) : (
            <Alert>An approved agreement has not been configured, so applications cannot be submitted yet.</Alert>
          )}
          <div className={admin.actions}>
            <button className="btn btn-primary" type="submit" disabled={busy || uploading || !options.agreementVersion} aria-busy={busy || undefined}>
              {busy ? 'Submitting…' : uploading ? 'Waiting for uploads…' : previous ? 'Submit revised application' : 'Submit application'}
            </button>
            <Link className="btn btn-secondary" href="/examiner">
              Cancel
            </Link>
          </div>
        </section>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: ReactNode; children: ReactNode }) {
  return (
    <label className={admin.field}>
      <span>{label}</span>
      {children}
      {error}
    </label>
  );
}
