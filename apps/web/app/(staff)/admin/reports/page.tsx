import type { Metadata } from 'next';
import { ModulePage } from '@/features/admin/ModulePage';

export const metadata: Metadata = { title: 'Reports' };

// PRD 8. Shown without figures until its backend milestone ships.
export default function Page() {
  return (
    <ModulePage
      title="Reports"
      scope="Sales, revenue, attempts, QC turnaround and examiner earnings. Funnels and cohorts come from PostHog instead of custom screens."
      dependsOn="Reports fill in as payments, attempts and QC review ship."
    />
  );
}
