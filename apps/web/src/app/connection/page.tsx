'use client';
import { useState } from 'react';
import { checkCoreConnection, coreApiUrl, type CoreHealth } from '@/lib/core-api';
export default function Home() {
    const [pending, setPending] = useState(false);
    const [health, setHealth] = useState<CoreHealth | null>(null);
    const [error, setError] = useState<string | null>(null);
    async function checkConnection() {
        setPending(true);
        setHealth(null);
        setError(null);
        try {
            setHealth(await checkCoreConnection());
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to connect to the backend.');
        }
        finally {
            setPending(false);
        }
    }
    return (<main className={"shell tw:w-[min(780px,_100%)] tw:mt-[0] tw:mr-[auto] tw:mb-[0] tw:ml-[auto] tw:pt-[44px] tw:pr-[24px] tw:pb-[24px] tw:pl-[24px] tw:max-[520px]:pt-[24px] tw:max-[520px]:pr-[16px] tw:max-[520px]:pb-[24px] tw:max-[520px]:pl-[16px] tw:[:where(&)_h1]:mt-[16px] tw:[:where(&)_h1]:mr-[0] tw:[:where(&)_h1]:mb-[16px] tw:[:where(&)_h1]:ml-[0] tw:[:where(&)_h1]:text-[clamp(30px,_6vw,_42px)] tw:[:where(&)_h1]:tracking-[-1.5px] tw:[:where(&)_button]:flex tw:[:where(&)_button]:items-center tw:[:where(&)_button]:justify-between tw:[:where(&)_button]:gap-[16px] tw:[:where(&)_button]:w-full tw:[:where(&)_button]:pt-[16px] tw:[:where(&)_button]:pr-[18px] tw:[:where(&)_button]:pb-[16px] tw:[:where(&)_button]:pl-[18px] tw:[:where(&)_button]:border-0 tw:[:where(&)_button]:rounded-[8px] tw:[:where(&)_button]:bg-[#1b5a48] tw:[:where(&)_button]:text-white tw:[:where(&)_button]:text-[14px] tw:[:where(&)_button]:font-semibold tw:[:where(&)_button]:cursor-pointer tw:[:where(&)_button:hover]:bg-[#154b3b] tw:[:where(&)_button:focus-visible]:[outline:3px_solid_#8dc8ac] tw:[:where(&)_button:focus-visible]:[outline-offset:3px] tw:[:where(&)_button:disabled]:opacity-[.65] tw:[:where(&)_button:disabled]:cursor-wait tw:[:where(&)_pre]:mt-[14px] tw:[:where(&)_pre]:mr-[0] tw:[:where(&)_pre]:mb-[14px] tw:[:where(&)_pre]:ml-[0] tw:[:where(&)_pre]:pt-[16px] tw:[:where(&)_pre]:pr-[16px] tw:[:where(&)_pre]:pb-[16px] tw:[:where(&)_pre]:pl-[16px] tw:[:where(&)_pre]:bg-[#f4f7f4] tw:[:where(&)_pre]:[border:1px_solid_var(--tw-color-portal-line)] tw:[:where(&)_pre]:rounded-[8px] tw:[:where(&)_pre]:overflow-x-auto tw:[:where(&)_pre]:text-portal-ink tw:[:where(&)_pre]:text-[12px] tw:[:where(&)_footer]:pt-[24px] tw:[:where(&)_footer]:pr-[24px] tw:[:where(&)_footer]:pb-[24px] tw:[:where(&)_footer]:pl-[24px] tw:[:where(&)_footer]:text-center tw:[:where(&)_footer]:text-[#82938a] tw:[:where(&)_footer]:text-[11px]"}>
      <header className={"brand tw:flex tw:items-center tw:gap-[10px] tw:font-bold tw:text-[17px]"}><span className={"brand-mark tw:grid tw:place-items-center tw:w-[32px] tw:h-[36px] tw:bg-portal-ink tw:text-[#fff] tw:rounded-[8px_8px_16px_8px]"} aria-hidden="true">L</span> Life Insurance <span className={"environment tw:ml-[auto] tw:[border:1px_solid_#cad7ce] tw:rounded-[5px] tw:pt-[5px] tw:pr-[8px] tw:pb-[5px] tw:pl-[8px] tw:text-[10px] tw:tracking-[1.5px] tw:text-portal-muted"}>LOCAL</span></header>
      <section className={"panel tw:mt-[54px] tw:pt-[38px] tw:pr-[38px] tw:pb-[38px] tw:pl-[38px] tw:bg-[#fff] tw:[border:1px_solid_var(--tw-color-portal-line)] tw:rounded-[18px] tw:[box-shadow:0_10px_35px_#153e3310] tw:max-[520px]:pt-[24px] tw:max-[520px]:pr-[20px] tw:max-[520px]:pb-[24px] tw:max-[520px]:pl-[20px] tw:max-[520px]:mt-[30px]"} aria-labelledby="page-title">
        <p className={"eyebrow tw:text-[11px] tw:tracking-[1.8px] tw:font-bold tw:text-[#588374]"}>STEP 01 · APPLICATION FOUNDATION</p>
        <h1 id="page-title">Check your connection.</h1>
        <p className={"intro tw:mb-[30px] tw:text-portal-muted tw:text-[15px] tw:leading-[1.8]"}>The frontend is ready. Check the backend connection to get started.</p>
        <p><a href={process.env.NEXT_PUBLIC_DATABASE_UI_URL ?? 'http://127.0.0.1:5050'} target="_blank" rel="noreferrer">View database tables ↗</a></p>

        <div className={"services tw:mt-[24px] tw:mr-[0] tw:mb-[24px] tw:ml-[0] tw:[border:1px_solid_var(--tw-color-portal-line)] tw:rounded-[10px]"}>
          <div className={"service tw:flex tw:items-center tw:gap-[14px] tw:pt-[18px] tw:pr-[18px] tw:pb-[18px] tw:pl-[18px] tw:[.service_+_&]:[border-top:1px_solid_var(--tw-color-portal-line)] tw:[&_strong]:block tw:[&_strong]:text-[14px] tw:[&_div_>_span]:block tw:[&_div_>_span]:mt-[5px] tw:[&_div_>_span]:text-[12px] tw:[&_div_>_span]:text-portal-muted tw:max-[520px]:pt-[16px] tw:max-[520px]:pr-[12px] tw:max-[520px]:pb-[16px] tw:max-[520px]:pl-[12px] tw:max-[520px]:gap-[10px]"}><span className={"dot tw:w-[8px] tw:h-[8px] tw:shrink-0 tw:rounded-[50%] tw:bg-[#c8d3ce] tw:[&.ready]:bg-[#24815f] tw:[&.ready]:[box-shadow:0_0_0_4px_#e9f4ed] ready"}/><div><strong>Frontend</strong><span>Next.js · port 3000</span></div><span className={"badge tw:ml-[auto] tw:text-[11px] tw:text-portal-muted tw:whitespace-nowrap tw:max-[520px]:text-[10px]"}>Running</span></div>
          <div className={"service tw:flex tw:items-center tw:gap-[14px] tw:pt-[18px] tw:pr-[18px] tw:pb-[18px] tw:pl-[18px] tw:[.service_+_&]:[border-top:1px_solid_var(--tw-color-portal-line)] tw:[&_strong]:block tw:[&_strong]:text-[14px] tw:[&_div_>_span]:block tw:[&_div_>_span]:mt-[5px] tw:[&_div_>_span]:text-[12px] tw:[&_div_>_span]:text-portal-muted tw:max-[520px]:pt-[16px] tw:max-[520px]:pr-[12px] tw:max-[520px]:pb-[16px] tw:max-[520px]:pl-[12px] tw:max-[520px]:gap-[10px]"}><span className={`dot tw:w-[8px] tw:h-[8px] tw:shrink-0 tw:rounded-[50%] tw:bg-[#c8d3ce] tw:[&.ready]:bg-[#24815f] tw:[&.ready]:[box-shadow:0_0_0_4px_#e9f4ed] ${health ? 'ready' : ''}`}/><div><strong>Backend</strong><span>NestJS · port 4000</span></div><span className={"badge tw:ml-[auto] tw:text-[11px] tw:text-portal-muted tw:whitespace-nowrap tw:max-[520px]:text-[10px]"}>{health ? 'Connected' : 'Not checked'}</span></div>
        </div>

        <button onClick={checkConnection} disabled={pending}>{pending ? 'Checking…' : 'Check backend connection'}<span aria-hidden="true">→</span></button>

        <div className={"result tw:mt-[20px] tw:text-[13px] tw:leading-[1.7] tw:text-portal-muted tw:[&_p]:mt-[8px] tw:[&_p]:mr-[0] tw:[&_p]:mb-[8px] tw:[&_p]:ml-[0]"} role="status" aria-live="polite">
          {health ? (<><p className={"success tw:text-[#216949] tw:font-bold"}>Connected successfully · {coreApiUrl.startsWith('/') ? 'via gateway' : 'CORS is working'}</p><p>The browser received a response from NestJS.</p><pre>{JSON.stringify(health, null, 2)}</pre></>) : error ? (<><p className={"error tw:text-[#b33d34] tw:font-bold"}>Unable to connect to the backend</p><p>{error}</p><p>Check that Core is running, verify the API URL and CORS_ORIGINS, and try again.</p></>) : (<p>Use the button to send a request from your browser to the backend.</p>)}
        </div>
        <p className={"endpoint tw:[border-top:1px_solid_var(--tw-color-portal-line)] tw:pt-[18px] tw:mt-[24px] tw:text-portal-muted tw:text-[11px] tw:leading-[1.7] tw:wrap-anywhere tw:[&_code]:ml-[6px]"}>API <code>{coreApiUrl}/health/live</code></p>
      </section>
      <footer>Local environment · Next.js + NestJS</footer>
    </main>);
}
