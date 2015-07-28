# gerrit-cli

> Gerrit in your command lines.

gerrit-cli provides a command-line interface to the Gerrit code review system.

It was born out of the annoyance of having to write out `git push orign
HEAD:refs/for/branch/topic` every time I wanted to push a patch. It's now just
`gerrit up`.


## Install

Install using NPM.

```
$ npm install -g gerrit-cli
```


### Tab completion

Bash tab-completion is also available and can be enabled by adding the following
line to your ~/.bashrc file.

```
eval "$(gerrit completion)"
```


## Usage

gerrit-cli is composed of multiple sub-commands, much like git.

Run `gerrit help` for a list of the commands, and `gerrit help <command>` for
detailed help.


### Commands

```
help          View help for specified command.
config        Manage server configurations
projects      Display available projects on server.
clone         Clone a project from server.
patches       List details of patches on the server for the current project.
assign        Assign reviewers to the current patch.
up            Push patches of current topic to server for review.
draft         Push patches of current topic to server as drafts.
checkout      Fetch and checkout topic branch from server.
recheckout    Re-checkout current topic.
ssh           Run arbitrary gerrit command on server.
review        Post a review for the current topic.
submit        Submit the current topic for merging.
abandon       Abandon the current topic.
comment       Post a comment on the current topic.
pubmit        Push patch to server then immediately submit for merging.
web           Open browser to gerrit web page for current patch.
completion    Enables tab completion for gerrit-cli.
topic         Create new topic branch.
```


### Config Setup

First step, you'll need to tell gerrit-cli about your server. This is
needed for certain commands like 'clone' and 'projects'. Run `gerrit config`
and you'll be prompted for the information it needs.

Multiple configs can be created by passing in a name, for example `gerrit
config mothership`, and later specified as options to other commands.  The
default config which you've created earlier is appropriately named "default".

Protip: the configs are saved in your `~/.gitconfig`.


### Cloning

Now you're ready to clone a remote repository. Run `gerrit clone` and you'll be
presented with a selectable list of available projects. Pick a project and it
will be cloned as usual. As a bonus the commit-msg hook will be automatically
installed for you.


### Creating a new topic and patch

For gerrit-cli to keep track of things, a topic branch's upstream should be the
target remote branch. For example, if you were to normally push `origin
HEAD:refs/for/someBranch/myTopic` then your topic branch should be called
`myTopic` and its upstream should be `origin/someBranch`.

Of course gerrit-cli helps you out here, you can create topic branches with
`gerrit topic myTopic`. The new branch's upstream will be set to the current
branch's upstream. For example, if you were on `master` which tracks
`origin/master`, then `myTopic`'s upstream would be `origin/master`.

Now that you have your topic branch get hacking and create your commits as
usual. When you're done and ready to push to Gerrit for review, run `gerrit
up`. That's it.

You could also assign reviewers to the patch by using the
'assign' option like so: `gerrit up --assign cbush jmartin`.


### Viewing patches on Gerrit

Run `gerrit patches` to view the list of open patches on Gerrit. There are
plenty of flags to filter the patches and define the display, I suggest taking
a look at `gerrit help patches`.

Here are a few examples.

```
// Patches that you've pushed.
$ gerrit patches --mine

// Patches that have yet to be reviewed for which you've been assigned as reviewer.
$ gerrit patches --not-reviewed --assigned

// Patches with featureX as the target branch, displayed in a vertical table format.
$ gerrit patches --branch featureX --vertical

// Patches that you've starred, displaying only the patch number, topic and subject.
$ gerrit patches --starred --format '%n %t %s'
```

### Checking out and reviewing patches

Let's say you run `gerrit patches` and get the following result.

```
Number  Topic   Branch  Owner  Updated   [...]
------  ------  ------  -----  --------  -----
12345   fixBug  master  cbush  Jun 13th  [...]
```

You can check out the patch using either the patch number `gerrit checkout
12345` or topic `gerrit checkout fixBug`. This command will fetch the latest
patch-set from the remote repository and properly name the local branch and
set the upstream.

Once you're done reviewing the code and testing the patch we can choose do run
one of the following commands from these examples:

- `gerrit review +1 -2 "Works well but needs code cleanup"`

- `gerrit submit "Merged with gusto."`

- `gerrit comment "Have you tested this on Android Sony Ericsson Devour Epic Z Prime?"`

- `gerrit abandon "Change of requirements."`

Unfortunately one of the only thing you can't do with gerrit-cli is leave inline
comments, you need to use Gerrit's web interface for that. This is however made
easier thanks to the `gerrit web` command which opens the web interface in your
default browser to the patch we currently have checked out.

# License

Copyright (c) 2013 Shane Smith

Licensed under the MIT license
