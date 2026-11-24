import type { Metadata } from 'next';
import { ModulePage } from '@/features/admin/ModulePage';

export const metadata: Metadata = { title: 'Catalogue' };

// PRD 8. Shown without figures until its backend milestone ships.
export default function Page() {
  return (
    <ModulePage
      title="Catalogue"
      scope="Feature or unpublish series and set price bands. Live test scheduling comes in Phase 2."
      dependsOn="Series appear here once examiners have tests approved by QC."
    />
  );
}
