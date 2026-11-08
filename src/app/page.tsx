import type { Metadata } from 'next';
import '@/frontend/styles/landing.css';
import { LandingPage } from '@/frontend/landing/landing-page';
import { LANDING_METADATA } from '@/frontend/landing/landing-metadata';

export const metadata: Metadata = LANDING_METADATA;

export default function Home() {
  return <LandingPage />;
}
