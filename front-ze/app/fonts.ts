import localFont from 'next/font/local'

// Bundled rather than fetched from Google Fonts at build time, so `bun run build` needs no network
// (the staging image build cannot resolve DNS). Inter variable, latin subset, weights 100-900.
export const inter = localFont({
  src: './_fonts/InterVariable-latin.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
})
