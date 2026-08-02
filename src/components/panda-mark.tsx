/**
 * The product mascot: a panda stitching nodes together.
 * The yarn ball is a node; the thread between them is a relationship.
 * Imported as a static Next.js image so it's optimized and never a request
 * to an external host.
 */
import Image from "next/image";
import pandaSrc from "@/img/logo-panda-transparent.png";
import { cn } from "@/lib/utils";

export function PandaMark({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={pandaSrc}
      alt="OrgGraph — a panda stitching organization nodes together"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
