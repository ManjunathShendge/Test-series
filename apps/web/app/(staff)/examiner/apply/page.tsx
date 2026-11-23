import { ExaminerApplicationView } from '@/features/examiner/ExaminerApplicationView';
import { ExaminerGate } from '@/features/examiner/ExaminerGate';

export default function ExaminerApplicationPage() {
  return (
    <ExaminerGate>
      <ExaminerApplicationView />
    </ExaminerGate>
  );
}
