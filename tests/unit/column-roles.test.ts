import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnRole, ColumnType } from "@/domain";
import { ambiguousRoles, defaultSettingsFor, resolveColumnRoles, rolesForType } from "@/domain";

let n = 0;
function col(name: string, type: ColumnType, role: ColumnRole | null = null): BoardColumn {
  n += 1;
  return { id: `c${n}`, boardId: "b", name, type, settings: defaultSettingsFor(type), position: n, width: 120, hidden: false, role, createdAt: "" };
}

describe("resolveColumnRoles", () => {
  it("takes the first column of a type when the board has said nothing, as it always did", () => {
    const briefedOn = col("Briefed on", "DATE");
    const dueDate = col("Due date", "DATE");
    const roles = resolveColumnRoles([briefedOn, dueDate]);
    expect(roles.dueDate?.id).toBe(briefedOn.id);
  });

  it("obeys the board when it says which column is the deadline", () => {
    const briefedOn = col("Briefed on", "DATE");
    const dueDate = col("Due date", "DATE", "dueDate");
    expect(resolveColumnRoles([briefedOn, dueDate]).dueDate?.id).toBe(dueDate.id);
  });

  it("does not fall back onto a column that was given a different job", () => {
    // "Briefed on" comes first, but the board has spoken for it, so the guess
    // moves on rather than handing it a second job.
    const briefedOn = col("Briefed on", "DATE", "timeline");
    const dueDate = col("Due date", "DATE");
    expect(resolveColumnRoles([briefedOn, dueDate]).dueDate?.id).toBe(dueDate.id);
  });

  it("ignores a role whose column can no longer do the job", () => {
    // The column was retyped after being nominated; the note is stale.
    const notes = col("Notes", "TEXT", "status");
    const status = col("Status", "STATUS");
    expect(resolveColumnRoles([notes, status]).status?.id).toBe(status.id);
  });

  it("takes an implied type whatever it is called, but a loose type only when its name says so", () => {
    // A stakeholder column is who the work is for, whatever it is named.
    const stakeholder = col("For", "STAKEHOLDER");
    expect(resolveColumnRoles([stakeholder]).department?.id).toBe(stakeholder.id);
    // A text column is only the department when it says as much.
    const notes = col("Notes", "TEXT");
    const school = col("School", "TEXT");
    expect(resolveColumnRoles([notes]).department).toBeNull();
    expect(resolveColumnRoles([notes, school]).department?.id).toBe(school.id);
  });

  it("keeps the requester off the PIC column unless the name says so", () => {
    const owner = col("Owner", "PERSON");
    const requester = col("Requester", "PERSON");
    const roles = resolveColumnRoles([owner, requester]);
    expect(roles.pic?.id).toBe(owner.id);
    expect(roles.requester?.id).toBe(requester.id);
  });

  it("finds a requester on a People column too", () => {
    const owner = col("Owner", "PERSON");
    const requester = col("Requested by", "PEOPLE");
    expect(resolveColumnRoles([owner, requester]).requester?.id).toBe(requester.id);
  });

  it("offers a column only the jobs its type could do", () => {
    expect(rolesForType("STATUS")).toEqual(["status"]);
    expect(rolesForType("DATE")).toEqual(["dueDate"]);
    expect(rolesForType("PERSON")).toEqual(["pic", "requester"]);
    expect(rolesForType("CHECKBOX")).toEqual([]);
  });
});

describe("ambiguousRoles", () => {
  it("names the jobs where position is deciding for the board", () => {
    expect(ambiguousRoles([col("Briefed on", "DATE"), col("Due date", "DATE")])).toContain("dueDate");
  });

  it("says nothing once the board has chosen", () => {
    expect(ambiguousRoles([col("Briefed on", "DATE"), col("Due date", "DATE", "dueDate")])).not.toContain("dueDate");
  });

  it("says nothing about a board with one of each", () => {
    expect(ambiguousRoles([col("Status", "STATUS"), col("Due date", "DATE"), col("Owner", "PERSON")])).toEqual([]);
  });
});
