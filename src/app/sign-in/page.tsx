import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { PandaMark } from "@/components/panda-mark";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/app");
  const { next, mode } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="group -mx-1 inline-flex w-fit items-center gap-1.5 rounded px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 11L5 7l4-4" />
        </svg>
        Back to home
      </Link>
      <PandaMark size={160} className="mt-8" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Sign in to {brand.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to build and explore your organization&rsquo;s knowledge graph.
      </p>
      <div className="mt-8">
        <SignInForm
          next={next}
          startOn={mode === "signup" ? "signup" : "signin"}
        />
      </div>
    </main>
  );
}
