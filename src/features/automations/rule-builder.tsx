"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AutomationAction,
  AutomationActionKind,
  AutomationCondition,
  AutomationTrigger,
  AutomationTriggerKind,
  BoardColumn,
  ColumnValue,
  ConditionMatch,
  ConditionOp,
  EntityId,
} from "@/domain";
import { AUTOMATION_ACTION_KINDS, CONDITION_OPS, MAX_ACTIONS_PER_RULE, T_SHIRT_SIZES, actionsAllowedFor, columnLabels, emptyValueFor } from "@/domain";
import type { RuleVocabulary } from "@/services";
import { TEXTUAL_COLUMNS } from "@/services";
import { cn } from "@/lib/utils";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";

/**
 * The builder: one sentence, assembled from three rows of pickers.
 *
 * Every list is filled from the board itself, so a rule can only ever name a
 * column, a group or a person that is actually there — which is most of what
 * stops a rule being written wrong. The rest is checked on save by
 * AutomationService, and the error it throws is the message shown here.
 */

export interface RuleDraft {
  trigger: AutomationTrigger;
  conditionMatch: ConditionMatch;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

const TRIGGER_WORDS: Record<AutomationTriggerKind, string> = {
  item_created: "a task is added",
  subitem_created: "a subitem is added",
  item_renamed: "a task is renamed",
  name_contains: "the name contains a word",
  comment_contains: "an update mentions a word",
  column_contains: "a column contains a word",
  column_changed: "a column changes",
  column_set_to: "a column becomes a value",
  column_cleared: "a column is cleared",
  number_crosses: "a number crosses a line",
  person_assigned: "somebody is assigned",
  person_unassigned: "somebody is removed",
  item_moved_to_group: "a task moves to a group",
  item_moved_from_group: "a task leaves a group",
  comment_added: "an update is posted",
  item_archived: "a task is archived",
  item_restored: "a task is restored",
  date_arrives: "a date arrives",
  column_unchanged_for: "a column sits still for days",
  recurring: "on a schedule",
  manual: "run by hand",
};

/** What the builder is writing: a rule that fires itself, or a quick run somebody fires. */
export type RuleBuilderMode = "rule" | "quick";

const ACTION_WORDS: Record<AutomationActionKind, string> = {
  set_value: "set a column",
  clear_value: "clear a column",
  copy_value: "copy a column to another",
  adjust_number: "add to a number",
  add_tags: "add tags",
  remove_tags: "remove tags",
  move_to_group: "move it to a group",
  assign_person: "assign somebody",
  unassign_person: "unassign somebody",
  shift_date: "move a date",
  set_date_relative: "set a date from today",
  set_name: "rename it",
  set_description: "set its description",
  set_parent_value: "set a column on the parent",
  set_subitems_value: "set a column on every subitem",
  notify: "notify somebody",
  add_comment: "post an update",
  create_item: "create a task",
  create_subitem: "add a subitem",
  duplicate_item: "duplicate it",
  archive_item: "archive it",
  restore_item: "restore it",
  send_webhook: "call a webhook",
};

/** The column types "a column becomes a value" can name a value for. */
const SETTABLE_TO = (column: BoardColumn) => hasLabels(column) || column.type === "CHECKBOX" || column.type === "SIZE";

/** Actions whose text is a template, so the placeholder hint applies. */
const TEMPLATED: readonly AutomationActionKind[] = ["notify", "add_comment", "create_item", "create_subitem", "set_name", "set_description", "add_tags", "remove_tags"];

const OP_WORDS: Record<ConditionOp, string> = {
  is: "is",
  is_not: "is not",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  contains: "contains",
  not_contains: "does not contain",
  greater_than: "is more than",
  less_than: "is less than",
  before: "is before",
  after: "is after",
  is_overdue: "is overdue",
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const hourWord = (hour: number) => (hour === 0 ? "midnight" : hour === 12 ? "midday" : hour < 12 ? `${hour}am` : `${hour - 12}pm`);
const isDateColumn = (column: BoardColumn) => column.type === "DATE" || column.type === "TIMELINE";
const isPeopleColumn = (column: BoardColumn) => column.type === "PERSON" || column.type === "PEOPLE";
const hasLabels = (column: BoardColumn) => column.type === "STATUS" || column.type === "DROPDOWN" || column.type === "PRIORITY";

/** The empty rule a new automation starts from: the one people write most. */
export function blankDraft(vocabulary: RuleVocabulary, mode: RuleBuilderMode = "rule"): RuleDraft {
  if (mode === "quick") {
    // A quick run has no trigger to choose and nothing to check; it starts as
    // one action, which is the thing the person came here to save.
    return { trigger: { kind: "manual" }, conditionMatch: "all", conditions: [], actions: [defaultAction(AUTOMATION_ACTION_KINDS, vocabulary, "set_value")] };
  }
  const status = vocabulary.columns.find((c) => c.type === "STATUS") ?? vocabulary.columns[0];
  return {
    trigger: status ? { kind: "column_set_to", columnId: status.id, labelId: columnLabels(status)[0]?.id ?? null } : { kind: "item_created" },
    conditionMatch: "all",
    conditions: [],
    actions: [{ kind: "notify", audience: "people_on_item", message: "{item} needs a look" }],
  };
}

export function RuleBuilder({
  draft,
  onChange,
  vocabulary,
  mode = "rule",
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
  vocabulary: RuleVocabulary;
  /** A quick run shows only the actions: it has no trigger and checks nothing. */
  mode?: RuleBuilderMode;
}) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  const allowed = actionsAllowedFor(draft.trigger.kind);
  const quick = mode === "quick";

  return (
    <div className="space-y-4" data-testid="rule-builder">
      {!quick && (
        <Section label="When">
          <TriggerEditor trigger={draft.trigger} onChange={(trigger) => set({ trigger, actions: draft.actions.filter((a) => actionsAllowedFor(trigger.kind).includes(a.kind)) })} vocabulary={vocabulary} />
        </Section>
      )}

      {!quick && (
      <Section
        label="Only if"
        action={
          <Button variant="ghost" size="sm" onClick={() => set({ conditions: [...draft.conditions, defaultCondition(vocabulary)] })} data-testid="add-condition">
            <Plus /> Add
          </Button>
        }
      >
        {draft.conditions.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Always.</p>
        ) : (
          <div className="space-y-2">
            {draft.conditions.length > 1 && (
              <Select value={draft.conditionMatch} onValueChange={(value) => set({ conditionMatch: value as ConditionMatch })}>
                <SelectTrigger className="h-8 w-40" aria-label="How the conditions combine">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all of these</SelectItem>
                  <SelectItem value="any">any of these</SelectItem>
                </SelectContent>
              </Select>
            )}
            {draft.conditions.map((condition, index) => (
              <Row key={index} onRemove={() => set({ conditions: draft.conditions.filter((_, i) => i !== index) })}>
                <ConditionEditor
                  condition={condition}
                  onChange={(next) => set({ conditions: draft.conditions.map((c, i) => (i === index ? next : c)) })}
                  vocabulary={vocabulary}
                />
              </Row>
            ))}
          </div>
        )}
      </Section>
      )}

      <Section
        label={quick ? "Do" : "Then"}
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={draft.actions.length >= MAX_ACTIONS_PER_RULE}
            onClick={() => set({ actions: [...draft.actions, defaultAction(allowed, vocabulary)] })}
            data-testid="add-action"
          >
            <Plus /> Add
          </Button>
        }
      >
        <div className="space-y-2">
          {draft.actions.map((action, index) => (
            <Row key={index} onRemove={draft.actions.length > 1 ? () => set({ actions: draft.actions.filter((_, i) => i !== index) }) : undefined}>
              <ActionEditor
                action={action}
                allowed={allowed}
                onChange={(next) => set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) })}
                vocabulary={vocabulary}
              />
            </Row>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface/40 p-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {onRemove && (
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove">
          <X />
        </Button>
      )}
    </div>
  );
}

/** A select that is only as wide as it needs to be, which is most of this screen. */
function Picker<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  testId,
}: {
  value: T | "";
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  className?: string;
  testId?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className={cn("h-8 w-auto min-w-32 max-w-full", className)} aria-label={label} data-testid={testId}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

function TriggerEditor({ trigger, onChange, vocabulary }: { trigger: AutomationTrigger; onChange: (next: AutomationTrigger) => void; vocabulary: RuleVocabulary }) {
  const columnPicker = (columnId: EntityId, filter: (c: BoardColumn) => boolean, onPick: (id: EntityId) => void) => (
    <Picker
      value={columnId}
      label="Column"
      onChange={onPick}
      options={vocabulary.columns.filter(filter).map((c) => ({ value: c.id, label: c.name }))}
      testId="trigger-column"
    />
  );

  return (
    <Row>
      <Picker
        value={trigger.kind}
        label="What happens"
        onChange={(kind) => onChange(defaultTrigger(kind, vocabulary))}
        options={(Object.keys(TRIGGER_WORDS) as AutomationTriggerKind[]).filter((kind) => kind !== "manual").map((kind) => ({ value: kind, label: TRIGGER_WORDS[kind] }))}
        testId="trigger-kind"
      />

      {trigger.kind === "item_created" && (
        <Picker
          value={trigger.groupId ?? "any"}
          label="Group"
          onChange={(groupId) => onChange({ ...trigger, groupId: groupId === "any" ? null : groupId })}
          options={[{ value: "any", label: "in any group" }, ...vocabulary.groups.map((g) => ({ value: g.id, label: `in ${g.name}` }))]}
        />
      )}

      {(trigger.kind === "item_moved_to_group" || trigger.kind === "item_moved_from_group") && (
        <Picker
          value={trigger.groupId}
          label="Group"
          onChange={(groupId) => onChange({ ...trigger, groupId })}
          options={vocabulary.groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      )}

      {(trigger.kind === "column_changed" || trigger.kind === "column_cleared") && columnPicker(trigger.columnId, () => true, (columnId) => onChange({ ...trigger, columnId }))}

      {trigger.kind === "column_contains" && columnPicker(trigger.columnId, (c) => TEXTUAL_COLUMNS.includes(c.type), (columnId) => onChange({ ...trigger, columnId }))}

      {(trigger.kind === "name_contains" || trigger.kind === "comment_contains" || trigger.kind === "column_contains") && (
        <Input
          value={trigger.text}
          onChange={(e) => onChange({ ...trigger, text: e.target.value })}
          placeholder="Words to listen for, separated by commas"
          aria-label="Words to listen for"
          className="h-8 min-w-56 flex-1"
          data-testid="trigger-text"
        />
      )}

      {trigger.kind === "column_set_to" && (
        <>
          {columnPicker(trigger.columnId, SETTABLE_TO, (columnId) => onChange(setToDefault(columnId, vocabulary)))}
          <span className="text-[13px] text-muted-foreground">becomes</span>
          <SetToPicker trigger={trigger} onChange={onChange} vocabulary={vocabulary} />
        </>
      )}

      {trigger.kind === "number_crosses" && (
        <>
          {columnPicker(trigger.columnId, (c) => c.type === "NUMBER", (columnId) => onChange({ ...trigger, columnId }))}
          <Picker
            value={trigger.direction}
            label="Direction"
            onChange={(direction) => onChange({ ...trigger, direction: direction as "above" | "below" })}
            options={[
              { value: "above", label: "goes above" },
              { value: "below", label: "goes below" },
            ]}
          />
          <Input
            type="number"
            value={Number.isFinite(trigger.threshold) ? String(trigger.threshold) : ""}
            onChange={(e) => onChange({ ...trigger, threshold: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
            aria-label="The number it has to cross"
            className="h-8 w-28"
            data-testid="trigger-threshold"
          />
        </>
      )}

      {(trigger.kind === "person_assigned" || trigger.kind === "person_unassigned") && (
        <>
          {columnPicker(trigger.columnId, isPeopleColumn, (columnId) => onChange({ ...trigger, columnId }))}
          <Picker
            value={trigger.userId ?? "anyone"}
            label="Who"
            onChange={(userId) => onChange({ ...trigger, userId: userId === "anyone" ? null : userId })}
            options={[{ value: "anyone", label: "anybody" }, ...vocabulary.users.map((u) => ({ value: u.id, label: u.displayName }))]}
          />
        </>
      )}

      {trigger.kind === "column_unchanged_for" && (
        <>
          {columnPicker(trigger.columnId, () => true, (columnId) => onChange({ ...trigger, columnId }))}
          <Picker
            value={String(trigger.days)}
            label="For how long"
            onChange={(days) => onChange({ ...trigger, days: Number(days) })}
            options={[1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90].map((days) => ({ value: String(days), label: `for ${days} ${days === 1 ? "day" : "days"}` }))}
          />
          <HourPicker value={trigger.atHour} onChange={(atHour) => onChange({ ...trigger, atHour })} />
        </>
      )}

      {trigger.kind === "date_arrives" && (
        <>
          {columnPicker(trigger.columnId, isDateColumn, (columnId) => onChange({ ...trigger, columnId }))}
          <Picker
            value={String(trigger.offsetDays)}
            label="When"
            onChange={(offset) => onChange({ ...trigger, offsetDays: Number(offset) })}
            options={[-7, -3, -2, -1, 0, 1, 2, 7].map((days) => ({
              value: String(days),
              label: days === 0 ? "on the day" : days < 0 ? `${-days} days before` : `${days} days after`,
            }))}
          />
          <HourPicker value={trigger.atHour} onChange={(atHour) => onChange({ ...trigger, atHour })} />
        </>
      )}

      {trigger.kind === "recurring" && (
        <>
          <Picker
            value={trigger.recurrence}
            label="How often"
            onChange={(recurrence) => onChange({ ...trigger, recurrence: recurrence as typeof trigger.recurrence })}
            options={[
              { value: "daily", label: "every day" },
              { value: "weekdays", label: "every weekday" },
              { value: "weekly", label: "every week" },
              { value: "monthly", label: "every month" },
            ]}
          />
          {trigger.recurrence === "weekly" && (
            <Picker
              value={String(trigger.weekday ?? 1)}
              label="Day"
              onChange={(weekday) => onChange({ ...trigger, weekday: Number(weekday) })}
              options={WEEKDAYS.map((name, index) => ({ value: String(index), label: `on ${name}` }))}
            />
          )}
          {trigger.recurrence === "monthly" && (
            <Picker
              value={String(trigger.dayOfMonth ?? 1)}
              label="Day of the month"
              onChange={(day) => onChange({ ...trigger, dayOfMonth: Number(day) })}
              // Twenty-eight is the last day every month has. Offering the 31st
              // would be offering a rule that skips February.
              options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `on day ${i + 1}` }))}
            />
          )}
          <HourPicker value={trigger.atHour} onChange={(atHour) => onChange({ ...trigger, atHour })} />
        </>
      )}
    </Row>
  );
}

/**
 * "Becomes what": a label for a status-like column, ticked or not for a
 * checkbox, a size for a size column. Each writes the field the domain reads
 * for that type and clears the others, so a trigger never carries two answers.
 */
function SetToPicker({
  trigger,
  onChange,
  vocabulary,
}: {
  trigger: Extract<AutomationTrigger, { kind: "column_set_to" }>;
  onChange: (next: AutomationTrigger) => void;
  vocabulary: RuleVocabulary;
}) {
  const column = vocabulary.columns.find((c) => c.id === trigger.columnId);
  if (column?.type === "CHECKBOX") {
    return (
      <Picker
        value={trigger.checked === false ? "no" : "yes"}
        label="Value"
        onChange={(next) => onChange({ kind: "column_set_to", columnId: trigger.columnId, checked: next === "yes" })}
        options={[
          { value: "yes", label: "ticked" },
          { value: "no", label: "unticked" },
        ]}
        testId="trigger-value"
      />
    );
  }
  if (column?.type === "SIZE") {
    return (
      <Picker
        value={trigger.text ?? ""}
        label="Size"
        onChange={(text) => onChange({ kind: "column_set_to", columnId: trigger.columnId, text })}
        options={T_SHIRT_SIZES.map((size) => ({ value: size, label: size }))}
        testId="trigger-value"
      />
    );
  }
  return <LabelPicker columnId={trigger.columnId} value={trigger.labelId ?? ""} onChange={(labelId) => onChange({ kind: "column_set_to", columnId: trigger.columnId, labelId })} vocabulary={vocabulary} />;
}

/** The first value a "becomes" trigger names for a column, by what the column holds. */
function setToDefault(columnId: EntityId, vocabulary: RuleVocabulary): AutomationTrigger {
  const column = vocabulary.columns.find((c) => c.id === columnId);
  if (column?.type === "CHECKBOX") return { kind: "column_set_to", columnId, checked: true };
  if (column?.type === "SIZE") return { kind: "column_set_to", columnId, text: T_SHIRT_SIZES[0] };
  return { kind: "column_set_to", columnId, labelId: column ? (columnLabels(column)[0]?.id ?? null) : null };
}

function HourPicker({ value, onChange }: { value: number; onChange: (hour: number) => void }) {
  return (
    <Picker
      value={String(value)}
      label="Time"
      onChange={(hour) => onChange(Number(hour))}
      options={HOURS.map((hour) => ({ value: String(hour), label: `at ${hourWord(hour)}` }))}
      testId="trigger-hour"
    />
  );
}

function LabelPicker({
  columnId,
  value,
  onChange,
  vocabulary,
}: {
  columnId: EntityId;
  value: string;
  onChange: (labelId: string) => void;
  vocabulary: RuleVocabulary;
}) {
  const column = vocabulary.columns.find((c) => c.id === columnId);
  const labels = column ? columnLabels(column) : [];
  return <Picker value={value} label="Value" onChange={onChange} options={labels.map((l) => ({ value: l.id, label: l.name }))} testId="trigger-label" />;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function ConditionEditor({
  condition,
  onChange,
  vocabulary,
}: {
  condition: AutomationCondition;
  onChange: (next: AutomationCondition) => void;
  vocabulary: RuleVocabulary;
}) {
  return (
    <>
      <Picker
        value={condition.kind}
        label="What to check"
        onChange={(kind) => onChange(defaultCondition(vocabulary, kind as AutomationCondition["kind"]))}
        options={[
          { value: "column", label: "a column" },
          { value: "group", label: "the group" },
          { value: "actor", label: "who changed it" },
          { value: "item_kind", label: "task or subitem" },
        ]}
      />

      {condition.kind === "column" && (
        <>
          <Picker
            value={condition.columnId}
            label="Column"
            onChange={(columnId) => onChange({ ...condition, columnId, value: null })}
            options={vocabulary.columns.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Picker
            value={condition.op}
            label="Test"
            onChange={(op) => onChange({ ...condition, op: op as ConditionOp })}
            options={CONDITION_OPS.map((op) => ({ value: op, label: OP_WORDS[op] }))}
          />
          {condition.op !== "is_empty" && condition.op !== "is_not_empty" && condition.op !== "is_overdue" && (
            <ValueEditor
              columnId={condition.columnId}
              value={condition.value ?? null}
              onChange={(value) => onChange({ ...condition, value })}
              vocabulary={vocabulary}
            />
          )}
        </>
      )}

      {condition.kind === "group" && (
        <>
          <Picker value={condition.op} label="Test" onChange={(op) => onChange({ ...condition, op: op as "is" | "is_not" })} options={[{ value: "is", label: "is" }, { value: "is_not", label: "is not" }]} />
          <Picker
            value={condition.groupId}
            label="Group"
            onChange={(groupId) => onChange({ ...condition, groupId })}
            options={vocabulary.groups.map((g) => ({ value: g.id, label: g.name }))}
          />
        </>
      )}

      {condition.kind === "actor" && (
        <>
          <Picker value={condition.op} label="Test" onChange={(op) => onChange({ ...condition, op: op as "is" | "is_not" })} options={[{ value: "is", label: "is" }, { value: "is_not", label: "is not" }]} />
          <Picker
            value={condition.userId}
            label="Person"
            onChange={(userId) => onChange({ ...condition, userId })}
            options={vocabulary.users.map((u) => ({ value: u.id, label: u.displayName }))}
          />
        </>
      )}

      {condition.kind === "item_kind" && (
        <Picker
          value={condition.is}
          label="Kind"
          onChange={(is) => onChange({ ...condition, is: is as "item" | "subitem" })}
          options={[{ value: "item", label: "is a top-level task" }, { value: "subitem", label: "is a subitem" }]}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ActionEditor({
  action,
  allowed,
  onChange,
  vocabulary,
}: {
  action: AutomationAction;
  allowed: readonly AutomationActionKind[];
  onChange: (next: AutomationAction) => void;
  vocabulary: RuleVocabulary;
}) {
  const columnPicker = (columnId: EntityId, filter: (c: BoardColumn) => boolean, onPick: (id: EntityId) => void) => (
    <Picker
      value={columnId}
      label="Column"
      onChange={onPick}
      options={vocabulary.columns.filter(filter).map((c) => ({ value: c.id, label: c.name }))}
      testId="action-column"
    />
  );

  return (
    <>
      <Picker
        value={action.kind}
        label="What to do"
        onChange={(kind) => onChange(defaultAction(allowed, vocabulary, kind as AutomationActionKind))}
        options={allowed.map((kind) => ({ value: kind, label: ACTION_WORDS[kind] }))}
        testId="action-kind"
      />

      {action.kind === "set_value" && (
        <>
          {columnPicker(action.columnId, (c) => !["ASSETS_RECAP", "DEPENDENCY", "BOOKED_AT"].includes(c.type), (columnId) => {
            const column = vocabulary.columns.find((c) => c.id === columnId);
            onChange({ kind: "set_value", columnId, value: column ? emptyValueFor(column.type) : action.value });
          })}
          <span className="text-[13px] text-muted-foreground">to</span>
          <ValueEditor columnId={action.columnId} value={action.value} onChange={(value) => value && onChange({ ...action, value })} vocabulary={vocabulary} />
        </>
      )}

      {action.kind === "clear_value" && columnPicker(action.columnId, () => true, (columnId) => onChange({ ...action, columnId }))}

      {(action.kind === "set_parent_value" || action.kind === "set_subitems_value") && (
        <>
          {columnPicker(action.columnId, (c) => !["ASSETS_RECAP", "DEPENDENCY", "BOOKED_AT"].includes(c.type), (columnId) => {
            const column = vocabulary.columns.find((c) => c.id === columnId);
            onChange({ ...action, columnId, value: column ? emptyValueFor(column.type) : action.value });
          })}
          <span className="text-[13px] text-muted-foreground">to</span>
          <ValueEditor columnId={action.columnId} value={action.value} onChange={(value) => value && onChange({ ...action, value })} vocabulary={vocabulary} />
        </>
      )}

      {action.kind === "copy_value" && (
        <>
          <Picker
            value={action.fromColumnId}
            label="From"
            onChange={(fromColumnId) => onChange({ ...action, fromColumnId })}
            options={vocabulary.columns.filter((c) => !["ASSETS_RECAP", "DEPENDENCY", "BOOKED_AT"].includes(c.type)).map((c) => ({ value: c.id, label: c.name }))}
            testId="action-column"
          />
          <span className="text-[13px] text-muted-foreground">to</span>
          <Picker
            value={action.toColumnId}
            label="To"
            onChange={(toColumnId) => onChange({ ...action, toColumnId })}
            // Only columns that hold the same kind of value: a date cannot be
            // copied into a status, and the save would refuse it anyway.
            options={vocabulary.columns
              .filter((c) => c.id !== action.fromColumnId && c.type === vocabulary.columns.find((f) => f.id === action.fromColumnId)?.type)
              .map((c) => ({ value: c.id, label: c.name }))}
            testId="action-column-to"
          />
        </>
      )}

      {action.kind === "adjust_number" && (
        <>
          {columnPicker(action.columnId, (c) => c.type === "NUMBER", (columnId) => onChange({ ...action, columnId }))}
          <span className="text-[13px] text-muted-foreground">by</span>
          <Input
            type="number"
            value={Number.isFinite(action.delta) ? String(action.delta) : ""}
            onChange={(e) => onChange({ ...action, delta: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
            aria-label="How much to change it by"
            className="h-8 w-28"
            data-testid="action-delta"
          />
        </>
      )}

      {(action.kind === "add_tags" || action.kind === "remove_tags") && (
        <>
          {columnPicker(action.columnId, (c) => c.type === "TAGS", (columnId) => onChange({ ...action, columnId }))}
          <Input
            value={action.tags.join(", ")}
            onChange={(e) => onChange({ ...action, tags: e.target.value.split(",").map((tag) => tag.trimStart()) })}
            placeholder="Tags, separated by commas"
            aria-label="Tags, separated by commas"
            className="h-8 min-w-48 flex-1"
            data-testid="action-tags"
          />
        </>
      )}

      {action.kind === "set_name" && (
        <Input
          value={action.name}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
          placeholder="What to call it"
          aria-label="The new name"
          className="h-8 min-w-48 flex-1"
          data-testid="action-name"
        />
      )}

      {action.kind === "set_description" && (
        <Textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          placeholder="The new description (leave empty to clear it)"
          aria-label="The new description"
          className="min-h-16 flex-1"
        />
      )}

      {action.kind === "send_webhook" && (
        <Input
          type="url"
          value={action.url}
          onChange={(e) => onChange({ ...action, url: e.target.value })}
          placeholder="https://…"
          aria-label="The address to call"
          className="h-8 min-w-64 flex-1"
          data-testid="action-url"
        />
      )}

      {action.kind === "move_to_group" && (
        <Picker
          value={action.groupId}
          label="Group"
          onChange={(groupId) => onChange({ ...action, groupId })}
          options={vocabulary.groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      )}

      {(action.kind === "assign_person" || action.kind === "unassign_person") && (
        <>
          {columnPicker(action.columnId, isPeopleColumn, (columnId) => onChange({ ...action, columnId }))}
          <Picker
            value={action.kind === "assign_person" && action.useActor ? "actor" : action.kind === "assign_person" && action.useCreator ? "creator" : (action.userIds[0] ?? "")}
            label="Person"
            onChange={(who) =>
              onChange(
                action.kind === "assign_person"
                  ? who === "actor"
                    ? { ...action, userIds: [], useActor: true, useCreator: false }
                    : who === "creator"
                      ? { ...action, userIds: [], useActor: false, useCreator: true }
                      : { ...action, userIds: [who], useActor: false, useCreator: false }
                  : { ...action, userIds: [who], all: false },
              )
            }
            options={[
              ...(action.kind === "assign_person"
                ? [
                    { value: "actor", label: "whoever made the change" },
                    { value: "creator", label: "whoever added the task" },
                  ]
                : []),
              ...vocabulary.users.map((u) => ({ value: u.id, label: u.displayName })),
            ]}
          />
        </>
      )}

      {(action.kind === "shift_date" || action.kind === "set_date_relative") && (
        <>
          {columnPicker(action.columnId, isDateColumn, (columnId) => onChange({ ...action, columnId }))}
          <Picker
            value={String(action.days)}
            label="By"
            onChange={(days) => onChange({ ...action, days: Number(days) })}
            options={[-14, -7, -3, -1, 0, 1, 2, 3, 7, 14, 30].map((days) => ({
              value: String(days),
              label:
                action.kind === "set_date_relative"
                  ? days === 0
                    ? "to today"
                    : days > 0
                      ? `to ${days} days from today`
                      : `to ${-days} days ago`
                  : days === 0
                    ? "by nothing"
                    : days > 0
                      ? `${days} days later`
                      : `${-days} days earlier`,
            }))}
          />
        </>
      )}

      {action.kind === "notify" && (
        <>
          <Picker
            value={action.audience}
            label="Who to tell"
            onChange={(audience) =>
              onChange({
                ...action,
                audience: audience as typeof action.audience,
                userIds: [],
                columnId: audience === "column" ? (vocabulary.columns.find(isPeopleColumn)?.id ?? null) : null,
              })
            }
            options={[
              { value: "people_on_item", label: "everybody on the task" },
              { value: "column", label: "everybody in a people column" },
              { value: "creator", label: "whoever added the task" },
              { value: "actor", label: "whoever made the change" },
              { value: "board_owners", label: "the board's owners" },
              { value: "board_members", label: "everybody on the board" },
              { value: "specific", label: "somebody in particular" },
            ]}
          />
          {action.audience === "column" && columnPicker(action.columnId ?? "", isPeopleColumn, (columnId) => onChange({ ...action, columnId }))}
          {action.audience === "specific" && (
            <Picker
              value={action.userIds?.[0] ?? ""}
              label="Person"
              onChange={(userId) => onChange({ ...action, userIds: [userId] })}
              options={vocabulary.users.map((u) => ({ value: u.id, label: u.displayName }))}
            />
          )}
          <Input
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            placeholder="What it should say"
            aria-label="What the notification says"
            className="h-8 min-w-48 flex-1"
            data-testid="action-message"
          />
        </>
      )}

      {action.kind === "add_comment" && (
        <Textarea
          value={action.body}
          onChange={(e) => onChange({ ...action, body: e.target.value })}
          placeholder="What the update should say"
          aria-label="What the update says"
          className="min-h-16 flex-1"
        />
      )}

      {(action.kind === "create_item" || action.kind === "create_subitem") && (
        <>
          <Input
            value={action.name}
            onChange={(e) => onChange({ ...action, name: e.target.value })}
            placeholder="Name of the new task"
            aria-label="Name of the new task"
            className="h-8 min-w-48 flex-1"
            data-testid="action-name"
          />
          {action.kind === "create_item" && (
            <Picker
              value={action.groupId ?? (vocabulary.groups[0]?.id ?? "")}
              label="Group"
              onChange={(groupId) => onChange({ ...action, groupId })}
              options={vocabulary.groups.map((g) => ({ value: g.id, label: `in ${g.name}` }))}
            />
          )}
        </>
      )}

      {TEMPLATED.includes(action.kind) && (
        <p className="w-full text-2xs text-muted-foreground">
          {"{item}, {board}, {group}, {ticket}, {actor}, {today} and {column:Name} are filled in when it runs."}
        </p>
      )}
    </>
  );
}

/** The right editor for whatever the chosen column holds. */
function ValueEditor({
  columnId,
  value,
  onChange,
  vocabulary,
}: {
  columnId: EntityId;
  value: ColumnValue | null;
  onChange: (value: ColumnValue | null) => void;
  vocabulary: RuleVocabulary;
}) {
  const column = vocabulary.columns.find((c) => c.id === columnId);
  if (!column) return null;

  if (hasLabels(column)) {
    const labels = columnLabels(column);
    const current = value && "labelId" in value ? (value.labelId ?? "") : "";
    return (
      <Picker
        value={current}
        label="Value"
        onChange={(labelId) =>
          onChange(
            column.type === "STATUS"
              ? { type: "STATUS", labelId }
              : column.type === "DROPDOWN"
                ? { type: "DROPDOWN", labelId }
                : { type: "PRIORITY", labelId },
          )
        }
        options={labels.map((l) => ({ value: l.id, label: l.name }))}
        testId="action-value"
      />
    );
  }

  if (column.type === "STAKEHOLDER") return <DepartmentValueEditor value={value} onChange={onChange} />;

  if (column.type === "CHECKBOX") {
    return (
      <Picker
        value={value?.type === "CHECKBOX" && value.checked ? "yes" : "no"}
        label="Value"
        onChange={(next) => onChange({ type: "CHECKBOX", checked: next === "yes" })}
        options={[{ value: "yes", label: "ticked" }, { value: "no", label: "unticked" }]}
      />
    );
  }

  if (isPeopleColumn(column)) {
    return (
      <Picker
        value={value && "userIds" in value ? (value.userIds[0] ?? "") : ""}
        label="Person"
        onChange={(userId) => onChange(column.type === "PEOPLE" ? { type: "PEOPLE", userIds: [userId] } : { type: "PERSON", userIds: [userId] })}
        options={vocabulary.users.map((u) => ({ value: u.id, label: u.displayName }))}
      />
    );
  }

  if (column.type === "NUMBER") {
    return (
      <Input
        type="number"
        value={value?.type === "NUMBER" && value.number !== null ? String(value.number) : ""}
        onChange={(e) => onChange({ type: "NUMBER", number: e.target.value === "" ? null : Number(e.target.value) })}
        aria-label="Value"
        className="h-8 w-28"
        data-testid="action-value"
      />
    );
  }

  if (column.type === "PLAIN_DATE") {
    return (
      <Input
        type="date"
        value={value?.type === "PLAIN_DATE" ? (value.date ?? "") : ""}
        onChange={(e) => onChange({ type: "PLAIN_DATE", date: e.target.value || null })}
        aria-label="Value"
        className="h-8 w-40"
        data-testid="action-value"
      />
    );
  }

  if (column.type === "TIME") {
    return (
      <Input
        type="time"
        value={value?.type === "TIME" ? (value.time ?? "") : ""}
        onChange={(e) => onChange({ type: "TIME", time: e.target.value || null })}
        aria-label="Value"
        className="h-8 w-32"
        data-testid="action-value"
      />
    );
  }

  if (column.type === "DATETIME" || column.type === "COUNTDOWN") {
    // The field works in local time; the value is a moment, stored in UTC. A countdown's is the moment it ends.
    const type = column.type;
    const local = value?.type === type && value.at ? toLocalInput(value.at) : "";
    return (
      <Input
        type="datetime-local"
        value={local}
        onChange={(e) => onChange({ type, at: e.target.value ? new Date(e.target.value).toISOString() : null })}
        aria-label="Value"
        className="h-8 w-52"
        data-testid="action-value"
      />
    );
  }

  if (column.type === "DATE") {
    return (
      <Input
        type="date"
        value={value?.type === "DATE" ? (value.date ?? "") : ""}
        onChange={(e) => onChange({ type: "DATE", date: e.target.value || null })}
        aria-label="Value"
        className="h-8 w-40"
        data-testid="action-value"
      />
    );
  }

  return (
    <Input
      value={value && "text" in value ? (value.text ?? "") : ""}
      onChange={(e) => onChange({ type: column.type === "LONG_TEXT" ? "LONG_TEXT" : "TEXT", text: e.target.value } as ColumnValue)}
      placeholder="Value"
      aria-label="Value"
      className="h-8 min-w-40 flex-1"
      data-testid="action-value"
    />
  );
}

/** A department, from Settings → Departments and nowhere else: the database refuses any other word. */
function DepartmentValueEditor({ value, onChange }: { value: ColumnValue | null; onChange: (value: ColumnValue | null) => void }) {
  const ws = useWorkspace();
  const departments = useWorkspaceList(ws.workspace.id, "STAKEHOLDER_GROUPS");
  const current = value?.type === "STAKEHOLDER" ? (departments.find((d) => d.name.toLowerCase() === (value.group ?? "").toLowerCase())?.name ?? "") : "";
  return <Picker value={current} label="Department" onChange={(group) => onChange({ type: "STAKEHOLDER", group })} options={departments.map((d) => ({ value: d.name, label: d.name }))} testId="action-value" />;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultTrigger(kind: AutomationTriggerKind, vocabulary: RuleVocabulary): AutomationTrigger {
  const firstOf = (filter: (c: BoardColumn) => boolean) => (vocabulary.columns.find(filter) ?? vocabulary.columns[0])?.id ?? "";
  switch (kind) {
    case "item_created":
      return { kind, groupId: null };
    case "column_changed":
      return { kind, columnId: firstOf(() => true) };
    case "column_set_to":
      return setToDefault(firstOf(SETTABLE_TO), vocabulary);
    case "column_cleared":
      return { kind, columnId: firstOf(() => true) };
    case "name_contains":
    case "comment_contains":
      return { kind, text: "" };
    case "column_contains":
      return { kind, columnId: firstOf((c) => TEXTUAL_COLUMNS.includes(c.type)), text: "" };
    case "number_crosses":
      return { kind, columnId: firstOf((c) => c.type === "NUMBER"), direction: "above", threshold: 0 };
    case "person_assigned":
    case "person_unassigned":
      return { kind, columnId: firstOf(isPeopleColumn), userId: null };
    case "item_moved_to_group":
    case "item_moved_from_group":
      return { kind, groupId: vocabulary.groups[0]?.id ?? "" };
    case "subitem_created":
    case "item_renamed":
    case "comment_added":
    case "item_archived":
    case "item_restored":
      return { kind };
    case "date_arrives":
      return { kind, columnId: firstOf(isDateColumn), offsetDays: -1, atHour: 9 };
    case "column_unchanged_for":
      return { kind, columnId: firstOf(hasLabels), days: 7, atHour: 9 };
    case "recurring":
      return { kind, recurrence: "weekly", weekday: 1, atHour: 9 };
    case "manual":
      return { kind };
  }
}

function defaultCondition(vocabulary: RuleVocabulary, kind: AutomationCondition["kind"] = "column"): AutomationCondition {
  switch (kind) {
    case "group":
      return { kind, op: "is", groupId: vocabulary.groups[0]?.id ?? "" };
    case "actor":
      return { kind, op: "is", userId: vocabulary.users[0]?.id ?? "" };
    case "item_kind":
      return { kind, is: "item" };
    default:
      return { kind: "column", columnId: vocabulary.columns[0]?.id ?? "", op: "is_not_empty", value: null };
  }
}

function defaultAction(allowed: readonly AutomationActionKind[], vocabulary: RuleVocabulary, kind?: AutomationActionKind): AutomationAction {
  const chosen = kind ?? allowed[0] ?? "notify";
  const firstOf = (filter: (c: BoardColumn) => boolean) => (vocabulary.columns.find(filter) ?? vocabulary.columns[0])?.id ?? "";
  switch (chosen) {
    case "set_value": {
      const columnId = firstOf(hasLabels);
      const column = vocabulary.columns.find((c) => c.id === columnId);
      return { kind: "set_value", columnId, value: column ? emptyValueFor(column.type) : { type: "TEXT", text: "" } };
    }
    case "clear_value":
      return { kind: "clear_value", columnId: firstOf(() => true) };
    case "move_to_group":
      return { kind: "move_to_group", groupId: vocabulary.groups[0]?.id ?? "" };
    case "assign_person":
      return { kind: "assign_person", columnId: firstOf(isPeopleColumn), userIds: [], useActor: true };
    case "unassign_person":
      return { kind: "unassign_person", columnId: firstOf(isPeopleColumn), userIds: [], all: true };
    case "shift_date":
      return { kind: "shift_date", columnId: firstOf(isDateColumn), days: 1 };
    case "set_date_relative":
      return { kind: "set_date_relative", columnId: firstOf(isDateColumn), days: 0 };
    case "add_comment":
      return { kind: "add_comment", body: "{actor} changed something on {item}." };
    case "create_item":
      return { kind: "create_item", groupId: vocabulary.groups[0]?.id ?? null, name: "Follow up on {item}" };
    case "create_subitem":
      return { kind: "create_subitem", name: "Check {item}" };
    case "archive_item":
      return { kind: "archive_item" };
    case "restore_item":
      return { kind: "restore_item" };
    case "duplicate_item":
      return { kind: "duplicate_item" };
    case "set_name":
      return { kind: "set_name", name: "{item}" };
    case "set_description":
      return { kind: "set_description", text: "" };
    case "copy_value": {
      const fromColumnId = firstOf(isDateColumn);
      const from = vocabulary.columns.find((c) => c.id === fromColumnId);
      const to = vocabulary.columns.find((c) => c.id !== fromColumnId && c.type === from?.type);
      return { kind: "copy_value", fromColumnId, toColumnId: to?.id ?? "" };
    }
    case "adjust_number":
      return { kind: "adjust_number", columnId: firstOf((c) => c.type === "NUMBER"), delta: 1 };
    case "add_tags":
      return { kind: "add_tags", columnId: firstOf((c) => c.type === "TAGS"), tags: [] };
    case "remove_tags":
      return { kind: "remove_tags", columnId: firstOf((c) => c.type === "TAGS"), tags: [] };
    case "set_parent_value":
    case "set_subitems_value": {
      const columnId = firstOf(hasLabels);
      const column = vocabulary.columns.find((c) => c.id === columnId);
      return { kind: chosen, columnId, value: column ? emptyValueFor(column.type) : { type: "TEXT", text: "" } };
    }
    case "send_webhook":
      return { kind: "send_webhook", url: "" };
    default:
      return { kind: "notify", audience: "people_on_item", message: "{item} needs a look" };
  }
}

/** An ISO moment as a datetime-local field wants it: "2026-09-16T19:06", in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
