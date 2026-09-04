import {
  Activity,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  Compass,
  Film,
  Flag,
  Globe,
  Hash,
  Image,
  Inbox,
  Layers,
  LayoutGrid,
  ListTodo,
  MapPin,
  Megaphone,
  MessageSquare,
  Monitor,
  Newspaper,
  Paintbrush,
  Palette,
  PenTool,
  Rocket,
  Sparkles,
  Star,
  Target,
  Users,
  Video,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/**
 * Curated icon set for boards and teams. Keeping this explicit keeps the bundle
 * small and gives pickers a predictable list.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  palette: Palette,
  paintbrush: Paintbrush,
  megaphone: Megaphone,
  monitor: Monitor,
  sparkles: Sparkles,
  newspaper: Newspaper,
  compass: Compass,
  inbox: Inbox,
  film: Film,
  video: Video,
  camera: Camera,
  image: Image,
  "pen-tool": PenTool,
  layers: Layers,
  target: Target,
  rocket: Rocket,
  flag: Flag,
  globe: Globe,
  "map-pin": MapPin,
  "book-open": BookOpen,
  briefcase: Briefcase,
  "building-2": Building2,
  users: Users,
  zap: Zap,
  star: Star,
  hash: Hash,
  "list-todo": ListTodo,
  "calendar-days": CalendarDays,
  "message-square": MessageSquare,
  activity: Activity,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function DynamicIcon({ name, fallback = "layout-grid", ...props }: LucideProps & { name: string; fallback?: string }) {
  const Icon = ICON_MAP[name] ?? ICON_MAP[fallback] ?? LayoutGrid;
  return <Icon {...props} />;
}
