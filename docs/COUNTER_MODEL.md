# Contextual card counters and bounded opponent exploitation

Implemented September 21, 2026. See the [measurements and release decision](COUNTER_RESEARCH_2026-09-21.md)
and the [interactive counter atlas](results/counter-model-2026-09-21/atlas/index.html).

## What a counter means

Define a battle context as both ordered teams, their permanent and temporary stats, honey,
equipment, crews, both captains, the active seats, round, season, and attack/defense orientation.
The live round selects a fixed seed. The simulator maps that context to one outcome.

For a candidate ordered team `a` and enemy scenario `e`, define:

```
u(a, e) = 1 for a win, 1/2 for a draw, 0 for a loss
V(a, p) = sum_e p[e] * u(a, e)
```

The live planner substitutes its series-aware utility in the last round: for example a drawn
round at a 1–0 lead wins the match. Defensive analysis uses ordinary round score. A board is
evaluated in all legal seat orders. Battle payoffs are deterministic; uncertainty concerns which
enemy team and future offers will be encountered.

An individual card is evaluated by placing it in a complete team. Replacing a card can also change
crew bonuses, kit targets, copy effects, item interactions, and who survives to trigger a faint or
last-standing effect. Attack and defense orientation can change deterministic event ordering.
Consequently, a standalone pairwise card table cannot prove the best purchase or team.

`lib/counter_model.js` exposes:

| Function | Result |
|---|---|
| `payoff(board, scenario, options)` | Simulated utility with the correct orientation and captain/seat inputs |
| `profile(board, scenarios, options)` | Each scenario's payoff, normalized weights, expected score, and minimum payoff |
| `rank(board, scenarios, options)` | All seat orders, optionally filtered by a baseline loss bound |
| `worstExpectation(values, weights, radius)` | Exact minimum over the specified total-variation uncertainty set, within floating-point tolerance |
| `compare(candidate, baseline, radius)` | Expected and worst-case **difference** using the same scenarios and distribution |

Attack scenarios have `{board, weight, seats, theirCaptain}`; defense scenarios also set
`role: 'defense'`. In a defense scenario, `board` and `theirCaptain` belong to the incoming
attacker. The supplied `options.ourCaptain` remains our captain after orientation is reversed.
A known current enemy captain overrides historical captain guesses in attack scenarios.

## What can actually be proved

Let `p` be the modeled distribution over a finite set of enemy scenarios. Allow another
distribution `q` to differ by at most `rho` in total variation:

```
Q(p, rho) = { q : q[e] >= 0, sum(q) = 1, 1/2 * sum(abs(q - p)) <= rho }
d[e]      = u(candidate, e) - u(baseline, e)
G         = min over q in Q(p, rho) of sum(q[e] * d[e])
```

If `G >= -epsilon`, then the candidate's expected utility is at most `epsilon` below the
baseline's **for every distribution in that set**. This follows directly from minimizing the
difference over all allowed distributions. At `rho = 1` and `epsilon = 0`, acceptance requires
the candidate to be no worse on every listed scenario. At `rho = 0`, it checks only the supplied
weighted average.

The implementation sorts scenario differences, then transfers probability mass from the largest
difference to the smallest until the allowed mass is exhausted or no improvement is possible.
Any transfer between less favorable donor/recipient values can be exchanged for such a transfer
without increasing the objective. This establishes the greedy transport solution. Tests compare
it with independently enumerated feasible distributions on a probability grid.

It is essential to minimize the **difference**. Subtracting two independently minimized values
does not provide this guarantee: `[0, 1]` and `[1, 0]` have equal individual minima, but changing
between them can lose a full point against a particular opponent.

The bound assumes correct battle inputs and simulator behavior. It does not cover missing enemy
teams, incorrect seats/captains, unknown future shop draws, a changing matchmaking process, or an
opponent reacting to our policy. A bound relative to a baseline also does not establish that the
baseline is optimal. The library is a checkable mathematical tool, not a proof of perfect play.

## Learning and loss data

The bot retains observed enemy boards and uses them to form `p`. It learns after wins and losses;
it does not retrain card powers or rewrite strategy rules. Changing `p` can still change purchases
and positioning substantially, so over-specialization is possible even with a fixed simulator.

Neither an unconditional best response to a guessed opponent nor removing all opponent evidence
is universally optimal. Choosing between them requires assumptions about future opponents and
measurements on data not used to choose the policy. The chronological results are in the
[research report](COUNTER_RESEARCH_2026-09-21.md). The new robust defense experiment did not improve
validation, so its policy is confined to `tools/research_counter_finish.js`; the live driver does
not call it. **The shipped planner therefore has no new universal safety or no-drift guarantee.**

## Atlas

The atlas contains all 179 cards and 320,410 ordered simulated matchups: one neutral single-card
duel context and nine team contexts. The team contexts replace front, middle, and back separately
on both teams in three complete recorded battles. Those backgrounds were selected deterministically
from the older training records, before evaluating the newer archive.

Each substituted card uses its base stats without equipment. Its teammates retain their recorded
stats and items; the recorded captains and seats are retained. Teams containing two mythics are
excluded. The page displays the complete context inputs and supports card, crew, and context
selection. Counts across illustrative contexts are not empirical win probabilities. Prices are
shown for reference, but the table does not establish affordability or optimal reseating.

Rebuild into a new directory:

```sh
node tools/build_counter_atlas.js --out /tmp/arena-atlas-new \
  --contexts docs/results/counter-model-2026-09-21/atlas-contexts.json
```

The live planner continues to evaluate actual legal shop states. It does not use this atlas as
fixed card weights or a tier list.

## Research used

- The [official Arena rules](https://thursdayarena.com/rules.md),
  [bot catalog](https://thursdayarena.com/api/catalog), and
  [item catalog](https://thursdayarena.com/api/items) define the game inputs. Recorded full battle
  traces establish the tested details of event ordering; published descriptions alone omit some.
- Johanson and Bowling, [Data Biased Robust Counter Strategies (2009)](https://webdocs.cs.ualberta.ca/~mbowling/papers/09aistats.pdf),
  studies exploiting opponent models while limiting the harm from inaccurate models. This motivates
  testing a bounded comparison; its poker results are not an Arena performance guarantee.
- [Safe Opponent-Exploitation Subgame Refinement (2022)](https://proceedings.neurips.cc/paper_files/paper/2022/hash/b12a1d1014e952e676f5d6931d03241a-Abstract-Conference.html)
  provides another formulation of exploitation with a safety constraint. Its assumptions do not
  establish an equilibrium or safety bound for our complete shop-and-match policy.
- Tesauro and Galperin, [On-line Policy Improvement using Monte-Carlo Search (1996)](https://proceedings.neurips.cc/paper/1996/hash/996009f2374006606f4c0b0fda878af1-Abstract.html),
  motivates evaluating action continuations through simulation. We tested additional purchase
  search and captain rollouts, then retained their measured limitations.
- Art Owen, [Monte Carlo theory, methods and examples, Chapter 8](https://artowen.su.domains/mc/Ch-var-basic.pdf),
  explains common random numbers. Shared draws reduce variance of a difference when they induce
  positive covariance; they do not guarantee better decisions. The reroll experiment shares RNG
  streams, with partial synchronization when frozen offers change draw consumption.
