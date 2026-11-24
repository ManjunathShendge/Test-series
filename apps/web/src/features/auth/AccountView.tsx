'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ExamList, type Device, type ExamSummary, type Profile } from '@exam-prep/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api/http';
import { listDevices, revokeDevice } from '@/lib/api/identity';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { useAuth } from './AuthProvider';
import { DeviceRows } from './DeviceRows';
import { PurchasesPanel } from '@/features/commerce/PurchasesPanel';
import { AttemptsPanel } from '@/features/attempt/AttemptsPanel';
import { RequireSession } from './RequireSession';
import { Alert, BusyButton, Notice, Waiting } from './ui';
import styles from './auth.module.css';

const STAGE = { starting: 'Just starting', revising: 'Revising', 'final-lap': 'Final lap' } as const;
const LANGUAGE = { en: 'English', hi: 'Hindi' } as const;

export function AccountView() {
  return <RequireSession>{(profile) => <Account profile={profile} />}</RequireSession>;
}

function Account({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await listDevices());
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load your devices.');
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    apiRequest('GET', '/exams', { schema: ExamList })
      .then((r) => setExams(r.items))
      .catch(() => setExams([]));
  }, [loadDevices]);

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await revokeDevice(id);
      setNotice('Device removed. It has been signed out.');
      await loadDevices();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not remove that device. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const logOut = async () => {
    setBusy('signout');
    await signOut();
    router.replace('/');
  };

  const examNames = profile.targetExamIds.map((id) => exams.find((e) => e.id === id)?.name).filter(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.panelHead}>
        <p className="eyebrow eyebrow-static">Your account</p>
        <h1 className="t-display">Hello, {profile.fullName.split(' ')[0]}</h1>
      </div>
      <div className={styles.accountGrid}>
        <section className={styles.panel} aria-labelledby="profile-title">
          <h2 id="profile-title" className="t-title">
            Profile
          </h2>
          <dl className={styles.summary}>
            <div>
              <dt>Name</dt>
              <dd>{profile.fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{profile.email ?? 'Not shared'}</dd>
            </div>
            <div>
              <dt>Preparing for</dt>
              <dd>{examNames.length ? examNames.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{profile.preparationStage ? STAGE[profile.preparationStage] : '—'}</dd>
            </div>
            <div>
              <dt>Question language</dt>
              <dd>{LANGUAGE[profile.preferredLanguage]}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <Link href="/onboarding?next=/account" className="btn btn-secondary">
              Edit preferences
            </Link>
            <Link href="/exams" className="btn btn-primary">
              Browse tests <Glyph name="arrow" size={16} />
            </Link>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="devices-title">
          <div className={styles.panelHead}>
            <h2 id="devices-title" className="t-title">
              Devices
            </h2>
            <p className="t-small t-secondary">Your account works on up to two devices at a time.</p>
          </div>
          {devices ? <DeviceRows devices={devices} busyId={busy} onRemove={(id) => void remove(id)} /> : <Waiting label="Loading devices…" />}
          <div aria-live="polite">
            {error ? <Alert>{error}</Alert> : null}
            {notice ? <Notice>{notice}</Notice> : null}
          </div>
          <BusyButton busy={busy === 'signout'} className="btn btn-secondary btn-full" onClick={() => void logOut()} type="button">
            Log out of this browser
          </BusyButton>
        </section>

        <AttemptsPanel />
        <PurchasesPanel />
      </div>
    </div>
  );
}
