import Link from "next/link";
import { requireUser } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { describeActiveProvider } from "@/lib/ai";
import { signOutAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { PalettePicker } from "@/components/palette-picker";
import { DimensionRule } from "@/components/construction-marks";
import { PandaMark } from "@/components/panda-mark";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const provider = describeActiveProvider();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-36 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/app" className="flex items-center gap-2.5">
            <PandaMark size={120} />
            <span className="text-3xl font-bold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <Badge variant={provider.aiEnabled ? "accent" : "secondary"}>
            {provider.aiEnabled ? "AI: OpenAI" : "AI: deterministic"}
          </Badge>
        </div>
        <div className="flex items-center gap-5">
          <PalettePicker className="hidden sm:flex" />
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <DimensionRule className="mx-auto w-full max-w-6xl px-6" />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
