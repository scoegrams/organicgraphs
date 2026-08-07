import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { lookupInvitation } from "@/lib/invitations";
import { normalizeEmail } from "@/lib/accounts";
import { PandaMark } from "@/components/panda-mark";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { AcceptInviteButton } from "./accept-button";

export const dynamic = "force-dynamic";

const ROLE_BLURB: Record<string, string> = {
  OWNER: "full control, including billing and members",
  ADMIN: "manage the schema, records, and members",
  MANAGER: "add and edit records",
  CONTRIBUTOR: "add and edit records",
  VIEWER: "read-only access",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <PandaMark size={140} />
      {children}
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupInvitation(token);

  if (!lookup.ok) {
    const message = {
      not_found: "This invitation link is not valid.",
      expired: "This invitation has expired.",
      already_accepted: "This invitation has already been used.",
      revoked: "This invitation was withdrawn.",
    }[lookup.reason];

    return (
      <Shell>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message} Ask whoever invited you to send a new link.
        </p>
        <Link
          href="/"
          className="mt-6 text-sm font-semibold text-accent transition hover:opacity-70"
        >
          Back to home
        </Link>
      </Shell>
    );
  }

  const { invitation } = lookup;
  const user = await getCurrentUser();

  // Signed in as the invited person: one click to join.
  if (user && normalizeEmail(user.email) === invitation.email) {
    return (
      <Shell>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          Join {invitation.organizationName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&rsquo;ll join as a {invitation.role.toLowerCase()} —{" "}
          {ROLE_BLURB[invitation.role] ?? "access to this workspace"}.
        </p>
        <div className="mt-8">
          <AcceptInviteButton token={token} />
        </div>
      </Shell>
    );
  }

  // Signed in as somebody else: switching accounts is the only way through.
  if (user) {
    return (
      <Shell>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Wrong account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation was sent to <strong>{invitation.email}</strong>, but
          you&rsquo;re signed in as {user.email}. Sign out and use the invited address.
        </p>
        <form action={signOutAndReturn} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="text-sm font-semibold text-accent transition hover:opacity-70"
          >
            Sign out and switch accounts
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        Join {invitation.organizationName}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create an account or sign in as {invitation.email} to accept this invitation.
      </p>
      <div className="mt-8">
        <SignInForm
          invite={token}
          inviteEmail={invitation.email}
          next={`/app/${invitation.organizationId}/workspace`}
          startOn="signup"
        />
      </div>
    </Shell>
  );
}

async function signOutAndReturn(formData: FormData) {
  "use server";
  const { signOut } = await import("@/lib/auth");
  await signOut();
  redirect(`/invite/${String(formData.get("token") ?? "")}`);
}
