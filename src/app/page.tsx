import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Brain,
  Github,
  BookOpen,
  Network,
  Users,
  Compass,
  ShieldCheck,
  Zap,
} from "lucide-react";
import styles from "./landing.module.css";
import {
  SmoothHashScroller,
  SmoothScrollLink,
} from "@/components/smooth-scroll-link";
import { siteConfig } from "@/lib/seo";

const features = [
  {
    icon: Zap,
    title: "Capture now. Organize later.",
    text: "Catch a thought without choosing a type or a folder. Keep it in Inbox or your Journal; text can queue offline after a prior signed-in visit.",
  },
  {
    icon: BookOpen,
    title: "A Daily Journal with context",
    text: "Write timestamped moments, reference real Items and see completed work alongside separate upcoming plans. Check-ins and guided Reviews have their own place.",
  },
  {
    icon: Network,
    title: "Connected knowledge",
    text: "Tasks, Notes, Habits, Events, Goals, People and Bookmarks share one record across views. Optional Projects, Areas and Tags add context without forcing a filing system.",
  },
  {
    icon: Users,
    title: "People, Places and you",
    text: "Keep a dedicated Me profile, distinguish mentions from real interactions, and connect follow-up Tasks and reference Notes. Save a Place and open external navigation.",
  },
  {
    icon: Compass,
    title: "Coach, with your approval",
    text: "Ask about your saved information and follow the sources. Review proposed changes before approving them. External provider use is disclosed before chat.",
  },
  {
    icon: ShieldCheck,
    title: "Private accounts. Portable records.",
    text: "Keep your information in your own account. Export records, relationships and histories; restore them to the same account. Optional examples are yours to add or remove.",
  },
];
const software = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  description: siteConfig.description,
  codeRepository: siteConfig.repositoryUrl,
  license: `${siteConfig.repositoryUrl}/blob/main/LICENSE`,
  featureList: [
    "Quick Capture and offline text outbox",
    "Daily Journal",
    "Connected Items, Projects, Areas and Tags",
    "People and Place Bookmarks",
    "Approval-gated conversational Coach",
    "Focus Timer",
    "Same-account V1 export and restore",
  ],
  screenshot: siteConfig.screenshotUrls,
};
export default function LandingPage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }}
      />
      <SmoothHashScroller />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-black focus:p-4"
      >
        Skip to content
      </a>
      <nav
        data-public-nav
        aria-label="Public navigation"
        className={styles.nav}
      >
        <div
          className={`${styles.wrap} flex min-h-20 flex-wrap items-center justify-between gap-3 py-4`}
        >
          <Link href="/" className={styles.logo}>
            <Brain aria-hidden="true" />
            bearing.now
          </Link>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {[
              ["features", "Features"],
              ["connections", "Connections"],
              ["philosophy", "Philosophy"],
            ].map(([id, name]) => (
              <SmoothScrollLink
                key={id}
                href={`#${id}`}
                className="inline-flex min-h-11 items-center"
              >
                {name}
              </SmoothScrollLink>
            ))}
            <a
              href={siteConfig.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              GitHub
            </a>
            <Link href="/app" className={styles.primary}>
              Open app <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </nav>
      <main id="main" tabIndex={-1}>
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <p className={styles.eyebrow}>A little space for a full life</p>
              <h1>
                Capture your life.
                <br />
                <em>Find the connections.</em>
              </h1>
              <p className={styles.intro}>
                The thought on your walk. The book a friend mentioned. The thing
                you meant to do. Give them a place to land—and a way back to
                each other.
              </p>
              <div className={styles.actions}>
                <Link href="/app" className={styles.primary}>
                  Open app <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <SmoothScrollLink href="#features" className={styles.secondary}>
                  Take a look around
                </SmoothScrollLink>
              </div>
              <p className={styles.fine}>
                Sign-in required · Invitation-only accounts.
                <br />
                Optional examples help you find your feet after sign-in.
              </p>
            </div>
            <figure className={styles.product}>
              <div className={styles.window}>
                <div className={styles.windowBar} aria-hidden="true">
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className="ml-auto">
                    Your day, with a little more context
                  </span>
                </div>
                <Image
                  src="/screenshots/v1-journal.png"
                  width={1440}
                  height={1000}
                  alt="The actual V1 Daily Journal with timestamped sample moments and referenced Items"
                  priority
                />
              </div>
              <figcaption className={styles.caption}>
                A real Daily Journal, with fictional sample data. Thoughts,
                plans and completed work each have their place.
              </figcaption>
            </figure>
          </div>
          <div className={`${styles.wrap} ${styles.ribbon}`}>
            <span>
              <Github size={16} aria-hidden="true" />
              Open source
            </span>
            <span>
              <ShieldCheck size={16} aria-hidden="true" />
              Private accounts
            </span>
            <span>
              <Compass size={16} aria-hidden="true" />
              Self-hostable
            </span>
            <span>
              <BookOpen size={16} aria-hidden="true" />
              Your records, exportable
            </span>
          </div>
        </section>
        <section id="features" className={styles.light}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>Less filing. More living.</p>
            <h2 className={styles.heading}>
              From a quick thought
              <br />
              to useful context.
            </h2>
            <p className={styles.lead}>
              Start with a sentence. Add structure when it helps. Bearing brings
              the pieces of your day together without making every thought a
              project.
            </p>
            <div className={styles.features}>
              {features.map((f) => (
                <article key={f.title} className={styles.feature}>
                  <f.icon aria-hidden="true" />
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="connections" className={`${styles.wrap} ${styles.story}`}>
          <p className={styles.eyebrow}>Small moments. A connected life.</p>
          <h2 className={styles.heading}>
            One record,
            <br />
            several perspectives.
          </h2>
          <div className={styles.steps}>
            {[
              [
                "01",
                "Catch the thought.",
                "“Ask Alex about that book.” Save it in the Journal, just as it came to you. You can organize it later in Inbox.",
              ],
              [
                "02",
                "Give it context.",
                "Turn it into a Task. Connect Alex’s Person profile and the book Bookmark. A mention stays a mention until you record an actual interaction.",
              ],
              [
                "03",
                "Pick up the thread.",
                "Find it in Search, revisit it from a Project or explore its links in Graph. Ask Coach about saved information, then inspect the supporting sources.",
              ],
            ].map(([number, title, body]) => (
              <article key={number} className={styles.step}>
                <span className={styles.number}>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className={styles.connectionNote}>
            <Network aria-hidden="true" />
            <p>
              A Task in Today, Journal and Calendar is still{" "}
              <strong className="text-white">one Task</strong>. Complete it
              once. See the change wherever you meet it.
            </p>
          </div>
        </section>
        <section id="philosophy" className={styles.philosophy}>
          <div className={`${styles.wrap} ${styles.philosophyGrid}`}>
            <h2 className={styles.heading}>
              A memory aid.
              <br />A little breathing room.
            </h2>
            <div>
              <p>
                Bearing helps you capture, organize, connect and recall. Keep
                specialized work in the tools you already love; bring the useful
                references here.
              </p>
              <p className="mt-4">
                Your records stay the authority. Coach proposes changes for your
                approval. Offline text capture works after a prior signed-in
                visit; AI needs connectivity and a configured external provider.
              </p>
              <Link href="/help">
                Read the help and privacy notes{" "}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
        <section className={`${styles.wrap} ${styles.closing}`}>
          <p className={styles.eyebrow}>Make a little room</p>
          <h2 className={styles.heading}>
            Start with what’s
            <br />
            on your mind.
          </h2>
          <p>
            Sign in to your workspace, or self-host and invite your own
            accounts.
          </p>
          <div className={`${styles.actions} justify-center`}>
            <Link href="/app" className={styles.primary}>
              Open bearing.now{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href={siteConfig.repositoryUrl} className={styles.secondary}>
              View source
            </a>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div
          className={`${styles.wrap} flex flex-wrap items-center gap-6 py-8`}
        >
          <span className="mr-auto font-semibold">bearing.now</span>
          <Link href="/help" className="inline-flex min-h-11 items-center">
            Help
          </Link>
          <a
            href={siteConfig.repositoryUrl}
            className="inline-flex min-h-11 items-center"
          >
            GitHub
          </a>
          <Link href="/app" className="inline-flex min-h-11 items-center">
            Open app
          </Link>
        </div>
      </footer>
    </div>
  );
}
