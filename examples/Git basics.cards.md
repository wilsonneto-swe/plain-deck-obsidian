---
tags: [git, version-control]
---
# Git basics

Cards on everyday Git: saving changes, branches, remotes and undoing things. Each card asks one thing; the
answer comes first and the reason, when there is one, after it.

# Saving changes

## What does `git add <file>` do?
It copies the file's current content into the staging area (the index), the snapshot the next commit will
record.

Changes made to the file after that are not staged until you run `git add` again.

## What does `git commit` record: the working tree or the staging area?
The staging area. Changes you have not added with `git add` stay out of the commit.

## Which command shows the changes you have not staged yet?
`git diff`, with no arguments: it compares your files with the staging area.

## Which command shows what the next commit will contain?
`git diff --staged` (or `--cached`): it compares the staging area with the last commit.

## In `git status`, what is an untracked file?
A file in your working tree that Git does not track (it is not in the staging area) and that is not ignored.

## Does adding a tracked file to `.gitignore` make Git stop tracking it?
No. `.gitignore` only applies to untracked files.

To stop tracking a file, run `git rm --cached <file>` and commit: the file stays on disk.

# Branches

## In Git, what is a branch?
A movable name for a commit. Each commit you make on the branch moves the name forward to the new commit.

Making a branch copies no files, which is why it is instant.

## In Git, what does `HEAD` point to?
What you have checked out: usually the current branch, which in turn points to a commit.

## What does "detached HEAD" mean?
`HEAD` points to a commit directly instead of to a branch, for example after checking out a tag.

Commits made there belong to no branch, so they are easy to lose once you switch away; `git switch -c <name>`
keeps them on a new branch.

## Which command creates a branch and switches to it?
`git switch -c <name>` (the older form: `git checkout -b <name>`).

## What is a fast-forward merge?
A merge that only moves the branch name forward, with no merge commit. It happens when the current branch has
no commits of its own since the other branch split off from it.

## What does `git rebase main` do to the current branch?
It replays the branch's own commits on top of `main` as new commits, so the history becomes a straight line.

The rebased commits get new hashes: avoid rebasing commits that others already have.

# Remotes

## Does `git fetch` change your own branches or files?
No. It downloads new commits from the remote and moves the remote-tracking branches, such as `origin/main`;
your branches and your working tree stay as they are.

## What is `origin/main`?
A remote-tracking branch: where `main` was on the remote named `origin` the last time your repository
talked to it. You don't commit to it; fetching moves it.

## What does `git pull` do, in terms of other Git commands?
A `git fetch`, then a merge or a rebase of the current branch with what was fetched: `git pull --rebase` asks
for a rebase, and the `pull.rebase` setting picks the default.

## Why is a push rejected as "non-fast-forward"?
The remote branch has commits that yours doesn't, and the push would drop them. Fetch, then merge or rebase so
your branch contains them, and push again.

# Undoing things

## How do you unstage a file but keep its changes?
`git restore --staged <file>` (the older form: `git reset <file>`). The changes stay in the working tree.

## How do you throw away the changes you have not staged in a file?
`git restore <file>`: the file goes back to its staged version, or to the last commit when nothing of it is
staged. Git keeps no copy of what you threw away.

## How do you undo a commit that others already have?
`git revert <commit>`: it makes a new commit with the opposite changes, so no history is rewritten.

## What does this command do?
```bash
git reset --soft HEAD~1
```
?
It moves the current branch back by one commit and keeps that commit's changes staged; your files don't
change. Useful to redo the last commit.
