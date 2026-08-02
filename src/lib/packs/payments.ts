import type { IndustryPackDef } from "./types";
import { commonFields, expl, rel, rt } from "./common";

// NOTE: This pack deliberately models the SALES/relationship side of a payments
// ISO/agent business. It must NEVER store cardholder data (PAN), full bank
// credentials, or authentication secrets. Fields are restricted accordingly.
export const paymentsPack: IndustryPackDef = {
  key: "payments",
  version: "1.0.0",
  name: "Payment-services sales organization",
  description:
    "For ISOs and payment agents: merchants, agents, processors, applications, pricing, residuals, and commissions — without ever touching cardholder data.",
  warning:
    "This workspace must never store cardholder data (card numbers), full bank credentials, or authentication secrets. Only merchant business details, boarding status, and commission relationships are captured. Handling card data requires a PCI-DSS compliant environment outside this application.",
  primaryUnitTypeKey: "merchant",
  recordTypes: [
    rt("merchant", "Merchant", "A business being boarded for payment processing.", {
      icon: "store", color: "#059669", sensitivity: "CONFIDENTIAL",
      fields: [
        { key: "legal_name", name: "Legal business name", type: "short_text" },
        { key: "mcc", name: "MCC (industry code)", type: "short_text" },
        commonFields.status(["Prospect", "Application", "Boarding", "Approved", "Declined"]),
        commonFields.notes(),
      ],
      why: "The merchant is the primary unit of a payments sales pipeline.",
      question: "Who are we boarding and where are they in the process?",
      cause: "Merchants are the primary unit of work.",
    }),
    rt("agent", "Agent", "A sales agent or sub-ISO.", {
      icon: "user", color: "#2563eb", sensitivity: "INTERNAL",
      fields: [commonFields.email(), { key: "agent_code", name: "Agent code", type: "short_text" }],
      why: "Agents source merchants and earn residual splits.",
      question: "Who brought in this merchant and what do they earn?",
      cause: "Agents were named as participants.",
    }),
    rt("processor", "Processor", "A payment processor / backend platform.", {
      icon: "cpu", color: "#7c3aed",
      fields: [commonFields.notes()],
      why: "Processors determine boarding rules and residual reporting.",
      question: "Which platform is a merchant boarded through?",
      cause: "Boarding routes through a processor.",
    }),
    rt("acquiring_partner", "Acquiring partner", "The acquiring bank or partner.", {
      icon: "landmark", color: "#b45309", sensitivity: "INTERNAL",
      fields: [commonFields.notes()],
      why: "Acquirers underwrite risk and hold the merchant relationship of record.",
      question: "Who is the acquiring partner behind a merchant?",
      cause: "Partners were named as participants.",
    }),
    rt("application", "Application", "A merchant application / MPA.", {
      icon: "file-text", color: "#4b5563", sensitivity: "CONFIDENTIAL",
      fields: [commonFields.status(["Draft", "Submitted", "Approved", "Declined"]), commonFields.dueDate()],
      why: "Applications gate boarding and carry underwriting status.",
      question: "What applications are in underwriting?",
      cause: "Work requires approvals.",
    }),
    rt("pricing_schedule", "Pricing schedule", "The rate/fee schedule for a merchant.", {
      icon: "percent", color: "#d97706", sensitivity: "CONFIDENTIAL",
      fields: [{ key: "buy_rate", name: "Buy rate", type: "percentage" }, { key: "sell_rate", name: "Sell rate", type: "percentage" }],
      why: "Pricing drives merchant economics and residual margin.",
      question: "What is the merchant paying and what is our margin?",
      cause: "Financial relationships in scope.",
    }),
    rt("processing_agreement", "Processing agreement", "The signed processing contract.", {
      icon: "file-signature", color: "#be123c", sensitivity: "CONFIDENTIAL",
      fields: [{ key: "effective_date", name: "Effective date", type: "date" }, { key: "expires_on", name: "Expires on", type: "date" }],
      why: "Agreements define term, obligations, and expiration.",
      question: "What are we committed to and until when?",
      cause: "Contracts must be tracked.",
    }),
    rt("terminal", "Terminal / gateway", "A device or gateway assigned to a merchant.", {
      icon: "smartphone", color: "#0d9488",
      fields: [{ key: "model", name: "Model", type: "short_text" }, commonFields.status(["Ordered", "Deployed", "Returned"]) ],
      why: "Terminals are assets tied to boarding and support.",
      question: "What equipment does a merchant have?",
      cause: "Merchants use terminals/gateways.",
    }),
    rt("residual_statement", "Residual statement", "A monthly residual report.", {
      icon: "bar-chart", color: "#16a34a", sensitivity: "CONFIDENTIAL",
      fields: [{ key: "period", name: "Period", type: "short_text" }, commonFields.amount("Residual amount")],
      why: "Residual statements are how the business gets paid over time.",
      question: "What residuals were earned this period?",
      cause: "Financial relationships in scope.",
    }),
    rt("commission_split", "Commission split", "How residuals split among agents.", {
      icon: "split", color: "#9333ea", sensitivity: "CONFIDENTIAL",
      fields: [{ key: "split_percent", name: "Split %", type: "percentage" }],
      why: "Splits determine who gets paid what, a frequent source of disputes.",
      question: "How is this merchant's residual shared?",
      cause: "Commissions must be transparent.",
    }),
    rt("support_case", "Support case", "A merchant support or dispute ticket.", {
      icon: "life-buoy", color: "#0891b2",
      fields: [commonFields.status(["Open", "Pending", "Resolved"]), commonFields.dueDate()],
      why: "Support quality drives retention in a churn-sensitive business.",
      question: "What issues are open for our merchants?",
      cause: "Blockers and service issues were flagged.",
    }),
    rt("compliance_document", "Compliance document", "KYC/AML or compliance artifact (no secrets).", {
      icon: "shield", color: "#4b5563", sensitivity: "RESTRICTED",
      fields: [{ key: "kind", name: "Document kind", type: "short_text" }, { key: "url", name: "Link", type: "url" }],
      why: "Compliance artifacts must be tracked but access-restricted.",
      question: "Is this merchant compliant and documented?",
      cause: "Regulated / sensitive information is involved.",
    }),
  ],
  relationshipTypes: [
    rel("agent_sources_merchant", "agent", "merchant", "sources", "was sourced by", "one_to_many"),
    rel("merchant_boarded_through_processor", "merchant", "processor", "is boarded through", "boards", "many_to_one"),
    rel("processor_backed_by_acquirer", "processor", "acquiring_partner", "is backed by", "backs", "many_to_one", "INTERNAL"),
    rel("application_for_merchant", "application", "merchant", "is for", "has application", "many_to_one", "CONFIDENTIAL"),
    rel("pricing_for_merchant", "pricing_schedule", "merchant", "prices", "has pricing", "one_to_one", "CONFIDENTIAL"),
    rel("agreement_for_merchant", "processing_agreement", "merchant", "governs", "has agreement", "one_to_one", "CONFIDENTIAL"),
    rel("terminal_assigned_merchant", "terminal", "merchant", "is assigned to", "uses", "many_to_one"),
    rel("residual_for_merchant", "residual_statement", "merchant", "reports", "has residuals", "many_to_one", "CONFIDENTIAL"),
    rel("split_for_agent", "commission_split", "agent", "pays", "is paid via", "many_to_one", "CONFIDENTIAL"),
    rel("support_for_merchant", "support_case", "merchant", "concerns", "has cases", "many_to_one"),
    rel("compliance_for_merchant", "compliance_document", "merchant", "documents", "has compliance", "one_to_many", "RESTRICTED"),
  ],
  workflows: [
    {
      key: "boarding_pipeline",
      name: "Merchant boarding",
      recordTypeKey: "merchant",
      states: [
        { key: "prospect", name: "Prospect" },
        { key: "application", name: "Application" },
        { key: "boarding", name: "Boarding" },
        { key: "approved", name: "Approved", isTerminal: true },
        { key: "declined", name: "Declined", isTerminal: true },
      ],
      transitions: [
        { from: "prospect", to: "application" },
        { from: "application", to: "boarding", requiresApproval: true },
        { from: "boarding", to: "approved", requiresApproval: true },
        { from: "application", to: "declined" },
        { from: "boarding", to: "declined" },
      ],
      explanation: expl(
        "The merchant boarding funnel from prospect to approved, with underwriting gates.",
        "Where is each merchant in boarding?",
        "You described work passing through stages with approvals.",
      ),
    },
  ],
  questions: [
    { id: "merchants_by_agent", text: "Which merchants did this agent source?" },
    { id: "pending_applications", text: "Which applications are in underwriting?" },
    { id: "expiring_agreements", text: "Which processing agreements expire soon?" },
  ],
  importMappings: [
    { key: "merchants_csv", label: "Merchants (CSV)", targetRecordTypeKey: "merchant", columns: { "Business name": "displayName", MCC: "mcc", Status: "status" } },
    { key: "agents_csv", label: "Agents (CSV)", targetRecordTypeKey: "agent", columns: { Name: "displayName", Email: "email", Code: "agent_code" } },
  ],
};
