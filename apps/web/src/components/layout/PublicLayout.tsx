import Link from "next/link";
import { PublicNavAuth } from "@/components/layout/PublicNavAuth";

type PublicLayoutProps = {
  children: React.ReactNode;
};

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Documind AI
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <Link href="#features" className="transition-colors hover:text-indigo-600">
              Features
            </Link>
            <Link href="#how-it-works" className="transition-colors hover:text-indigo-600">
              How it works
            </Link>
            <Link href="#testimonials" className="transition-colors hover:text-indigo-600">
              Testimonials
            </Link>
          </nav>
          <PublicNavAuth />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} Documind AI. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:text-indigo-600">
              Privacy
            </Link>
            <Link href="#" className="hover:text-indigo-600">
              Terms
            </Link>
            <Link href="#" className="hover:text-indigo-600">
              X
            </Link>
            <Link href="#" className="hover:text-indigo-600">
              LinkedIn
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
