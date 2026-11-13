import { ArrowDown, ArrowRight, Check, CircleDot, ClipboardList, FileCheck2, GitBranch, Github, History } from "lucide-react";
import { Link } from "react-router";
import { actionStyles } from "~/components/actions/ActionButton";
import { ProductIdentity } from "~/components/layout/ProductIdentity";

const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background";
const steps = [
    { title: "Start with a request", description: "Choose a request type, fill in the details, and submit when you're ready.", icon: ClipboardList },
    { title: "Review with context", description: "Assigned reviewers see the request details and record an approval or rejection.", icon: FileCheck2 },
    { title: "Follow the outcome", description: "Check your request status and revisit its decision history in one place.", icon: History },
];

export function LandingPage()
{
    return (
        <div className="min-h-svh bg-background text-foreground">
            <a href="#main-content" className={`sr-only fixed left-4 top-4 z-50 rounded-md bg-background p-3 focus:not-sr-only ${focusClass}`}>Skip to content</a>
            <header className="border-b">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
                    <Link to="/" aria-label="Workflow and Approval System home" className={`flex min-w-0 items-center gap-3 rounded-sm ${focusClass}`}>
                        <ProductIdentity />
                    </Link>
                    <nav aria-label="Main navigation" className="flex items-center gap-6">
                        <a href="#how-it-works" className={`hidden rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none sm:inline-flex ${focusClass}`}>How it works</a>
                        <Link to="/auth/login" className={actionStyles()}>Sign in<ArrowRight className="size-4" aria-hidden="true" /></Link>
                    </nav>
                </div>
            </header>
            <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 outline-none sm:px-8">
                <section aria-labelledby="landing-title" className="grid items-center gap-10 pb-14 pt-12 sm:pb-20 sm:pt-16 lg:grid-cols-2 lg:gap-16 lg:pb-24 lg:pt-20">
                    <div>
                        <p className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground"><GitBranch className="size-4" aria-hidden="true" />Your team's approval workspace</p>
                        <h1 id="landing-title" className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl">Keep every request moving.</h1>
                        <p className="mt-6 max-w-md text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">Submit requests, review the details, and follow each decision. A shared workspace for work that needs approval.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link to="/auth/login" className={actionStyles({ variant: "primary" })}>Sign in to workspace<ArrowRight className="size-4" aria-hidden="true" /></Link>
                            <a href="#how-it-works" className={actionStyles({ variant: "ghost" })}>See how it works<ArrowDown className="size-4" aria-hidden="true" /></a>
                        </div>
                        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Use your work email and password to sign in.</p>
                    </div>
                    <figure aria-labelledby="example-caption" className="min-w-0 rounded-xl border bg-muted/30 p-3 sm:p-5">
                        <figcaption id="example-caption" className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">A request, from start to finish</span><span>Illustrative example</span></figcaption>
                        <div className="rounded-lg border bg-card text-card-foreground">
                            <div className="border-b p-5 sm:p-6">
                                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-xs text-muted-foreground">Example request</span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"><CircleDot className="size-3.5" aria-hidden="true" />Pending approval</span>
                                </div>
                                <p className="text-xl font-semibold tracking-tight">Equipment purchase</p>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The details and decision history, together.</p>
                            </div>
                            <ol aria-label="Example request progress" className="space-y-0 p-5 sm:p-6">
                                <li className="flex gap-4">
                                    <div className="flex flex-col items-center"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" aria-hidden="true" /></span><span className="my-1 min-h-7 w-px flex-1 bg-border" /></div>
                                    <div className="pb-6"><p className="text-sm font-medium">Request submitted</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Details ready for review</p></div>
                                </li>
                                <li className="flex gap-4">
                                    <div className="flex flex-col items-center"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"><CircleDot className="size-4" aria-hidden="true" /></span><span className="my-1 min-h-7 w-px flex-1 bg-border" /></div>
                                    <div className="pb-6"><p className="text-sm font-medium">Reviewer assigned</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Awaiting a decision</p></div>
                                </li>
                                <li className="flex gap-4">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground"><FileCheck2 className="size-4" aria-hidden="true" /></span>
                                    <div><p className="text-sm font-medium text-muted-foreground">Outcome recorded</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Available after review</p></div>
                                </li>
                            </ol>
                        </div>
                        <p className="mt-4 flex items-center gap-2 px-1 text-xs leading-relaxed text-muted-foreground"><History className="size-4 shrink-0" aria-hidden="true" />A clear record at every step.</p>
                    </figure>
                </section>
                <section id="how-it-works" aria-labelledby="workflow-title" tabIndex={-1} className="grid scroll-mt-8 gap-8 border-t py-12 outline-none sm:py-16 lg:grid-cols-5 lg:gap-16">
                    <div className="lg:col-span-2"><h2 id="workflow-title" className="text-3xl font-semibold leading-tight tracking-tight">Less chasing.<br />More clarity.</h2><p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">From the first detail to the final decision, everyone has a clear next step.</p></div>
                    <ol className="divide-y lg:col-span-3">
                        {steps.map(({ title, description, icon: Icon }, index) => (
                            <li key={title} className="flex gap-4 py-6 first:pt-0 last:pb-0">
                                <span className="pt-1 text-xs tabular-nums text-muted-foreground">0{index + 1}</span>
                                <div className="flex-1"><h3 className="text-base font-medium">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
                                <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            </li>
                        ))}
                    </ol>
                </section>
            </main>
            <footer className="border-t">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:px-8">
                    <p>Workflow and Approval System</p>
                    <a href="https://github.com/oangsa/approval-system" className={`inline-flex min-h-11 items-center gap-2 rounded-sm transition-colors hover:text-foreground motion-reduce:transition-none ${focusClass}`}><Github className="size-4" aria-hidden="true" />Source on GitHub</a>
                </div>
            </footer>
        </div>
    );
}
