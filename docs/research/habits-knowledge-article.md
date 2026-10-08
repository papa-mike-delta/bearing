# Habits knowledge article (Phase 2)

## Question

What do Wood & Neal (2007), Gollwitzer (1999) and Lally et al. (2010) actually support and not support, and what should the Coach's one Phase 2 knowledge article, `packages/coach/knowledge/habits.md`, say?

- Asked by: Paul, 2026-10-07.
- Researched by: Bearing Research. Repo state read at `main` `8ac802c`.
- Criteria the requester named:
  - research the three papers from the papers themselves;
  - state what each supports and does not support, covering the 21-day myth, the 18–254 day range, the ~66-day median and the missed-day effect;
  - searchable headings, each section ending with its citation (spec §8.4);
  - a ready-to-use draft article body.
- This note does not edit `habits.md`. Build copies the draft below.

## Constraints from the glossary and ADRs

Constraints are taken from the spec, issue #1 and the code.

| # | Constraint | Source |
| --- | --- | --- |
| C1 | The knowledge base is static markdown in `packages/coach/knowledge`, shipped with the app. `searchKnowledge` returns a section, not the whole corpus. The system prompt carries titles only. No embeddings in v1: "search by heading". | `docs/research/spec.md` §8.4 |
| C2 | Write it from primary sources, and say what those sources do not support. Each article ends with the citation. The Coach quotes the article, not a vibes summary. | spec §8.4 |
| C3 | Habits starter bullet: "Cues beat motivation (Wood and Neal). Implementation intentions: if-then plans (Gollwitzer). A new habit is not 21 days; Lally et al. 2010 found a median around 66 days, with a wide range. Missing a day does not reset the behavior. Streaks are a display, not a moral score. Bad-habit tracking counts occurrences; it does not shame." | spec §8.4 |
| C4 | Coaching boundary: reflect, ask one question, propose a next Task or habit. No diagnosis, no clinical advice. | spec §8.4 |
| C5 | Habit-design skill: "turn 'I want to run' into a cue, a tiny version, a recurrence". Habits ship in Phase 5, with streaks computed by `habitProgress`. Bad habits have no streak and no incomplete count. | spec §8.3, §11.2, §11.6, §6 |
| C6 | Phase 2 ships one knowledge article. | spec §11.6.2 |
| C7 | Current file is a 3-line placeholder headed "Habit cues", repeating "Cues beat motivation" and "median about 66 days, not 21". | `packages/coach/knowledge/habits.md` at `8ac802c` |
| C8 | Vocabulary: Area, Task, Coach. "Habit" is a Phase 5 entity. In Phase 2 the Coach can only propose a Task (C4, spec §11.6). | spec §3, §11.6 |

## Candidates

- **A. Ship the spec bullet as written** (C3), lightly expanded.
- **B. Rewrite each claim to what the papers measured, with explicit "does not support" lines.** Keep the spec's product rules (streaks, bad-habit counting), labelled as product rules rather than findings.
- **C. Widen the source set** to cover claims these three papers don't (e.g. a source for "tiny version", a modern meta-analysis of implementation intentions). This is out of scope for this note and is flagged as follow-up research.

## Primary-source comparison

Each row is a claim the article might make. Page numbers refer to the published pagination.

| Claim (spec §8.4 wording) | Wood & Neal 2007 [1] | Gollwitzer 1999 [2] | Lally et al. 2010 [3] | Verdict for the article |
| --- | --- | --- | --- | --- |
| "Cues beat motivation" | **Partly.** Once a habit is formed, "perception of contexts triggers the associated response without a mediating goal" (abstract, p. 843). Students with strong habits kept them across a university transfer when the context stayed the same, "regardless of students' behavioral goals" (p. 856). But goals "direct habits by motivating repetition that leads to habit formation" (p. 843). [1] | Plans work only when the goal intention is strong: no benefit for women with weak BSE intentions (p. 499). [2] | Participants chose behaviours they wanted, and "approximately half did not perform the behaviour consistently enough" (p. 1007). [3] | Reword: motivation starts and drives the repetition; for a formed habit, the cue does the work. Don't say motivation doesn't matter. |
| "Implementation intentions: if-then plans" | Implementation intentions link a response to a context cue (p. 851). They didn't stop strong habits in Betsch et al. (about 50% errors) (p. 855). [1] | **Yes.** Form: "When situation x arises, I will perform response y!" (p. 494). Christmas report written on time by 3/4 with a plan vs 1/3 without. Hard projects 2/3 vs 1/4. Easy projects ~80% either way (p. 495). Exercise 29%, then 39% with motivation only, then 91% with a plan (p. 496). [2] | Participants chose a cue such as "after breakfast", but plans weren't manipulated (pp. 998, 1000). [3] | Supported for starting a behaviour. Not shown to override a strong existing habit. "Instant habits" (p. 499) is Gollwitzer's interpretation, which Wood & Neal dispute. |
| "Not 21 days" | Not addressed: no time-to-habit figure. [1] | Not addressed. Studies ran 2–3 weeks but measured goal completion, not habit (p. 496). [2] | Never mentions 21 days. "21" in the paper is a score threshold on the SRHI subscale, not a day count (p. 1001). The paper does report times far longer than 21 days. [3] | Say "the research doesn't support a fixed 21 days". Don't attribute a debunking to Lally by name; the paper only cites Ronis et al.'s "10 times" (p. 1007). |
| "Median around 66 days" | n/a [1] | n/a [2] | **Yes, with caveats.** Modelled median time to 95% of the automaticity plateau = 66 days (IQR 39–102). Based on the 39 participants whose curve fit well, out of 82 with adequate data and 96 enrolled. Self-reported automaticity. Mostly postgraduate students. Simple eating, drinking and exercise behaviours (pp. 1001–1004). [3] | Use "about two months for half of the people whose data fit well". Don't say "66 days to form a habit". |
| "Wide range" (18–254 days) | n/a [1] | n/a [2] | **Yes.** Range 18–254 days (p. 1002). Recording lasted only 84 days, so values beyond 84 are curve extrapolations. Exercise took about 1.5× longer than eating and drinking, but that difference wasn't significant (p. 1007). [3] | Present the range as "weeks to most of a year, modelled". |
| "Missing a day does not reset" | n/a [1] | n/a [2] | **Single misses only.** 140 single missed opportunities in 55 participants. Automaticity dipped 0.29 points the next day. The 2-day gain was 0.55 with a miss vs 0.79 without: "did not materially affect" (pp. 1006–1007). Missing a week (Armitage 2005) "reduces the likelihood of future performance" (p. 1007). Few data on early vs late misses. [3] | Supported for one missed day. Not for long lapses. |
| "Streaks are a display, not a moral score" | Not addressed. [1] | Not addressed. [2] | Indirect: one miss doesn't undo progress, so resetting a streak to zero overstates a single miss (p. 1007). [3] | This is a product rule. Label it as one, and cite Lally only for the missed-day finding. |
| "Bad-habit tracking counts occurrences; it does not shame" | On breaking habits: avoid or alter the cue (upstream), or inhibit the response once cued (downstream, effortful). Context changes (moving, a new job) free behaviour to follow goals (pp. 855–856, 859). Nothing on counting or shame. [1] | If-then plans can be aimed at unwanted responses (p. 500). Nothing on counting. [2] | n/a [3] | The counting and no-shame part is a product rule. Wood & Neal support "change or avoid the cue" as advice for unwanted habits. |
| "A tiny version" (habit-design skill, §8.3) | Not addressed. [1] | Not addressed. [2] | Only the weak, non-significant hint that more complex behaviour (exercise) took longer (p. 1007). [3] | Not supported by these three. Needs another source (candidate C). |
| Self-control as a "finite, depletable resource" | W&N lean on ego depletion for downstream inhibition (p. 854). [1] | n/a [2] | n/a [3] | The basis is weak: a 23-lab registered replication found d = 0.04, 95% CI [−0.07, 0.15] [4]. Don't put "willpower runs out" in the article. |

How the papers were read: full text from author or repository PDFs [1][2][3], converted with `pdftotext` on the box. Every page number above was checked by extracting single PDF pages and searching for the quoted phrase. Metadata (volume, issue, pages) comes from Crossref [5]. Lally's online version is dated 2009, and its print issue is 2010, vol. 40(6), pp. 998–1009. The spec's "2010" is correct.

## Recommendation

**Use B: rewrite each claim to what was measured, with an explicit "What this does not mean" line in each section.** Label the streak and bad-habit lines as Bearing product rules backed only where noted.

Why:

- Spec §8.4 demands "say what those sources do not support" (C2).
- Three spec phrases overstate the papers:
  - "Cues beat motivation" (Wood & Neal give goals the formation role);
  - "Missing a day does not reset" (true only for single misses);
  - "median around 66 days" (a modelled figure from 39 people, by self-report).
- One H2 per claim, with the words a user would type ("21 days", "missed a day", "streak", "if-then"), fits heading search (C1).

Risks:

- **Old evidence.** All three papers are 2007–2010, Gollwitzer's numbers are from small 1990s studies, and Lally's sample is small and student-heavy. The article says so, so the Coach doesn't oversell.
- **The habit-design skill's "tiny version"** has no support here. Phase 5 needs its own research note before the skill ships.
- **Phase 2 has no Habit entity** (C8). The article must have the Coach propose a Task ("set up a cue"), not "track a habit", until Phase 5.

### Decisions for Spec

1. **Reword §8.4's habits bullet** to match the article (e.g. "Repetition in a stable context builds habits; once formed, the cue does the work (Wood and Neal)"). Keep "Missing a day…" but scope it to a single day.
2. **Whether to commission a source for "tiny version"** (§8.3) before Phase 5, or drop it from the skill description.
3. **The heading format `searchKnowledge` keys on.** This draft uses one H1 per article and H2 sections, each ending in a `Source:` line. The search tool should return one H2 section plus the article's H1.

## What Build should wrap

- No packages. Copy the draft below into `packages/coach/knowledge/habits.md`, replacing the placeholder (C7).
- `searchKnowledge` itself is Phase 2's knowledge reader. If Spec adds it as a tool, it should split on `^## ` and match on heading words. That is plain string handling in `packages/coach`, which spec §8.4 says needs no embeddings.
- Keep each section short enough to quote whole (C2: the Coach quotes the article).

## What Build must not reinvent

- **No new facts:** don't add numbers or claims beyond the article. Each one is tied to a page above.
- **No embeddings or vector search** in v1 (spec §8.4, §11.7).
- **Don't paraphrase sources** into the system prompt. The prompt carries titles only (C1).

## Draft article body for `packages/coach/knowledge/habits.md`

Copy everything between the fences.

````markdown
# Habits

How habits form and break, from three studies. Each section says what the research found and what it does not mean.

## Cues and repetition: how a habit forms

A habit is an action that has been repeated often enough in the same setting that the setting starts it, with little thought. The setting can be a place, a time, or the thing you just did ("after breakfast"). Goals and motivation matter at the start: they are why you repeat the action at all. Once the habit is strong, the cue does most of the work. In one study, students with strong habits kept them after changing universities when the setting stayed the same, whatever their goals.

What this does not mean: that motivation is irrelevant, or that willpower can replace a cue. Early on, wanting the outcome is what drives the repetition.

Source: Wood, W., & Neal, D. T. (2007). A new look at habits and the habit–goal interface. Psychological Review, 114(4), 843–863. https://doi.org/10.1037/0033-295X.114.4.843

## If-then plans (implementation intentions) for getting started

Decide in advance when and where you will act: "When situation X happens, I will do Y." In the studies, people who wrote down when and where were much more likely to follow through on hard goals. About three in four wrote a required report on time with a plan, against one in three without. In one exercise study, a plan raised the share who exercised from 39% to 91%. Plans helped little when the task was already easy, and did not help people who did not really intend to act.

What this does not mean: that one plan makes an instant habit, or that a plan beats a strong old habit. In one study reviewed by Wood and Neal, people with if-then plans still slipped into a practised old route about half the time.

Source: Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. American Psychologist, 54(7), 493–503. https://doi.org/10.1037/0003-066X.54.7.493. The old-habit point: Wood, W., & Neal, D. T. (2007). Psychological Review, 114(4), 843–863. https://doi.org/10.1037/0033-295X.114.4.843

## How long does a habit take? Not 21 days

There is no fixed number. In a 12-week study, 96 people picked one daily eating, drinking or exercise behaviour tied to a cue and rated how automatic it felt each day. For the 39 people whose data fit the model well, reaching about 95% of their own plateau took a median of 66 days: about two months. The range ran from 18 to 254 days. Exercise tended to take longer than drinking water.

What this does not mean: that a habit takes 66 days, or that it is "done" on a set date. The 66 is a midpoint for some of the people in one small study, mostly students. The figures past 84 days are projections from a curve, and "automatic" was self-rated. The study does not support 21 days either; it never tested that number.

Source: Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674

## Missed a day? It does not reset the habit

Missing one day barely moved how automatic the behaviour felt (a dip of less than half a point on a 42-point scale), and progress carried on when people resumed the next day.

What this does not mean: that lapses do not matter. An earlier study found that missing a whole week made people less likely to keep going. Get back to it on the next chance, not next Monday.

Source: Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674

## Streaks are a display, not a score

In Bearing a streak is a count shown on screen, not a judgement. This is a product rule, not a research finding. The research behind it is the missed-day result above: a single miss does not undo progress, so a broken streak is not lost work.

What this does not mean: that streaks motivate everyone or harm anyone. None of these studies tested streak displays.

Source: Bearing product rule (spec §8.4). Evidence for the missed-day part: Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). European Journal of Social Psychology, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674

## Breaking an unwanted habit: change the cue

Because the setting starts the habit, the most reliable lever is the cue. Avoid it, remove it, or change it. Turning off email notifications is an example. Big life changes such as moving or a new job are a chance, because the old cues are gone. Stopping the action after the cue has fired is possible but takes effort. An if-then plan aimed at the moment of temptation ("When I feel the urge, I will…") can help, most likely with weaker habits.

What this does not mean: that failing to resist is a character flaw. Bearing counts occurrences of a bad habit to show a pattern, not to shame. That counting rule is a product choice, not a finding.

Source: Wood, W., & Neal, D. T. (2007). A new look at habits and the habit–goal interface. Psychological Review, 114(4), 843–863. https://doi.org/10.1037/0033-295X.114.4.843. The if-then part: Gollwitzer, P. M. (1999). American Psychologist, 54(7), 493–503. https://doi.org/10.1037/0003-066X.54.7.493

## What these studies do not cover

These three papers do not show that a "tiny version" of a behaviour builds a habit faster. They do not show that rewards or streaks are needed, or that willpower "runs out". (A large replication found almost no evidence for the ego-depletion effect behind that idea.) They are also not clinical advice. When something here is not enough, the Coach says so rather than guessing.

Source: Wood & Neal (2007), Gollwitzer (1999) and Lally et al. (2010), above. Hagger, M. S., et al. (2016). A multilab preregistered replication of the ego-depletion effect. Perspectives on Psychological Science, 11(4), 546–573. https://doi.org/10.1177/1745691616652873
````

## Spec claims found wrong or overstated

- §8.4 "Cues beat motivation (Wood and Neal)". Wood & Neal give goals the formation role ("motivating repetition that leads to habit formation") and cues the role in performing a formed habit [1].
- §8.4 "Missing a day does not reset the behavior". This holds for a single missed day only. A week's lapse does hurt [3].
- §8.4 "median around 66 days". The figure is a modelled time to 95% of the plateau, among 39 well-fitting participants, by self-report [3]. Fine as shorthand only if the article carries the caveat.
- §8.4 "A new habit is not 21 days; Lally et al. 2010…" reads as if Lally refuted 21 days. The paper never mentions it [3].
- §8.3 "a tiny version". There is no support in these sources.
- Placeholder `habits.md` "A habit is a response tied to a stable context, not a streak". This is consistent with Wood & Neal [1]. The "not a streak" half is a product rule.

## Could not verify

- Gollwitzer & Sheeran (2006), the implementation-intentions meta-analysis. Its abstract and full text weren't reachable, so no effect size is quoted. The article uses only the 1999 figures.
- Primary studies inside the reviews were not read: Orbell et al. 1997, Milne et al. 1999, Betsch et al. 2004, Wood et al. 2005, Armitage 2005. Figures are as reported by Gollwitzer [2], Wood & Neal [1] and Lally [3].

## Sources

All checked 2026-10-07.

1. Wood, W., & Neal, D. T. (2007). A new look at habits and the habit–goal interface. *Psychological Review*, 114(4), 843–863. https://doi.org/10.1037/0033-295X.114.4.843. Author PDF: https://dornsife.usc.edu/wendy-wood/wp-content/uploads/sites/183/2023/10/wood.neal_.2007psychrev_a_new_look_at_habits_and_the_interface_between_habits_and_goals.pdf
2. Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist*, 54(7), 493–503. https://doi.org/10.1037/0003-066X.54.7.493. Repository PDF (KOPS, Universität Konstanz): https://kops.uni-konstanz.de/bitstreams/14cc2a36-5f01-4dc1-b9ca-f2d0ca0c8930/download
3. Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674. Full-text copy used: https://www.flexyourbrain.com/wp-content/uploads/2015/10/UL-STUDY-66-Days-IJSP_998-1009.pdf
4. Hagger, M. S., et al. (2016). A multilab preregistered replication of the ego-depletion effect. *Perspectives on Psychological Science*, 11(4), 546–573. https://doi.org/10.1177/1745691616652873. Abstract via Crossref.
5. Crossref REST API, metadata for the DOIs above. https://api.crossref.org/works/10.1002/ejsp.674 (and the same path for each DOI)
