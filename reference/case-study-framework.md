# Case study framework

Working notes for later public pages. The public page is one decision, one path, and one figure. These questions are the raw material. Bullets are enough. Leave a section blank when you do not remember. A blank is more useful than a reconstructed number.

Do not put credentials, customer records, control procedures, or non-public financials in the dumps. Describe the class of problem and the decision.

Each finished case study needs sections 1 through 7. Section 8 is the drawing brief. Section 9 decides what is allowed onto the public site.

## 1. Constraint

What made this a design problem rather than a tool install.

- What was getting worse: volume, close time, a wrong number, an audit, a customer waiting on a report, a source that could not be queried.
- What you could not replace: the system of record, a contract, a team skill, a regulation, a deadline.
- Who felt it, and what they did when the data was late or wrong.

## 2. Ownership

A tool list hides whether you selected it, built it, operated it, or used it.

For each system that matters, mark one: Selected, Built, Operated, Used, Advised.

- What you personally designed or wrote.
- What you inherited and kept.
- What another team owned, and where your boundary was.

## 3. One path

One business flow. A platform map can stay in the private diagrams.

- Business object: the thing a row represents.
- Grain: one row is one ___ per ___.
- Cadence: how the source arrives, and how fresh the consumer actually needed it.
- Landing: file, API, database, and why that door existed.
- The transform step that changed the meaning: a grain change, a late-arriving fact, a test that blocked a publish, a model you retired.
- Consumer: who looked at it, and whether they could explore freely or only see a governed report.
- Scale, if you can defend it: users, rows, dollars of decisions, or how often it ran. Say what the number counts.

## 4. Options and what each lacked

Three real options you evaluated. Skip tools you only saw in a market map.

For each option:

- Name.
- What it did well for this constraint.
- What it lacked.
- Who wanted it, and the reason they gave.

## 5. Decision

- What you chose.
- The constraint that made the winner acceptable, including its weakness.
- What you knowingly gave up.
- What would have made you pick a different option.

## 6. Evidence

The proof a stranger can hold onto. One strong fact beats a list.

- A before and after, with both sides defined the same way.
- A metric definition: grain, filters, and the known caveat.
- Adoption: who used it, and how you knew.
- The check that made it trustworthy: a test, a monitor, a reconciliation, a human review.

If the only number you remember is the one already on the résumé, say whether you can still define it.

## 7. Scar

- What broke, what shipped wrong, or what you turned off.
- How you noticed.
- What you changed afterward.
- What you would not repeat.

## 8. Figure

A few boxes. The caption does the work the old posters tried to do with logos.

- Nodes worth drawing.
- What each arrow should say: grain, cadence, or a trust boundary.
- The one sentence under the figure.
- Names, schemas, and internal areas that stay off the drawing.

## 9. Public boundary

- Safe to publish while you are employed there.
- Safe only after you have left.
- Never: customer data, unreleased numbers, control design, implementation of a security boundary.

Write the public page from the first list only.

## What a finished page is

About 800 to 1,500 words. Title is the decision, not the company stack. One figure from section 8. The job pages stay as the index and link to the case.

Write a page when sections 1, 4, 5, and 7 have real answers. The other sections make it tighter. They are not a reason to invent detail.

## Cases to write

| Case | Decision the page should be about | Private dump |
| --- | --- | --- |
| Avenue One | How one business path moved from a target architecture, through an operating picture, to a platform with separate tools for catalog, monitors, and audiences | `reference/stacks/dumps/avenue-one.md` |
| Finexio | Why customer reporting and internal exploration split, and what the connector could not carry | `reference/stacks/dumps/finexio.md` |
| ARS | Why Power BI won for company-wide reporting after Shiny and CRM Analytics | `reference/stacks/dumps/ars.md` |
| Deutsche Bank | Where a US equity trade breaks between execution and settlement, and what the break reporting changed | `reference/stacks/dumps/deutsche-bank.md` |
| Lumi | What you owned in a month, and why the analytics database was not a warehouse | `reference/stacks/dumps/lumi.md` |
| SoFi | The compliance and evaluation constraints that change the work relative to the earlier warehouse roles. Public timeline runs through September 2026 | `reference/stacks/dumps/sofi.md` |

SoFi can be drafted once sections 1, 4, 5, and 7 are filled. Leaving does not clear internal detail.
