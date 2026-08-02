import type { IndustryPackDef } from "./types";
import { commonFields, expl } from "./common";

export const genericPack: IndustryPackDef = {
  key: "generic",
  version: "1.0.0",
  name: "Generic business",
  description:
    "A versatile operating model for most companies: people, teams, clients, projects, and the documents and decisions around them.",
  primaryUnitTypeKey: "project",
  recordTypes: [
    {
      key: "person",
      name: "Person",
      description: "An individual — employee, contact, or stakeholder.",
      icon: "user",
      color: "#2563eb",
      sensitivity: "INTERNAL",
      fields: [
        { key: "title", name: "Title", type: "short_text" },
        commonFields.email(),
        { key: "phone", name: "Phone", type: "short_text", sensitivity: "CONFIDENTIAL" },
        commonFields.notes(),
      ],
      explanation: expl(
        "People are the backbone of any organizational graph.",
        "Who is involved and how do we reach them?",
        "All organizations track people.",
      ),
    },
    {
      key: "team",
      name: "Team",
      description: "A department or working group.",
      icon: "users",
      color: "#7c3aed",
      fields: [{ key: "mandate", name: "Mandate", type: "long_text" }],
      explanation: expl(
        "Teams give structure to ownership and reporting.",
        "How is the organization structured?",
        "Departments and teams were named as participants.",
      ),
    },
    {
      key: "client",
      name: "Client",
      description: "A customer the organization serves.",
      icon: "briefcase",
      color: "#0891b2",
      fields: [
        { key: "industry", name: "Industry", type: "short_text" },
        commonFields.notes(),
      ],
      explanation: expl(
        "Clients are who the work is for; nearly every question routes back to them.",
        "Who are our customers and what do we do for them?",
        "Clients were named as participants.",
      ),
    },
    {
      key: "project",
      name: "Project",
      description: "A primary unit of work with an owner and a lifecycle.",
      icon: "folder-kanban",
      color: "#059669",
      fields: [
        commonFields.status(["Planned", "Active", "Blocked", "Done"]),
        commonFields.dueDate(),
        commonFields.notes(),
      ],
      explanation: expl(
        "Projects are the default unit of work the graph is built to move forward.",
        "What are we delivering and where does it stand?",
        "Projects were described as the primary unit of work.",
      ),
    },
    {
      key: "task",
      name: "Task",
      description: "A discrete piece of work within a project.",
      icon: "check-square",
      color: "#16a34a",
      fields: [
        commonFields.status(["To do", "Doing", "Done"]),
        commonFields.dueDate(),
      ],
      explanation: expl(
        "Tasks make progress measurable beneath projects.",
        "What concrete steps remain?",
        "Work breaks down into stages and steps.",
      ),
    },
    {
      key: "document",
      name: "Document",
      description: "A file, brief, or source that supports work and decisions.",
      icon: "file-text",
      color: "#4b5563",
      fields: [
        { key: "url", name: "Link", type: "url" },
        commonFields.notes(),
      ],
      explanation: expl(
        "Documents are the evidence behind decisions and deliverables.",
        "What supports this work, and where does it live?",
        "Information lives across the systems you selected.",
      ),
    },
    {
      key: "meeting",
      name: "Meeting",
      description: "A scheduled discussion that produces decisions and actions.",
      icon: "calendar",
      color: "#d97706",
      fields: [{ key: "date", name: "Date", type: "datetime" }, commonFields.notes()],
      explanation: expl(
        "Meetings are where decisions are made; capturing them keeps context.",
        "Where were key decisions made?",
        "Coordination happens through meetings.",
      ),
    },
    {
      key: "decision",
      name: "Decision",
      description: "A recorded choice with rationale and supporting sources.",
      icon: "gavel",
      color: "#9333ea",
      fields: [commonFields.notes()],
      explanation: expl(
        "Decisions with their sources make the organization auditable and teachable.",
        "Why did we choose this, and what informed it?",
        "Auditability is a product principle.",
      ),
    },
    {
      key: "vendor",
      name: "Vendor",
      description: "An external supplier or service provider.",
      icon: "truck",
      color: "#ca8a04",
      fields: [commonFields.email(), commonFields.notes()],
      explanation: expl(
        "Vendors are external dependencies worth tracking alongside internal work.",
        "Who do we depend on externally?",
        "Vendors were named as participants.",
      ),
    },
    {
      key: "agreement",
      name: "Agreement",
      description: "A contract or agreement with a client or vendor.",
      icon: "file-signature",
      color: "#be123c",
      sensitivity: "CONFIDENTIAL",
      fields: [
        { key: "effective_date", name: "Effective date", type: "date" },
        { key: "expires_on", name: "Expires on", type: "date" },
        commonFields.amount("Contract value"),
      ],
      explanation: expl(
        "Agreements carry obligations and dates that create risk if missed.",
        "What are we committed to and until when?",
        "Contracts and obligations must be tracked.",
      ),
    },
    {
      key: "invoice",
      name: "Invoice",
      description: "A billing document tied to a client or project.",
      icon: "receipt",
      color: "#0d9488",
      sensitivity: "CONFIDENTIAL",
      fields: [
        commonFields.amount(),
        commonFields.status(["Draft", "Sent", "Paid", "Overdue"]),
        commonFields.dueDate(),
      ],
      explanation: expl(
        "Financial relationships connect work to revenue.",
        "What is owed and what has been paid?",
        "Financial relationships were in scope.",
      ),
    },
    {
      key: "location",
      name: "Location",
      description: "An office, site, or place of operation.",
      icon: "map-pin",
      color: "#65a30d",
      fields: [{ key: "address", name: "Address", type: "short_text" }],
      explanation: expl(
        "Locations anchor people, work, and assets geographically.",
        "Where do we operate?",
        "Locations were captured in the interview.",
      ),
    },
  ],
  relationshipTypes: [
    rel("person_manages_person", "person", "person", "manages", "reports to", "one_to_many"),
    rel("person_belongs_to_team", "person", "team", "belongs to", "includes", "many_to_one"),
    rel("person_owns_project", "person", "project", "owns", "is owned by", "one_to_many"),
    rel("project_serves_client", "project", "client", "serves", "is served by", "many_to_one"),
    rel("task_part_of_project", "task", "project", "is part of", "contains", "many_to_one"),
    rel("document_supports_decision", "document", "decision", "supports", "is supported by"),
    rel("meeting_produced_decision", "meeting", "decision", "produced", "was produced in"),
    rel("agreement_with_client", "agreement", "client", "is with", "has agreement", "many_to_one", "CONFIDENTIAL"),
    rel("invoice_for_client", "invoice", "client", "bills", "is billed", "many_to_one", "CONFIDENTIAL"),
    rel("vendor_supplies_project", "vendor", "project", "supplies", "is supplied by"),
    rel("person_based_at_location", "person", "location", "is based at", "hosts", "many_to_one"),
  ],
  workflows: [
    {
      key: "project_lifecycle",
      name: "Project lifecycle",
      recordTypeKey: "project",
      states: [
        { key: "planned", name: "Planned" },
        { key: "active", name: "Active" },
        { key: "blocked", name: "Blocked" },
        { key: "done", name: "Done", isTerminal: true },
      ],
      transitions: [
        { from: "planned", to: "active" },
        { from: "active", to: "blocked" },
        { from: "blocked", to: "active" },
        { from: "active", to: "done", requiresApproval: true },
      ],
      explanation: expl(
        "A simple, universal delivery flow that most teams recognize immediately.",
        "Where is each project in its lifecycle?",
        "Work passes through stages with owners and approvals.",
      ),
    },
  ],
  questions: [
    { id: "unpaid_invoices", text: "Which invoices are overdue?" },
    { id: "expiring_agreements", text: "Which agreements expire in the next 45 days?" },
  ],
  importMappings: [
    {
      key: "people_csv",
      label: "People (CSV)",
      targetRecordTypeKey: "person",
      columns: { Name: "displayName", Email: "email", Title: "title" },
    },
    {
      key: "clients_csv",
      label: "Clients (CSV)",
      targetRecordTypeKey: "client",
      columns: { Name: "displayName", Industry: "industry" },
    },
  ],
};

// Small relationship helper to keep the pack readable.
function rel(
  key: string,
  sourceTypeKey: string,
  targetTypeKey: string,
  forwardLabel: string,
  reverseLabel: string,
  cardinality:
    | "one_to_one"
    | "one_to_many"
    | "many_to_one"
    | "many_to_many" = "many_to_many",
  sensitivity: "GENERAL" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" = "GENERAL",
) {
  return {
    key,
    sourceTypeKey,
    targetTypeKey,
    forwardLabel,
    reverseLabel,
    cardinality,
    sensitivity,
    explanation: expl(
      `Captures how ${sourceTypeKey.replace(/_/g, " ")} relates to ${targetTypeKey.replace(/_/g, " ")}.`,
      `How is ${sourceTypeKey.replace(/_/g, " ")} connected to ${targetTypeKey.replace(/_/g, " ")}?`,
      "Core relationship for this operating model.",
    ),
  };
}

export { rel as genericRel };
