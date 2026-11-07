import { Bricolage_Grotesque } from 'next/font/google';

// Display face for headings. Self-hosted by next/font at build time: no runtime request to Google.
export const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});
