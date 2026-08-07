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
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-75"
          >
            <PandaMark size={38} className="shrink-0" />
            <span className="text-lg font-bold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <Badge
            variant={provider.aiEnabled ? "accent" : "secondary"}
            className="hidden sm:inline-flex"
          >
            {provider.aiEnabled ? "AI on" : "AI off"}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <PalettePicker className="hidden sm:flex" />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground md:block">
              {user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <DimensionRule className="mx-auto w-full max-w-6xl px-6" />
      <main className="mx-auto max-w-6xl px-6 pt-7 pb-5">{children}</main>
    </div>
  );
}
