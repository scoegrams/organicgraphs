import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PACKS } from "@/lib/packs";
import { getCurrentUser } from "@/lib/auth";
import { PandaMark } from "@/components/panda-mark";
import { brand } from "@/lib/brand";
import {
  PreviewGraph,
  type PreviewGraphEdge,
  type PreviewGraphNode,
} from "./preview-graph";
import {
  DEFAULT_DESIGN_COLORS,
  buildTypeShades,
  ensureContrast,
  inkOn,
  luminance,
  mixHex,
  shadeForType,
} from "@/lib/design-palette";
import { fieldsFromJson } from "@/lib/obsidian-export";

export const dynamic = "force-dynamic";

const MAX_DRAFT_NODES = 56;

function hex(c: string) {
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      description: true,
      industryPackKey: true,
      designPack: true,
    },
  });

  if (!org) notFound();

  const pack = org.designPack;
  const user = await getCurrentUser();
  const membership = user
    ? await prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId: orgId },
        },
        select: { id: true },
      })
    : null;
  const isMember = Boolean(membership);

  // A preview is only readable by the org's own members until its owner
  // publishes it. 404 rather than 403 so an org id cannot be confirmed by
  // probing this route.
  if (!isMember && !pack?.isPublic) notFound();

  const [typeCounts, recordTypes, allRecords, allRelationships, relationshipTypes] =
    await Promise.all([
      prisma.record.groupBy({
        by: ["recordTypeKey"],
        where: { organizationId: orgId, archived: false },
        _count: { _all: true },
      }),
      prisma.recordTypeDefinition.findMany({
        where: { organizationId: orgId },
        select: { key: true, name: true, color: true, fields: true },
      }),
      prisma.record.findMany({
        where: { organizationId: orgId, archived: false },
        select: {
          id: true,
          displayName: true,
          recordTypeKey: true,
          status: true,
          values: true,
          sensitivity: true,
        },
      }),
      prisma.relationship.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          sourceId: true,
          targetId: true,
          relationshipTypeKey: true,
        },
      }),
      prisma.relationshipTypeDefinition.findMany({
        where: { organizationId: orgId },
        select: {
          key: true,
          forwardLabel: true,
          reverseLabel: true,
        },
      }),
    ]);

  const typeNameMap = new Map(recordTypes.map((t) => [t.key, t]));
  const relTypeByKey = new Map(relationshipTypes.map((r) => [r.key, r]));
  const fieldMetaByType = new Map(
    recordTypes.map((t) => {
      const defs = fieldsFromJson(t.fields);
      const raw = Array.isArray(t.fields) ? t.fields : [];
      const sens = new Map<string, string>();
      for (const f of raw) {
        if (f && typeof f === "object" && "key" in f) {
          const o = f as { key?: string; sensitivity?: string };
          if (typeof o.key === "string")
            sens.set(o.key, o.sensitivity ?? "GENERAL");
        }
      }
      return [t.key, { defs, sens }] as const;
    }),
  );
  const totalRecords = typeCounts.reduce((s, r) => s + r._count._all, 0);
  const relCount = allRelationships.length;

  // Prefer highly connected nodes for the draft so the site graph looks alive.
  const degree = new Map<string, number>();
  for (const r of allRecords) degree.set(r.id, 0);
  for (const e of allRelationships) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  const ranked = [...allRecords].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
  );
  const draftRecords = ranked.slice(0, MAX_DRAFT_NODES);
  const draftIds = new Set(draftRecords.map((r) => r.id));

  const industryPack = org.industryPackKey
    ? PACKS.find((p) => p.key === org.industryPackKey)
    : null;

  // Site mode always paints from the user's 4 design colors — never pack rainbows.
  const primary = pack?.colorPrimary ?? DEFAULT_DESIGN_COLORS.colorPrimary;
  const secondary = pack?.colorSecondary ?? DEFAULT_DESIGN_COLORS.colorSecondary;
  const accent = pack?.colorAccent ?? DEFAULT_DESIGN_COLORS.colorAccent;
  const neutral = pack?.colorNeutral ?? DEFAULT_DESIGN_COLORS.colorNeutral;
  const tagline = pack?.tagline ?? org.description ?? null;

  const typeShades = buildTypeShades({ primary, secondary, accent, neutral });
  const graphNodes: PreviewGraphNode[] = draftRecords.map((r) => {
    const t = typeNameMap.get(r.recordTypeKey);
    const meta = fieldMetaByType.get(r.recordTypeKey);
    const values =
      r.values && typeof r.values === "object" && !Array.isArray(r.values)
        ? (r.values as Record<string, unknown>)
        : {};
    const fields: { label: string; value: string }[] = [];
    // Public site: omit confidential / restricted record + field values.
    if (r.sensitivity === "GENERAL" || r.sensitivity === "INTERNAL") {
      for (const def of meta?.defs ?? []) {
        const sens = meta?.sens.get(def.key) ?? "GENERAL";
        if (sens === "CONFIDENTIAL" || sens === "RESTRICTED") continue;
        const v = values[def.key];
        if (v === null || v === undefined || v === "") continue;
        fields.push({
          label: def.name,
          value: Array.isArray(v) ? v.map(String).join(", ") : String(v),
        });
      }
    }
    return {
      id: r.id,
      name: r.displayName,
      typeKey: r.recordTypeKey,
      typeName: t?.name ?? r.recordTypeKey,
      color: shadeForType(r.recordTypeKey, typeShades),
      status: r.status,
      fields,
    };
  });
  const graphEdges: PreviewGraphEdge[] = allRelationships
    .filter((e) => draftIds.has(e.sourceId) && draftIds.has(e.targetId))
    .map((e) => {
      const rt = relTypeByKey.get(e.relationshipTypeKey);
      return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        forwardLabel: rt?.forwardLabel,
        reverseLabel: rt?.reverseLabel,
      };
    });

  // Page ground is Background; hero band is Primary. Type reacts to luminance.
  const bodyBg = secondary;
  const bodyText = ensureContrast(bodyBg, primary);
  const heroBg = primary;
  const heroText = inkOn(heroBg, {
    dark: "#141414",
    light: luminance(secondary) > 0.7 ? secondary : "#f9f7f3",
  });
  // Muted hero copy — blended, not opacity (opacity fails on neon greens).
  const heroMuted = mixHex(heroText, heroBg, 0.28);
  const heroWash = hex(heroText);
  const inkRgb = luminance(bodyBg) > 0.55 ? "#000000" : "#ffffff";
  const graphPaper = secondary;
  const chipOnAccent = inkOn(accent);

  return (
    <div
      style={{
        background: bodyBg,
        color: bodyText,
        minHeight: "100vh",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* Member chrome — only for logged-in org members */}
      {isMember ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: `${secondary}f2`,
            borderBottom: `1px solid ${primary}22`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              padding: "10px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`/app/${orgId}/workspace`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: accent,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ← Back to workspace
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link
                href={`/app/${orgId}/design`}
                style={{
                  color: primary,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  opacity: 0.8,
                }}
              >
                Edit design
              </Link>
              <Link
                href={`/app/${orgId}/graph`}
                style={{
                  color: primary,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  opacity: 0.8,
                }}
              >
                Open graph
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Hero ── */}
      <div style={{ background: heroBg, color: heroText }}>
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "72px 32px 60px",
          }}
        >
          {industryPack ? (
            <span
              style={{
                display: "inline-block",
                background: accent,
                color: chipOnAccent,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 10px",
                borderRadius: 4,
                marginBottom: 20,
              }}
            >
              {industryPack.name}
            </span>
          ) : null}

          <h1
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {org.name}
          </h1>

          {tagline ? (
            <p
              style={{
                marginTop: 20,
                fontSize: "clamp(1rem, 2.5vw, 1.35rem)",
                fontWeight: 500,
                color: heroMuted,
                maxWidth: 560,
                lineHeight: 1.5,
              }}
            >
              {tagline}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 36,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Records", value: totalRecords },
              { label: "Connections", value: relCount },
              { label: "Record types", value: typeCounts.length },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: `rgba(${heroWash} / 0.1)`,
                  border: `1px solid rgba(${heroWash} / 0.22)`,
                  borderRadius: 8,
                  padding: "10px 20px",
                  textAlign: "center",
                  color: heroText,
                }}
              >
                <div
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: heroMuted,
                    marginTop: 4,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: accent }} />

      {/* ── Graph draft ── */}
      {graphNodes.length > 0 ? (
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "56px 32px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: neutral,
                  margin: 0,
                }}
              >
                Organization graph
              </h2>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 15,
                  fontWeight: 600,
                  opacity: 0.8,
                }}
              >
                A live draft of how {org.name} is connected.
              </p>
            </div>
            {allRecords.length > MAX_DRAFT_NODES ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  opacity: 0.45,
                }}
              >
                Showing {graphNodes.length} of {allRecords.length} records
              </p>
            ) : null}
          </div>
          <PreviewGraph
            nodes={graphNodes}
            edges={graphEdges}
            ink={ensureContrast(graphPaper, primary)}
            paper={graphPaper}
            accent={accent}
            height={440}
          />
        </div>
      ) : null}

      {/* ── Record type grid ── */}
      {typeCounts.length > 0 ? (
        <div
          style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px 56px" }}
        >
          <h2
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: neutral,
              marginBottom: 24,
              marginTop: 0,
            }}
          >
            What&apos;s in the graph
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {typeCounts
              .sort((a, b) => b._count._all - a._count._all)
              .map((tc) => {
                const type = typeNameMap.get(tc.recordTypeKey);
                const typeColor = shadeForType(tc.recordTypeKey, typeShades);
                return (
                  <div
                    key={tc.recordTypeKey}
                    style={{
                      background: `rgba(${hex(inkRgb)} / 0.04)`,
                      border: `1px solid rgba(${hex(inkRgb)} / 0.1)`,
                      borderRadius: 10,
                      padding: "18px 20px",
                      borderTop: `3px solid ${typeColor}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                    >
                      {tc._count._all}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        marginTop: 6,
                        opacity: 0.7,
                      }}
                    >
                      {type?.name ?? tc.recordTypeKey}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* ── Color palette swatch ── */}
      {pack ? (
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "0 32px 56px",
          }}
        >
          <h2
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: neutral,
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            Brand palette
          </h2>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { color: primary, label: "Primary" },
              { color: secondary, label: "Background" },
              { color: accent, label: "Accent" },
              { color: neutral, label: "Neutral" },
            ].map(({ color, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: color,
                    border: `1px solid rgba(${hex(inkRgb)} / 0.15)`,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    opacity: 0.5,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: `1px solid rgba(${hex(inkRgb)} / 0.1)`,
          maxWidth: 900,
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 12, opacity: 0.45, margin: 0 }}>
          {org.name} · Knowledge graph
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: 0.4,
          }}
        >
          <PandaMark size={24} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            Powered by {brand.name}
          </span>
        </div>
      </div>
    </div>
  );
}
