/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "lucide-react";

export function ProductMockup() {
  return (
    <div className="relative mx-auto mt-10 max-w-[1080px] min-w-0 sm:mt-16 md:mt-20">
      {/* Coral-teal glow beneath the product surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-20 h-72 bg-[radial-gradient(ellipse_at_30%_center,oklch(0.78_0.16_25/0.30)_0%,transparent_60%),radial-gradient(ellipse_at_70%_center,oklch(0.68_0.13_215/0.26)_0%,transparent_60%)] blur-2xl dark:bg-[radial-gradient(ellipse_at_30%_center,oklch(0.74_0.17_25/0.22)_0%,transparent_60%),radial-gradient(ellipse_at_70%_center,oklch(0.7_0.13_215/0.22)_0%,transparent_60%)]"
      />

      <div className="border-border bg-surface relative overflow-hidden rounded-2xl border shadow-[0_30px_80px_-20px_oklch(0_0_0/0.18)] sm:rounded-[20px] dark:shadow-[0_30px_80px_-20px_oklch(0_0_0/0.65)]">
        {/* Window chrome */}
        <div className="border-border flex h-9 min-w-0 items-center gap-2 border-b px-3 sm:px-4">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#ff5f56]/85" />
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#ffbd2e]/85" />
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#27c93f]/85" />
          <div className="bg-muted font-mono text-muted-foreground mx-auto max-w-[calc(100%-4rem)] min-w-0 truncate rounded-md px-2 py-0.5 text-[10px] sm:max-w-none sm:px-3 sm:text-[11px]">
            app.manut.xyz / workspace / projects
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[224px_1fr]">
          {/* Sidebar */}
          <aside aria-hidden className="border-border bg-muted/40 hidden flex-col gap-1 border-r p-3 md:flex">
            <div className="font-mono tracking-widest text-muted-foreground px-2 pt-2 pb-1 text-[10px] uppercase">
              Workspace
            </div>
            {[
              { label: "Launch project", active: true, dot: "P" },
              { label: "Work items", badge: "12", dot: "W" },
              { label: "Cycles", dot: "C" },
              { label: "Intake", dot: "I" },
            ].map((item) => (
              <div
                key={item.label}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] " +
                  (item.active ? "bg-accent/40 text-foreground font-medium" : "text-muted-foreground")
                }
              >
                <span aria-hidden>{item.dot}</span>
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="bg-accent/60 text-accent-foreground ml-auto rounded-full px-1.5 text-[10px] font-semibold">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            ))}
            <div className="font-mono tracking-widest text-muted-foreground mt-3 px-2 pt-2 pb-1 text-[10px] uppercase">
              Recent
            </div>
            {["Bug triage", "Ops review", "Release handoff"].map((label) => (
              <div key={label} className="text-muted-foreground rounded-md px-2 py-1.5 text-[13px]">
                {label}
              </div>
            ))}
          </aside>

          {/* Content */}
          <div className="overflow-hidden p-4 sm:p-7 md:p-8">
            <div className="mb-5">
              <h3 className="text-xl font-semibold tracking-tight sm:text-[22px]">Production onboarding cleanup</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Updated by operations · 3 minutes ago · 4 collaborators
              </p>
            </div>

            {/* AI bubble */}
            <div className="border-accent/40 bg-accent/15 dark:bg-accent/10 mb-3 rounded-xl border p-4">
              <div className="font-mono tracking-widest text-accent-foreground/80 mb-2 flex items-center gap-1.5 text-[10px] uppercase">
                <Sparkles className="size-3" aria-hidden />
                Manut AI · Draft mode
              </div>
              <p className="text-foreground text-[13px] leading-relaxed">
                I summarized the open work items, grouped blockers by owner, and drafted the next handoff checklist for
                review.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="bg-foreground/5 font-mono tracking-wider text-foreground/70 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase">
                  Draft ready
                </span>
                <span className="bg-foreground/5 font-mono tracking-wider text-foreground/70 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase">
                  Sources linked
                </span>
                <span className="bg-foreground/5 font-mono tracking-wider text-foreground/70 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase">
                  Review first
                </span>
              </div>
            </div>

            {/* Work item table */}
            <div className="border-border bg-muted/30 mb-3 rounded-xl border p-4">
              <div className="font-mono tracking-widest text-muted-foreground mb-3 text-[10px] uppercase">
                Active work items
              </div>
              <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
                <div className="bg-border grid min-w-[280px] grid-cols-[1fr_90px_72px] gap-px overflow-hidden rounded-md text-[12px]">
                  <div className="bg-background/80 font-mono tracking-wider text-muted-foreground px-2.5 py-1.5 text-[10px] uppercase">
                    Work item
                  </div>
                  <div className="bg-background/80 font-mono tracking-wider text-muted-foreground px-2.5 py-1.5 text-[10px] uppercase">
                    Owner
                  </div>
                  <div className="bg-background/80 font-mono tracking-wider text-muted-foreground px-2.5 py-1.5 text-[10px] uppercase">
                    Status
                  </div>
                  <div className="bg-card text-foreground px-2.5 py-1.5">Invite email review</div>
                  <div className="bg-card text-muted-foreground px-2.5 py-1.5">Ops</div>
                  <div className="bg-card px-2.5 py-1.5">
                    <span className="text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1">
                      <span aria-hidden className="size-1.5 rounded-full bg-current" /> Active
                    </span>
                  </div>
                  <div className="bg-card text-foreground px-2.5 py-1.5">Attachment upload smoke</div>
                  <div className="bg-card text-muted-foreground px-2.5 py-1.5">Product</div>
                  <div className="bg-card text-muted-foreground px-2.5 py-1.5">In Review</div>
                  <div className="bg-card text-foreground px-2.5 py-1.5">Better Stack check</div>
                  <div className="bg-card text-muted-foreground px-2.5 py-1.5">Infra</div>
                  <div className="bg-card text-amber-600 dark:text-amber-400 px-2.5 py-1.5">Planned</div>
                </div>
              </div>
            </div>

            {/* Skeleton text */}
            <div className="border-border bg-muted/30 rounded-xl border p-4">
              <div className="font-mono tracking-widest text-muted-foreground mb-3 text-[10px] uppercase">
                Executive summary
              </div>
              <div className="space-y-2">
                <div className="bg-foreground/8 dark:bg-foreground/12 h-2.5 w-[92%] rounded" />
                <div className="bg-foreground/8 dark:bg-foreground/12 h-2.5 w-[85%] rounded" />
                <div className="bg-foreground/8 dark:bg-foreground/12 h-2.5 w-[78%] rounded" />
                <div className="bg-foreground/8 dark:bg-foreground/12 h-2.5 w-[60%] rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
