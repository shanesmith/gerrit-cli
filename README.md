# gerrit-cli

> Gerrit in your command lines.

gerrit-cli provides a command-line interface to the Gerrit code review system.

It was born out of the frustration of having to write out
`git push orign HEAD:refs/for/branch/topic` every time and simplifies it to
just `gerrit up`.


## Install

```
$ npm install -g gerrit-cli
```

## Usage

gerrit-cli is composed of multiple sub-commands, much like git. Run `gerrit
help` for a list of the commands, and `gerrit help <command>` for detailed help
on the command.

Full documentation on usage to come later, but for now here are some examples.


```
$ gerrit config
Creating new configuration for "default"
[?] Host: example.com
[?] Port: 29418
[?] User: quigley

$ gerrit clone
[?] Clone which project? killer_app
[?] Clone to which folder? killer_app
Cloning project killer_app from default into folder killer_app...
remote: Counting objects: 5783, done
[...]
Setting up commit-msg hook...

$ cd killer_app

$ gerrit status
 Number:          68
 Owner Username:  lathrope
 Branch:          master
 Topic:           new_feature
 Created:         Mar 13th, 2015, 08:46 am
 Updated:         May 26th, 2015, 11:02 am
 Subject:         This feature will make us rich
 Review Status:   0 / 0
 Files:
     M  app.js  +1  -10

 Number:          71
 Owner Username:  quigley
 Branch:          master
 Topic:           refactor
 Created:         Apr 24th, 2015, 09:55 am
 Updated:         May 12th, 2015, 04:16 pm
 Subject:         Refactor all the things
 Review Status:   +1 / +2
 Files:
     A  app.js      +105  -0
     A  index.html  +62  -0

$ gerrit checkout new_feature
Getting latest patchset...
Refspec is refs/changes/68/68/2

$ gerrit review +1 -2 "Nice feature, but needs skub"

$ git checkout -b bugfix master

[hack, hack, hack]

$ git commit -am "Squash crazy bug"

$ gerrit up --assign lathrope

$ gerrit comment "First attempt at fixing bug, comments welcomed."
```


