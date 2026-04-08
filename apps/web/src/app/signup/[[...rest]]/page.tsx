import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { PublicLayout } from "@/components/layout/PublicLayout";

type SignupPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
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
          <SignUp path="/signup" routing="path" signInUrl={`/login?next=${encodeURIComponent(nextPath)}`} />
        </div>
      </section>
    </PublicLayout>
  );
}
