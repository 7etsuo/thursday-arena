# Verification evidence

See [the implementation report](../../DEFENSE_FIXES_2026-09-21.md).

- `final-tests.log`: offline suite, including 900-match lifecycle and full battle fixtures.
- `historical-archive-replay.json`: pre-S3 archive, 7,121 exact fights.
- `paired-s12.csv`, `paired-s3.csv` and corresponding `.log` files: 100 pairs per season.
- `chronological-summary.json`, `chronological-evaluation.json`: all 2,751 final-shop checks.
- `practice.log`: two anonymous official practice matches; no rated actions.
- `official-rules.md`: rules fetched September 21, including top-table K=32 defenses.
- `backup.json`: pre-change backup identity.
- `runtime-sha256.txt`: installed application file checksums.
- `source-changes.diff`: changes relative to the pre-change backup.

## Commands

```sh
npm test
node tools/verify_archive_battles.js /path/to/pre-S3-records-root
node tools/eval_versions.js --before-dir /path/to/pre-change-code --games 10 --seeds 101,103,107,109,113,127,131,137,139,149 --season both --budget Infinity --csv /new/path/s12.csv
node tools/eval_versions.js --before-dir /path/to/pre-change-code --games 10 --seeds 101,103,107,109,113,127,131,137,139,149 --season 3 --budget Infinity --csv /new/path/s3.csv
node tools/eval_defense_logs.js /path/to/extracted/evidence/analysis /new/path/defense-eval.json
node tools/verify_live_practice.js --seed 20260922 --games 2 --budget 1500
```

The first five commands use local data. The final command sends anonymous practice requests.
The comparison tool requires the pre-change code backup separately. `npm test` includes all new
recorded battle and defensive-learning fixtures; it does not need that backup or a network.
