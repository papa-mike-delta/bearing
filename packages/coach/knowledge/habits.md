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

## Repeating Tasks versus Habits in Bearing

A Task may repeat when the person asks for a Task. A repeating Task has no streak. Its Task page has a clearable rule control: every 1–999 days, weeks or months, optionally on a weekday for weeks or day 1–31/last for months. A new rule starts at every month. The Task row and page show the derived phrase. Changing the rule affects only the next creation, not this Task's date.

Paul may give createTask an optional rule only from a stated phrase that maps to this control, such as every month on the last day or every 3 weeks on Tuesday. Otherwise ask one question and write nothing. Paul cannot change or clear the rule on an existing Task; point to its Task page. Completing a repeating Task finishes this one and creates one next Task in the same transaction, without using a create slot. A resend of that completion creates no second Task. The next date is strictly after the browser's completion day; a late completion slips and missed intervals are not created. It copies name, note, priority, Goal, Area and rule. The next Task does not inherit links (Related edges); the completed Task keeps them. Now/Later and Kanban keep the new Task in Later until its date, then Just came up. Priority List stores the date and remains a single list. Filing an Inbox draft as a Task sets no rule.

The completion receipt reads Completed 'Pay rent'. Next is Tue, Mar 3, with the name linking to the completed Task and the date to the new Task. A Task without a rule still reads Completed '…' with its Task link.

What this does not mean: a repeating Task is not evidence of habit formation, and it has no Habit streak or record.

Source: Bearing product rule, issue #155 (epic #152), not a research finding.
