# 0.0.3

- New 'squads' commands to group reviewers
- Include tab completion for 'ger' alias
- Fixed 'recheckout' command to check out current patch instead of current topic
- Fixed '--assign' option when multiple patches detected


# 0.0.2

- Renamed 'push' command to 'up' to avoid accidental mix up with git command.
- Renamed 'status' command to 'patches', plus various display improvements.
- Renamed 'browser' command to 'web'.
- New command 'topic' to help create topic branch.
- New '--comment' option for 'up' command.
- Re-appropriated 'status' command to show detailed status of a patch
  had their base_branch argument moved to a '--branch' option.
- Commands that push patches (up, drafts...) now use upstream's remote and have
  option.
- Moved config argument of 'projects' and 'clone' commands to a '--config'.
- Removed the need for the url config value.
- Add missing interactive options for submit and abandon commands.
- Better documentation, including better 'help' command.
