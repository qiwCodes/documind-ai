"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const authSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type AuthValues = z.infer<typeof authSchema>;

type AuthFormProps = {
  mode: "login" | "signup";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

  const isLogin = mode === "login";
  const nextPath = searchParams.get("next") || "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const meta = useMemo(
    () =>
      isLogin
        ? {
            title: "Welcome back",
            subtitle: "Sign in to continue your document intelligence workflow",
            submitLabel: "Log in",
            switchLabel: "ยังไม่มีบัญชี?",
            switchAction: "สมัครสมาชิก",
            switchHref: `/signup?next=${encodeURIComponent(nextPath)}`,
          }
        : {
            title: "Create your account",
            subtitle: "Start building smarter conversations from your documents",
            submitLabel: "Sign up",
            switchLabel: "มีบัญชีอยู่แล้ว?",
            switchAction: "เข้าสู่ระบบ",
            switchHref: `/login?next=${encodeURIComponent(nextPath)}`,
          },
    [isLogin, nextPath],
  );

  useEffect(() => {
    if (!serverError && !successMessage) return;
    const timer = setTimeout(() => {
      setServerError(null);
      setSuccessMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [serverError, successMessage]);

  const onSubmit = async (values: AuthValues) => {
    setServerError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setServerError("Missing Supabase env in apps/web/.env.local. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) {
          setServerError(error.message);
          return;
        }
        router.push(nextPath);
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
      setSuccessMessage("Account created. Check your inbox to confirm your email before logging in.");
    } finally {
      setIsLoading(false);
    }
  };

  const onOauth = async (provider: "google" | "github") => {
    setServerError(null);
    setSuccessMessage(null);
    setOauthLoading(provider);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setServerError("Missing Supabase env in apps/web/.env.local. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) {
        if (error.message.includes("Unsupported provider")) {
          setServerError(
            `Provider ${provider} is not enabled in Supabase. Enable it in Authentication > Providers first.`,
          );
        } else {
          setServerError(error.message);
        }
      }
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <div className="relative">
      {(serverError || successMessage) && (
        <div
          className={`absolute -top-14 left-0 right-0 rounded-md px-3 py-2 text-xs shadow-sm ${
            serverError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
          role="status"
          aria-live="polite"
        >
          {serverError ?? successMessage}
        </div>
      )}
      <Card className="w-full border-slate-200">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">{meta.title}</CardTitle>
        <p className="text-sm text-slate-500">{meta.subtitle}</p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" placeholder="you@domain.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <Input type="password" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : meta.submitLabel}
          </Button>

          <div className="relative py-1 text-center text-xs text-slate-400">
            <span className="bg-white px-2">or continue with</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOauth("google")}
              disabled={isLoading || oauthLoading !== null}
            >
              {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Google"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOauth("github")}
              disabled={isLoading || oauthLoading !== null}
            >
              {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : "GitHub"}
            </Button>
          </div>

          <p className="text-center text-sm text-slate-500">
            {meta.switchLabel}{" "}
            <Link href={meta.switchHref} className="font-medium text-indigo-600 hover:text-indigo-500">
              {meta.switchAction}
            </Link>
          </p>
        </form>
      </CardContent>
      </Card>
    </div>
  );
}
