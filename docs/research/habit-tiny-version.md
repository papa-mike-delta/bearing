# Habit design: the "tiny version" (small starting version)

## Question

What do high-trust primary sources say about starting a habit with a very small version ("tiny habits", "two-minute" style), and how should the Coach's habit-design skill guide Paul?

- Asked by: Paul, 2026-10-21, for issue #118 (Paul helps design a habit), part of Habits epic #25.
- Researched by: Bearing Research. Repo state read at `review` `ffb9db7` (2026-10-21 13:34 ET).
- Spec read: `docs/research/spec.md` on `review` with commit `63de6a5` ignored. That commit does not touch §8.3 or §8.4.
- Criteria named by the requester:
  - primary sources only;
  - grade the evidence honestly, and say plainly if direct evidence for "start tiny" is weak and what it rests on instead;
  - ready-to-paste quotable sections for `packages/coach/knowledge/habits.md`, with citations;
  - guidance for the habit-design skill.
- This note does not edit `habits.md`, the skill file or any code. Build copies the drafts below.

## Constraints from the glossary, spec and issue

There is no `CONTEXT.md` and no `docs/adr/`. `GLOSSARY.md` at the repo root is the glossary. Its words used here are: Habit, Many-times habit, Habit goal, Weekly habit, Bad habit, Due habit, Coach.

| # | Constraint | Source |
|---|---|---|
| C1 | Habit design turns "I want to run" into "a cue, a tiny version, a recurrence. Writes a habit only if asked." | spec §8.3 |
| C2 | Knowledge is written "from primary sources, and say what those sources do not support". `searchKnowledge` returns one section matched on heading words. The Coach quotes and does not paraphrase. | spec §8.4; `packages/coach/src/knowledge-search.ts` |
| C3 | "Every research claim in the reply comes from a `searchKnowledge` section with its source. There is no uncited 'tiny version' claim." "The 'small starting version' advice must come from the research note above." | issue #118 |
| C4 | The current article says the three papers "do not show that a 'tiny version' of a behaviour builds a habit faster". | `packages/coach/knowledge/habits.md`, "What these studies do not cover" |
| C5 | The earlier note flagged the gap: "The habit-design skill's 'tiny version' has no support here." | `docs/research/habits-knowledge-article.md` |
| C6 | Coaching boundary: reflect, ask one question, propose a next Task or habit. No clinical advice. | spec §8.4 |
| C7 | The skill's allowed tools are `listHabits`, `searchKnowledge` and `createHabit`. It proposes first and creates only after an explicit yes. | issue #118 |

## Candidates (sources)

1. **Tiny Habits RCT (gratitude), 2022.** This is the only peer-reviewed randomized trial I found that reports results for the Tiny Habits Method. 154 adults were randomized to Tiny Habits for Gratitude, Tiny Habits Control, or Inactive Control, with a 5-day email program and a certified coach [1].
2. **Minute Calisthenics, 2020.** A Tiny Habits resistance-training RCT. Only the protocol and registry record are published; I found no results paper [2][3].
3. **Lally et al. 2010.** The habit-formation curve study. Simpler behaviours plateaued sooner, but the difference was not significant [4].
4. **Gardner, Lally & Wardle 2012.** An expert recommendation paper in BJGP. It recommends "small and manageable" changes and gives the patient handout [5].
5. **Lally, Chipperfield & Wardle 2008** and **Beeken et al. 2017.** Habit-formation advice with "small changes" (Ten Top Tips), tested in RCTs on weight [6][7].
6. **Gollwitzer & Sheeran 2006.** Meta-analysis of if-then plans (implementation intentions) [8].
7. **Bandura & Schunk 1981.** Proximal (near, attainable) sub-goals versus distal goals [9].
8. **Locke & Latham 2002.** Goal-setting review: difficult, specific goals raise performance. This is the counterweight [10].
9. **BJ Fogg.**
   - The Behavior Model paper (2009) holds that behaviour needs motivation, ability and a prompt together, and treats ability as simplicity [11].
   - *Tiny Habits* (2019) is the method book [12]. It is the original author's own work, not peer reviewed, and is cited here only as the definition of the method.
10. **James Clear, *Atomic Habits* (2018), "two-minute rule".** A secondary popularizer. It is not used as evidence and is listed only so nobody cites it by mistake [13].

## Primary-source comparison

| Criterion | Tiny Habits RCT [1] | Lally 2010 [4] | Gardner 2012 [5] | 10TT RCTs [6][7] | If-then meta-analysis [8] | Proximal goals [9] | Goal difficulty [10] | Fogg [11][12] |
|---|---|---|---|---|---|---|---|---|
| Tests "start small" directly? | Partly. The whole package was tested (tiny recipe, anchor, celebration, coach); "tiny" was not isolated. | No. Observational, and behaviours were self-chosen. | No. Recommendation and argument. | No. "Small changes" plus repetition, as a package. | No. Tests if-then plans. | No. Tests near versus far goals. | No. | No. Theory and method. |
| Outcome | Self-reported gratitude (GQ-6). Post-test d = 0.85 vs inactive control. At 1 month only the gratitude arm differed (d = 0.78). | Self-rated automaticity (SRHI). | n/a | Weight. 2008: 2 kg vs 0.4 kg at 8 weeks vs waiting list [5]. 2017: −0.87 kg vs usual care at 3 months; similar loss by 24 months [7]. | Goal attainment, d = .65 across 94 tests [8]. | Arithmetic skill, self-efficacy, interest [9]. | Task performance [10]. | n/a |
| Sample and setting | 154 adults, 5-day email program, 2021 [1]. | 96 volunteers, mostly students, 12 weeks [4]. | n/a | 2017: 537 adults with obesity in primary care [7]. | Lab and field studies, many domains [8]. | Children aged 7–10 with low arithmetic skill [9]. | Many lab and field studies [10]. | n/a |
| Main weakness | No active control that isolates the small size; dropout 26–44%; one behaviour domain. | Complexity effect not significant; small sample. | Expert opinion; cites [4] for "simpler actions become habitual more quickly". | Small size confounded with habit advice; the 24-month effect was not sustained. | Not habit formation as such. | Children, maths, not habits. | Performance, not habit formation. | No controlled test of the model. |
| Supports a "tiny version"? | Weak, indirect | Weak hint | Expert advice | Indirect | No (it supports the cue) | Indirect (analogy) | Pulls the other way for performance | Author's claim |

Notes:
- **Direct evidence for "start tiny" is weak.** One small RCT tested the Tiny Habits package against doing nothing and found gains in self-reported gratitude [1]. No trial I found compares a tiny version with a full-size version of the same habit. No trial measures whether the tiny version grows into the full behaviour.
- **What it rests on instead:**
  - the plausible claim that easier behaviours are done more reliably (Fogg's ability axis [11]);
  - Lally's non-significant hint that simpler behaviours become automatic sooner [4];
  - expert advice that small, manageable changes avoid discouraging failure [5];
  - proximal-goal evidence in children's learning [9].
- **The strongest evidence in this space is the cue, not the size.** If-then plans have a medium-to-large average effect over 94 tests [8]. The skill should lead with the cue.
- **Counterweight.** For performance, specific and difficult goals beat easy ones, unless the goal exceeds ability or commitment lapses [10]. Gardner et al. frame small changes as a first step, "at least for their first habit goal" [5]. The skill should present the starting version as a floor, not a ceiling.

## Evidence-strength verdict

| Claim | Grade |
|---|---|
| An if-then cue ("After X, I will Y") helps people act | **Moderate–strong.** Meta-analysis, d = .65 [8]. |
| A tiny version makes a habit form faster or stick better | **Weak.** One package RCT with a self-report outcome [1]; a non-significant observational hint [4]; expert opinion [5]. |
| A small first step is a reasonable, low-risk way to start | **Expert consensus with indirect support** [5][9][11]. Fair to offer as advice, labelled as such. |
| Two minutes is the right size | **No evidence.** Popular-book rule only [13]. |

## Recommendation

Keep the starting version in the habit-design skill, but make it an option that Paul offers and labels honestly, not a research-backed rule.

- **Paul leads with the cue.** The cue is an if-then plan anchored to something the person already does. It has the strongest evidence [8].
- **Paul offers a starting version.** Its job is to make the action easy to do every time the cue comes. Paul quotes the new "Start small" section, which says this is expert advice with weak direct evidence, not a proven speed-up.
- **The person chooses the size.** Paul never claims a number of minutes.
- **Known risks:**
  - The person may treat the tiny version as the goal. The section says it is a floor; doing more is fine [5][12].
  - Search may miss the section if the person says "start small" and the heading lacks those words. The headings below include "small", "tiny" and "two minutes".
  - If later evidence appears, this section needs revisiting. No results have been published yet for the Tiny Habits exercise trial [2][3].

## What Build should wrap

This is a content decision, so there are no libraries. Build uses the existing pieces:
- **Knowledge:** paste the sections below into `packages/coach/knowledge/habits.md`, following the existing H2 + "What this does not mean" + "Source:" pattern. The current Wood & Neal / Gollwitzer / Lally sections and their tests stay.
  - Replace the first sentence of "What these studies do not cover" as shown below. Leave the rest of that section.
  - Optional: add the meta-analysis line to the if-then section (draft C).
  - Rebuild the generated article (`packages/coach/src/knowledge-articles.generated.ts` via `scripts/generate-knowledge.ts`) and extend `knowledge-search.test.ts`. "start small", "tiny habit" and "two minutes" should each return the new section; "if-then" should still return the existing one.
- **Skill:** `packages/coach/skills/habit-design.md` (issue #118) has these steps.
  1. Ask what the person wants and why. Ask one question at a time.
  2. Propose a cue as an if-then plan anchored to an existing routine: "After I …, I will …".
  3. Offer a starting version the person can do every time the cue comes. Call `searchKnowledge("start small")` and quote that section with its source before making any claim about size.
  4. Propose a period. Daily or weekly, once or many-times, with a Habit goal inside the glossary ranges. For something to stop, use a Bad habit named for the lapse, as in #95's rules.
  5. Show the design and wait. Call `createHabit` only after an explicit yes. Name the habit for the starting version or for the full behaviour, whichever the person picks, and say which.
  - Never say a habit takes N days, and never promise the tiny version "works". Quote the section instead.

### Draft A (new section; paste after "If-then plans")

```markdown
## Start small: a tiny version or two-minute habit

A common piece of advice is to start a new habit with a small version you can do every time, such as one push-up or a two-minute walk after lunch, and do more only when you want to. Health researchers recommend "small and manageable" changes for a first habit, because failure can be discouraging and early success can build confidence. In one study of daily habits, simpler actions such as drinking water tended to become automatic sooner than harder ones such as exercise, though the difference was not statistically reliable. In one trial, adults who practised the "Tiny Habits" method (a tiny action after an existing routine, then a small celebration) for five days reported more gratitude than people who did nothing.

What this does not mean: that a tiny version is proven to build a habit faster or make it last. No study we found compared a tiny version with a full-size version of the same habit, and the trial above measured self-reported gratitude, not lasting behaviour. "Two minutes" is a rule from popular books, not a tested number. The small version is a floor, not a limit: doing more on a good day is fine. For performance, hard specific goals usually beat easy ones, so a small start is a way to begin, not a final target.

Source: Gardner, B., Lally, P., & Wardle, J. (2012). Making health habitual: the psychology of 'habit-formation' and general practice. British Journal of General Practice, 62(605), 664–666. https://doi.org/10.3399/bjgp12X659466. Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). European Journal of Social Psychology, 40(6), 998–1009. https://doi.org/10.1002/ejsp.674. Tiny Habits trial: Frontiers in Public Health (2022), 10, 866992. https://doi.org/10.3389/fpubh.2022.866992. Goal difficulty: Locke, E. A., & Latham, G. P. (2002). American Psychologist, 57(9), 705–717. https://doi.org/10.1037/0003-066X.57.9.705
```

### Draft B (replace the first sentence of "What these studies do not cover")

Current: `These three papers do not show that a "tiny version" of a behaviour builds a habit faster.`

Replace with: `These papers do not show that a "tiny version" of a behaviour builds a habit faster; see "Start small" for what is known.`

### Draft C (optional; append to the if-then section's source line paragraph)

```markdown
A later review of 94 tests found that if-then plans had a medium-to-large effect on reaching goals on average.

Source: Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. Advances in Experimental Social Psychology, 38, 69–119. https://doi.org/10.1016/S0065-2601(06)38002-1
```

If Draft C is used, put its sentence before the existing "What this does not mean" line, so each section still ends with one Source line (C2).

## What Build must not reinvent

- **Search:** heading search already exists (`searchKnowledgeArticles`). No embeddings and no new search.
- **Writes:** habit creation rules, ranges, replay and receipts already live in `createHabit` (#95). The skill only proposes and then calls it.
- **Size claims:** don't write evidence claims into the skill file's prompt. The skill tells Paul to call `searchKnowledge` and quote.
- **Two-minute rule:** don't cite James Clear or any blog as a source in the article.

## Decisions for Paul

1. Keep the "tiny version" in the skill as labelled expert advice (recommended), or drop it from spec §8.3?
2. When the person agrees, does the habit's name track the starting version ("One push-up after coffee") or the aim ("Push-ups")? Recommended: ask, defaulting to the starting version so a Done check is honest.
3. Add Draft C (meta-analysis) now? Recommended: yes. It's the strongest evidence for the cue step.

## Sources

All checked 2026-10-21.

1. Tiny Habits® for Gratitude—Implications for Healthcare Education Stakeholders. Frontiers in Public Health (2022) 10:866992. https://doi.org/10.3389/fpubh.2022.866992 (abstract and methods: https://pmc.ncbi.nlm.nih.gov/articles/PMC9149079/)
2. Hollingsworth, J. C., et al. (2020). Protocol for Minute Calisthenics. BMC Public Health 20, 1242. https://doi.org/10.1186/s12889-020-09355-4
3. ClinicalTrials.gov NCT04207567 (completed 2021-01-04; no results paper found). https://clinicaltrials.gov/study/NCT04207567
4. Lally, P., et al. (2010). How are habits formed. European Journal of Social Psychology 40(6), 998–1009. https://doi.org/10.1002/ejsp.674 (page 1007, as read for `habits-knowledge-article.md`)
5. Gardner, B., Lally, P., & Wardle, J. (2012). Making health habitual. British Journal of General Practice 62(605), 664–666. https://doi.org/10.3399/bjgp12X659466 (PDF read: https://bjgp.org/content/bjgp/62/605/664.full.pdf; quotes "small and manageable behaviour changes, because failure can be discouraging", "at least for their first habit goal", "simpler actions become habitual more quickly", Box 1 "Choose a simple action…")
6. Lally, P., Chipperfield, A., & Wardle, J. (2008). Healthy habits: efficacy of simple advice on weight control based on a habit-formation model. International Journal of Obesity 32(4), 700–707. https://doi.org/10.1038/sj.ijo.0803771 (results as reported in [5])
7. Beeken, R. J., et al. (2017). A brief intervention for weight control based on habit-formation theory delivered through primary care. International Journal of Obesity 41, 246–254. https://doi.org/10.1038/ijo.2016.206
8. Gollwitzer, P. M., & Sheeran, P. (2006). Advances in Experimental Social Psychology 38, 69–119. https://doi.org/10.1016/S0065-2601(06)38002-1 (abstract: https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f)
9. Bandura, A., & Schunk, D. H. (1981). Cultivating competence, self-efficacy, and intrinsic interest through proximal self-motivation. Journal of Personality and Social Psychology 41(3), 586–598. https://doi.org/10.1037/0022-3514.41.3.586
10. Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation. American Psychologist 57(9), 705–717. https://doi.org/10.1037/0003-066X.57.9.705
11. Fogg, B. J. (2009). A behavior model for persuasive design. Persuasive '09. https://doi.org/10.1145/1541948.1541999
12. Fogg, B. J. (2019). *Tiny Habits: The Small Changes That Change Everything.* Houghton Mifflin Harcourt. (The original author's book; method definition only, not evidence.)
13. Clear, J. (2018). *Atomic Habits.* Avery. (Secondary popularizer of the "two-minute rule"; listed for labelling only, not cited as evidence.)

## Not verified

- I didn't open the full text of [6] (Lally 2008), [9] (Bandura & Schunk) or [12] (Fogg's book). Their findings come from abstracts, DOI landing pages, or [5]'s summary.
- I didn't check the author list and funding of [1] for a Tiny Habits affiliation.
- I didn't search exhaustively for other tiny-habit RCTs (e.g. in other languages); only the trials above were found.
