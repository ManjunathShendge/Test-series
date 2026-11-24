import { notFound } from 'next/navigation';

// Unknown addresses inside this area show its own not-found page, inside the console menu.
export default function Missing() {
  notFound();
}
