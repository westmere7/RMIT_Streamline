import { addDays, subDays } from "date-fns";
import type { Tracker, TrackerSheet } from "@/domain";
import { DOMESTIC_CAMPAIGNS_COLUMNS, DOMESTIC_CAMPAIGNS_FROZEN, buildRows, buildTemplateColumns, type DemoRowSpec } from "@/features/trackers/tracker-template";
import { toISODate } from "@/lib/dates/dates";

export interface DemoTrackerOptions {
  workspaceId: string;
  teamId: string;
  createdBy: string;
  now: Date;
  /** Deterministic id generator so the seed is stable across runs. */
  idFor: () => string;
}

/**
 * Demo copy of the team's asset tracker. The layout (columns, bands, dropdowns)
 * follows the real workbook; every row below is invented for the demo.
 */
export function buildDemoTracker({ workspaceId, teamId, createdBy, now, idFor }: DemoTrackerOptions): { trackers: Tracker[]; trackerSheets: TrackerSheet[] } {
  const iso = (d: Date) => d.toISOString();
  const day = (offset: number) => toISODate(addDays(now, offset));
  const created = subDays(now, 21);

  const tracker: Tracker = {
    id: idFor(),
    workspaceId,
    teamId,
    name: "Domestic Campaigns Asset Tracker",
    description: "Creative asset production across domestic campaigns — one row per asset or size, grouped by phase and channel.",
    createdBy,
    createdAt: iso(created),
    updatedAt: iso(subDays(now, 1)),
  };

  const { columns, ids } = buildTemplateColumns(DOMESTIC_CAMPAIGNS_COLUMNS, () => idFor());

  const sem1: DemoRowSpec[] = [
    { section: "Phase 1 — Connect" },
    { subsection: "Display" },
    { cells: { channel: "Display", stage: "Prospecting (Connect)", targeting: "VE", objective: "Traffic", status: "IN PROGRESS", format: "HTML5", message: "How do I upskill for the job I actually want?", cta: "Explore courses", staticCopy: "Gain in-demand TAFE qualifications with hands-on learning and industry connections.", image: "Trades student in workshop", landingPage: "https://example.rmit.local/study/vocational", fileReview: "R1", developedBy: "Vietnam", sizes: "160x600px", specsLink: "https://example.rmit.local/specs/display", firstDraft: day(-3), materialDeadline: day(4), liveDate: day(8), endDate: day(60), notes: "Round 1 feedback in Frame.io — tighten headline on the skyscraper.", approved: "", despatched: "", fileLocation: "https://example.rmit.local/files/sem1-display" } },
    { cells: { sizes: "300x250px", fileReview: "R1" } },
    { cells: { sizes: "300x600px", fileReview: "R1", format: "HTML5" } },
    { cells: { sizes: "728x90px", fileReview: "R1" } },
    { cells: { sizes: "320x50px", fileReview: "R2" } },
    { cells: { sizes: "970x250px", fileReview: "R2", notes: "Static fallback × 6 to follow." } },
    { cells: { channel: "Display", stage: "Prospecting (Connect)", targeting: "PG", objective: "Traffic", status: "BRIEFED", format: "Static banner", message: "How do I elevate my career without pausing it?", cta: "Find your course", staticCopy: "Gain specialist skills with flexible postgraduate study designed for working professionals.", image: "Professional on campus at dusk", landingPage: "https://example.rmit.local/study/postgraduate", fileReview: "", developedBy: "Cyclone", sizes: "300x250px, 300x600px, 728x90px", firstDraft: day(2), materialDeadline: day(9), liveDate: day(12), endDate: day(60) } },
    { subsection: "Social" },
    { cells: { channel: "Facebook and Instagram", stage: "Prospecting (Connect)", targeting: "SL", objective: "Awareness", status: "NEEDS REVIEW", format: "Video - 15s", message: "Your next chapter starts at RMIT.", cta: "Learn more", staticCopy: "Hands-on learning, industry partners and a campus in the heart of Melbourne.", image: "Hero film cutdown", landingPage: "https://example.rmit.local/study", fileReview: "https://f.io/demo-social-15", developedBy: "Vietnam", sizes: "1x1 | 9x16 | 4x5", firstDraft: day(-5), materialDeadline: day(1), liveDate: day(8), endDate: day(45), notes: "Waiting on caption approval from Comms.", approved: "", despatched: "" } },
    { cells: { channel: "Facebook and Instagram", stage: "Prospecting (Connect)", targeting: "SL", objective: "Awareness", status: "COMPLETED", format: "Carousel", message: "Five ways RMIT gets you job-ready.", cta: "See how", staticCopy: "Industry placements, real briefs and mentors who work in the field.", image: "5-card carousel", landingPage: "https://example.rmit.local/study/job-ready", fileReview: "R3", developedBy: "Cyclone", sizes: "1080x1080 × 5", firstDraft: day(-14), materialDeadline: day(-7), liveDate: day(-2), endDate: day(45), approved: "Approved JW 28/8", despatched: "Y", fileLocation: "https://example.rmit.local/files/sem1-carousel" } },
    { cells: { channel: "YouTube", stage: "Prospecting (Connect)", targeting: "ALL", objective: "Awareness", status: "YET TO BRIEF", format: "Video - 6s", message: "Bumper — brand line only.", cta: "", staticCopy: "", image: "Hero film bumper", landingPage: "https://example.rmit.local/study", developedBy: "Vietnam", sizes: "16x9", firstDraft: day(6), materialDeadline: day(12), liveDate: day(15), endDate: day(45) } },
    { section: "Phase 2 — Convert" },
    { subsection: "Social" },
    { cells: { channel: "Facebook and Instagram", stage: "Remarketing (Convert)", targeting: "UG NSL", objective: "Traffic, Applications", status: "YET TO BRIEF", format: "Static", message: "Applications close soon — finish yours today.", cta: "Apply now", staticCopy: "Still deciding? Talk to us about pathways, credit transfer and scholarships.", image: "Student at open day desk", landingPage: "https://example.rmit.local/apply", developedBy: "Comms", sizes: "1x1 | 9x16", firstDraft: day(20), materialDeadline: day(27), liveDate: day(30), endDate: day(75) } },
    { cells: { channel: "The Age (HPTO)", stage: "Remarketing (Convert)", targeting: "PG", objective: "Traffic", status: "YET TO BRIEF", format: "Static banner", message: "Study while you work.", cta: "Explore postgrad", staticCopy: "Evening and online options across business, design and engineering.", landingPage: "https://example.rmit.local/study/postgraduate", developedBy: "Cyclone", sizes: "970x250px, 300x250px", firstDraft: day(22), materialDeadline: day(29), liveDate: day(33), endDate: day(75) } },
    { cells: { channel: "Spotify", stage: "Remarketing (Convert)", targeting: "SL", objective: "Awareness", status: "YET TO BRIEF", format: "Audio - 30s", message: "Radio script — 30s.", developedBy: "Existing content", sizes: "30s audio + 640x640 companion", liveDate: day(33), endDate: day(75), notes: "Reuse Sem 2 script with updated dates." } },
    { cells: {} },
    { cells: {} },
    { cells: {} },
  ];

  const openDay: DemoRowSpec[] = [
    { section: "Open Day 2026" },
    { subsection: "Registration drive" },
    { cells: { channel: "Facebook and Instagram", stage: "Prospecting (Connect)", targeting: "SL", objective: "KPIs: Registration, Cost per Registration", status: "COMPLETED", format: "Static", message: "Save the date — Open Day, 9 August.", cta: "Register", staticCopy: "Tour campuses, meet lecturers and see where your course could take you.", image: "Campus crowd shot", landingPage: "https://example.rmit.local/open-day", fileReview: "R2", developedBy: "Cyclone", sizes: "1x1 | 9x16", firstDraft: day(-30), materialDeadline: day(-24), liveDate: day(-20), endDate: day(10), approved: "Approved PN 5/8", despatched: "Y" } },
    { cells: { channel: "ATAR Notes", stage: "Prospecting (Connect)", targeting: "SL", objective: "KPIs: Registration", status: "FILE DELIVERY", format: "Static banner", message: "Ask us anything at Open Day.", cta: "Register", landingPage: "https://example.rmit.local/open-day", fileReview: "R2", developedBy: "Vietnam", sizes: "300x250px, 728x90px", firstDraft: day(-10), materialDeadline: day(-4), liveDate: day(-1), endDate: day(10), notes: "Files sent to publisher; awaiting confirmation." } },
    { cells: { channel: "YouTube", stage: "Prospecting (Connect)", targeting: "ALL", objective: "Awareness", status: "IN PROGRESS", format: "Video - 15s", message: "One day, every course.", cta: "Register", landingPage: "https://example.rmit.local/open-day", fileReview: "R1", developedBy: "Vietnam", sizes: "16x9 | 9x16", firstDraft: day(-2), materialDeadline: day(3), liveDate: day(5), endDate: day(10) } },
    { subsection: "Reminder" },
    { cells: { channel: "Facebook and Instagram", stage: "Remarketing (Convert)", targeting: "SL", objective: "Attendance", status: "BRIEFED", format: "Static", message: "Tomorrow — see you on campus.", cta: "Plan your day", landingPage: "https://example.rmit.local/open-day/plan", developedBy: "Comms", sizes: "1x1 | 9x16", firstDraft: day(3), materialDeadline: day(6), liveDate: day(8), endDate: day(9) } },
    { cells: {} },
    { cells: {} },
  ];

  const sheets: TrackerSheet[] = [
    { id: idFor(), trackerId: tracker.id, name: "Sem 1 2027", position: 0, columns, rows: buildRows(sem1, ids, idFor), frozenColumns: DOMESTIC_CAMPAIGNS_FROZEN, createdAt: iso(created), updatedAt: iso(subDays(now, 1)) },
    { id: idFor(), trackerId: tracker.id, name: "Open Day 2026", position: 1, columns: columns.map((c) => ({ ...c })), rows: buildRows(openDay, ids, idFor), frozenColumns: DOMESTIC_CAMPAIGNS_FROZEN, createdAt: iso(created), updatedAt: iso(subDays(now, 2)) },
  ];

  return { trackers: [tracker], trackerSheets: sheets };
}
