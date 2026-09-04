"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Database, LogOut, RotateCcw, Settings, UserCog, Wrench } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { IS_DEV } from "@/lib/config";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Profile menu with a discreet developer section (user switcher, reset seed). */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useCurrentUser();
  const ws = useWorkspace();
  const { signOut, signIn } = useAuth();
  const { providerKind } = useDataContext();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [resetOpen, setResetOpen] = React.useState(false);
  const showDevTools = IS_DEV || providerKind === "local";

  const switchUser = async (email: string) => {
    await signIn(email);
    queryClient.clear();
    router.refresh();
    toast.success(`Now signed in as ${email}`);
  };

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
            "flex h-10 w-full items-center gap-2 rounded-md px-1.5 text-left hover:bg-sidebar-accent/70 focus-visible:outline-2 focus-visible:outline-ring",
            collapsed && "justify-center px-0",
          )}
          aria-label="Account menu"
          data-testid="user-menu"
        >
          <UserAvatar user={user} size="md" tooltip={false} />
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
          <DropdownMenuItem onSelect={() => router.push(routes.settings(ws.slug, "general"))}>
            <Settings /> Workspace settings
          </DropdownMenuItem>
          {showDevTools && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Wrench className="size-3" /> Developer
              </DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserCog /> Switch user
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {ws.users
                    .filter((u) => u.deactivatedAt === null)
                    .map((u) => (
                      <DropdownMenuItem key={u.id} disabled={u.id === user.id} onSelect={() => void switchUser(u.email)}>
                        <UserAvatar user={u} size="xs" tooltip={false} />
                        <span className="truncate">{u.displayName}</span>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => setResetOpen(true)}>
                <RotateCcw /> Reset demo data
              </DropdownMenuItem>
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
