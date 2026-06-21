import {
  Archive,
  ClipboardList,
  FileText,
  Flag,
  GitBranch,
  ListChecks,
  Paperclip,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Reveal } from '@/components/reveal';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeatureProps {
  title: string;
  description: string;
  icon: ReactNode;
  span?: 'wide' | 'default';
  accent?: boolean;
  badges?: ReactNode;
}

function Feature({
  title,
  description,
  icon,
  span = 'default',
  accent,
  badges,
}: FeatureProps) {
  return (
    <article
      className={cn(
        'group relative isolate flex flex-col gap-4 p-7 sm:p-8',
        'bg-card transition-colors hover:bg-muted/50',
        span === 'wide' && 'md:col-span-2',
        accent && 'md:col-span-2'
      )}
    >
      <div
        className={cn(
          'grid size-11 place-items-center rounded-xl',
          'bg-foreground/[0.04] text-foreground transition-transform group-hover:-translate-y-0.5'
        )}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {badges ? <div className="mt-auto pt-2">{badges}</div> : null}
    </article>
  );
}

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="section-pad relative"
    >
      <div className="container-prose">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="kicker kicker-line">Work management</p>
          <h2
            id="features-heading"
            className="mt-4 text-balance text-[clamp(1.875rem,3.4vw,3rem)] font-semibold leading-[1.1] tracking-[-0.025em]"
          >
            The operational layer
            <br />
            <span className="display-italic text-gen-z-gradient">
              between planning and shipping.
            </span>
          </h2>
          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Manut keeps the everyday work visible: project scopes, work item
            detail, cycles, modules, intake, pages, attachments, and the
            signals a team needs to keep moving.
          </p>
        </Reveal>

        <Reveal
          delay={120}
          className="mt-16 grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3 [&>article]:bg-card"
        >
          <Feature
            span="wide"
            icon={<ListChecks className="size-5" aria-hidden />}
            title="Projects and work items"
            description="Track the work from idea to completion with status, assignees, priorities, labels, estimates, comments, activity, and linked context."
            badges={
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Assignees
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Labels
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Priorities
                </Badge>
                <Badge className="rounded-full bg-accent text-accent-foreground font-mono text-[10px]">
                  Activity
                </Badge>
              </div>
            }
          />
          <Feature
            icon={<Flag className="size-5" aria-hidden />}
            title="Cycles and modules"
            description="Group delivery into time-bound cycles and durable modules so teams can see what is active, blocked, upcoming, and complete."
          />
          <Feature
            icon={<Archive className="size-5" aria-hidden />}
            title="Intake that stays visible"
            description="Capture incoming work before it becomes a project commitment. Review, triage, assign, and move accepted items into the right place."
          />
          <Feature
            icon={<GitBranch className="size-5" aria-hidden />}
            title="Saved views"
            description="Create focused lists and boards for each team rhythm: by owner, status, priority, label, project, cycle, module, or custom filter."
          />
          <Feature
            icon={<FileText className="size-5" aria-hidden />}
            title="Pages for working context"
            description="Keep planning notes, specs, checklists, and decisions close to the work items they explain."
          />
          <Feature
            icon={<Paperclip className="size-5" aria-hidden />}
            title="Attachments and references"
            description="Attach files and supporting material where decisions happen so project history remains reviewable."
          />
          <Feature
            span="wide"
            icon={<ShieldCheck className="size-5" aria-hidden />}
            title="Access, activity, and operator visibility"
            description="Use access-controlled workspaces, workspace activity, and monitored production endpoints to keep the app accountable without claiming unsupported enterprise controls."
            badges={
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Email access
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Magic links
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[10px]"
                >
                  Monitoring
                </Badge>
              </div>
            }
          />
          <Feature
            icon={<Sparkles className="size-5" aria-hidden />}
            title="AI-assisted workflows"
            description="Use configured AI support for summarization, drafting, triage, and next-step assistance while keeping the product copy provider-neutral."
          />
          <Feature
            icon={<ClipboardList className="size-5" aria-hidden />}
            title="Operational handoff"
            description="Turn project state into a clear handoff: what changed, what is blocked, who owns the next move, and where the evidence lives."
          />
        </Reveal>
      </div>
    </section>
  );
}
