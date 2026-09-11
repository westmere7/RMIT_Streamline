"use client";

import { ArrowRight, BookOpen, Check, ChevronDown, Copy, Download, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/features/members/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { articleText, GUIDE_ARTICLES, guideMarkdown, searchGuide, type GuideArticle, type GuideSection } from "./guide-content";

const QUICK_STARTS = [
  { id: "quick-start-stakeholder", label: "For stakeholders", hint: "Submit a brief and follow your request" },
  { id: "quick-start-admin", label: "For admins", hint: "Set up managers and oversee the teams" },
  { id: "quick-start-manager", label: "For team managers", hint: "Plan, assign, and deliver your team's work" },
];

export function DocumentationSection() {
  const { slug } = useWorkspace();
  const params = useSearchParams();
  const [query, setQuery] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const results = searchGuide(query);
  const requested = params.get("guide") ?? "start";
  const selected = results.find((article) => article.id === requested) ?? results[0];
  const guideHref = (id: string) => `${routes.settings(slug, "documentation")}&guide=${encodeURIComponent(id)}`;
  const articleRef = React.useRef<HTMLElement>(null);
  const chapterMenuRef = React.useRef<HTMLDetailsElement>(null);
  const pendingChapter = React.useRef<string | null>(null);

  const focusArticle = () => {
    const article = articleRef.current;
    const scroller = article?.closest<HTMLElement>("[data-settings-content]");
    if (!article || !scroller) return;
    article.focus({ preventScroll: true });
    // Scroll only the Settings pane, keeping the mobile app bars in place.
    scroller.scrollTo({ top: scroller.scrollTop + article.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16, behavior: "instant" });
  };

  // Only move focus after an explicit chapter choice, never while searching.
  React.useEffect(() => {
    if (pendingChapter.current !== selected?.id) return;
    pendingChapter.current = null;
    focusArticle();
  }, [selected?.id, requested, query]);

  const chooseChapter = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Keep ordinary new-tab / new-window link behavior.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(event.currentTarget.href).searchParams.get("guide");
    pendingChapter.current = destination;
    setQuery("");
    setCopied(false);
    if (chapterMenuRef.current) chapterMenuRef.current.open = false;
    // Clicking the current chapter need not trigger a render.
    if (destination === selected?.id) {
      requestAnimationFrame(() => {
        pendingChapter.current = null;
        focusArticle();
      });
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([guideMarkdown()], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "streamline-user-guide.md";
    anchor.click();
    // Give the browser time to start the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyLink = async () => {
    if (!selected) return;
    setCopied(await copyToClipboard(new URL(guideHref(selected.id), window.location.origin).href, "Chapter link copied"));
  };

  const chapterList = (
    <nav aria-label="Documentation chapters">
      {Array.from(new Set(results.map((article) => article.category))).map((category) => (
        <div key={category} className="mb-5 last:mb-0">
          <p className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{category}</p>
          <ul className="space-y-0.5">
            {results.filter((article) => article.category === category).map((article) => (
              <li key={article.id}>
                <Link
                  href={guideHref(article.id)}
                  scroll={false}
                  onClick={chooseChapter}
                  aria-current={selected?.id === article.id ? "page" : undefined}
                  className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", selected?.id === article.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
                >
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <section aria-labelledby="documentation-title" className="min-w-0" data-testid="documentation-section">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BookOpen aria-hidden="true" className="size-4" /> THE STREAMLINE GUIDE
          </div>
          <h2 id="documentation-title" className="text-2xl font-semibold tracking-tight">Make the work flow.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your guide to requests, delivery, collaboration, and workspace administration. Start with a workflow, or find the answer you need.</p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={download}>
          <Download aria-hidden="true" /> Download guide
        </Button>
      </div>

      <section aria-labelledby="quick-start-title" className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 id="quick-start-title" className="text-sm font-semibold">Quick start guides</h3>
          <Link href={guideHref("workflow")} scroll={false} onClick={chooseChapter} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Full request-to-delivery workflow <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
        {QUICK_STARTS.map((entry) => (
          <Link key={entry.id} href={guideHref(entry.id)} scroll={false} onClick={chooseChapter} className="group flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-4">
            <span className="min-w-0"><span className="block text-sm font-medium">{entry.label}</span><span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">{entry.hint}</span></span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          </Link>
        ))}
        </div>
      </section>

      <div className="mb-6">
        <label htmlFor="documentation-search" className="sr-only">Search documentation</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input id="documentation-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setCopied(false); }} placeholder="Search topics, actions, or questions…" className="h-11 pr-12 pl-9 text-sm" aria-describedby="documentation-search-status" />
          {query && <Button variant="ghost" size="icon" className="absolute top-0 right-0 size-11" aria-label="Clear documentation search" onClick={() => { setQuery(""); document.getElementById("documentation-search")?.focus(); }}><X aria-hidden="true" /></Button>}
        </div>
        <p id="documentation-search-status" role="status" className="mt-2 text-xs text-muted-foreground">
          {query.trim() ? `${results.length} ${results.length === 1 ? "chapter matches" : "chapters match"} your search. Choose a chapter to read it.` : `${GUIDE_ARTICLES.length} chapters · Practical steps, feature references, and troubleshooting`}
        </p>
      </div>

      {!selected ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="text-base font-semibold">No matching chapters</h3>
          <p className="mt-2 text-sm text-muted-foreground">Try a shorter phrase such as “allocation”, “permissions”, or “save”.</p>
          <Button variant="outline" onClick={() => setQuery("")} className="mt-4 min-h-11">Show all chapters</Button>
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
          <div className="hidden xl:block">{chapterList}</div>
          <div className="min-w-0">
            <details ref={chapterMenuRef} className="mb-5 rounded-xl border bg-card xl:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                Browse chapters{query.trim() ? ` (${results.length})` : ""}<ChevronDown aria-hidden="true" className="size-4" />
              </summary>
              <div className="max-h-80 overflow-y-auto px-2 pb-3">{chapterList}</div>
            </details>
            <article ref={articleRef} tabIndex={-1} aria-labelledby="guide-article-title" className="min-w-0 scroll-mt-4 rounded-xl border border-border/70 bg-card p-5 outline-none sm:p-7 focus-visible:ring-2 focus-visible:ring-ring" data-testid="guide-article">
              <header className="mb-7 border-b pb-6">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium">{selected.category}</span><span aria-hidden="true">·</span><span>{Math.max(1, Math.ceil(articleText(selected).split(/\s+/).length / 200))} min read</span>
                </div>
                <h3 id="guide-article-title" className="text-xl font-semibold tracking-tight sm:text-2xl">{selected.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{selected.summary}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">For {selected.audience.toLowerCase()}</p>
                  <Button variant="ghost" className="min-h-11" onClick={() => void copyLink()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy chapter link"}</Button>
                </div>
              </header>
              <div className="space-y-8">
                {selected.sections.map((section, index) => <ArticleSection key={`${selected.id}-${index}`} section={section} />)}
              </div>
              <footer className="mt-8 border-t pt-5">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">Continue reading</p>
                <div className="flex flex-wrap gap-2">
                  {selected.related.map((id) => GUIDE_ARTICLES.find((article) => article.id === id)).filter((article): article is GuideArticle => !!article).map((article) => (
                    <Link key={article.id} href={guideHref(article.id)} scroll={false} onClick={chooseChapter} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{article.title}<ArrowRight aria-hidden="true" className="size-3.5 shrink-0" /></Link>
                  ))}
                </div>
              </footer>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function ArticleSection({ section }: { section: GuideSection }) {
  return (
    <section className="min-w-0 space-y-3 text-base leading-7 break-words">
      <h4 className="text-base font-semibold leading-snug">{section.title}</h4>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.steps && <ol className="list-decimal space-y-3 pl-6 marker:font-semibold marker:text-muted-foreground">{section.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}</ol>}
      {section.bullets && <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">{section.bullets.map((bullet) => <li key={bullet} className="pl-1">{bullet}</li>)}</ul>}
      {section.table && (
        <div className="overflow-x-auto rounded-lg border" role="region" aria-label={`${section.title} table`} tabIndex={0}>
          <table className="w-full text-left text-sm leading-relaxed">
            <caption className="sr-only">{section.title}</caption>
            <thead className="bg-muted/60"><tr>{section.table.headers.map((header) => <th key={header} scope="col" className="px-3 py-3 font-semibold">{header}</th>)}</tr></thead>
            <tbody className="divide-y">{section.table.rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row" className="px-3 py-3 align-top font-medium">{cell}</th> : <td key={index} className="px-3 py-3 align-top">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {section.note && <aside className="rounded-lg border border-border/70 bg-muted/40 p-4 text-sm leading-relaxed"><p className="mb-1 font-semibold">{section.note.title}</p><p>{section.note.text}</p></aside>}
    </section>
  );
}
