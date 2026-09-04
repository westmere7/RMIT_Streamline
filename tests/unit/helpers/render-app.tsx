import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, type RenderResult } from "@testing-library/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { AuthProviderContext } from "@/features/auth/auth-context";
import { LocalAuthProvider } from "@/features/auth/providers/local-auth-provider";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { DataProviderContext, type DataContextValue } from "@/features/data/data-context";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard } from "@/lib/permissions/permissions";
import { createServices } from "@/services";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";

let counter = 0;

export interface TestApp {
  data: DataContextValue;
  /** Renders children inside every app provider, signed in as the given seeded user. */
  render: (ui: React.ReactNode) => Promise<RenderResult>;
}

export async function createTestApp(userKey: keyof typeof SEED_USER_IDS = "danh"): Promise<TestApp> {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `component-${Date.now()}-${counter}` });
  const services = createServices(repos);
  const auth = new LocalAuthProvider(repos.users);
  await auth.signIn({ email: `${userKey}@rmit.local` });
  const workspace = (await repos.workspaces.getById(SEED_WORKSPACE_ID))!;
  const data: DataContextValue = { providerKind: "local", services, auth };

  return {
    data,
    render: async (ui) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      const result = render(
        <QueryClientProvider client={queryClient}>
          <DataProviderContext value={data}>
            <AuthProviderContext>
              <TooltipPrimitive.Provider>
                <WorkspaceProvider workspace={workspace}>{ui}</WorkspaceProvider>
              </TooltipPrimitive.Provider>
            </AuthProviderContext>
          </DataProviderContext>
        </QueryClientProvider>,
      );
      // Providers resolve asynchronously (auth session + workspace context).
      await screen.findByTestId("app-ready", {}, { timeout: 5000 });
      return result;
    },
  };
}

/** Marker rendered once the workspace context is ready. */
export function AppReady({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <span data-testid="app-ready" hidden />
      {children}
    </>
  );
}

export interface TestBoardProps {
  boardId: string;
  children: React.ReactNode;
  openItem?: (id: string | null) => void;
}

/** Provides a real BoardContext (snapshot + optimistic mutations) for a seeded board. */
export function TestBoard({ boardId, children, openItem }: TestBoardProps) {
  const ws = useWorkspace();
  const board = ws.boardById(boardId)!;
  const snapshot = useBoardSnapshot(boardId);
  const mutations = useBoardMutations(boardId);
  const [now] = React.useState(() => new Date());
  const model = React.useMemo(
    () => (snapshot.data ? buildBoardModel(snapshot.data, { search: "", filters: EMPTY_FILTERS, sort: null, now }) : null),
    [snapshot.data, now],
  );
  if (!model) return <span data-testid="app-ready" hidden />;
  const value: BoardContextValue = {
    board,
    model,
    mutations,
    users: ws.users,
    canEdit: canEditBoard(ws.permissions, board),
    canManage: canManageBoard(ws.permissions, board),
    openItem: openItem ?? (() => undefined),
    openEditLabels: () => undefined,
    now,
  };
  return (
    <BoardContextProvider value={value}>
      <AppReady>{children}</AppReady>
    </BoardContextProvider>
  );
}
