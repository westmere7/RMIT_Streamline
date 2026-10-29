import type { BookingFormTemplate, ColorToken } from "@/domain";
import { defaultBookingFormTemplate } from "@/domain";

/**
 * The built-in booking form with work types offered on its services, as a
 * workspace that has work types would have it. The built-in form itself offers
 * none, because a new workspace has no work types yet; these names stand in
 * for a workspace's own.
 */
const OFFERED: Record<string, Array<[string, ColorToken]>> = {
  "svc-brand": [["Approval", "green"], ["Digital / Social", "blue"], ["Print", "orange"], ["Publication", "amber"], ["Installation", "teal"], ["Others", "gray"]],
  "svc-design": [["Digital / Social", "blue"], ["Print", "orange"], ["Publication", "amber"], ["Installation", "teal"], ["Key Visual", "pink"], ["Others", "gray"]],
  "svc-production": [["Photography", "sky"], ["Videography", "purple"]],
};

export function fixtureBookingFormTemplate(): BookingFormTemplate {
  const template = defaultBookingFormTemplate();
  for (const service of template.services) service.subServices = (OFFERED[service.id] ?? []).map(([name, color]) => ({ name, color }));
  return template;
}

/** Every work type the fixture offers, as a workspace would list them. */
export const FIXTURE_WORK_TYPES = [...new Map(Object.values(OFFERED).flat().map(([name, color]) => [name, { name, color }])).values()];
