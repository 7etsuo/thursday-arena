# Thursday Arena — full counter sheet (from omlejmi + kit texts)

Source: all 24 kit texts in `catalog.json` + 93 omlejmi wins / 100 public matches
(`/tmp/omlejmi2/details`). Public replays show round boards, not shop clicks.

## How omlejmi actually counters

He does **not** mirror. Name overlap with opponent is ~0 on most wins.
After he sees the ghost board (round 0 fight), he **pivots seats/kits** toward a
role answer. Observed round-win responses:

| Their archetype | What he answers with (top) | Why it works |
|---|---|---|
| **glass_burst** (first_seat / spotlight — Tech Demos) | flamingo_pass, grow_scale, chip_snipe, double_echo, bulk_echo | Burst one-shots thin fronts; flamingo soaks+passes, grow/bulk survive the 4-atk open |
| **chip_snipe** (mosquito / pin / sidestep) | double_echo, grow_scale, echo_hype | Outscale chip; don’t race chip-for-chip |
| **bulk_echo** | echo_hype, grow_hype, grow_scale | Win the tempo race or stack more buffs |
| **wake_chip** | flamingo, sustain, grow | Front that lives through wake ticks |
| **backline_snipe** (backtap / last_word) | double_echo, bulk_echo, flamingo | Fat mid/back or pass-back so snipe doesn’t end the fight |
| **buff_suicide** (dodo / dump) | grow, chip, echo_hype | Punish their spent front |
| **flamingo_pass** | grow_scale, hype battery | Kill the flamingo before pass value, or outscale |
| **hurt_revenge** (peacock / sting) | echo_hype / bulk wall | Don’t tip-tap; burst or wall |
| **sustain** (patch / guard / hold_the_line) | echo_hype | Overwhelm heal with buffed front |
| **ko_snowball** | spotlight / spite burst | Deny the KO stack |

### Front-seat answers (empirical)

vs **first_seat** front → his front: flamingo ×16, bulk ×11, grow ×9, peacock ×3  
vs **bulk** front → bulk / flamingo / grow  
vs **mosquito** → bulk wall  
vs **dodo** → bulk / grow  

Food while countering: potato on his front (grow/bulk/flamingo), honey on mid/back.

---

## Mechanical counter matrix (all 24 kits)

### Burst / opener damage
| Kit | Does | Counter with | Avoid |
|---|---|---|---|
| **first_seat** | Jumps front | flamingo / bulk / grow / hold_the_line (+honey/potato) | thin hype/wake fronts |
| **spotlight** | SoB front: 2 dmg to their front | same walls; peacock if you want revenge | glass 2–3 hp fronts |
| **mosquito** | SoB 1 to enemy front | bulk+guard / patch behind; outscale | stacking more mosquito |
| **pin** | SoB 1 to same seat | don’t put key unit in mirrored seat; bulk that seat | mirroring seat glass |
| **sidestep** | SoB 1 to enemy mid | fat mid (echo/guard) or move key unit off mid | unprotected echo mid |
| **backtap** | SoB 1 to last enemy | don’t leave 1hp back; last_word trade or fat back | lone last_word back |
| **last_word** | SoB back: 3 to last enemy | honey back / don’t leave weak back | 3hp backline |

### Scaling engines
| Kit | Does | Counter with | Avoid |
|---|---|---|---|
| **echo** | +1/+1 when friend ahead attacks | **anti-mirror** (don’t echo-vs-echo); grow race; wake chip; flamingo force trades | double echo into their echo |
| **hype** | SoB +2 atk to front | kill/chip front before swing; sting/spite; bulk walls | letting hyped grow connect thrice |
| **grow** | +1/+1 before each attack | sting/spite/wake to cut; burst front down; deny time | slow sustain mirrors |
| **snowball** | KO: +2/+2 | deny KOs (trade evenly); burst them first | feeding free KOs |
| **wake** | on ahead-attack: 1 to enemy front | bulk/hold_the_line/patch; kill wake seat | thin fronts |
| **cover** | ahead faints: +2 atk | don’t free-kill their ahead; chip both | suicide into cover |

### Walls / sustain
| Kit | Does | Counter with | Avoid |
|---|---|---|---|
| **bulk** | SoB +2 hp | grow/hype stack; spotlight; potato grow | weak chip only |
| **guard** | SoB +2 hp to ahead | same as bulk on their front | — |
| **hold_the_line** | front hurt: +1 hp | big hits (hyped grow); sting; ignore chip | mosquito-only plans |
| **patch** | ahead hurt: heal 1 | burst through heal; multi-hit wake+hyped front | single 1-dmg ticks |

### Pass / sacrifice
| Kit | Does | Counter with | Avoid |
|---|---|---|---|
| **flamingo** | faint: +1/+1 to two behind | kill behind first if possible; grow race; sniper back | trading into flamingo early without pressure |
| **dump** | give 50% atk to ahead then faint | kill the buffed ahead; chip before dump resolves | — |
| **dodo** | SoB give 50% atk to ahead | same; walls on receiving front | — |
| **spite** | faint: 2 to enemy front | bulk/honey front | glass front |

### Revenge
| Kit | Does | Counter with | Avoid |
|---|---|---|---|
| **peacock** | hurt: +3 atk | burst kill in one hit; don’t tip-tap | chip wars |
| **sting** | hurt: 2 to enemy front | bulk/honey; kill sting seat fast | unprotected front |
| **drain** | KO: restore 2 | deny KO | — |

---

## Practical “counter build” recipes (shop targets)

1. **vs Tech Demos / first_seat glass** → front flamingo|bulk|grow (+potato) · mid echo|guard · back hype|echo. Never open thin wake/hype.
2. **vs double mosquito / pin** → bulk wall + echo/hype scale. Skip pin war.
3. **vs their echo mid** → prefer grow/flamingo front, **one** echo max (or wake), hype back. Don’t echo-mirror.
4. **vs peacock/sting** → alpha strike (spotlight/hyped grow) or fat bulk; no chip.
5. **vs flamingo** → pressure behind or outgrow; potato grow front.
6. **vs last_word/backtap** → honey the back seat; avoid 3hp back.
7. **vs patch/hold_the_line sustain** → hyped grow / double hype; overwhelm heal.
8. **vs snowball** → even trades, no free KO feeds; burst race.

Default when unknown: **grow|bulk|flamingo → echo|guard → hype** (his spine), then pivot with the table above after round 0.

## Wire-in (planner)

Ghost fingerprint → archetype → preferred kit set + front bias + food seats.
Already have ghost memory; next step is encoding this matrix into `planShop`.
