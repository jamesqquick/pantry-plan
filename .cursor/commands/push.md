# Push changes

Help me push the current branch to the remote.

1. **Check state**: Confirm the branch name and that there are local commits to push (or that we intend to push an existing branch).
2. **Remote**: Use the default remote (usually `origin`) unless I specify another.
3. **Push**: Run or give the exact command to push, e.g. `git push -u origin <branch>` for a first push, or `git push` if the branch already tracks a remote.

If the remote has new commits, suggest `git pull --rebase` (or `git pull`) first, then push. Do not force-push unless I explicitly ask.
