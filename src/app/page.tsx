import '@/frontend/styles/landing.css';
import { displayFont } from '@/frontend/landing/fonts';
import { LandingPage } from '@/frontend/landing/landing-page';

export default function Home() {
  return (
    <div className={displayFont.variable}>
      <LandingPage />
    </div>
  );
}
