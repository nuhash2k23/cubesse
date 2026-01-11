import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamic import to avoid SSR issues with Three.js
const VerandaConfigurator = dynamic(
  () => import('@/components/veranda/VerandaFinal'),
  { ssr: false }
);

export default function Home() {
  return (
    <>
      <Head>
        <title>Veranda Configurator | CUBESSE</title>
        <meta name="description" content="Design your perfect Dutch veranda" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <VerandaConfigurator />
      </main>
    </>
  );
}
