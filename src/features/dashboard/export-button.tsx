"use client";

import { FileDown, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportDashboardPdf, type ExportMeta } from "@/features/dashboard/export-pdf";
import type { DashboardViewProps } from "@/features/dashboard/views/types";

/** Export PDF, in the dashboard's header: the report drawn from the figures on screen. */
export function ExportDashboardButton({ view, meta }: { view: DashboardViewProps; meta: ExportMeta }) {
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportDashboardPdf(view, meta);
      toast.success("Dashboard report downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Could not make the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy} data-testid="dashboard-export">
      {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Export PDF
    </Button>
  );
}
