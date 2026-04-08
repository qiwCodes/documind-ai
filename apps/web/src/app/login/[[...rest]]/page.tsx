import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { PublicLayout } from "@/components/layout/PublicLayout";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { userId } = await auth();
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";

  if (userId) {
    redirect(nextPath);
  }

  return (
    <PublicLayout>
      <section className="py-10 md:py-14">
        <div className="mx-auto max-w-md">
          <SignIn path="/login" routing="path" signUpUrl={`/signup?next=${encodeURIComponent(nextPath)}`} />
        </div>
      </section>
    </PublicLayout>
  );
}
