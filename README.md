[![npm](https://img.shields.io/npm/v/gerrit-cli.svg)](https://www.npmjs.com/package/gerrit-cli)
[![license](https://img.shields.io/github/license/shanesmith/gerrit-cli.svg)](https://github.com/shanesmith/gerrit-cli)
[![Build Status](https://travis-ci.org/shanesmith/gerrit-cli.svg?branch=master)](https://travis-ci.org/shanesmith/gerrit-cli)

# gerrit-cli

> Gerrit in your command lines.

gerrit-cli provides a command-line interface to the Gerrit code review system.
With it you can clone projects, push and checkout patches, assign reviewers,
and perform reviews all from the comfort of your shell.

It was born out of the annoyance of having to write out `git push origin
HEAD:refs/for/branch/topic` every time I wanted to push a patch. It's now just
`gerrit up`.


## Install

Install using NPM.

```sh
$ npm install -g gerrit-cli
```


**Tab completion**

Bash tab-completion is also available and can be enabled by adding the following
line to your `.bashrc` file.

```sh
source <(gerrit completion)
```
_Zsh completion is not yet available..._

**Requirements**

- NodeJS >= 0.12
- Git
- SSH

Tested with Gerrit 2.12.3, although most likely also works on older versions.


## Usage

gerrit-cli is composed of multiple sub-commands, much like git.

Run `gerrit help` for a list of the commands, and `gerrit help <command>` for
detailed help. Many commands also have shorter aliases listed in the help page.

### Commands

```
help            View help for specified command.
config          Manage server configurations
projects        Display available projects on server.
clone           Clone a project from server.
add-remote      Add project remote for existing repository.
install-hook    Installs the commit message hook.
patches         List details of patches on the server for the current project.
status          Show full details of a specific patch, including comments.
assign          Assign reviewers to the current patch.
up              Push patches of current topic to server for review.
draft           Push patches of current topic to server as drafts.
checkout        Fetch and checkout topic branch from server.
recheckout      Re-checkout current topic.
ssh             Run arbitrary gerrit command on server.
review          Post a review for the current topic.
submit          Submit the current topic for merging.
abandon         Abandon the current topic.
comment         Post a comment on the current topic.
ninja           Push patch to server then immediately submit for merging.
web             Open browser to gerrit web page for current patch.
completion      Enables tab completion for gerrit-cli.
topic           Create new topic branch.
clean           Cleans out merged topic branches.
squad           Manage squads of reviewers.
```


### Feature Walkthrough

First we need to tell gerrit-cli about our server.

```sh
$ gerrit config

# Creating new configuration for "default"
# ? Host (ex: example.com) sprockets.com
# ? Port 29418
# ? User george
```

Now let's clone a project. Note how the commit-msg hook is automatically
installed at the end.

```sh
$ gerrit clone killer-app

# ? Clone to which folder? killer-app
# Cloning project killer-app from default config into folder killer-app...
# ...
# Installing commit-msg hook...
```

Now we want to start working on a topic branch. 

gerrit-cli has one requirement in order to track your work: your local topic
branch needs to track the upstream branch that it is intended to merge
into.

We'll use the `topic` command here, which will simply create a branch that will
track the current branch's upstream.

```sh
$ gerrit topic lasers

# Branch lasers set up to track remote branch master from origin.
```

`gerrit-cli` commands act on the current topic branch, which is now "lasers".

It's time to crank out some code.

```sh
$ vim shark.js

# Hack, hack, hack...

$ git commit -m "Added fricken lasers"
```

Let's create a patch for review on the server for this commit.

```sh
$ gerrit up

# Pushing to origin (refs/for/master/lasers)
# remote:
# remote: New Changes:
# remote:   https://sprockets.com/gerrit/57420 Added fricken lasers
# remote:
# To ssh://sprockets.com:29418/killer-app.git
#  * [new branch]      HEAD -> refs/for/master/lasers
```

Now we'll want to add some reviewers. Let's say that we know we'll often be
assigning the same set of reviewers, we can create a squad to group them.

```sh
$ gerrit squad set dudes jmartin cbush

# Reviewer(s) "jmartin, cbush" set to squad "dudes".

$ gerrit assign @dudes slevasseur

# Assigned reviewer jmartin
# Assigned reviewer cbush
# Assigned reviewer slevasseur
```

Let's finish up by reviewing someone else's patch. We can view what patches are
on the server with the `patches` command, we'll add some filter flags for our
use right now.

```sh
$ gerrit patches --not-reviewed --assigned

# Number  Topic   Branch  Owner    Updated 
# ------  ------  ------  -----    --------
# 123456  fixBug  master  cbush    Mar 14th
# 713705  soleil  master  jmartin  Sep 3rd
```

We'll check out the first patch.

```sh
$ gerrit checkout fixBug

# Getting latest patchset...
# Refspec is refs/changes/56/123456/1
```

Now that we have the topic branch checked out we can run our tests on it, then
leave our review.

```sh
$ gerrit review 1 -1 "Bug is fixed, but needs more cow bells."

# Reviews have been posted successfully.
```

If we want to leave an inline review comment that can't be done through this
tool, however you can quickly navigate to the web interface.

```sh
$ gerrit web
```

This concludes the walkthrough! If your legs are tired why don't you sit down
and read through `gerrit help` for more options and advanced use.


# License

Copyright (c) Shane Smith. Distributed under the MIT license.
