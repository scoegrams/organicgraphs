import Link from "next/link";
import { brand } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
import { PalettePicker } from "@/components/palette-picker";
import {
  CornerTicks,
  DimensionRule,
  NodeGraphGlyph,
} from "@/components/construction-marks";
import { PandaMark } from "@/components/panda-mark";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <PandaMark size={176} />
          <span className="text-4xl font-bold tracking-tight">
            {brand.name}
          </span>
        </div>
        <PalettePicker />
      </header>

      <DimensionRule className="mx-auto w-full max-w-6xl px-6" />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-14 px-6 py-16 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {brand.tagline}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            {brand.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-in" className={cn(buttonVariants({ size: "lg" }))}>
              Get started
            </Link>
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-accent text-accent hover:bg-accent/10 hover:text-accent",
              )}
            >
              Developer sign-in
            </Link>
          </div>
        </div>

        <div className="relative aspect-square w-full max-w-sm shrink-0 border border-border bg-card p-8">
          <CornerTicks />
          <NodeGraphGlyph className="text-primary" />
          <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          <p className="absolute bottom-3 left-0 w-full text-center text-xs text-muted-foreground">
            every node is a record in your organization
          </p>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8">
        <DimensionRule className="mb-4" />
        <p className="text-xs text-muted-foreground">
          Milestone 1 spine: sign in → organization → industry pack → wizard →
          recommended operating model → review &amp; approve → generated
          workspace.
        </p>
      </footer>
    </div>
  );
}
