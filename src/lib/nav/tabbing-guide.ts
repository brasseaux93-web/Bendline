import type { Jurisdiction } from "@/lib/domain/types";
import type { OutlineNodeRecord, TabbingGuide, TabbingGuideItem } from "./types";

const IPC_DEFAULT_TABS: TabbingGuideItem[] = [
  {
    chapterRef: "Ch. 3",
    title: "General Piping & Hanger Spacing",
    tabColor: "Cyan",
    tabSide: "Right edge",
    focusSummary: "Supports table, corrosion sleeves, testing pressures.",
  },
  {
    chapterRef: "Ch. 4",
    title: "Fixtures & Minimum Facilities",
    tabColor: "Cyan",
    tabSide: "Right edge",
    focusSummary: "Occupancy fixture table and urinal/closet clearances.",
  },
  {
    chapterRef: "Ch. 5",
    title: "Water Heaters & Relief Protection",
    tabColor: "Amber",
    tabSide: "Right edge",
    focusSummary: "T&P relief discharge routing, pans, thermal expansion.",
  },
  {
    chapterRef: "Ch. 6",
    title: "Water Supply & Cross-Connection",
    tabColor: "Emerald",
    tabSide: "Right edge",
    focusSummary: "WSFU sizing tables, backflow device hazard selection.",
  },
  {
    chapterRef: "Ch. 7",
    title: "Sanitary Drainage & DFU",
    tabColor: "Amber",
    tabSide: "Right edge",
    focusSummary: "DFU table, drain slope capacity, fitting orientation, cleanouts.",
  },
  {
    chapterRef: "Ch. 9",
    title: "Vents, Trap Arms & Wet Vents",
    tabColor: "Cyan",
    tabSide: "Top edge",
    focusSummary: "Trap-to-vent table, wet venting, AAVs, vent length chart.",
  },
  {
    chapterRef: "Ch. 10–11",
    title: "Traps, Interceptors & Storm",
    tabColor: "Purple",
    tabSide: "Top edge",
    focusSummary: "Trap seal bounds, grease interceptors, roof rainfall tables.",
  },
];

const UPC_DEFAULT_TABS: TabbingGuideItem[] = [
  {
    chapterRef: "Ch. 3",
    title: "General Installation & Hangers",
    tabColor: "Cyan",
    tabSide: "Right edge",
    focusSummary: "Hanger spacing intervals and pipe protection rules.",
  },
  {
    chapterRef: "Ch. 4–5",
    title: "Fixtures & Water Heaters",
    tabColor: "Amber",
    tabSide: "Right edge",
    focusSummary: "Fixture clearance rules, seismic strapping, T&P termination.",
  },
  {
    chapterRef: "Ch. 6",
    title: "Water Supply & Backflow",
    tabColor: "Emerald",
    tabSide: "Right edge",
    focusSummary: "Developed-length WSFU sizing charts and backflow selection.",
  },
  {
    chapterRef: "Ch. 7",
    title: "Sanitary Drainage & Sewers",
    tabColor: "Amber",
    tabSide: "Top edge",
    focusSummary: "DFU values, sewer pitch capacity, horizontal branch tables.",
  },
  {
    chapterRef: "Ch. 9",
    title: "Vents, Trap Arms & Island Sinks",
    tabColor: "Cyan",
    tabSide: "Top edge",
    focusSummary: "Aggregate vent cross-section and trap-arm distance bounds.",
  },
];

export function buildTabbingGuide(
  jurisdiction: Jurisdiction,
  outlineNodes: OutlineNodeRecord[] = []
): TabbingGuide {
  const customTables = outlineNodes
    .filter(
      (n) =>
        n.code_family === jurisdiction.code_family &&
        n.edition === jurisdiction.edition &&
        n.node_kind === "table"
    )
    .slice(0, 4);

  const recommendedTabs =
    jurisdiction.code_family === "UPC" ? [...UPC_DEFAULT_TABS] : [...IPC_DEFAULT_TABS];

  if (customTables.length > 0 && recommendedTabs.length > 0) {
    // Highlight top table anchor alongside chapter index guide
    recommendedTabs[recommendedTabs.length - 1] = {
      ...recommendedTabs[recommendedTabs.length - 1],
      focusSummary: `${recommendedTabs[recommendedTabs.length - 1].focusSummary} Key high-frequency table: ${customTables[0].title}.`,
    };
  }

  return {
    jurisdictionName: jurisdiction.name,
    codeFamily: jurisdiction.code_family,
    edition: jurisdiction.edition,
    openBook: jurisdiction.open_book,
    allowedRefs: jurisdiction.allowed_refs,
    bulletinUrl: jurisdiction.bulletin_url,
    lastVerifiedAt: jurisdiction.last_verified_at,
    bulletinVerificationNotice:
      "IMPORTANT: Verify permitted tab types (permanent vs removable, factory-printed vs handwritten labels) and book-marking rules directly in your state licensing bulletin before exam day.",
    disclaimer: "Verify against your adopted code. Not legal advice.",
    recommendedTabs,
    examDayChecklist: [
      "Verify in the state vendor bulletin whether permanent adhesive tabs only are permitted and whether handwritten notes or highlights are restricted.",
      "Place high-frequency Sizing Tables (DFU, WSFU, Trap Arm, Rainfall) on Top edge tabs; place Chapter starts cleanly stepped along the Right edge.",
      "Use clean printed section labels only if handwritten tab abbreviations are disallowed by your testing center.",
      "Confirm the exact adopted code edition and state amendment insert listed in your exam confirmation letter.",
    ],
  };
}
