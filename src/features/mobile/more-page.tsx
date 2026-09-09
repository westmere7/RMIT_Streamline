"use client";

import { ChevronRight, ClipboardPen, Info, LayoutDashboard, LogOut, MessageSquare, Moon, Settings2, Sun, SunMoon, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/features/version/about-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageMembers, canManageWorkspace } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { useThemePreference, THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<ThemePreference, React.ComponentType<{ className?: string }>> = { light: Sun, dim: Moon, dark: Moon, system: SunMoon };

/**
 * Everything the bottom bar has no room for: the pages reached now and then,
 * the theme, and the way out.
 *
 * Permissions decide what appears, the same helpers the desktop menus use, so a
 * viewer sees a viewer's list here too.
 */
export function MorePage() {
  const ws = useWorkspace();
  const router = useRouter();
  const { signOut } = useAuth();
  const [theme, setTheme] = useThemePreference();
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const user = ws.currentUser;

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="sr-only">More</h1>

        <Link
          href={routes.person(ws.slug, user.id)}
          className="mb-5 flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 active:bg-accent/70"
          data-testid="more-profile"
        >
          <UserAvatar user={user} size="lg" tooltip={false} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{user.displayName}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{user.jobTitle ?? user.email}</span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
        </Link>

        <Group title="Work">
          <Row href={routes.dashboard(ws.slug)} icon={LayoutDashboard} label="Dashboard" />
          <Row href={routes.book(ws.slug)} icon={ClipboardPen} label="Stakeholder Portal" />
          <Row href={routes.messages(ws.slug)} icon={MessageSquare} label="Messages" />
        </Group>

        <Group title="Workspace">
          <Row href={routes.members(ws.slug)} icon={Users} label={canManageMembers(ws.permissions) ? "Members and invitations" : "Members"} />
          <Row href={routes.settings(ws.slug, canManageWorkspace(ws.permissions) ? "general" : "view")} icon={Settings2} label="Settings" />
          <Row href={routes.person(ws.slug, user.id)} icon={UserRound} label="Your profile" />
        </Group>

        <Group title="Appearance">
          <li className="px-3 py-3">
            <p className="mb-2 text-[13px] font-medium">Theme</p>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-4 gap-1.5">
              {THEME_PREFERENCES.map((preference) => {
                const Icon = THEME_ICONS[preference];
                const active = theme === preference;
                return (
                  <button
                    key={preference}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(preference)}
                    className={cn(
                      "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-2xs font-medium capitalize transition-colors",
                      active ? "border-ring bg-accent-soft/60 ring-2 ring-ring/25" : "border-border/70 active:bg-accent/70",
                    )}
                    data-testid={`more-theme-${preference}`}
                  >
                    <Icon className="size-4" />
                    {preference}
                  </button>
                );
              })}
            </div>
          </li>
        </Group>

        <Group title="About">
          <li>
            <button type="button" onClick={() => setAboutOpen(true)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-accent/70" data-testid="more-about">
              <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[15px]">About Streamline</span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
            </button>
          </li>
        </Group>

        <Button
          variant="outline"
          className="h-12 w-full text-[15px]"
          onClick={() => void signOut().then(() => router.replace(routes.login()))}
          data-testid="more-sign-out"
        >
          <LogOut /> Sign out
        </Button>
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 px-1 text-[13px] font-semibold tracking-tight">{title}</h2>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">{children}</ul>
    </section>
  );
}

function Row({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-accent/70">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[15px]">{label}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
      </Link>
    </li>
  );
}
