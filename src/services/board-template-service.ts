import type { BoardTemplatePart, EntityId, SavedBoardTemplate } from "@/domain";
import { buildBoardTemplateSpec, remapTemplateIds } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { BoardBundle, BoardService, CreateBoardInput } from "./board-service";
import type { ItemService } from "./item-service";

export interface SaveBoardTemplateInput {
  name: string;
  description?: string | null;
  parts: readonly BoardTemplatePart[];
}

/**
 * Board layouts saved under a name (see src/domain/board/board-template.ts).
 *
 * Saving reads the board as it is now; a board made from the template is its
 * own from then on, and changing either touches nothing of the other. A name
 * already taken in the workspace is saved over, as the booking form's
 * templates are: a template is kept up to date by saving it again.
 */
export class BoardTemplateService {
  constructor(
    private readonly repos: Repositories,
    private readonly boards: BoardService,
    private readonly items: ItemService,
  ) {}

  list(workspaceId: EntityId): Promise<SavedBoardTemplate[]> {
    return this.repos.boardTemplates.listByWorkspace(workspaceId);
  }

  async saveFromBoard(boardId: EntityId, input: SaveBoardTemplateInput, actorId: EntityId): Promise<SavedBoardTemplate> {
    const name = input.name.trim();
    if (!name) throw new Error("Give the template a name.");
    if (name.length > 80) throw new Error("Keep the name under 80 characters.");
    const board = await this.repos.boards.getById(boardId);
    if (!board) throw new NotFoundError("Board", boardId);
    const [groups, columns, rules, items] = await Promise.all([
      this.repos.boards.listGroups(boardId),
      this.repos.boards.listColumns(boardId),
      input.parts.includes("automations") ? this.repos.automations.listRulesByBoard(boardId) : Promise.resolve([]),
      input.parts.includes("tasks") ? this.repos.items.listByBoard(boardId) : Promise.resolve([]),
    ]);
    const spec = buildBoardTemplateSpec({ board, groups, columns, rules, items }, input.parts);
    const description = input.description?.trim() || null;
    const existing = (await this.repos.boardTemplates.listByWorkspace(board.workspaceId)).find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return this.repos.boardTemplates.update(existing.id, { name, description, spec });
    return this.repos.boardTemplates.create({ workspaceId: board.workspaceId, name, description, spec, createdBy: actorId });
  }

  async delete(templateId: EntityId): Promise<void> {
    await this.repos.boardTemplates.delete(templateId);
  }

  /**
   * A new board laid out as the template says: its groups and columns, then
   * its task names in order, then its automations pointed at the new ones.
   *
   * Tasks before rules: a write only queues automation events once the board
   * has a rule listening, so building the template's own tasks first keeps
   * its "when a task is added" rules from firing once for every one of them.
   */
  async createBoard(templateId: EntityId, input: Omit<CreateBoardInput, "templateId">, actorId: EntityId): Promise<BoardBundle> {
    const template = await this.repos.boardTemplates.getById(templateId);
    if (!template) throw new NotFoundError("BoardTemplate", templateId);
    const { spec } = template;
    const bundle = await this.boards.createBoard(
      { ...input, templateId: "blank", description: input.description ?? spec.board?.description ?? null, color: input.color ?? spec.board?.color, icon: input.icon ?? spec.board?.icon },
      actorId,
      spec,
    );
    const ids = bundle.ids ?? new Map<string, string>();

    const firstGroup = bundle.groups[0]!;
    const positions = new Map<string, number>();
    for (const task of spec.tasks) {
      const groupId = ids.get(task.groupKey) ?? firstGroup.id;
      const position = positions.get(groupId) ?? 0;
      positions.set(groupId, position + 1);
      const item = await this.items.createItem({ boardId: bundle.board.id, groupId, name: task.name, position }, actorId);
      for (const [index, sub] of task.subitems.entries()) {
        await this.items.createItem({ boardId: bundle.board.id, groupId, parentItemId: item.id, name: sub, position: index }, actorId);
      }
    }

    for (const rule of spec.automations) {
      const moved = remapTemplateIds({ trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }, ids);
      await this.repos.automations.createRule({
        workspaceId: bundle.board.workspaceId,
        boardId: bundle.board.id,
        name: rule.name,
        enabled: rule.enabled,
        trigger: moved.trigger,
        conditionMatch: rule.conditionMatch,
        conditions: moved.conditions,
        actions: moved.actions,
        createdBy: actorId,
      });
    }
    return bundle;
  }
}
