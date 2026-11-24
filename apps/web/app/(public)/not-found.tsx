import { ErrorScreen } from '@/ui/errors/ErrorScreen';

export default function PublicNotFound() {
  return <ErrorScreen kind="not-found" variant="page" />;
}
