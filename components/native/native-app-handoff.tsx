import { ArrowUpRight, Download, Smartphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type NativeAppHandoffProps = {
  openURL: string;
  title: string;
  description: string;
  statusMessage?: string | null;
};

export function NativeAppHandoff({
  openURL,
  title,
  description,
  statusMessage,
}: NativeAppHandoffProps) {
  const installURL = process.env.NEXT_PUBLIC_IOS_INSTALL_URL?.trim();

  return (
    <main className="min-h-dvh bg-[#f5f7f9] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-[#17202d]">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col">
        <header className="flex items-center gap-3" aria-label="SideSeat">
          <Image
            src="/icons/app-icon.png"
            alt="SideSeat"
            width={48}
            height={48}
            priority
            className="h-12 w-12 rounded-[12px] shadow-sm"
          />
          <div>
            <p className="text-lg font-semibold">SideSeat</p>
            <p className="text-sm text-[#667085]">iPhone app</p>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-[#e7f4ee] text-[#176b4d]">
            <Smartphone aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <h1 className="max-w-sm text-3xl font-semibold leading-tight">{title}</h1>
          <p className="mt-4 max-w-sm text-base leading-6 text-[#667085]">{description}</p>

          {statusMessage ? (
            <p className="mt-5 rounded-lg border border-[#bddfce] bg-[#edf8f2] px-4 py-3 text-sm leading-5 text-[#155c43]">
              {statusMessage}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3">
            <a
              href={openURL}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#17202d] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#293446] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17202d]"
            >
              Open SideSeat
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </a>
            {installURL ? (
              <a
                href={installURL}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#d0d5dd] bg-white px-5 py-3 text-sm font-semibold text-[#344054] transition-colors hover:bg-[#f9fafb]"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Install for iPhone
              </a>
            ) : null}
          </div>
        </section>

        <footer className="flex items-center gap-5 border-t border-[#e1e5ea] pt-5 text-sm text-[#667085]">
          <Link href="/privacy" className="hover:text-[#17202d]">
            Privacy
          </Link>
          <Link href="/support" className="hover:text-[#17202d]">
            Support
          </Link>
        </footer>
      </div>
    </main>
  );
}
