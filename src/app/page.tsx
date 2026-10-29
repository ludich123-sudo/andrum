import { redirect } from 'next/navigation';

// Startsidan på appens egen adress leder till adminpanelen.
// Kunder kommer in via studions länk: /s/<studio>.
export default function Home() {
  redirect('/admin');
}
