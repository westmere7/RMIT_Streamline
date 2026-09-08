"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Database, Eye, LogOut, MessageSquare, Monitor, Moon, RotateCcw, Settings, Sun, SunDim, SunMoon, UserRound, Users, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useUnreadMessages } from "@/features/messages/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { IS_DEV } from "@/lib/config";
import { canManageMembers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/** Profile menu with a discreet developer section (user switcher, reset seed). */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useCurrentUser();
  const ws = useWorkspace();
  const { signOut } = useAuth();
  const { providerKind } = useDataContext();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [resetOpen, setResetOpen] = React.useState(false);
  const [theme, setTheme] = useThemePreference();
  const unreadMessages = useUnreadMessages().data ?? 0;
  const showDevTools = IS_DEV || providerKind === "local";
  const setViewAsUserId = useUiStore((s) => s.setViewAsUserId);

  const resetData = async () => {
    await services.repos.admin.resetToSeed();
    queryClient.clear();
    router.replace(routes.workspace(ws.slug));
    toast.success("Demo data reset");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-sidebar-accent/70 focus-visible:outline-2 focus-visible:outline-ring",
            collapsed && "justify-center px-0",
          )}
          aria-label="Account menu"
          data-testid="user-menu"
        >
          <span className="relative">
            <UserAvatar user={user} size="md" tooltip={false} />
            {/* Messages left the sidebar, so unread ones announce themselves here. */}
            {unreadMessages > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-primary" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                <span className="block truncate text-2xs text-muted-foreground">{user.jobTitle}</span>
              </span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-60">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-[13px] font-medium text-foreground">{user.displayName}</span>
            <span className="block text-2xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Which workspace this is. One exists today; switching between them lands here. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-testid="menu-workspace">
              <Building2 /> Workspace
              <span className="ml-auto max-w-28 truncate text-2xs text-muted-foreground">{ws.workspace.name}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuItem onSelect={() => router.push(routes.workspace(ws.slug))} data-testid="menu-workspace-current">
                <span className="truncate">{ws.workspace.name}</span>
                <Check className="ml-auto size-3.5" />
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push(routes.person(ws.slug, user.id))} data-testid="menu-your-profile">
            <UserRound /> Your profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(routes.messages(ws.slug))} data-testid="menu-messages">
            <MessageSquare /> Messages
            {unreadMessages > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground">{unreadMessages}</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(routes.members(ws.slug))} data-testid="menu-members">
            <Users /> Members
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(routes.settings(ws.slug, "general"))}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoon /> Theme
              <span className="ml-auto text-2xs capitalize text-muted-foreground">{theme}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemePreference)}>
                <DropdownMenuRadioItem value="light">
                  <Sun className="size-4 text-muted-foreground" /> Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dim">
                  <SunDim className="size-4 text-muted-foreground" /> Dim
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon className="size-4 text-muted-foreground" /> Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor className="size-4 text-muted-foreground" /> System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {showDevTools && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Wrench className="size-3" /> Developer
              </DropdownMenuLabel>
              {/* Reading the workspace as a colleague: what they can see, without their password. */}
              {canManageMembers(ws.ownPermissions) && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger data-testid="menu-view-as">
                    <Eye /> View as
                    {ws.viewingAs && <span className="ml-auto max-w-24 truncate text-2xs text-muted-foreground">{ws.viewingAs.firstName}</span>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
                    <DropdownMenuItem onSelect={() => setViewAsUserId(null)} disabled={!ws.viewingAs} data-testid="view-as-self">
                      <UserRound /> Yourself
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {ws.activeUsers
                      .filter((u) => u.id !== user.id)
                      .map((u) => (
                        <DropdownMenuItem key={u.id} onSelect={() => setViewAsUserId(u.id)} disabled={ws.viewingAs?.id === u.id} data-testid={`view-as-${u.id}`}>
                          <UserAvatar user={u} size="xs" tooltip={false} />
                          <span className="truncate">{u.displayName}</span>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {providerKind === "local" && (
                <DropdownMenuItem onSelect={() => setResetOpen(true)}>
                  <RotateCcw /> Reset demo data
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled>
                <Database /> Provider: {providerKind}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut().then(() => router.replace(routes.login()))}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset demo data?"
        description="All boards, items, comments and notifications in this browser will be replaced with the original seed data. This cannot be undone."
        confirmLabel="Reset data"
        destructive
        onConfirm={resetData}
      />
    </>
  );
}
