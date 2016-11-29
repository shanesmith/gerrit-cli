"use strict";

var helpers = require("./helpers");
var sandboxEach = helpers.sandboxEach;

var _ = require("lodash");
var Q = require("bluebird");
var fs = require("fs-extra");

var git = require("../lib/git");
var gerrit = require("../lib/gerrit");
var prompter = require("../lib/prompter");
var gerrit_ssh = require("../lib/gerrit-ssh");

describe("gerrit", function() {

  var requirementTestDef = {

    "inRepo": function(fn) {

      it("should reject if not in a git repository", function() {

        git.inRepo.returns(false);

        return expect(fn()).to.be.rejectedWith(gerrit.GerritError);

      });

    },

    "cleanIndex": function(fn) {

      it("should reject if the index is not clean", function() {

        git.isIndexClean.returns(false);

        return expect(fn()).to.be.rejectedWith(gerrit.GerritError);

      });

    }

  };

  var testRequirements = function(requirements, fn) {
    requirements.forEach(function(req) {
      requirementTestDef[req](fn);
    });
  };

  sandboxEach(function(sandbox) {

    sandbox.stub(git, "inRepo").returns(true);

    sandbox.stub(git, "isIndexClean").returns(true);

  });


  describe("GerritError", function() {

    it("should be an Error", function() {
      expect(gerrit.GerritError).to.inheritsfrom(Error);
    });

    it("should set a message", function() {
      var err = new gerrit.GerritError("message");
      expect(err.message).to.equal("message");
    });

    it("should format a message-array", function() {
      var err = new gerrit.GerritError(["message %s", "foo"]);
      expect(err.message).to.equal("message foo");
    });

  });

  describe("parseRemote()", function() {

    testRequirements(["inRepo"], gerrit.parseRemote);

    it("should return the parsed remote url", sinon.test(function() {

      this.stub(git, "config");

      var urls = { 
        "user@example.com:foo/bar.git": {
          host: "example.com",
          port: null,
          user: "user",
          project: "foo/bar"
        },
        "example.com:foo/bar.git": {
          host: "example.com",
          port: null,
          user: null,
          project: "foo/bar" 
        },
        "ssh://user@example.com:1234/foo/bar.git": {
          host: "example.com",
          port: "1234",
          user: "user",
          project: "foo/bar"
        },
        "ssh://example.com/foo/bar.git": {
          host: "example.com",
          port: null,
          user: null,
          project: "foo/bar"
        }
      };

      return Q.map(Object.keys(urls), function(url, index) {
        var remote = "remote_" + index;

        var expectedObj = _.defaults({}, urls[url], {
          name: remote
        });

        git.config.withArgs("remote." + remote + ".url").returns(url);

        return expect(gerrit.parseRemote(remote), url).to.eventually.deep.equal(expectedObj);

      });

    }));

    it("should use the remote 'origin' is none provided", sinon.test(function() {

      this.stub(git, "config").returns("ssh://user@example.com/foo/bar.git");

      return gerrit.parseRemote()
        .then(function() {

          expect(git.config).to.have.been.calledWith("remote.origin.url");

        });

    }));

    it("should reject if the provided remote does not exits", sinon.test(function() {

      this.stub(git, "config").returns(null);

      var promise = gerrit.parseRemote("remote");

      return expect(promise).to.have.been.rejectedWith(gerrit.GerritError);

    }));

  });

  describe("allConfigs()", function() {

    it("should return the config for all remote config", sinon.test(function() {

      this.stub(git, "config").returns({
        "gerrit.one.host": null,
        "gerrit.two.host": null,
        "gerrit.three.host": null
      });

      this.stub(gerrit, "config", function(name) {
        return name + "_config";
      });

      return expect(gerrit.allConfigs()).to.eventually.deep.equal({
        "one": "one_config",
        "two": "two_config",
        "three": "three_config"
      });

    }));

  });

  describe("configExists()", function() {

    it("should return true if the config exists", sinon.test(function() {

      this.stub(git, "config").returns({"foo": null});

      return expect(gerrit.configExists("foo")).to.eventually.equal(true);

    }));

    it("should return false if the config does not exits", sinon.test(function() {

      this.stub(git, "config").returns({});

      return expect(gerrit.configExists("foo")).to.eventually.equal(false);

    }));

  });

  describe("config()", function() {

    it("should reject if the config does not exist and values are not given", sinon.test(function() {

      this.stub(git, "config").returns({});

      return expect(gerrit.config("foo")).to.be.rejectedWith(gerrit.GerritError);

    }));

    it("should return the config for the given name", sinon.test(function() {

      this.stub(git, "config").returns({
        "gerrit.foo.un": "one",
        "gerrit.foo.deux": "two",
        "gerrit.foo.trois": "three"
      });

      return expect(gerrit.config("foo")).to.eventually.deep.equal({
        "name": "foo",
        "un": "one",
        "deux": "two",
        "trois": "three"
      });

    }));

    it("should set the config with values if provided", sinon.test(function() {

      this.stub(git, "config").returns({});

      var values = {
        "un": "one",
        "deux": "two",
        "trois": "three"
      };

      return gerrit.config("foo", values).then(function(config) {

        expect(config).to.deep.equal({
          "name": "foo",
          "un": "one",
          "deux": "two",
          "trois": "three"
        });

        expect(git.config).to.have
          .been.calledWith("gerrit.foo.un", "one", {global: true})
          .and.calledWith("gerrit.foo.deux", "two", {global: true})
          .and.calledWith("gerrit.foo.trois", "three", {global: true});

      });

    }));

    it("should override values if they previously exist", sinon.test(function() {

      this.stub(git, "config").returns({
        "gerrit.foo.un": "one",
        "gerrit.foo.deux": "two",
        "gerrit.foo.trois": "three"
      });

      var values = {
        "deux": "zwei",
        "quatre": "vier"
      };

      return gerrit.config("foo", values).then(function(config) {

        expect(config).to.deep.equal({
          "name": "foo",
          "un": "one",
          "deux": "zwei",
          "trois": "three",
          "quatre": "vier"
        });

        expect(git.config).to.have
          .been.calledWith("gerrit.foo.deux", "zwei", {global: true})
          .and.calledWith("gerrit.foo.quatre", "vier", {global: true});

      });

    }));

  });

  describe("projects()", function() {

    it("should return a list of projects", sinon.test(function() {

      this.stub(gerrit, "config").resolves({foo: "bar"});

      this.stub(gerrit_ssh, "run").resolves("foo\nbar\nxyzzy");

      return expect(gerrit.projects("project")).to.eventually.deep.equal(["foo", "bar", "xyzzy"]);

    }));

  });

  describe("clone()", function() {

    sandboxEach(function(sandbox) {

      sandbox.stub(gerrit, "config").resolves({
        user: "user",
        host: "host",
        port: "1234"
      });

      sandbox.stub(fs, "existsSync").returns(false);

    });

    it("should throw if the destination exists", sinon.test(function() {

      fs.existsSync.returns(true);

      return expect(gerrit.clone()).to.be.rejectedWith(gerrit.GerritError);

    }));

    it("should clone the project into the destination folder", sinon.test(function() {

      this.stub(git, "show").resolves(null);

      this.stub(process, "chdir", _.noop);

      this.stub(git, "config", _.noop);

      this.stub(gerrit, "installHook").resolves(null);

      return gerrit.clone("gerrit", "project", "destination").then(function() {

        expect(git.show).to.have.been.calledWith(["clone", "--progress", "ssh://user@host:1234/project.git", "destination"]);

        expect(process.chdir).to.have.been.calledWith("destination");

        expect(git.config).to.have.been.calledWith("remote.origin.gerrit", "gerrit");

        expect(gerrit.installHook).to.have.been.calledWith("origin");

      });

    }));

    it("should use the project name as the destination folder if none provided", sinon.test(function() {

      this.stub(git, "show").resolves(null);

      this.stub(process, "chdir", _.noop);

      this.stub(git, "config", _.noop);

      this.stub(gerrit, "installHook").resolves(null);

      return gerrit.clone("gerrit", "project").then(function() {

        expect(git.show).to.have.been.calledWith(["clone", "--progress", "ssh://user@host:1234/project.git", "project"]);

        expect(process.chdir).to.have.been.calledWith("project");

        expect(git.config).to.have.been.calledWith("remote.origin.gerrit", "gerrit");

        expect(gerrit.installHook).to.have.been.calledWith("origin");

      });

    }));

  });

  describe("installHook()", function() {

    testRequirements(["inRepo"], gerrit.installHook);

    it("should install the commit-msg hook", sinon.test(function() {

      this.stub(gerrit, "parseRemote").resolves({foo: "bar"});

      this.stub(git, "dir").returns("the/git/dir");

      this.stub(fs, "mkdirpSync", _.noop);

      this.stub(gerrit_ssh, "scp").resolves(null);

      return gerrit.installHook("remote")
        .then(function() {

          expect(gerrit.parseRemote).to.have.been.calledWith("remote");

          expect(fs.mkdirpSync).to.have.been.calledWith("the/git/dir/hooks");

          expect(gerrit_ssh.scp).to.have.been.calledWith("hooks/commit-msg", "the/git/dir/hooks", {foo: "bar"});

        });

    }));

  });

  describe("ssh()", function() {

    testRequirements(["inRepo"], gerrit.ssh);

    it("should run the provided command", sinon.test(function() {

      this.stub(gerrit, "parseRemote").resolves({foo: "bar"});

      this.stub(gerrit_ssh, "run").resolves(null);

      return gerrit.ssh("command", "remote")
        .then(function() {

          expect(gerrit_ssh.run).to.have.been.calledWith("command", {foo: "bar"});

        });

    }));

  });

  describe("ssh_query()", function() {

    testRequirements(["inRepo"], gerrit.ssh);

    it("should run the provided query", sinon.test(function() {

      this.stub(gerrit, "parseRemote").resolves({foo: "bar"});

      this.stub(gerrit_ssh, "query").resolves(null);

      return gerrit.ssh_query("query", "remote")
        .then(function() {

          expect(gerrit_ssh.query).to.have.been.calledWith("query", {foo: "bar"});

        });

    }));


  });

  describe("patches()", function() {

    testRequirements(["inRepo"], gerrit.ssh);

    it("should query for patches", sinon.test(function() {

      this.stub(gerrit, "parseRemote").resolves({project: "project"});

      this.stub(gerrit_ssh, "query").resolves(null);

      return gerrit.patches({query: "query"}, "remote")
        .then(function() {

          expect(gerrit_ssh.query).to.have.been.calledWith({
            status: "open",
            project: "project",
            query: "query"
          });

        });

    }));

  });

  describe("assign()", function() {

    testRequirements(["inRepo"], gerrit.ssh);

    it("should assign reviewers to the patch list", sinon.test(function() {

      var revList = ["revOne", "revTwo"];

      var reviewers = ["reviewer-one", "@squad", "reviewer-two"];

      var reviewersExpanded = ["reviewer-one", "squad-one", "squad-two", "reviewer-two"];

      this.stub(gerrit.squad, "get").returns(["squad-one", "squad-two"]);

      this.stub(gerrit, "parseRemote").resolves({foo: "bar"});

      var callIndex = 0;
      this.stub(gerrit_ssh, "run", function() {
        callIndex++;

        if (callIndex % 4 === 0) {
          return Q.reject();
        }

        return Q.resolve();
      });

      return gerrit.assign(revList, reviewers, "remote")
        .then(function(result) {

          expect(gerrit.squad.get).to.have.been.calledWith("squad");

          revList.forEach(function(hash) {
            reviewersExpanded.forEach(function(reviewer) {

              expect(gerrit_ssh.run).to.have.been.calledWith(["set-reviewers --add '%s' -- %s", reviewer, hash], {foo: "bar"});

            });
          });

          expect(result).to.deep.equal([
            [
              {success: true, reviewer: "reviewer-one"},
              {success: true, reviewer: "squad-one"},
              {success: true, reviewer: "squad-two"},
              {success: false, reviewer: "reviewer-two"}
            ],[
              {success: true, reviewer: "reviewer-one"},
              {success: true, reviewer: "squad-one"},
              {success: true, reviewer: "squad-two"},
              {success: false, reviewer: "reviewer-two"}
            ]
          ]);

        });

    }));

  });

  describe("up()", function() {

    testRequirements(["inRepo"], gerrit.up);

    sandboxEach(function(sandbox) {

      sandbox.stub(git.branch, "hasUpstream").returns(true);

      sandbox.stub(git.branch, "isRemote").returns(true);

      sandbox.stub(git.branch, "upstream").returns("upstream/branch");

      sandbox.stub(git.branch, "parsedRemote").returns({branch: "p-branch", remote: "p-remote"});

      sandbox.stub(git.branch, "name").returns("topic");

      sandbox.stub(git, "config").returns("");

      sandbox.stub(gerrit, "parseRemote").returns({name: "remote-name"});

      sandbox.stub(git, "show").resolves();

    });

    it("should reject if the topic does not have an upstream", sinon.test(function() {

      git.branch.hasUpstream.returns(false);

      return expect(gerrit.up()).to.be.rejectedWith(gerrit.GerritError);

    }));

    it("should reject if the upstream branch is not remote", sinon.test(function() {

      git.branch.isRemote.returns(false);

      return expect(gerrit.up()).to.be.rejectedWith(gerrit.GerritError);

    }));

    it("should push the current patch", sinon.test(function() {

      return gerrit.up()
        .then(function() {

          expect(git.show).to.have.been.calledWith(["push", "remote-name", "HEAD:refs/for/p-branch/topic"]);

          expect(git.config).to.not.have.been.calledWith("branch.topic.draft", "yes");

        });

    }));

    it("should draft the current patch if specified", sinon.test(function() {

      return gerrit.up(null, null, true)
        .then(function() {

          expect(git.show).to.have.been.calledWith(["push", "remote-name", "HEAD:refs/drafts/p-branch/topic"]);

          expect(git.config).to.have.been.calledWith("branch.topic.draft", "yes");
          
        });

    }));

    it("should prompt to undraft", sinon.test(function() {

      git.config.returns("yes");

      this.stub(git.config, "unset", _.noop);

      this.stub(prompter, "confirm").resolves(true);

      return gerrit.up()
        .then(function() {

          expect(git.show).to.have.been.calledWith(["push", "remote-name", "HEAD:refs/for/p-branch/topic"]);

          expect(git.config.unset).to.have.been.called; //With("branch.topic.draft");

        });

    }));

  });

  describe("checkout()", function() {

    testRequirements(["inRepo", "cleanIndex"], gerrit.checkout);

    sandboxEach(function(sandbox) {

      sandbox.stub(gerrit, "parseRemote").returns({name: "remote-name"});

      sandbox.stub(gerrit_ssh.query, "number").returns([]);

      sandbox.stub(gerrit_ssh.query, "topic").returns([{topic: "topic", number: "1234", branch: "branch"}]);

      sandbox.stub(git, "exec").returns(null);

      sandbox.stub(git.branch, "exists").returns(false);

      sandbox.stub(git.branch, "create", _.noop);

      sandbox.stub(git.branch, "setUpstream", _.noop);

      sandbox.stub(git.branch, "remove", _.noop);

    });

    it("should checkout the topic", sinon.test(function() {

      return gerrit.checkout("topic", 1, false, "remote")
        .then(function() {

          expect(git.exec).to.have
            .been.calledWith("fetch '%s' '%s'", "remote-name", "refs/changes/34/1234/1")
            .and.calledWith("checkout FETCH_HEAD");

          expect(git.branch.create).to.have.been.calledWith("topic", "FETCH_HEAD", true);

          expect(git.branch.setUpstream).to.have.been.calledWith("topic", "remote-name/branch");

        });

    }));

    it("should checkout the patch number", sinon.test(function() {

      gerrit_ssh.query.number.returns([{topic: "topic", number: "4321", branch: "branch"}]);

      gerrit_ssh.query.topic.returns([]);

      return gerrit.checkout("4321", 1, false, "remote")
        .then(function() {

          expect(git.exec).to.have
            .been.calledWith("fetch '%s' '%s'", "remote-name", "refs/changes/21/4321/1")
            .and.calledWith("checkout FETCH_HEAD");

          expect(git.branch.create).to.have.been.calledWith("topic", "FETCH_HEAD", true);

          expect(git.branch.setUpstream).to.have.been.calledWith("topic", "remote-name/branch");

        });

    }));

    describe("with existing branch ", function() {

      it("should prompt and overwrite branch if answer is yes", sinon.test(function() {

        git.branch.exists
          .onFirstCall().returns(true)
          .onSecondCall().returns(false);

        this.stub(prompter, "confirm").resolves(true);

        return gerrit.checkout("topic", 1, false, "remote")
          .then(function() {

            expect(git.branch.remove).to.have.been.calledWith("topic");

            expect(git.branch.create).to.have.been.calledWith("topic", "FETCH_HEAD", true);

          });

      }));

      it("should prompt and not overwrite branch if answer is no", sinon.test(function() {

        git.branch.exists
          .onFirstCall().returns(true)
          .onSecondCall().returns(true);

        this.stub(prompter, "confirm").resolves(false);

        return gerrit.checkout("topic", 1, false, "remote")
          .then(function() {

            expect(git.branch.remove).to.not.have.been.calledWith("topic");

            expect(git.branch.create).to.not.have.been.calledWith("topic", "FETCH_HEAD", true);

          });

      }));

      it("should not prompt and should overwrite when forced", sinon.test(function() {

        git.branch.exists
          .onFirstCall().returns(true)
          .onSecondCall().returns(false);

        this.stub(prompter, "confirm", _.noop);

        return gerrit.checkout("topic", 1, true, "remote")
          .then(function() {

            expect(prompter.confirm).to.not.have.been.called;

            expect(git.branch.remove).to.have.been.calledWith("topic");

            expect(git.branch.create).to.have.been.calledWith("topic", "FETCH_HEAD", true);

          });

      }));

      it("should never overwrite if topic name is master", sinon.test(function() {

        git.branch.exists
          .onFirstCall().returns(true)
          .onSecondCall().returns(true);

        gerrit_ssh.query.topic.returns([{topic: "master", number: "1234", branch: "branch"}]);

        this.stub(prompter, "confirm", _.noop);

        return gerrit.checkout("master", 1, false, "remote")
          .then(function() {

            expect(prompter.confirm).to.not.have.been.called;

            expect(git.branch.remove).to.not.have.been.called;

            expect(git.branch.create).to.not.have.been.called;

          });

      }));

    });

    it("should fetch the latest patch set if none provided", sinon.test(function() {

      git.exec.withArgs("ls-remote '%s' '%s/*'").returns("refs/changes/34/1234/1\nrefs/changes/34/1234/2\nrefs/changes/34/1234/3");

      return gerrit.checkout("topic", null, false, "remote")
        .then(function() {

          expect(git.exec).to.have
            .been.calledWith("ls-remote '%s' '%s/*'", "remote-name", "refs/changes/34/1234")
            .and.calledWith("fetch '%s' '%s'", "remote-name", "refs/changes/34/1234/3");

        });

    }));

    it("should reject if the target is not found", sinon.test(function() {

      gerrit_ssh.query.number.returns([]);
      gerrit_ssh.query.topic.returns([]);

      return expect(gerrit.checkout("topic", 1, false, "remote")).to.be.rejectedWith(gerrit.GerritError);

    }));

    it("should prompt the user if the target is both a patch number and topic name", sinon.test(function() {

      gerrit_ssh.query.number.returns([{topic: "1234", number: "5678", branch: "branch"}]);
      gerrit_ssh.query.topic.returns([{topic: "topic", number: "1234", branch: "branch"}]);

      this.stub(prompter, "choose").resolves("topic");

      return gerrit.checkout("1234", 1, false, "remote")
        .then(function() {

          expect(prompter.choose).to.have.been.called;

        });

    }));

  });

  describe("review()", function() {

    testRequirements(["inRepo"], gerrit.review);

    sandboxEach(function(sandbox) {

      sandbox.stub(gerrit, "parseRemote").returns({name: "remote-name", project: "project"});

    });

    it("should send the review", sinon.test(function() {

      this.stub(gerrit_ssh, "run", _.noop);

      return gerrit.review("1234", "-1", "+2", "message", "submit", "remote")
        .then(function() {

          expect(gerrit_ssh.run).to.have.been.calledWith(["review", "--project 'project'", "--submit", "--verified '-1'", "--code-review '+2'", "--message 'message'", "1234"].join(" "), {name: "remote-name", project: "project"});

        });

    }));

  });

  describe("completion()", function() {

    it("should return the completion", sinon.test(function() {

      this.stub(fs, "readFileSync").returns("completion content");

      expect(gerrit.completion()).to.equals("completion content");

    }));

  });

  describe("topic()", function() {

    it("should create a topic branch and set it's upstream", sinon.test(function() { 

      this.stub(git.branch, "create").returns("q");
      this.stub(git.branch, "setUpstream").returns("q");

      gerrit.topic("topic", "upstream");

      expect(git.branch.create).to.have.been.calledWith("topic", "HEAD", true);

      expect(git.branch.setUpstream).to.have.been.calledWith("HEAD", "upstream");

    }));

    it("should use the current upstream if none given", sinon.test(function() {

      this.stub(git.branch, "create").returns("q");
      this.stub(git.branch, "setUpstream").returns("q");

      this.stub(git.branch, "upstream").returns("upstream");

      gerrit.topic("topic");

      expect(git.branch.create).to.have.been.calledWith("topic", "HEAD", true);

      expect(git.branch.setUpstream).to.have.been.calledWith("HEAD", "upstream");

    }));

  });

  describe("squad", function() {

    describe("get()", function() {

      it("should return the squad", sinon.test(function() {

        this.stub(git, "config").withArgs("gerrit-squad.name.reviewer", {local: true, all: true}).returns(["foo", "bar"]);

        expect(gerrit.squad.get("name")).to.deep.equal(["foo", "bar"]);

      }));

    });

    describe("getAll()", function() {

      it("should return all squads", sinon.test(function() {

        this.stub(git.config, "subsections").returns(["one", "two"]);

        this.stub(gerrit.squad, "get", function(squad) {
          return [squad + "-foo", squad + "-bar"];
        });

        expect(gerrit.squad.getAll()).to.deep.equal({
          "one": ["one-foo", "one-bar"],
          "two": ["two-foo", "two-bar"]
        });

      }));

    });

    describe("set()", function() {

      it("should set the squad to the reviewers", sinon.test(function() {

        this.stub(git.config, "set", _.noop);

        gerrit.squad.set("squad", ["foo", "bar"]);

        expect(git.config.set).to.have.been.calledWith("gerrit-squad.squad.reviewer", ["foo", "bar"]);

      }));

    });

    describe("add()", function() {

      it("should add reviewers to the squad", sinon.test(function() {

        this.stub(git.config, "add", _.noop);

        gerrit.squad.add("squad", ["foo", "bar"]);

        expect(git.config.add).to.have.been.calledWith("gerrit-squad.squad.reviewer", ["foo", "bar"], {unique: true});

      }));

    });

    describe("remove()", function() {

      it("should remove reviewers from the squad", sinon.test(function() {

        this.stub(git.config, "unsetMatching", _.noop);

        gerrit.squad.remove("squad", ["foo", "bar"]);

        expect(git.config.unsetMatching).to.have.been.calledWith("gerrit-squad.squad.reviewer", ["foo", "bar"]);

      }));

    });

    describe("delete()", function() {

      it("should delete the squad", sinon.test(function() {

        this.stub(git.config, "removeSection", _.noop);

        gerrit.squad.delete("squad");

        expect(git.config.removeSection).to.have.been.calledWith("gerrit-squad.squad");

      }));

    });

    describe("rename()", function() {

      it("should rename the squad", sinon.test(function() {

        this.stub(git.config, "renameSection", _.noop);

        gerrit.squad.rename("squad", "newsquad");

        expect(git.config.renameSection).to.have.been.calledWith("gerrit-squad.squad", "gerrit-squad.newsquad");

      }));

    });

    describe("exists()", function() {

      it("should return whether the squad exists", sinon.test(function() {

        this.stub(git.config, "sectionExists", _.noop);

        gerrit.squad.exists("squad");

        expect(git.config.sectionExists).to.have.been.calledWith("gerrit-squad.squad");

      }));


    });

  });
  
});
