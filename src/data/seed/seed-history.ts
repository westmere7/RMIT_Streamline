import { addBusinessDays, addDays, addHours, addMinutes, differenceInCalendarDays, isWeekend, startOfDay, subHours } from "date-fns";
import type { Activity, BoardColumn, BoardGroup, ColumnValue, Comment, Item, ItemAsset, Notification, NotificationType } from "@/domain";
import { DEFAULT_TYPE_DELIVERY, recapAssets, recapColumnValue } from "@/domain";
import { toISODate } from "@/lib/dates/dates";
import { slugify } from "@/lib/slug";
import type { SeedExtrasContext } from "./seed-extras";
import { emptySeedBundle, type BoardKey, type SeedBundle, type UserKey } from "./seed-data";

/**
 * Months of history for the demo boards, so every view has a past and a future
 * to draw: some three hundred items spread from about five months ago to three
 * months ahead, with timelines, owners, subitems, dependency chains, asset lines,
 * status-change activity, updates and a few notifications.
 *
 * Everything is generated from a small deterministic PRNG (mulberry32 seeded from
 * a constant per board), with every date relative to `now`, so the same clock
 * always gives the same bundle. Ids come from the "history…" namespaces
 * (seed-data.ts) and rows point at the base boards only through the lookups, so
 * the top-up (scripts/db-seed-topup.mts) can translate them by name like the rest
 * of the extras.
 */

type Phase = "past" | "present" | "future";
type StatusId = "not_started" | "working" | "waiting" | "stuck" | "done";
type PriorityId = "critical" | "high" | "medium" | "low";

const STATUS_NAMES: Record<StatusId, string> = { not_started: "Not Started", working: "Working On It", waiting: "Waiting", stuck: "Stuck", done: "Done" };

/** An item name, optionally with the tags it carries; names without tags draw from the board's tag pool. */
type Named = string | readonly [string, ...string[]];

interface AssetLineSpec {
  name: string;
  type: string;
  notes: string;
  /** Quantity range, or null for "one, not counted". */
  qty: [number, number] | null;
}

interface HistoryBoardSpec {
  board: BoardKey;
  /** Who works on the board; the first `busy` of them carry three times the weight, so Workload shows hot weeks. */
  people: UserKey[];
  busy: number;
  /** Which groups items of each phase land in (a past item that is not done stays in a present group). */
  phases: Record<Phase, string[]>;
  names: readonly Named[];
  tags?: string[];
  /** Names matching this are big pieces: two to four weeks rather than days. */
  big?: RegExp;
  /** Dependency chains (names from `names`): each depends on the one before it, timelines run in sequence, all in one group. */
  chains?: string[][];
  /** Subitem names, used as consecutive steps. */
  steps: string[];
  assets: AssetLineSpec[];
  descriptions?: string[];
  /** TEXT / LONG_TEXT column key → pool of values, with the chance an item gets one. */
  texts?: Record<string, { pool: string[]; chance: number }>;
  numbers?: Record<string, (rng: Rng) => number>;
  checkbox?: string;
  link?: { key: string; path: string; text: string; chance: number };
  /** Creative Requests: who asked, workspace-wide. */
  requesters?: UserKey[];
  /** Day offsets the schedule is spread over (default about five months back to three ahead). */
  window?: [number, number];
  /** Archived board: everything finished long ago. */
  forceDone?: boolean;
}

// ---- Deterministic randomness -----------------------------------------------------

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** mulberry32: uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error("Nothing to pick from");
    return items[Math.floor(this.next() * items.length)]!;
  }

  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  /** Around the centre with the given spread, peaked in the middle (mean of three uniforms). */
  around(centre: number, spread: number): number {
    return Math.round(centre + ((this.next() + this.next() + this.next()) / 3 - 0.5) * 2 * spread);
  }
}

const HISTORY_SEED = 0x524d4954; // "RMIT"

function hashKey(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// ---- The boards --------------------------------------------------------------------

const STUDIO_STEPS = ["Brief and references", "First concept", "Internal review", "Amends round 1", "Stakeholder approval", "Final artwork", "Export and handover", "Upload to DAM"];

const BOARD_HISTORY: HistoryBoardSpec[] = [
  {
    board: "sem1",
    people: ["emily", "jun", "grace", "jane", "sarah", "tom", "priya"],
    busy: 3,
    phases: { past: ["Completed", "Live"], present: ["Production", "Review"], future: ["Planning"] },
    tags: ["Video", "Social", "Photography", "Media", "Copy", "DOOH", "Print", "Web", "Radio", "Brand", "Search", "Strategy"],
    big: /film|shoot|platform deck|nurture|refresh/i,
    names: [
      ["Campaign platform deck – executive briefing", "Strategy"],
      ["Audience segmentation refresh", "Strategy", "Media"],
      ["Key visual – photography brief", "Photography", "Brand"],
      ["Talent casting and release forms", "Photography", "Video"],
      ["Campus photography shoot – Bundoora", "Photography"],
      ["Campus photography shoot – Brunswick", "Photography"],
      ["Hero film – 30s master", "Video"],
      ["Hero film – 15s cutdowns x4", "Video", "Social"],
      ["Hero film – 6s bumpers", "Video", "Social"],
      ["Paid social – phase 2 creative", "Social", "Media"],
      ["Paid social – phase 3 retargeting", "Social", "Media"],
      ["YouTube pre-roll – 15s", "Video", "Media"],
      ["Spotify audio – 30s", "Radio", "Media"],
      ["Radio script – 15s tag", "Radio", "Copy"],
      ["Print ad – Herald Sun half page", "Print"],
      ["Print ad – Saigon Times full page", "Print"],
      ["Street press – Beat magazine", "Print"],
      ["Tram side panels – route 1 and 96", "DOOH", "Print"],
      ["Bus shelter posters – CBD", "Print", "Media"],
      ["Southern Cross Station large format", "DOOH"],
      ["Melbourne Airport arrivals wall", "DOOH"],
      ["Landing page copy deck", "Web", "Copy"],
      ["Landing page – course finder embed", "Web"],
      ["Search ads – international keywords", "Search", "Copy"],
      ["Display banners – programmatic set", "Media", "Web"],
      ["Email nurture – 5-step sequence", "Copy", "Web"],
      ["Agent toolkit – Vietnam", "Print", "Brand"],
      ["Parents brochure – A5 16pp", "Print", "Copy"],
      ["Scholarship insert – A4", "Print"],
      ["Campaign photography retouching batch 2", "Photography"],
      ["Vietnamese subtitles – hero film", "Video", "Copy"],
      ["Mid-campaign performance review", "Media", "Strategy"],
      ["Creative refresh – phase 2 key visual", "Brand", "Photography"],
      ["Wrap report and learnings deck", "Strategy"],
    ],
    steps: ["Brief agreed with media agency", "Concept and copy", "Design round 1", "Stakeholder review", "Amends", "Final artwork and specs", "Trafficked to media", "Live check"],
    assets: [
      { name: "Instagram tile", type: "Social", notes: "1080×1080", qty: [2, 6] },
      { name: "Story", type: "Social", notes: "1080×1920, safe zones for UI", qty: [2, 4] },
      { name: "MREC banner", type: "Digital", notes: "300×250, under 150 KB", qty: [1, 3] },
      { name: "Leaderboard", type: "Digital", notes: "728×90 + 320×50", qty: [1, 2] },
      { name: "30s master", type: "Video", notes: "16:9, 4K ProRes + H.264", qty: null },
      { name: "Full-page press ad", type: "Print", notes: "260×380 mm, CMYK, 5 mm bleed", qty: [1, 2] },
      { name: "Landing page hero", type: "Web", notes: "1920×600, WebP", qty: null },
    ],
    descriptions: [
      "Part of the Semester 1 integrated campaign. Work from the approved key visual and the copy deck in the shared folder.",
      "Melbourne and Vietnam versions needed; check the bilingual lockup rules before exporting.",
      "Media agency has booked the placements — final artwork must meet their spec sheet exactly.",
    ],
  },
  {
    board: "masterclass",
    people: ["danh", "tuyet", "duc", "hil", "linh", "thao", "minh"],
    busy: 2,
    phases: { past: ["Delivered", "Approved"], present: ["Design", "Internal Review", "Stakeholder Review"], future: ["Briefing"] },
    tags: ["Vietnam", "Melbourne", "Global"],
    names: [
      ["Masterclass series – Season 2 identity refresh", "Global"],
      ["Speaker announcement tile – Dr Lan Nguyen", "Vietnam"],
      ["Speaker announcement tile – Prof. Alan Reid", "Melbourne"],
      ["Speaker announcement tile – Hanh Pham", "Vietnam"],
      ["Speaker announcement tile – Sam Okafor", "Melbourne", "Global"],
      ["Episode 1 recap carousel", "Global"],
      ["Episode 2 recap carousel", "Global"],
      ["Episode 3 recap carousel", "Global"],
      ["Registration landing page banner", "Global"],
      ["Eventbrite cover image", "Melbourne"],
      ["LinkedIn event banner", "Global"],
      ["Zoom waiting room slide", "Global"],
      ["Lower-third name straps", "Global"],
      ["Countdown story stickers", "Vietnam", "Melbourne"],
      ["Speaker gift certificate", "Vietnam"],
      ["Venue directional signage – Hanoi", "Vietnam"],
      ["Venue directional signage – Saigon South", "Vietnam"],
      ["Programme booklet – Season 2", "Vietnam", "Melbourne"],
      ["Q&A slide template", "Global"],
      ["Post-event thank-you tile", "Global"],
      ["Highlights reel thumbnail", "Global"],
      ["Podcast cover art", "Global"],
      ["Email header – early bird", "Global"],
      ["Email header – last call", "Global"],
      ["Print poster – A3 campus noticeboards", "Vietnam", "Melbourne"],
      ["Alumni network invitation", "Melbourne"],
      ["Sponsor logo lockup panel", "Global"],
      ["Photography brief – speaker portraits", "Global"],
      ["Name badges and lanyards", "Vietnam"],
      ["Livestream holding slide", "Global"],
      ["Season 2 wrap tile", "Global"],
      ["Speaker bio cards – set of 6", "Vietnam", "Melbourne"],
    ],
    steps: ["Brief from events team", "Layout", "Internal review", "Amends", "Speaker approval", "Export all sizes"],
    assets: [
      { name: "Instagram tile", type: "Social", notes: "1080×1080", qty: [1, 4] },
      { name: "Story", type: "Social", notes: "1080×1920", qty: [1, 3] },
      { name: "LinkedIn banner", type: "Digital", notes: "1584×396", qty: null },
      { name: "Email header", type: "Digital", notes: "600×200", qty: [1, 2] },
      { name: "A3 poster", type: "Print", notes: "297×420 mm, CMYK", qty: [1, 2] },
      { name: "Pull-up banner", type: "Event", notes: "850×2000 mm", qty: [1, 2] },
    ],
    texts: { format: { pool: ["1080x1080", "1080x1920", "1080x1080, 1080x1920", "1920x1080", "1200x628", "600x200", "A3 print", "A5, 16pp", "1584x396", "SVG, PNG", "16:9 PowerPoint"], chance: 1 } },
    descriptions: ["Masterclass series collateral. Speaker names and titles are locked in the events tracker; photography is in the shared folder.", "Bilingual versions for Hanoi and Saigon South where marked."],
  },
  {
    board: "rmitinerary",
    people: ["danh", "tuyet", "duc", "hil", "linh", "thao"],
    busy: 2,
    phases: { past: ["Completed"], present: ["Design", "Production", "Stakeholder Review"], future: ["Backlog", "Design"] },
    big: /manuscript|print run|flipbook|adaptation|flatplan/i,
    names: [
      "Editorial plan and flatplan v2",
      "Welcome letter spread",
      "Contents and how-to-use spread",
      "Persona spread – Creator",
      "Persona spread – Innovator",
      "Persona spread – Changemaker",
      "Persona spread – Analyst",
      "Campus map – City",
      "Campus map – Brunswick",
      "Campus map – Bundoora",
      "Campus map – Hanoi",
      "Scholarships spread",
      "Pathways diagram – VET to degree",
      "Student life photo essay",
      "Accommodation guide spread",
      "Industry partners spread",
      "Key dates and intake calendar",
      "Fees and costs table",
      "Back cover and partner logos",
      "Cover concept – round 1",
      "Cover concept – round 2",
      "Iconography set – 40 icons",
      "Infographic – graduate outcomes",
      "Copy edit – full manuscript",
      "Proof 1 – printer",
      "Proof 2 – colour corrections",
      "Accessible PDF tagging",
      "Web flipbook build",
      "Print run – 5,000 copies",
      "Agent edition – 8pp cut-down",
      "Japanese language adaptation",
      "Korean language adaptation",
      "Thai language adaptation",
      "Distribution plan – schools mailout",
    ],
    chains: [
      ["Cover concept – round 1", "Cover concept – round 2"],
      ["Copy edit – full manuscript", "Proof 1 – printer", "Proof 2 – colour corrections", "Print run – 5,000 copies"],
      ["Persona spread – Creator", "Japanese language adaptation", "Korean language adaptation"],
      ["Accessible PDF tagging", "Web flipbook build"],
      ["Campus map – City", "Campus map – Brunswick", "Campus map – Bundoora"],
    ],
    steps: ["Content outline", "Layout", "Illustration", "Copy proofread", "Stakeholder review", "Amends", "Final export"],
    assets: [
      { name: "Spread (print)", type: "Print", notes: "A4 4pp, CMYK, 3 mm bleed", qty: [1, 2] },
      { name: "Spread (digital)", type: "Digital", notes: "PDF, tagged", qty: null },
      { name: "Illustration", type: "Brand", notes: "Vector, brand palette", qty: [1, 4] },
      { name: "Map", type: "Print", notes: "A3 fold-out", qty: null },
      { name: "Web tile", type: "Web", notes: "1200×630", qty: [1, 2] },
    ],
    texts: { notes: { pool: ["Photography from the Melbourne shoot.", "Waiting on final copy from Student Recruitment.", "Approved by Joanne.", "Two rounds of amends so far.", "Printer needs 300 dpi CMYK.", "Check program names against the handbook.", "Vietnamese diacritics tested at 8 pt."], chance: 0.4 } },
    descriptions: ["RMITinerary 2026 publication. Grid and typography follow the approved master; persona spreads are 4pp each.", "Language adaptations reuse the English layout with expanded text frames."],
  },
  {
    board: "dooh",
    people: ["duc", "danh", "tuyet", "hil", "linh", "minh"],
    busy: 2,
    phases: { past: ["Completed", "Approved"], present: ["In Progress", "Internal Review"], future: ["This Fortnight"] },
    names: [
      "Flinders St Station concourse – portrait",
      "Melbourne Central atrium screen",
      "Chadstone digital panels – 8 sites",
      "Highpoint food court wall",
      "Tullamarine departures corridor",
      "Tan Son Nhat arrivals hall",
      "Landmark 81 lobby screens",
      "Vincom Center Dong Khoi – escalator panels",
      "Hanoi Old Quarter street furniture",
      "Bitexco Tower lift lobby",
      "Bus shelter digital – St Kilda Rd x12",
      "Tram stop panels – Swanston St",
      "Crown Riverwalk large format",
      "QV Melbourne cube",
      "Bourke St Mall – motion refresh",
      "Doncaster Westfield escalator banner",
      "Campus digital screens – 24 sites",
      "Library foyer screen loop",
      "Building 80 media wall",
      "Saigon South campus LED wall",
      "Sem 1 DOOH – phase 2 key visual",
      "Scholarship deadline – emergency slate",
      "Open Day countdown – 7 days",
      "Open Day countdown – 1 day",
      "Masterclass series – lobby loop",
      "Postgraduate evening – campus screens",
      "Airport lounge – departures",
      "Grand Prix weekend takeover",
      "Network spec sheet – Vietnam update",
      "Colour calibration test card",
      "Motion template – headline reveal",
      "Motion template – logo sting",
    ],
    steps: ["Specs confirmed with network", "Static layout", "Motion pass", "Internal review", "Agency approval", "Export and upload"],
    assets: [
      { name: "Portrait loop", type: "Motion", notes: "1080×1920 @ 10 s, MP4 H.264", qty: [1, 3] },
      { name: "Landscape loop", type: "Motion", notes: "1920×1080 @ 8 s", qty: [1, 2] },
      { name: "Static slide", type: "Digital", notes: "1920×1080 JPG", qty: [1, 4] },
      { name: "Large format", type: "Motion", notes: "2160×3840 @ 10 s", qty: null },
    ],
    texts: { format: { pool: ["1080x1920 @ 10s", "1920x1080 @ 8s", "2160x3840 @ 10s", "3840x1080 @ 15s", "1080x1920 static", "1920x1080 static", "1080x1350 @ 6s", "4320x1080 @ 15s"], chance: 1 } },
    checkbox: "specs",
    descriptions: ["Digital out-of-home placement booked by the media agency. Match the network spec sheet; no audio.", "Motion loop built from the Sem 1 key visual templates."],
  },
  {
    board: "requests",
    people: ["tuyet", "danh", "duc", "hil", "linh", "thao", "minh", "admin"],
    busy: 2,
    phases: { past: ["Delivered"], present: ["In Progress", "Triaged"], future: ["New Requests", "Triaged"] },
    requesters: ["grace", "joanne", "jane", "emily", "jun", "priya", "sarah", "chloe", "tom", "ben"],
    names: [
      "School of Design – graduate exhibition poster",
      "School of Engineering – capstone showcase banner",
      "College of Business and Law – MBA info evening flyer",
      "School of Health – simulation lab signage",
      "School of Fashion and Textiles – runway invitation",
      "School of Media – film festival programme",
      "School of Science – lab safety poster series",
      "Library – study space etiquette posters",
      "Student Wellbeing – mental health week tiles",
      "Careers – employer expo pull-up banners",
      "Alumni Relations – reunion email header",
      "International – agent newsletter template",
      "RMIT Vietnam – Tet greeting card",
      "RMIT Vietnam – graduation stage backdrop",
      "Sports and Recreation – intramural season poster",
      "Property Services – construction hoarding artwork",
      "Ngarara Willim Centre – NAIDOC Week tiles",
      "Research Office – ERA impact one-pager",
      "School of Architecture – studio review invitation",
      "Global Experience – exchange fair banner",
      "Student Union – election candidate template",
      "Equity and Inclusion – Pride Month lanyard",
      "Vice-Chancellor's office – annual address slides",
      "School of Education – placement handbook cover",
      "Advancement – donor thank-you card",
      "Campus Store – merchandise range lookbook",
      "Timetabling – exam period wayfinding",
      "IT Services – phishing awareness poster",
      "School of Art – open studio A-frame signs",
      "Business school – case competition trophy artwork",
      "College of Vocational Education – TAFE expo stand",
      "Vietnam Student Services – orientation booklet",
      "School of Computing – hackathon t-shirt",
      "Facilities – recycling station labels",
    ],
    steps: ["Clarify brief with requester", "Design", "Requester review", "Amends", "Deliver files"],
    assets: [
      { name: "A3 poster", type: "Print", notes: "297×420 mm, CMYK", qty: [1, 6] },
      { name: "A4 flyer", type: "Print", notes: "Double-sided, 150 gsm", qty: [50, 500] },
      { name: "Pull-up banner", type: "Event", notes: "850×2000 mm", qty: [1, 3] },
      { name: "Social tile", type: "Social", notes: "1080×1080", qty: [1, 4] },
      { name: "Email header", type: "Digital", notes: "600×200", qty: null },
      { name: "Slide template", type: "Digital", notes: "16:9 PowerPoint", qty: null },
    ],
    numbers: { estimate: (rng) => rng.weighted([[1, 3], [2, 5], [3, 5], [4, 4], [6, 3], [8, 3], [12, 2], [16, 1], [24, 1]]) },
    link: { key: "brief", path: "briefs", text: "Brief", chance: 0.5 },
    descriptions: ["Request received through the booking form; brief and references linked. Brand-compliant, print-ready PDFs unless noted.", "Quick turnaround job for a school event. Reuse the school lockup and the current template."],
  },
  {
    board: "alwayson",
    people: ["grace", "jane", "tuyet", "chloe", "jun", "priya"],
    busy: 2,
    phases: { past: ["Published"], present: ["This Week", "Drafting", "Scheduled"], future: ["Ideas", "Scheduled"] },
    tags: ["Instagram", "TikTok", "LinkedIn", "Facebook", "Web"],
    names: [
      ["Student spotlight – first in family", "Instagram", "Web"],
      ["Student spotlight – mature-age nursing student", "Facebook", "Web"],
      ["Research news – recycled concrete", "LinkedIn"],
      ["Research news – wearable sensors", "LinkedIn", "Web"],
      ["Alumni story – games designer at Wargaming", "LinkedIn", "Instagram"],
      ["Alumni story – architect in Hanoi", "LinkedIn", "Web"],
      ["Campus life reel – City campus rooftop", "Instagram", "TikTok"],
      ["Campus life reel – Bundoora lake", "Instagram", "TikTok"],
      ["Staff picks – library reading list", "Instagram"],
      ["Exam week study spots", "Instagram", "TikTok"],
      ["Semester break checklist", "Instagram", "Facebook"],
      ["Census date reminder", "Facebook", "Instagram"],
      ["Scholarship spotlight – equity scholarships", "Facebook", "LinkedIn"],
      ["Meet the mentors – peer program", "Instagram"],
      ["Sustainability week roundup", "LinkedIn", "Instagram"],
      ["International student week – food tour", "TikTok", "Instagram"],
      ["Graduation season – gown collection", "Facebook", "Instagram"],
      ["Graduation season – photo spots", "Instagram", "TikTok"],
      ["Behind the scenes – fashion studio", "TikTok", "Instagram"],
      ["Behind the scenes – TV studio", "TikTok"],
      ["Course spotlight – cybersecurity", "LinkedIn", "Facebook"],
      ["Course spotlight – nursing", "Facebook", "Instagram"],
      ["Course spotlight – game design", "TikTok", "Instagram"],
      ["Industry partner – Bosch internships", "LinkedIn"],
      ["Lunar New Year greetings", "Facebook", "Instagram", "LinkedIn"],
      ["R U OK? Day", "Instagram", "Facebook"],
      ["Wear It Purple Day", "Instagram"],
      ["World Teachers' Day", "LinkedIn", "Facebook"],
      ["Melbourne Cup public holiday notice", "Facebook", "Instagram"],
      ["Christmas closure dates", "Facebook", "Instagram", "Web"],
      ["New year welcome – O-week teaser", "Instagram", "TikTok"],
      ["Weekly events roundup – template refresh", "Instagram", "Facebook"],
    ],
    steps: ["Idea and angle", "Draft copy", "Visual", "Approval", "Schedule"],
    assets: [
      { name: "Feed tile", type: "Social", notes: "1080×1080", qty: [1, 3] },
      { name: "Story", type: "Social", notes: "1080×1920", qty: [1, 3] },
      { name: "Reel", type: "Video", notes: "9:16, under 30 s, captions", qty: null },
      { name: "Web article image", type: "Web", notes: "1200×630", qty: null },
    ],
    texts: { copy: { pool: ["Meet the students making the most of campus life this semester…", "New research from RMIT could change how we build our cities.", "Big week ahead — here is what is on across our campuses.", "Applications close soon. Do not miss your chance.", "From the studio floor to the runway: a look behind the scenes."], chance: 0.4 } },
  },
  {
    board: "openday",
    people: ["priya", "thao", "tuyet", "joanne", "linh", "danh"],
    busy: 2,
    phases: { past: ["Completed", "Live"], present: ["Production", "Review"], future: ["Planning", "Production"] },
    tags: ["City", "Brunswick", "Bundoora", "Global"],
    big: /toolkit|booklet|signage|highlights|banners|wrap/i,
    names: [
      ["Open Day brand toolkit", "Global"],
      ["Registration landing page assets", "Global"],
      ["Save-the-date social tiles", "Global"],
      ["Programme booklet – A5 32pp", "City", "Brunswick", "Bundoora"],
      ["Campus map – A0 boards x6", "City"],
      ["Directional arrows – A-frames x40", "City", "Brunswick"],
      ["Building entrance banners – 3m x 9m", "City"],
      ["Faculty flags – feather banners x24", "City", "Bundoora"],
      ["Stage screen content – morning block", "City"],
      ["Stage screen content – afternoon block", "City"],
      ["Lectern sign and name tents", "City"],
      ["Volunteer lanyards and badges", "Global"],
      ["Tour guide flags and route cards", "City", "Brunswick", "Bundoora"],
      ["Photo wall backdrop", "City"],
      ["Food truck precinct signage", "City"],
      ["Registration tent fascia", "City", "Bundoora"],
      ["Accessibility map and quiet room signage", "Global"],
      ["Prize draw entry cards", "Global"],
      ["Parent information session slides", "Global"],
      ["Scholarships and pathways slides", "Global"],
      ["Sponsor logo wall", "City"],
      ["Live social coverage plan", "Global"],
      ["Post-event thank-you email", "Global"],
      ["Post-event survey tile", "Global"],
      ["Highlights reel – 60s", "Global"],
      ["Bundoora shuttle bus timetable poster", "Bundoora"],
      ["Brunswick campus wayfinding decals", "Brunswick"],
      ["Vietnam Open Day – bilingual signage", "Global"],
      ["Hanoi campus – stage backdrop", "Global"],
      ["Campus TV screens – Open Day loop", "City", "Brunswick", "Bundoora"],
      ["Wayfinding QR code stickers", "Global"],
      ["Lost property and first aid signage", "City", "Bundoora"],
      ["Wet weather plan signage", "City"],
      ["Wrap report and photo archive", "Global"],
    ],
    steps: ["Quantities from Facilities", "Artwork", "Accessibility check", "Print quote", "Approval", "Print and install"],
    assets: [
      { name: "A-frame insert", type: "Print", notes: "A1, corflute", qty: [4, 40] },
      { name: "Feather banner", type: "Event", notes: "600×2400 mm, double-sided", qty: [2, 24] },
      { name: "Building banner", type: "Print", notes: "3000×9000 mm mesh", qty: [1, 3] },
      { name: "Stage slide", type: "Digital", notes: "1920×1080", qty: [4, 30] },
      { name: "Programme booklet", type: "Print", notes: "A5 32pp, saddle-stitched", qty: [1000, 3000] },
      { name: "Social tile", type: "Social", notes: "1080×1080", qty: [1, 6] },
    ],
    numbers: { budget: (rng) => (rng.chance(0.25) ? 0 : rng.int(3, 150) * 100) },
    descriptions: ["Open Day 2026 collateral. Facilities own the frame sizes; confirm before artwork.", "Three campuses; City has the main stage and the largest volume."],
  },
  {
    board: "video",
    people: ["minh", "duc", "linh", "chloe"],
    busy: 2,
    phases: { past: ["Delivered"], present: ["Shooting", "Post-production", "Client Review"], future: ["Briefed", "Pre-production"] },
    big: /films|ceremony|anthem|explainer|episode|livestream|archive|walkthrough/i,
    names: [
      "Scholarship stories – 3 films",
      "Nursing simulation lab walkthrough",
      "Engineering capstone showcase – highlights",
      "Graduation – Hanoi ceremony",
      "Graduation – Saigon South ceremony",
      "Graduation – Melbourne ceremony highlights",
      "Vice-Chancellor address – studio record",
      "Student housing tour – 360°",
      "Brunswick campus drone flyover",
      "Lunar New Year greeting – 20s",
      "Semester 1 hero film – Vietnamese version",
      "Course explainer – Data Science",
      "Course explainer – Fashion Enterprise",
      "Course explainer – Aerospace Engineering",
      "Alumni profile – architect in Hanoi",
      "Alumni profile – startup founder",
      "Research explainer – battery recycling",
      "Open Day welcome loop – 2026",
      "Masterclass episode 1 – edit",
      "Masterclass episode 2 – edit",
      "Masterclass episode 3 – edit",
      "Masterclass highlights – 90s",
      "Social cutdowns – scholarship campaign",
      "Careers Week – employer testimonials",
      "Library tour – accessibility version",
      "International students – arrival guide",
      "Sports club sizzle reel",
      "Brand anthem – 60s",
      "Brand anthem – 30s cutdown",
      "Photography shoot – campus life stills",
      "Subtitles and captions – Q3 batch",
      "Archive digitisation – 2019 campaign tapes",
      "Livestream – Open Day main stage",
      "Studio safety induction video",
    ],
    steps: ["Treatment and script", "Shot list and call sheet", "Shoot day", "Offline edit", "Colour and sound", "Client review", "Master and deliver"],
    assets: [
      { name: "Master", type: "Video", notes: "16:9, 4K ProRes 422", qty: null },
      { name: "Social cutdown", type: "Video", notes: "9:16 and 1:1, captions burnt in", qty: [1, 4] },
      { name: "Caption file", type: "Copy", notes: "SRT, EN + VI", qty: [1, 2] },
      { name: "Thumbnail", type: "Digital", notes: "1280×720", qty: [1, 3] },
      { name: "Lower-third pack", type: "Motion", notes: "After Effects template", qty: null },
    ],
    texts: { format: { pool: ["1 x 90s, 16:9 + 9:16", "3 x 60s, captions", "60s loop, no audio", "4K master + 30s social", "2min + 15s teaser", "360°, web embed", "Livestream + 2min recap", "30s + 15s + 6s", "45s vertical"], chance: 1 } },
    checkbox: "approved",
    descriptions: ["Film job for the studio: brief, shot list and talent releases in the shared folder. Deliver masters to the DAM.", "Interviews plus b-roll; captions in English and Vietnamese."],
  },
  {
    board: "brand",
    people: ["sarah", "danh", "duc", "emily", "joanne", "linh"],
    busy: 2,
    phases: { past: ["Approved"], present: ["Design", "Internal Review", "Stakeholder Review"], future: ["Discovery", "Design"] },
    big: /architecture|guidelines|portal|photography|illustration/i,
    names: [
      "Brand architecture – sub-brand hierarchy",
      "Wordmark refinements",
      "Logo lockups – schools and colleges",
      "Logo lockups – RMIT Vietnam bilingual",
      "Primary colour palette – accessibility pass",
      "Secondary palette – campaign accents",
      "Typography – heading scale",
      "Typography – Vietnamese diacritics test",
      "Grid system – print",
      "Grid system – digital",
      "Iconography style",
      "Illustration style",
      "Photography – people direction",
      "Photography – campus and place",
      "Motion principles",
      "Sonic logo brief",
      "Tone of voice – core principles",
      "Tone of voice – social examples",
      "Email signature template",
      "Business card and stationery",
      "Presentation template – 16:9",
      "Document template – A4 report",
      "Social templates – Instagram",
      "Social templates – LinkedIn",
      "Merchandise guidelines",
      "Signage and wayfinding standards",
      "Vehicle livery",
      "Co-branding – government partners",
      "Co-branding – industry partners",
      "Brand portal – information architecture",
      "Brand portal – asset upload",
      "Guidelines PDF – v1 layout",
      "Guidelines PDF – v1 proofread",
      "Brand launch – staff roadshow deck",
    ],
    chains: [
      ["Wordmark refinements", "Logo lockups – schools and colleges", "Logo lockups – RMIT Vietnam bilingual"],
      ["Primary colour palette – accessibility pass", "Secondary palette – campaign accents"],
      ["Typography – heading scale", "Typography – Vietnamese diacritics test"],
      ["Guidelines PDF – v1 layout", "Guidelines PDF – v1 proofread", "Brand launch – staff roadshow deck"],
      ["Brand portal – information architecture", "Brand portal – asset upload"],
    ],
    steps: ["Audit and references", "Exploration", "Internal critique", "Refinement", "Brand council review", "Documented in guidelines"],
    assets: [
      { name: "Guideline section", type: "Brand", notes: "InDesign, A4 landscape", qty: null },
      { name: "Logo files", type: "Brand", notes: "SVG, EPS, PNG @2x", qty: [2, 12] },
      { name: "Template", type: "Digital", notes: "PowerPoint / Word", qty: [1, 3] },
      { name: "Sample artwork", type: "Print", notes: "A4, for the brand council", qty: [1, 4] },
    ],
    texts: { notes: { pool: ["Brand council meets fortnightly; next slot is the review date.", "Keep the humanist option in the deck for comparison.", "Contrast checked against WCAG AA at body sizes.", "Agency partners want a stacked lockup rule.", "Needs the secondary typeface decision first."], chance: 0.35 } },
    link: { key: "brief", path: "brand", text: "Reference", chance: 0.3 },
  },
  {
    board: "website",
    people: ["tom", "ravi", "hil", "jun", "grace"],
    busy: 2,
    phases: { past: ["Done"], present: ["In Progress", "QA"], future: ["Backlog", "This Sprint"] },
    tags: ["Course finder", "Content", "Course pages", "Navigation", "Templates", "Forms", "Performance", "Accessibility", "Design system", "Analytics"],
    names: [
      ["Course finder – filter by study mode", "Course finder"],
      ["Course finder – saved courses", "Course finder"],
      ["Course finder – empty state copy", "Course finder", "Content"],
      ["Course page – entry requirements accordion", "Course pages"],
      ["Course page – fees tab for international", "Course pages"],
      ["Course page – career outcomes module", "Course pages", "Content"],
      ["Course page – related courses carousel", "Course pages"],
      ["Scholarship listing page", "Templates"],
      ["Scholarship detail template", "Templates"],
      ["Global navigation – mobile drawer", "Navigation"],
      ["Footer refresh", "Navigation"],
      ["Breadcrumbs on deep pages", "Navigation", "Accessibility"],
      ["Search results – course boosting", "Course finder"],
      ["Campus pages – map embed", "Templates"],
      ["Campus pages – Vietnam bilingual toggle", "Templates", "Content"],
      ["News article template", "Templates", "Content"],
      ["Events listing – calendar view", "Templates"],
      ["Events detail – add to calendar", "Templates"],
      ["Staff profile template", "Templates"],
      ["Research centre landing template", "Templates"],
      ["Enquiry form – short version", "Forms"],
      ["Enquiry form – CRM field mapping", "Forms"],
      ["Cookie consent banner", "Forms", "Accessibility"],
      ["Skip links and focus order", "Accessibility"],
      ["Colour contrast fixes – buttons", "Accessibility", "Design system"],
      ["Image lazy-loading audit", "Performance"],
      ["Core Web Vitals – LCP on course pages", "Performance", "Course pages"],
      ["Design tokens – spacing scale", "Design system"],
      ["Button component – loading state", "Design system"],
      ["Card component – variants", "Design system"],
      ["Tag manager – event naming", "Analytics"],
      ["Heatmap review – course pages", "Analytics", "Course pages"],
      ["Chatbot entry point", "Forms"],
      ["404 page redesign", "Templates", "Content"],
    ],
    steps: ["Design in Figma", "Build", "Code review", "QA on staging", "Content check", "Release"],
    assets: [
      { name: "Figma frame", type: "Web", notes: "Desktop + mobile", qty: [2, 6] },
      { name: "Hero image", type: "Web", notes: "1920×600 WebP", qty: [1, 3] },
      { name: "Icon", type: "Brand", notes: "SVG, 24 px grid", qty: [1, 12] },
    ],
    numbers: { points: (rng) => rng.weighted([[1, 2], [2, 4], [3, 5], [5, 5], [8, 3], [13, 1]]) },
    link: { key: "brief", path: "figma", text: "Figma", chance: 0.4 },
  },
  {
    board: "social",
    people: ["chloe", "jane", "grace", "tuyet", "linh", "minh"],
    busy: 2,
    phases: { past: ["Published"], present: ["Writing", "Design", "Scheduled"], future: ["Ideas", "Writing"] },
    tags: ["Instagram", "TikTok", "LinkedIn", "Facebook"],
    names: [
      ["October – Mental Health Month tiles", "Instagram", "Facebook"],
      ["Halloween on campus – reel", "Instagram", "TikTok"],
      ["Melbourne Cup – closure notice", "Facebook", "Instagram"],
      ["Graduation countdown – 30 days", "Instagram"],
      ["Graduation – live stories plan", "Instagram", "TikTok"],
      ["Graduation – congratulations tile", "Instagram", "Facebook", "LinkedIn"],
      ["Exam period – library hours", "Facebook", "Instagram"],
      ["Exam period – wellbeing tips carousel", "Instagram"],
      ["Summer school – enrolments open", "Facebook", "LinkedIn"],
      ["Summer break – campus closure dates", "Facebook", "Instagram"],
      ["Christmas – staff and student greeting", "Instagram", "Facebook", "LinkedIn"],
      ["New Year – 2027 welcome", "Instagram", "LinkedIn"],
      ["Year in review – 10 highlights carousel", "Instagram", "LinkedIn"],
      ["Alumni of the year – announcement", "LinkedIn", "Facebook"],
      ["International Students Day", "Instagram", "TikTok"],
      ["World Kindness Day", "Instagram"],
      ["Remembrance Day", "Facebook", "LinkedIn"],
      ["Movember – staff team", "Instagram", "Facebook"],
      ["Black Friday – campus store", "Instagram", "Facebook"],
      ["Course spotlight – Master of Cyber Security", "LinkedIn"],
      ["Course spotlight – Bachelor of Nursing", "Facebook", "Instagram"],
      ["Course spotlight – Communication Design", "Instagram", "TikTok"],
      ["Research spotlight – microplastics", "LinkedIn"],
      ["Research spotlight – urban heat", "LinkedIn", "Facebook"],
      ["Student takeover – week 1", "TikTok", "Instagram"],
      ["Student takeover – week 2", "TikTok", "Instagram"],
      ["Behind the scenes – graduation gown fitting", "TikTok"],
      ["Campus dogs – reel", "Instagram", "TikTok"],
      ["Study abroad – applications closing", "Instagram", "Facebook"],
      ["Meet the makers – jewellery studio", "Instagram"],
      ["Career tips – LinkedIn profile", "LinkedIn"],
      ["Industry partner – Telstra announcement", "LinkedIn"],
      ["Open Day thank-you", "Instagram", "Facebook"],
      ["Q4 performance recap tile", "LinkedIn"],
    ],
    steps: ["Caption draft", "Visual", "Approval", "Schedule", "Community management"],
    assets: [
      { name: "Feed tile", type: "Social", notes: "1080×1080", qty: [1, 6] },
      { name: "Story", type: "Social", notes: "1080×1920", qty: [1, 4] },
      { name: "Reel", type: "Video", notes: "9:16, 15–30 s", qty: null },
      { name: "Carousel card", type: "Social", notes: "1080×1350", qty: [3, 10] },
    ],
    texts: { copy: { pool: ["Save the date and tag a friend who needs to see this.", "Congratulations, graduates of 2026 — we cannot wait to see what you do next.", "The library is open late all exam period. Find your spot.", "Applications close soon. Link in bio.", "Meet the students behind this year's showcase.", "Our campuses close for the break on 24 December and reopen 5 January."], chance: 0.45 } },
    checkbox: "approved",
  },
  {
    board: "sem2archive",
    people: ["joanne", "emily", "danh", "jun", "priya"],
    busy: 1,
    phases: { past: ["Completed"], present: ["Live"], future: ["Live"] },
    names: ["Sem 2 media plan", "Sem 2 hero film", "Sem 2 print – The Age", "Sem 2 search ads"],
    steps: STUDIO_STEPS,
    assets: [],
    window: [-175, -95],
    forceDone: true,
  },
];

// ---- Updates ---------------------------------------------------------------------

/** `{owner}` becomes an @mention of the item's owner. */
const COMMENTS_BY_PHASE: Record<Phase, string[]> = {
  past: [
    "Delivered and archived to the DAM. Closing this one.",
    "Final files sent to the printer; they confirmed receipt.",
    "Published on schedule — early numbers look good.",
    "Stakeholders signed off on the final round. Thanks {owner}, nice work.",
    "Two rounds of amends and done. Learnings noted for next time.",
    "Approved by the school. Uploaded to the shared folder.",
  ],
  present: [
    "First round is in the shared folder — {owner} let me know if the crop works for the portrait format.",
    "Stakeholders happy with direction B. Moving to amends.",
    "Holding this until the photography lands — placeholders in for now.",
    "{owner} can you push the export tonight so Melbourne has it first thing?",
    "Sizes confirmed with the media agency — see the updated spec sheet.",
    "Amends from round 2 are in. One more look before it goes to the stakeholder.",
    "{owner} bumping this: the due date is close and I don't see the latest version yet.",
    "Client wants the logo larger on the end frame. Otherwise approved.",
    "Accessibility check passed; contrast on the secondary palette is fine at this size.",
  ],
  future: [
    "Brief and references are in the folder. {owner} it's yours when you finish the current sprint.",
    "Booked in for next fortnight; copy will come from the school first.",
    "Photography brief sent — shoot is being scheduled around the campus timetable.",
    "Kick-off with the stakeholders is set. Reuse the template from last round.",
    "Parking this in the backlog until the school confirms dates — nothing to do yet.",
    "Quote requested from the printer so we know the lead time before we start artwork.",
  ],
};

/** Questions for the administrator (Creative Requests and Open Day), so the admin persona has mentions of their own. */
const ADMIN_COMMENTS = [
  "@Admin Account can you confirm the budget code is approved before we start on this one?",
  "@Admin Account is the sign-off from the school on file? Want to be sure before it goes to print.",
  "@Admin Account could you check the requester has access to the shared folder?",
  "@Admin Account the supplier needs a purchase order number — can you raise one this week?",
];

// ---- Builder -----------------------------------------------------------------------

interface Slot {
  start: Date;
  end: Date;
  phase: Phase;
  /** Whether the item shows a timeline, only a due date, or neither. */
  dating: "timeline" | "due" | "none";
}

interface GeneratedItem {
  item: Item;
  spec: HistoryBoardSpec;
  slot: Slot;
  status: StatusId;
  owners: UserKey[];
  due: string | null;
  groupName: string;
  /** When the item was last touched: the last status change, or its creation. */
  touched: Date;
}

export function buildSeedHistory(ctx: SeedExtrasContext): SeedBundle {
  const { now, workspaceId, sid, users, userNames, boards, lookups } = ctx;
  const bundle = emptySeedBundle();
  const iso = (d: Date) => d.toISOString();
  const today = startOfDay(now);
  const latest = subHours(now, 1);
  const clamp = (d: Date) => (d > latest ? latest : d);
  const firstName = (key: UserKey) => userNames[key].split(" ")[0]!;
  const deliveryFor = (type: NotificationType) => (DEFAULT_TYPE_DELIVERY[type] === "UPDATE" ? "UPDATE" : "NOTIFICATION") as Notification["delivery"];

  const pushValue = (itemId: string, column: BoardColumn | null | undefined, value: ColumnValue | null, at: Date) => {
    if (!column || value === null) return;
    bundle.itemColumnValues.push({ id: sid("historyValue"), itemId, columnId: column.id, value, updatedAt: iso(at) });
  };
  const activity = (a: Omit<Activity, "id" | "workspaceId">) => bundle.activities.push({ ...a, id: sid("historyActivity"), workspaceId });

  /** Candidate notifications for the two personas; trimmed to a handful at the end. */
  const candidates: Array<Omit<Notification, "id" | "delivery" | "readAt">> = [];
  const positions = new Map<string, number>();
  const nextPosition = (groupId: string) => {
    const position = positions.get(groupId) ?? 100;
    positions.set(groupId, position + 1);
    return position;
  };

  for (const spec of BOARD_HISTORY) {
    const rng = new Rng(HISTORY_SEED ^ hashKey(spec.board));
    const boardId = boards[spec.board];
    const boardName = lookups.boardName(spec.board);
    const groups = lookups.groups(spec.board);
    const column = (key: string) => lookups.column(spec.board, key);
    const columns = lookups.columns(spec.board);
    const hasTimeline = column("timeline") !== null;
    const hasDue = column("due") !== null;
    const tagsColumn = column("channel") ?? column("market");
    const dependencyColumn = column("dependency");
    const recapColumn = columns.find((c) => c.type === "ASSETS_RECAP") ?? null;
    const sizeColumn = columns.find((c) => c.type === "SIZE") ?? null;
    const groupByName = (name: string): BoardGroup => {
      const group = groups.find((g) => g.name === name);
      if (!group) throw new Error(`Seed history: group ${name} missing on ${spec.board}`);
      return group;
    };
    const peopleWeights = spec.people.map((key, index) => [key, index < spec.busy ? 3 : 1] as const);
    const pickOwners = (): UserKey[] => {
      const first = rng.weighted(peopleWeights);
      if (!rng.chance(0.25) || spec.people.length < 2) return [first];
      const others = spec.people.filter((p) => p !== first);
      return [first, rng.pick(others)];
    };

    // Spread over the window, with a bump around today so the current weeks are the busiest.
    const [windowStart, windowEnd] = spec.window ?? [-150, 75];
    const randomStart = (): Date => {
      const offset = rng.chance(0.6) ? rng.int(windowStart, windowEnd) : Math.max(windowStart, Math.min(windowEnd, rng.around(-5, 40)));
      const day = addDays(today, offset);
      return isWeekend(day) ? addBusinessDays(day, 1) : day;
    };
    const durationFor = (name: string): number => {
      if (spec.big?.test(name)) return rng.int(10, 20);
      return rng.weighted([[rng.int(2, 5), 45], [rng.int(6, 10), 35], [rng.int(11, 20), 20]]);
    };
    const slotFrom = (start: Date, name: string): Slot => {
      const end = addBusinessDays(start, durationFor(name) - 1);
      const phase: Phase = end < today ? "past" : start > today ? "future" : "present";
      const dating = rng.weighted<Slot["dating"]>([["timeline", 85], ["due", 10], ["none", 5]]);
      return { start, end, phase, dating };
    };
    const statusFor = (slot: Slot): StatusId => {
      if (spec.forceDone) return "done";
      if (slot.phase === "past") return rng.weighted<StatusId>([["done", 75], ["stuck", 10], ["waiting", 8], ["working", 7]]);
      if (slot.phase === "present") return rng.weighted<StatusId>([["working", 60], ["waiting", 15], ["stuck", 10], ["not_started", 10], ["done", 5]]);
      return rng.weighted<StatusId>([["not_started", 85], ["working", 10], ["waiting", 5]]);
    };
    const priorityFor = (slot: Slot): PriorityId => {
      const near = slot.phase === "present" || Math.abs(differenceInCalendarDays(slot.start, today)) <= 14;
      return near
        ? rng.weighted<PriorityId>([["high", 35], ["critical", 25], ["medium", 30], ["low", 10]])
        : rng.weighted<PriorityId>([["medium", 40], ["high", 30], ["low", 20], ["critical", 10]]);
    };
    const groupFor = (phase: Phase, status: StatusId): BoardGroup => {
      const names = phase === "past" && status !== "done" ? spec.phases.present : spec.phases[phase];
      return groupByName(rng.pick(names));
    };
    /** A moment on a working day, between 8:00 and 18:00. */
    const workTime = (day: Date, fromHour = 8, toHour = 18): Date => addMinutes(addHours(startOfDay(day), rng.int(fromHour, toHour)), rng.int(0, 59));
    const nameOf = (named: Named) => (typeof named === "string" ? named : named[0]);
    const tagsOf = (named: Named): string[] | null => {
      if (typeof named !== "string") return named.slice(1);
      if (!spec.tags?.length) return null;
      const first = rng.pick(spec.tags);
      if (!rng.chance(0.3)) return [first];
      const second = rng.pick(spec.tags.filter((t) => t !== first));
      return [first, second];
    };

    const generated = new Map<string, GeneratedItem>();

    const makeItem = (named: Named, slot: Slot, group: BoardGroup, status: StatusId): GeneratedItem => {
      const name = nameOf(named);
      const owners = pickOwners();
      const requester = spec.requesters ? rng.pick(spec.requesters) : null;
      const creator: UserKey = requester ?? (rng.chance(0.5) ? spec.people[0]! : rng.pick(spec.people));
      // Briefed a fortnight or so before the work starts; work that starts well
      // ahead was still briefed at some point in the past, not this minute.
      const briefed = workTime(addDays(slot.start, -rng.int(2, 14)));
      const created = briefed > latest ? workTime(addDays(now, -rng.int(1, 45))) : briefed;
      const due = slot.dating === "none" || !hasDue ? null : toISODate(addDays(slot.end, rng.chance(0.7) ? 0 : rng.int(1, 3)));
      const item: Item = {
        id: sid("historyItem"),
        boardId,
        groupId: group.id,
        parentItemId: null,
        name,
        description: spec.descriptions && rng.chance(0.3) ? rng.pick(spec.descriptions) : null,
        position: nextPosition(group.id),
        createdBy: users[creator],
        archivedAt: null,
        createdAt: iso(created),
        updatedAt: iso(created),
      };
      bundle.items.push(item);
      activity({ boardId, itemId: item.id, actorId: item.createdBy, eventType: "ITEM_CREATED", metadata: { itemName: name, boardName, groupName: group.name }, createdAt: iso(created) });

      // ---- Status history: how the item got to where it is -------------------
      let touched = created;
      const statusStep = (from: StatusId, to: StatusId, at: Date, actor: UserKey) => {
        const when = clamp(at);
        if (when < touched) return;
        touched = when;
        activity({ boardId, itemId: item.id, actorId: users[actor], eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: name, columnName: column("status")?.name ?? "Status", columnType: "STATUS", from: STATUS_NAMES[from], to: STATUS_NAMES[to] }, createdAt: iso(when) });
        const owner = owners[0]!;
        if (actor !== owner && (owner === "danh" || owner === "admin")) {
          candidates.push({ userId: users[owner], type: "STATUS_CHANGED", title: `${name} is now ${STATUS_NAMES[to]}`, body: `${firstName(actor)} changed the status from ${STATUS_NAMES[from]}`, entityType: "ITEM", entityId: item.id, boardId, actorId: users[actor], createdAt: iso(when) });
        }
      };
      const owner = owners[0]!;
      const others = spec.people.filter((p) => p !== owner);
      const colleague = others.length && rng.chance(0.3) ? rng.pick(others) : owner;
      if (status === "done") {
        const straight = rng.chance(0.25);
        if (!straight) {
          statusStep("not_started", "working", workTime(slot.start, 8, 11), owner);
          if (rng.chance(0.3) && differenceInCalendarDays(slot.end, slot.start) >= 3) {
            const midDay = addDays(slot.start, Math.floor(differenceInCalendarDays(slot.end, slot.start) / 2));
            const detour: StatusId = rng.chance(0.5) ? "waiting" : "stuck";
            statusStep("working", detour, workTime(midDay, 9, 16), owner);
            statusStep(detour, "working", workTime(addDays(midDay, 1), 9, 16), owner);
          }
        }
        statusStep(straight ? "not_started" : "working", "done", workTime(addDays(slot.end, rng.chance(0.7) ? 0 : rng.int(1, 2)), 14, 19), colleague);
      } else if (status !== "not_started" && slot.start <= latest) {
        statusStep("not_started", "working", workTime(slot.start, 8, 11), owner);
        if (status !== "working") {
          const laterDay = addDays(slot.start, Math.max(1, Math.min(differenceInCalendarDays(today, slot.start), rng.int(1, 6))));
          statusStep("working", status, workTime(laterDay, 9, 17), colleague);
        }
      }
      item.updatedAt = iso(touched);

      // ---- Values -------------------------------------------------------------
      const at = touched;
      pushValue(item.id, column("owner"), { type: "PERSON", userIds: owners.map((k) => users[k]) }, created);
      if (requester) pushValue(item.id, column("requester"), { type: "PERSON", userIds: [users[requester]] }, created);
      pushValue(item.id, column("status"), { type: "STATUS", labelId: status }, at);
      pushValue(item.id, column("priority"), { type: "PRIORITY", labelId: priorityFor(slot) }, created);
      if (slot.dating === "timeline" && hasTimeline) pushValue(item.id, column("timeline"), { type: "TIMELINE", start: toISODate(slot.start), end: toISODate(slot.end) }, created);
      if (due) pushValue(item.id, column("due"), { type: "DATE", date: due }, created);
      const tags = tagsOf(named);
      if (tags && tagsColumn) pushValue(item.id, tagsColumn, { type: "TAGS", tags }, created);
      for (const [key, { pool, chance }] of Object.entries(spec.texts ?? {})) {
        const target = column(key);
        if (!target || !rng.chance(chance)) continue;
        const text = rng.pick(pool);
        pushValue(item.id, target, target.type === "LONG_TEXT" ? { type: "LONG_TEXT", text } : { type: "TEXT", text }, created);
      }
      for (const [key, make] of Object.entries(spec.numbers ?? {})) pushValue(item.id, column(key), { type: "NUMBER", number: make(rng) }, created);
      if (spec.checkbox) {
        const checked = status === "done" ? rng.chance(0.9) : slot.phase === "future" ? rng.chance(0.1) : rng.chance(0.4);
        pushValue(item.id, column(spec.checkbox), { type: "CHECKBOX", checked }, at);
      }
      if (spec.link && rng.chance(spec.link.chance)) pushValue(item.id, column(spec.link.key), { type: "LINK", url: `https://example.rmit.local/${spec.link.path}/${slugify(name)}`, text: spec.link.text }, created);
      if (sizeColumn) {
        const days = differenceInCalendarDays(slot.end, slot.start) + 1;
        pushValue(item.id, sizeColumn, { type: "SIZE", size: days <= 3 ? "XS" : days <= 7 ? "S" : days <= 14 ? "M" : days <= 21 ? "L" : "XL" }, created);
      }

      // Being put on the item is worth a notification for the personas.
      for (const key of owners) {
        if ((key === "danh" || key === "admin") && creator !== key) {
          candidates.push({ userId: users[key], type: "ASSIGNED", title: `${firstName(creator)} assigned you to ${name}`, body: `${boardName} · ${group.name}`, entityType: "ITEM", entityId: item.id, boardId, actorId: users[creator], createdAt: iso(created) });
        }
      }

      const result: GeneratedItem = { item, spec, slot, status, owners, due, groupName: group.name, touched };
      generated.set(name, result);
      return result;
    };

    // ---- Chains first: sequential timelines, one group, each depending on the last
    const chained = new Set<string>();
    for (const chain of spec.chains ?? []) {
      const slots: Slot[] = [];
      let start = randomStart();
      for (const name of chain) {
        const slot = slotFrom(start, name);
        slot.dating = "timeline";
        slots.push(slot);
        start = addBusinessDays(slot.end, rng.int(1, 3));
        chained.add(name);
      }
      const statuses = slots.map(statusFor);
      // A predecessor that is late while its successor has begun: the blocked case the Gantt should show.
      for (let i = 0; i < slots.length - 1; i++) {
        if (slots[i]!.phase === "past" && slots[i + 1]!.phase === "present" && rng.chance(0.5)) {
          statuses[i] = "stuck";
          statuses[i + 1] = "working";
        }
      }
      const phases = new Set(slots.map((s) => s.phase));
      const chainPhase: Phase = statuses.every((s) => s === "done") && phases.size === 1 && phases.has("past") ? "past" : phases.size === 1 && phases.has("future") ? "future" : "present";
      const group = groupByName(rng.pick(spec.phases[chainPhase]));
      let previous: GeneratedItem | null = null;
      chain.forEach((name, index) => {
        const current = makeItem(name, slots[index]!, group, statuses[index]!);
        if (previous && dependencyColumn) pushValue(current.item.id, dependencyColumn, { type: "DEPENDENCY", itemIds: [previous.item.id] }, current.touched);
        previous = current;
      });
    }

    // ---- Everything else, each on its own schedule ---------------------------
    for (const named of spec.names) {
      if (chained.has(nameOf(named))) continue;
      const slot = slotFrom(randomStart(), nameOf(named));
      if (!hasTimeline && slot.dating === "timeline") slot.dating = "due";
      const status = statusFor(slot);
      makeItem(named, slot, groupFor(slot.phase, status), status);
    }

    // ---- Subitems, asset lines and updates ---------------------------------------
    for (const entry of generated.values()) {
      const { item, slot, status, owners, due } = entry;
      const created = new Date(item.createdAt);

      if (rng.chance(0.35) && spec.steps.length >= 2) {
        const count = Math.min(spec.steps.length, rng.weighted([[2, 50], [3, 35], [4, 15]]));
        const offset = rng.int(0, spec.steps.length - count);
        const steps = spec.steps.slice(offset, offset + count);
        const span = Math.max(1, differenceInCalendarDays(slot.end, slot.start));
        steps.forEach((stepName, index) => {
          const subStatus: StatusId =
            status === "done" ? "done"
            : status === "not_started" ? (index === 0 && slot.phase === "present" ? "working" : "not_started")
            : index < Math.floor(count / 2) ? "done" : index === Math.floor(count / 2) ? (status === "working" ? "working" : status) : "not_started";
          const sub: Item = {
            id: sid("historyItem"),
            boardId,
            groupId: item.groupId,
            parentItemId: item.id,
            name: stepName,
            description: null,
            position: index,
            createdBy: item.createdBy,
            archivedAt: null,
            createdAt: iso(clamp(addHours(created, 1 + index))),
            updatedAt: item.updatedAt,
          };
          bundle.items.push(sub);
          pushValue(sub.id, column("status"), { type: "STATUS", labelId: subStatus }, entry.touched);
          if (rng.chance(0.7)) pushValue(sub.id, column("owner"), { type: "PERSON", userIds: [users[rng.chance(0.7) ? owners[0]! : rng.pick(spec.people)]] }, created);
          if (hasDue && rng.chance(0.35)) pushValue(sub.id, column("due"), { type: "DATE", date: toISODate(addDays(slot.start, Math.round(((index + 1) / count) * span))) }, created);
        });
      }

      if (spec.assets.length && rng.chance(0.3)) {
        const count = rng.int(1, Math.min(4, spec.assets.length));
        const offset = rng.int(0, spec.assets.length - count);
        const lines: ItemAsset[] = spec.assets.slice(offset, offset + count).map((line, index) => ({
          id: sid("historyAsset"),
          itemId: item.id,
          boardId,
          name: line.name,
          assetType: line.type,
          quantity: line.qty ? rng.int(line.qty[0], line.qty[1]) : null,
          assigneeId: rng.chance(0.8) ? users[owners[index % owners.length]!] : null,
          dueDate: due,
          notes: line.notes,
          position: index,
          createdBy: item.createdBy,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));
        bundle.itemAssets.push(...lines);
        pushValue(item.id, recapColumn, recapColumnValue(recapAssets(lines, toISODate(today))), entry.touched);
      }

      if (rng.chance(0.15)) {
        const commentCount = rng.chance(0.35) ? 2 : 1;
        const from = created;
        const to = slot.phase === "future" ? latest : clamp(workTime(slot.end, 9, 18));
        const spanMinutes = Math.max(60, Math.round((to.getTime() - from.getTime()) / 60000));
        for (let i = 0; i < commentCount; i++) {
          const owner = owners[0]!;
          const askAdmin = (spec.board === "requests" || spec.board === "openday") && owner !== "admin" && rng.chance(0.4);
          const author: UserKey = askAdmin ? spec.people[0]! : rng.pick(spec.people.filter((p) => p !== owner).concat(spec.people[0]!));
          const template = askAdmin ? rng.pick(ADMIN_COMMENTS) : rng.pick(COMMENTS_BY_PHASE[slot.phase]);
          const mentionsOwner = !askAdmin && template.includes("{owner}") && author !== owner;
          const body = template.replace("{owner}", mentionsOwner ? `@${userNames[owner]}` : firstName(owner));
          const mentioned: UserKey[] = askAdmin ? ["admin"] : mentionsOwner ? [owner] : [];
          const at = clamp(addMinutes(from, rng.int(30, spanMinutes)));
          const comment: Comment = {
            id: sid("historyComment"),
            itemId: item.id,
            authorId: users[author],
            body,
            mentionUserIds: mentioned.map((k) => users[k]),
            sharedId: null,
            createdAt: iso(at),
            updatedAt: iso(at),
          };
          bundle.comments.push(comment);
          activity({ boardId, itemId: item.id, actorId: comment.authorId, eventType: "COMMENT_ADDED", metadata: { itemName: item.name }, createdAt: iso(at) });
          const snippet = body.replace(/@[A-Z][a-z]+ [A-Z][a-z]+ ?/g, "").trim();
          for (const key of mentioned) {
            if (key !== "danh" && key !== "admin") continue;
            candidates.push({ userId: users[key], type: "MENTION", title: `${firstName(author)} mentioned you in ${item.name}`, body: snippet.length > 140 ? `${snippet.slice(0, 137)}…` : snippet, entityType: "ITEM", entityId: item.id, boardId, actorId: comment.authorId, createdAt: iso(at) });
          }
          if (at > entry.touched) item.updatedAt = iso(at);
        }
      }
    }
  }

  // ---- Notifications: a light touch for the two personas -----------------------------
  // The most recent few of each kind; anything older than five days has been read.
  const rng = new Rng(HISTORY_SEED);
  const fiveDaysAgo = subHours(now, 24 * 5);
  const quota = { danh: 14, admin: 8 };
  const taken = { danh: 0, admin: 0 };
  const perType = new Map<string, number>();
  const recentFirst = [...candidates].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  for (const candidate of recentFirst) {
    const persona: keyof typeof quota = candidate.userId === users.danh ? "danh" : "admin";
    if (taken[persona] >= quota[persona]) continue;
    const typeKey = `${persona}:${candidate.type}`;
    if ((perType.get(typeKey) ?? 0) >= 5) continue;
    perType.set(typeKey, (perType.get(typeKey) ?? 0) + 1);
    taken[persona] += 1;
    const at = new Date(candidate.createdAt);
    const read = at < fiveDaysAgo || rng.chance(0.4);
    bundle.notifications.push({ ...candidate, id: sid("historyNotification"), delivery: deliveryFor(candidate.type), readAt: read ? iso(clamp(addMinutes(at, rng.int(20, 600)))) : null });
  }

  return bundle;
}
