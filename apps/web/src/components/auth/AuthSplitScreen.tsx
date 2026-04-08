import { Lightbulb, ShieldCheck, Sparkles } from "lucide-react";
import { AuthForm } from "@/components/auth/AuthForm";

type AuthSplitScreenProps = {
  mode: "login" | "signup";
};

export function AuthSplitScreen({ mode }: AuthSplitScreenProps) {
  const isLogin = mode === "login";

  return (
    <section className="py-8 md:py-12">
      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-2">
        <div className="order-2 p-5 md:p-8 lg:order-1">
          <AuthForm mode={mode} />
        </div>
        <div className="order-1 bg-gradient-to-br from-slate-900 via-indigo-900 to-indigo-700 p-8 text-white lg:order-2">
          {isLogin ? (
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-widest text-indigo-200">Knowledge Innovation</p>
              <blockquote className="max-w-md text-2xl font-medium leading-relaxed">
                “The future belongs to those who can turn information into understanding.”
              </blockquote>
              <p className="max-w-md text-sm text-indigo-100/90">
                กลับเข้าสู่ระบบเพื่อค้นหา insight ใหม่จากเอกสารชุดเดิมของคุณอย่างต่อเนื่อง
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Why join Documind AI?</h2>
              <ul className="space-y-4 text-sm text-indigo-100">
                <li className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Citation-first answers that are easy to verify.
                </li>
                <li className="flex items-start gap-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                  Cross-document reasoning for faster research decisions.
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  Instant summaries and reusable knowledge workspace.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
