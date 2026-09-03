# Cogiens Development Topology

Status: PROPOSED FOR MERGE
Effective baseline: 2026-09-03

## 1. Canonical rule

**Code lives in Git; machines host working copies.**

The GitHub repository `main` branch is the canonical source of truth for code and small text-based project assets. A developer workstation, M-3, or a deployment server must never become an independent source of truth.

## 2. Node responsibilities

| Node | Role | May modify code? | Canonical? |
|---|---|---:|---:|
| GitHub | Primary Git repository, PR, review, CI, tags and releases | Through Git operations | **YES** |
| Main workstation | Human development and project command desk | Yes, on branches | No |
| M-3 | Harness Federation execution base; H01-H08 worktrees; local-model arena | Yes, on isolated branches/worktrees | No |
| Hong Kong server | Git mirror, off-site backup and deployment node | Mirror/deploy only by default | No |

There must be only one canonical `main` branch. The Hong Kong mirror is not a second writable `main` during normal operation.

## 3. M-3 directory standard

```text
D:\FND\M3-Harness\                       # Harness infrastructure only
D:\FND\M3-Harness-Projects\              # All actual development work
  00_inbox\
  01_projects\                             # clean integration clones
  02_worktrees\
    H01\ H02\ H03\ H04\ H05\ H06\ H07\ H08\
  03_shared\
  04_artifacts\
  05_evidence\
  06_logs\
  07_benchmarks\
  08_archives\
  09_quarantine\
```

`01_projects` is for clean integration copies. Harnesses must do consequential work under their own `02_worktrees/Hxx/...` worktree and branch.

## 4. Branch standard

- `main` — reviewed, tested, releasable state.
- `task/<TASK-ID>` — human or integration task branch.
- `harness/Hxx/<TASK-ID>` — H01-H08 execution branch.
- `review/Hxx/<TASK-ID>` — review-only branch if changes are required.
- `fix/<TASK-ID>` — bounded corrective change.
- `exp/<TASK-ID>` — experimental work that is not production-ready.

A Harness must never directly push unreviewed task output to `main`.

## 5. Work handoff between the main workstation and M-3

Start work from the latest remote state:

```powershell
git fetch --all --prune
git switch main
git pull --ff-only
```

For unfinished work that must move to another machine, prefer a WIP commit and push rather than a machine-local stash:

```powershell
git add .
git commit -m "WIP: <TASK-ID> checkpoint"
git push
```

Then on the other node:

```powershell
git fetch --all --prune
git switch <branch>
git pull --ff-only
```

Do not use SMB/network-share editing as the normal development workflow for Git repositories.

## 6. Harness acceptance and evidence

H01-H08 states remain evidence-gated:

`DECLARED_UNVERIFIED -> DISCOVERED -> CONNECTED -> VERIFIED -> QUALIFIED -> ACTIVE`

Every consequential Harness run must preserve at minimum:

- Project ID and Task ID
- Harness ID and adapter version
- Model ID where applicable
- Source commit SHA and branch
- Workspace/worktree path
- Commands/tools used
- Test result
- Changed files / diff summary
- Artifact SHA-256 values
- Reviewer / review Harness
- Final PASS / FAIL / QUARANTINE decision

Failed or unverified output belongs under the M-3 quarantine area and must not be merged.

## 7. Large assets do not belong in Git

Do not commit model weights, large corpora, vector databases, checkpoints, database dumps, raw bulk PDFs or secrets.

Git stores code, schemas, manifests, prompts, benchmark definitions, ontology text, small fixtures and metadata. Large assets must live in M-3/object storage with version manifests and integrity hashes checked into Git.

Example manifest fields:

```yaml
asset: WaterMedicineCorpus-v0.1
location: s3://water-data/corpus/wm-v0.1/
sha256_manifest: <hash>
version: 0.1
```

## 8. Hong Kong mirror rule

The Hong Kong server is an off-site Git mirror and deployment/backup node. During normal operation it must not accept independent feature development.

Recommended mirror operation:

```bash
git clone --mirror <canonical-github-url> <repo>.git
cd <repo>.git
git remote update --prune
```

Automated mirror jobs must not contain plaintext credentials in repository files.

## 9. Production boundary

Git merge is not production deployment. Production changes require a separate release/deployment approval and evidence trail.

## 10. Frozen operating principle

> **One canonical repository. Multiple disposable working copies. Isolated Harness worktrees. Review before merge. Off-site mirror, not a competing main.**
