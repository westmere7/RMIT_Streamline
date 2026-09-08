"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BookingAnswerDestination, BookingFieldType, BookingFormTemplate, BookingTemplateField, TagOption } from "@/domain";
import { BOOKING_FIELD_TYPES, BOOKING_FIELD_TYPE_LABELS, BOOKING_STANDARD_KEY_LABELS, missingStandardKeys, newCustomField, newStandardField } from "@/domain";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { parseOptions } from "./options";

/**
 * Adding a question to a section: bring back one of the standard questions
 * the form dropped, or write a new one and say where its answer should go —
 * into the brief with everything else, or into a column of its own on Task
 * Allocation so the team can sort and filter by it.
 */
export function AddFieldDialog({ open, onOpenChange, template, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; template: BookingFormTemplate; onAdd: (field: BookingTemplateField) => void }) {
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<BookingFieldType>("TEXT");
  const [destination, setDestination] = React.useState<BookingAnswerDestination>("brief");
  const [options, setOptions] = React.useState("");
  const missing = missingStandardKeys(template);
  const canAdd = label.trim().length > 0 && (type !== "TAGS" || parseOptions(options).length > 0);

  const reset = () => {
    setLabel("");
    setType("TEXT");
    setDestination("brief");
    setOptions("");
  };

  const addCustom = () => {
    if (!canAdd) return;
    const palette: TagOption[] = parseOptions(options);
    onAdd(newCustomField(newId(), label.trim(), type, destination, palette));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="md" data-testid="add-field-dialog">
        <DialogHeader>
          <DialogTitle>Add a question</DialogTitle>
          <DialogDescription>Bring back one of the built-in questions, or write your own.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {missing.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium">Built-in questions not on the form</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-[13px] hover:border-foreground/40 hover:bg-accent"
                    onClick={() => {
                      onAdd(newStandardField(key));
                      reset();
                      onOpenChange(false);
                    }}
                    data-testid={`add-standard-${key}`}
                  >
                    {BOOKING_STANDARD_KEY_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={cn("space-y-4", missing.length > 0 && "border-t border-border/60 pt-5")}>
            <p className="text-[13px] font-medium">A question of your own</p>
            <div className="grid gap-1.5">
              <Label htmlFor="add-field-label">Question</Label>
              <Input id="add-field-label" placeholder="e.g. Cost centre" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus data-testid="add-field-label" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="add-field-type">Kind of answer</Label>
                <Select value={type} onValueChange={(v) => setType(v as BookingFieldType)}>
                  <SelectTrigger id="add-field-type" data-testid="add-field-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t} data-testid={`add-field-type-${t.toLowerCase()}`}>
                        {BOOKING_FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-field-destination">Where the answer goes</Label>
                <Select value={destination} onValueChange={(v) => setDestination(v as BookingAnswerDestination)}>
                  <SelectTrigger id="add-field-destination" data-testid="add-field-destination">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brief" data-testid="add-field-destination-brief">
                      Into the brief
                    </SelectItem>
                    <SelectItem value="column" data-testid="add-field-destination-column">
                      Its own column on Task Allocation
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {type === "TAGS" && (
              <div className="grid gap-1.5">
                <Label htmlFor="add-field-options">Choices</Label>
                <Input id="add-field-options" placeholder="Separate with commas, e.g. Melbourne, Hanoi, Saigon" value={options} onChange={(e) => setOptions(e.target.value)} data-testid="add-field-options" />
              </div>
            )}
            <p className="text-2xs text-muted-foreground">
              {destination === "column" ? "A column is added to Task Allocation when you save the form. On a team board without one, the answer joins the brief." : "The answer is written under the brief on the request, with the label you gave it."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={addCustom} disabled={!canAdd} data-testid="add-field-submit">
            Add question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
