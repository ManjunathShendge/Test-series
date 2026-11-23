import { ExaminerAuthoringView } from '@/features/examiner/ExaminerAuthoringView';
import { ExaminerGate } from '@/features/examiner/ExaminerGate';

export default function ExaminerAuthoringPage() {
  return (
    <ExaminerGate>
      <ExaminerAuthoringView />
    </ExaminerGate>
  );
}
