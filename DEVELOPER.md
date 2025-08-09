## Upstream Merge Safety and Process

We periodically merge updates from the `cyanheads/mcp-ts-template` repo into `main`.  
This guide covers how to protect our custom code from being overwritten and how to perform upstream merges.

---

### How `.gitattributes` Protects Custom Code

We use `.gitattributes` with `merge=ours` to tell Git:

> On merge conflict for this file/path, always keep **our** version and discard the incoming one.

- This only applies when a **conflict** happens.
- If upstream changes a file we haven’t touched, we still get their changes.

---

### When to Add Entries to `.gitattributes`

Add paths to `.gitattributes` when:

- You create **custom code** that should never be replaced by upstream.
- You fork an upstream file and start maintaining your own version.
- You have project-specific docs or config that upstream might also touch.

**Rule of thumb:**  
If upstream changes this file, and you *never* want their version → **protect it**.

---

### Common Protected Paths

```gitattributes
# Protect all README files anywhere
**/README.md    merge=ours

# Protect project docs
docs/**         merge=ours

# Protect GitHub workflows/configs
.github/**      merge=ours

# Protect custom server/tooling code
src/custom/**   merge=ours
tools/**        merge=ours

# Optional: keep our devcontainer & VSCode settings
.devcontainer/** merge=ours
.vscode/**       merge=ours
```

---

### Adding New Custom Code

When creating new modules or directories that are yours:

1. Add a new `merge=ours` rule to `.gitattributes`.
2. Commit the updated `.gitattributes` **before** the next upstream merge.

Example:

```bash
echo "src/newtool/** merge=ours" >> .gitattributes
git add .gitattributes
git commit -m "chore: protect src/newtool from upstream merges"
```

---

### Related Git Config

Enable the `ours` merge driver:

```bash
git config merge.ours.driver true
```

Enable automatic conflict resolution memory:

```bash
git config rerere.enabled true
```

---

### Upstream Merge Process

We treat the template repo as an `upstream` remote and periodically merge from it.

**Initial Setup (one-time)**

```bash
git remote add upstream https://github.com/cyanheads/mcp-ts-template.git
git fetch upstream
git config merge.ours.driver true
git config rerere.enabled true
```

---

**Regular Upstream Merge (manual)**

```bash
git fetch upstream
git switch -c chore/upstream-merge-$(date +%Y%m%d)
git merge upstream/main
# Resolve conflicts (should be minimal with .gitattributes)
git add -A
git commit
git push -u origin HEAD
# Open PR and merge into main
```

---

**Best Practices**

- Commit `.gitattributes` protections early — before writing significant custom code.
- Keep `.gitattributes` up to date as you add new modules.
- Review upstream merge PRs before merging.
- Avoid over-protecting files you may want upstream changes for.

---
