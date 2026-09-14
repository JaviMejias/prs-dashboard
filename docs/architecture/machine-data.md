# Machine-local boundary

`LocalMachineRepository` is a small optional shape for diagnostics and
portable instructions. It may contain local path, current branch, head SHA,
merge-base SHA, working-tree state and verification time.

It is not a repository manager or synchronization system. The PWA may display
or generate commands, but cannot execute Git or inspect arbitrary filesystem
paths by itself. Machine data stays local and is excluded from normal export.
