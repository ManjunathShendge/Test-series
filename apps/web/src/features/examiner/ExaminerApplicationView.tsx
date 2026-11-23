'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  missingHindiFields,
  type CreateExaminerApplicationRequest,
  type ExaminerSample,
} from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { Alert } from '@/features/auth/ui';
import { messageOf, State, useLoad } from '@/features/admin/ui';
import styles from '@/features/admin/admin.module.css';
import { uploadExaminerFile } from './upload';

const OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
type SampleDraft = Omit<ExaminerSample, 'examId' | 'subjectId' | 'topicId'> & {
  examId: string;
  subjectId: string;
  topicId: string;
};

function blankSample(position: number): SampleDraft {
  return {
    position,
    examId: '',
    subjectId: '',
    topicId: '',
    stemEn: '',
    options: OPTION_IDS.map((id) => ({ id, textEn: '' })),
    correctOption: 'A',
    solutionEn: '',
    difficulty: 'medium',
    imageAssetIds: [],
  };
}

export function ExaminerApplicationView() {
  const { state, reload, set } = useLoad(async () => {
    const [options, application] = await Promise.all([
      adminApi.examinerOptions(),
      adminApi.examinerApplication(),
    ]);
    return { options, application };
  }, []);
  const [accountType, setAccountType] = useState<'individual' | 'institute'>('individual');
  const [instituteName, setInstituteName] = useState('');
  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [examId, setExamId] = useState('');
  const [samples, setSamples] = useState<SampleDraft[]>(() =>
    Array.from({ length: 10 }, (_, i) => blankSample(i + 1)),
  );
  const [assetIds, setAssetIds] = useState<{
    photo?: string;
    pan?: string;
    bank?: string;
    business?: string;
  }>({});
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (state.status !== 'ready' || state.data.application?.status !== 'rejected') return;
    const application = state.data.application;
    setAccountType(application.accountType);
    setInstituteName(application.instituteName ?? '');
    setBio(application.bio);
    setExperienceYears(
      application.experienceYears === null ? '' : String(application.experienceYears),
    );
    setExamId(application.examIds[0] ?? '');
    setSamples(
      application.samples.map((sample) => ({
        ...sample,
        examId: sample.examId,
        subjectId: sample.subjectId,
        topicId: sample.topicId,
        options: sample.options.map((option) => ({ ...option })),
      })),
    );
    setAssetIds({
      ...(application.photoAssetId ? { photo: application.photoAssetId } : {}),
      ...(application.panDocAssetId ? { pan: application.panDocAssetId } : {}),
      ...(application.bankProofAssetId ? { bank: application.bankProofAssetId } : {}),
      ...(application.businessProofAssetId ? { business: application.businessProofAssetId } : {}),
    });
  }, [state]);

  const selectedExam = useMemo(
    () =>
      state.status === 'ready'
        ? state.data.options.exams.find((exam) => exam.id === examId)
        : undefined,
    [examId, state],
  );
  const changeSample = (index: number, patch: Partial<SampleDraft>) => {
    setSamples((current) =>
      current.map((sample, i) => (i === index ? { ...sample, ...patch } : sample)),
    );
  };

  async function attachFile(
    field: 'photo' | 'pan' | 'bank' | 'business',
    classification: 'examiner_kyc',
  ) {
    const input = document.getElementById(`application-${field}`) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    setUploading(field);
    setError(null);
    try {
      const id = await uploadExaminerFile(file, classification);
      setAssetIds((current) => ({ ...current, [field]: id }));
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state.status !== 'ready') return;
    setError(null);
    const exam = state.data.options.exams.find((item) => item.id === examId);
    if (!exam) return setError(new Error('Choose an exam with a published template.'));
    if (!agreementAccepted)
      return setError(new Error('Read and accept the agreement shown below.'));
    if (samples.some((sample) => !sample.subjectId || !sample.topicId)) {
      return setError(
        new Error('Choose a subject and topic for each of the ten sample questions.'),
      );
    }
    const partialHindi = samples.findIndex((sample) => missingHindiFields(sample).length);
    if (partialHindi >= 0) {
      return setError(
        new Error(
          `Sample ${partialHindi + 1} has partial Hindi. Add Hindi to the question, all four options and the solution, or remove it.`,
        ),
      );
    }
    if (accountType === 'institute' && !instituteName.trim()) {
      return setError(new Error('Enter the institute name.'));
    }
    if (!bio.trim() || bio.trim().length < 20)
      return setError(new Error('Add a short bio of at least 20 characters.'));
    if (!state.data.options.agreementVersion || !state.data.options.agreementText) {
      return setError(
        new Error('Applications are unavailable until an approved agreement is configured.'),
      );
    }

    const request: CreateExaminerApplicationRequest = {
      accountType,
      ...(accountType === 'institute' ? { instituteName: instituteName.trim() } : {}),
      bio: bio.trim(),
      ...(experienceYears.trim() ? { experienceYears: Number(experienceYears) } : {}),
      socialLinks: {},
      examIds: [exam.id],
      subjectIds: [...new Set(samples.map((sample) => sample.subjectId))],
      ...(assetIds.photo ? { photoAssetId: assetIds.photo } : {}),
      ...(assetIds.pan ? { panDocAssetId: assetIds.pan } : {}),
      ...(assetIds.bank ? { bankProofAssetId: assetIds.bank } : {}),
      ...(assetIds.business ? { businessProofAssetId: assetIds.business } : {}),
      agreementVersion: state.data.options.agreementVersion,
      samples: samples.map((sample) => ({
        ...sample,
        examId: exam.id,
        options: sample.options.map((option) => ({ ...option })),
      })),
    };
    setBusy(true);
    try {
      const application = await adminApi.submitExaminerApplication(request);
      set({ ...state.data, application });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading')
    return (
      <State title="Loading application">
        Checking your account and the available exam catalogue.
      </State>
    );
  if (state.status === 'error') {
    return (
      <State
        title="Could not load application"
        action={
          <button className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        }
      >
        {messageOf(state.error)}
      </State>
    );
  }
  const { options, application } = state.data;
  if (application && application.status !== 'rejected') {
    return (
      <>
        <div className={styles.pageHead}>
          <div>
            <h1>Examiner application</h1>
            <p>Your application status and next step.</p>
          </div>
          <Link className="btn btn-secondary" href="/examiner">
            Question authoring
          </Link>
        </div>
        <section className={styles.card}>
          <h2>Application {application.status}</h2>
          {application.status === 'pending' ? (
            <p>
              Operations will review your profile and all ten sample questions. Submitting does not
              publish questions.
            </p>
          ) : (
            <p>
              You are approved to create draft questions. Every question still needs separate human
              QC approval before publication.
            </p>
          )}
          {application.rejectionReason ? (
            <p>
              <b>Review feedback:</b> {application.rejectionReason}
            </p>
          ) : null}
          <p>
            Submitted {new Date(application.createdAt).toLocaleString('en-IN')} · Agreement{' '}
            {application.agreementVersion ?? 'not recorded'}
          </p>
        </section>
      </>
    );
  }

  const handleFile =
    (field: 'photo' | 'pan' | 'bank' | 'business') => (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) void attachFile(field, 'examiner_kyc');
    };
  const selectClass = styles.control;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{application ? 'Revise examiner application' : 'Apply to become an examiner'}</h1>
          <p>Complete your profile and submit ten sample questions for human review.</p>
        </div>
      </div>
      {error ? <Alert>{error instanceof Error ? error.message : messageOf(error)}</Alert> : null}
      {!options.exams.length ? (
        <State title="No exams are open for applications">
          An administrator must publish an exam template and add syllabus topics first.
        </State>
      ) : (
        <form className={styles.grid} onSubmit={(event) => void submit(event)} noValidate>
          <section className={styles.card}>
            <h2>Profile</h2>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Account type</span>
                <select
                  className={selectClass}
                  value={accountType}
                  onChange={(event) =>
                    setAccountType(event.target.value as 'individual' | 'institute')
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="institute">Institute</option>
                </select>
              </label>
              {accountType === 'institute' ? (
                <label className={styles.field}>
                  <span>Institute name</span>
                  <input
                    className={selectClass}
                    value={instituteName}
                    onChange={(event) => setInstituteName(event.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
              ) : null}
              <label className={styles.field}>
                <span>Experience (years)</span>
                <input
                  className={selectClass}
                  inputMode="numeric"
                  value={experienceYears}
                  onChange={(event) =>
                    setExperienceYears(event.target.value.replace(/\D/g, '').slice(0, 2))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Short bio</span>
                <textarea
                  className={selectClass}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  minLength={20}
                  maxLength={4000}
                  rows={4}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Exam</span>
                <select
                  className={selectClass}
                  value={examId}
                  onChange={(event) => {
                    const nextExamId = event.target.value;
                    const subject = options.exams.find((item) => item.id === nextExamId)
                      ?.subjects[0];
                    setExamId(nextExamId);
                    setSamples((current) =>
                      current.map((sample) => ({
                        ...sample,
                        examId: nextExamId,
                        subjectId: subject?.id ?? '',
                        topicId: subject?.topics[0]?.id ?? '',
                      })),
                    );
                  }}
                >
                  <option value="">Select an exam</option>
                  {options.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="t-small t-secondary">
              KYC files are optional in this local workflow. Uploads remain private and unscanned;
              they are not verified evidence.
            </p>
            <div className={styles.inline}>
              {(
                [
                  ['photo', 'Profile photo'],
                  ['pan', 'PAN document'],
                  ['bank', 'Bank proof'],
                  ['business', 'Business proof'],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className={styles.field}>
                  <span>
                    {label}
                    {assetIds[field] ? ' · uploaded, malware scan passed' : ''}
                  </span>
                  <input
                    id={`application-${field}`}
                    type="file"
                    accept={
                      field === 'photo'
                        ? 'image/jpeg,image/png,image/webp'
                        : 'image/jpeg,image/png,image/webp,application/pdf'
                    }
                    disabled={busy || uploading !== null}
                    onChange={handleFile(field)}
                  />
                </label>
              ))}
            </div>
            {uploading ? <p role="status">Uploading {uploading}…</p> : null}
          </section>
          <section className={styles.card}>
            <h2>Ten sample questions</h2>
            <p>
              Each question needs English stem, four distinct options, an answer, and a solution.
              All samples use the selected exam.
            </p>
            <div className={styles.grid}>
              {samples.map((sample, index) => {
                const subject = selectedExam?.subjects.find((item) => item.id === sample.subjectId);
                return (
                  <details
                    key={sample.position}
                    className={styles.card}
                    open={sample.position === 1}
                  >
                    <summary>
                      Sample {sample.position}
                      {sample.stemEn ? ` · ${sample.stemEn.slice(0, 70)}` : ''}
                    </summary>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Subject</span>
                        <select
                          className={selectClass}
                          value={sample.subjectId}
                          onChange={(event) => {
                            const next = selectedExam?.subjects.find(
                              (item) => item.id === event.target.value,
                            );
                            changeSample(index, {
                              subjectId: event.target.value,
                              topicId: next?.topics[0]?.id ?? '',
                            });
                          }}
                        >
                          <option value="">Select subject</option>
                          {selectedExam?.subjects.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Topic</span>
                        <select
                          className={selectClass}
                          value={sample.topicId}
                          onChange={(event) => changeSample(index, { topicId: event.target.value })}
                        >
                          <option value="">Select topic</option>
                          {subject?.topics.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Difficulty</span>
                        <select
                          className={selectClass}
                          value={sample.difficulty}
                          onChange={(event) =>
                            changeSample(index, {
                              difficulty: event.target.value as SampleDraft['difficulty'],
                            })
                          }
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Question (English)</span>
                        <textarea
                          className={selectClass}
                          value={sample.stemEn}
                          onChange={(event) => changeSample(index, { stemEn: event.target.value })}
                          maxLength={20_000}
                          rows={3}
                        />
                      </label>
                      {sample.options.map((option, optionIndex) => (
                        <label className={styles.field} key={option.id}>
                          <span>Option {option.id}</span>
                          <input
                            className={selectClass}
                            value={option.textEn}
                            onChange={(event) =>
                              changeSample(index, {
                                options: sample.options.map((item, i) =>
                                  i === optionIndex
                                    ? { ...item, textEn: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            maxLength={10_000}
                          />
                        </label>
                      ))}
                      <label className={styles.field}>
                        <span>Correct option</span>
                        <select
                          className={selectClass}
                          value={sample.correctOption}
                          onChange={(event) =>
                            changeSample(index, {
                              correctOption: event.target.value as SampleDraft['correctOption'],
                            })
                          }
                        >
                          {OPTION_IDS.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Solution (English)</span>
                        <textarea
                          className={selectClass}
                          value={sample.solutionEn}
                          onChange={(event) =>
                            changeSample(index, { solutionEn: event.target.value })
                          }
                          maxLength={20_000}
                          rows={3}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>
                          Question images (optional)
                          {sample.imageAssetIds.length
                            ? ` · ${sample.imageAssetIds.length} uploaded, malware scan passed`
                            : ''}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy || uploading !== null || sample.imageAssetIds.length >= 20}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (!file) return;
                            setUploading(`sample-${sample.position}`);
                            setError(null);
                            void uploadExaminerFile(file, 'question_asset')
                              .then((id) => {
                                changeSample(index, {
                                  imageAssetIds: [...sample.imageAssetIds, id],
                                });
                              })
                              .catch(setError)
                              .finally(() => setUploading(null));
                          }}
                        />
                      </label>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
          <section className={styles.card}>
            <h2>Agreement</h2>
            {options.agreementText && options.agreementVersion ? (
              <>
                <p>{options.agreementText}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={agreementAccepted}
                    onChange={(event) => setAgreementAccepted(event.target.checked)}
                  />{' '}
                  I have read and accept version {options.agreementVersion}.
                </label>
              </>
            ) : (
              <p>
                An approved agreement has not been configured; applications cannot be submitted.
              </p>
            )}
            <div className={styles.actions} style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={
                  busy || uploading !== null || !options.agreementVersion || !options.agreementText
                }
                aria-busy={busy || undefined}
              >
                {busy
                  ? 'Submitting…'
                  : application
                    ? 'Submit revised application'
                    : 'Submit application'}
              </button>
              <Link className="btn btn-secondary" href="/examiner">
                Back to examiner dashboard
              </Link>
            </div>
          </section>
        </form>
      )}
    </>
  );
}
