"use strict";

var helpers = require("./helpers");
var sandboxEach = helpers.sandboxEach;

var _ = require("lodash");
var fs = require("fs");
var spawn = require("cross-spawn");
var mock_spawn = require("mock-spawn");

var git = require("../lib/git");

describe("git", function() {

  describe("GitError", function() {

    it("should be an Error", function() {
      expect(git.GitError).to.inheritsfrom(Error);
    });

    it("should accept code, command, output and error parameter", function() {
      var err = new git.GitError(12, "command", "output", "error");
      expect(err.code).to.equal(12);
      expect(err.command).to.equal("command");
      expect(err.output).to.equal("output");
      expect(err.error).to.equal("error");
    });

  });

  describe("exec()", function() {

    sandboxEach(function(sandbox) {

      sandbox.stub(spawn, "sync").returns({status: 0, stdout: "output\n", stderr: "error\n"});

    });

    it("should execute the command", sinon.test(function() {

      var output = git.exec("command");

      expect(spawn.sync).to.have.been.calledWith("git", ["command"]);

      // without trailing newline
      expect(output).to.equal("output");

    }));

    it("should format command as arguments", sinon.test(function() {

      git.exec("command", "one");
      git.exec("command", ["two", "two"]);
      git.exec(["command", "three"]);
      git.exec(["command", ["four", "four"]]);

      expect(spawn.sync).to.have.been.calledWith("git", ["command", "one"]);
      expect(spawn.sync).to.have.been.calledWith("git", ["command", "two", "two"]);
      expect(spawn.sync).to.have.been.calledWith("git", ["command", "three"]);
      expect(spawn.sync).to.have.been.calledWith("git", ["command", "four", "four"]);

    }));

    it("should throw an error if the command fails", sinon.test(function() {

      spawn.sync.returns({
        status: 1,
        stdout: "stdout\n",
        stderr: "stderr\n"
      });

      expect(_.partial(git.exec, "command")).to.throw(git.GitError);

    }));

  });

  describe("execSuccess()", function() {

    it("should return true if the command succeeds", sinon.test(function() {

      this.stub(git, "run").returns({status: 0});

      expect(git.execSuccess("command")).to.be.true;

    }));

    it("should return false if the command fails", sinon.test(function() {

      this.stub(git, "run").returns({status: 1});

      expect(git.execSuccess("command")).to.be.false;

    }));

  });

  describe("show()", function() {

    var spawn;

    sandboxEach(function(sandbox) {
      spawn = mock_spawn();
      sandbox.stub(spawn, "spawn", spawn);
    });

    it("should show the runing command");

  });

  describe("inRepo()", function() {

    it("should return whether the current directory is a repositoru", sinon.test(function() {

      this.stub(git, "execSuccess").withArgs("rev-parse", "--git-dir").returns(true);

      expect(git.inRepo()).to.be.true;

    }));

  });

  describe("dir()", function() {

    it("should return the git repository directory", sinon.test(function() {

      this.stub(git, "exec").withArgs("rev-parse", "--git-dir").returns("/path/to/dir");

      expect(git.dir()).to.equal("/path/to/dir");

    }));

  });

  describe("isDetachedHead()", function() {

    sandboxEach(function(sandbox) {
      sandbox.stub(git, "dir").returns("/path/to/dir");
      sandbox.stub(fs, "lstatSync").returns({
        isSymbolicLink: _.constant(false)
      });
    });

    it("should return false if HEAD is a symbolic link", sinon.test(function() {

      fs.lstatSync.returns({
        isSymbolicLink: _.constant(true)
      });

      expect(git.isDetachedHead()).to.be.false;

    }));

    it("should return false if HEAD is a reference", sinon.test(function() {

      this.stub(fs, "readFileSync").returns("ref: refs/heads/master");

      expect(git.isDetachedHead()).to.be.false;

    }));

    it("should return true if HEAD is not a reference", sinon.test(function() {

      this.stub(fs, "readFileSync").returns("abc123hash");

      expect(git.isDetachedHead()).to.be.true;

    }));

  });

  describe("isIndexClean()", function() {

    it("should return whether the index is clean", sinon.test(function() {

      this.stub(git, "execSuccess").withArgs("diff-index", "--no-ext-diff", "--quiet", "--exit-code", "HEAD").returns(true);

      expect(git.isIndexClean()).to.be.true;

    }));

  });

  describe("hashFor", function() {

    it("should return the hash for the provided reference", sinon.test(function() {

      this.stub(git, "exec").withArgs("rev-list", "--max-count=1", "ref").returns("hash");

      expect(git.hashFor("ref")).to.equal("hash");

    }));

  });

  describe("revList", function() {

    it("should return a list of revisions", sinon.test(function() {

      this.stub(git, "exec").withArgs("rev-list", "target", "^excludeTarget").returns("one\ntwo\nthree");

      expect(git.revList("target", "excludeTarget")).to.deep.equal(["one", "two", "three"]);

    }));

  });

  describe("describeHash", function() {

    it("should return a decription of the hash", sinon.test(function() {

      this.stub(git, "exec").withArgs("show", "--no-patch", "--format=%h %s", "hash").returns("description");

      expect(git.describeHash("hash")).to.be.equal("description");

    }));

  });

  describe("commitInfo", function() {

    it("should return commit info", sinon.test(function() {

      this.stub(git, "exec").withArgs("show", "--no-patch", "--format=format", "hash").returns("info");

      expect(git.commitInfo("hash", "format")).to.be.equal("info");

    }));

  });

  describe("getChangeId", function() {
    it("should return the commit's ChangeId", sinon.test(function() {

      this.stub(git, "exec").withArgs("show", "--no-patch", "--format=%b", "hash").returns("blah blah\nChange-Id: Iabc123\nblah blah");

      expect(git.getChangeId("hash")).to.equal("Iabc123");

    }));
  });

  describe("config", function() {

    describe("config()", function() {

      sandboxEach(function(sandbox) {
        sandbox.stub(git.config, "get", _.noop);
        sandbox.stub(git.config, "set", _.noop);
      });

      it("should get the values if ('key')", sinon.test(function() {

        git.config("key");

        expect(git.config.get).to.have.been.calledWith("key");

      }));

      it("should get the values if ('key', {options})", sinon.test(function() {

        git.config("key", {option: "option"});

        expect(git.config.get).to.have.been.calledWith("key", {option: "option"});

      }));

      it("should set the values if ('key', 'value')", sinon.test(function() {

        git.config("key", "value");

        expect(git.config.set).to.have.been.calledWith("key", "value");

      }));

      it("should set the values if ('key', 'value', {options})", sinon.test(function() {

        git.config("key", "value", {option: "option"});

        expect(git.config.set).to.have.been.calledWith("key", "value", {option: "option"});

      }));

      it("should set the values if ('key', [value])", sinon.test(function() {

        git.config("key", ["value"]);

        expect(git.config.set).to.have.been.calledWith("key", ["value"]);

      }));

      it("should set the values if ('key', [value], {options})", sinon.test(function() {

        git.config("key", ["value"], {option: "option"});

        expect(git.config.set).to.have.been.calledWith("key", ["value"], {option: "option"});

      }));

    });

    describe("get()", function() {

      it("should get the config", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", [], "key").returns("value");

        expect(git.config.get("key")).to.equals("value");

      }));

      it("should get the local config if local option is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--local"], "key").returns("value");

        expect(git.config.get("key", {local: true})).to.equal("value");

      }));

      it("should get the global config if options is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--global"], "key").returns("value");

        expect(git.config.get("key", {global: true})).to.equal("value");

      }));

      it("should get all config values if the all option is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--get-all"], "key").returns("one\ntwo\nthree");

        expect(git.config.get("key", {all: true})).to.deep.equal(["one", "two", "three"]);

      }));

      it("should get matching config values if the regex flag is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--get-regexp"], "key").returns("k-one v-one\nk-two v-two\nk-two v-three");

        expect(git.config.get("key", {regex: true})).to.deep.equal({
          "k-one": ["v-one"],
          "k-two": ["v-two", "v-three"]
        });

      }));

      it("should return null if there are no config values", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", [], "key").throws("error");

        expect(git.config.get("key")).to.be.null;

      }));

      it("should return an empty array if there are no config values and the all flag is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--get-all"], "key").throws("error");

        expect(git.config.get("key", {all: true})).to.deep.equal([]);

      }));

      it("should return an empty array if there are no config values and the regex flag is set", sinon.test(function() {

        this.stub(git, "exec").withArgs("config", ["--get-regexp"], "key").throws("error");

        expect(git.config.get("key", {regex: true})).to.deep.equal([]);

      }));

    });

    describe("set()", function() {

      sandboxEach(function(sandbox) {
        sandbox.stub(git, "exec", _.noop);
        sandbox.stub(git.config, "unset", _.noop);
      });

      it("should set the value", sinon.test(function() {

        git.config.set("key", "value");

        expect(git.config.unset).to.have.been.calledWith("key");

        expect(git.exec).to.have.been.calledWith("config", ["--add"], "key", "value");

      }));

      it("should set multiple values", sinon.test(function() {

        git.config.set("key", ["one", "two"]);

        expect(git.config.unset).to.have.been.calledWith("key");

        expect(git.exec).to.have
          .been.calledWith("config", ["--add"], "key", "one")
          .and.calledWith("config", ["--add"], "key", "two");

      }));

      it("should set the local config if the local option is set", sinon.test(function() {

        git.config.set("key", "value", {local: true});

        expect(git.config.unset).to.have.been.calledWith("key", sinon.match({local: true}));

        expect(git.exec).to.have.been.calledWith("config", ["--local", "--add"], "key", "value");

      }));

      it("should set the global config if the global option is set", sinon.test(function() {

        git.config.set("key", "value", {global: true});

        expect(git.config.unset).to.have.been.calledWith("key", sinon.match({global: true}));

        expect(git.exec).to.have.been.calledWith("config", ["--global", "--add"], "key", "value");

      }));

      it("should add a config if the add option is set", sinon.test(function() {

        git.config.set("key", "value", {add: true});

        expect(git.config.unset).to.have.not.been.called;

        expect(git.exec).to.have.been.calledWith("config", ["--add"], "key", "value");

      }));

      it("should set unique values if the unique option is set", sinon.test(function() {

        this.stub(git.config, "get").withArgs("key", sinon.match({all: true})).returns(["b", "c"]);

        var values = git.config.set("key", ["a", "b", "c", "d"], {add: true, unique: true});

        expect(git.config.unset).to.have.not.been.called;

        expect(git.exec).to.have
          .been.calledWith("config", ["--add"], "key", "a")
          .and.calledWith("config", ["--add"], "key", "d")
          .and.not.calledWith("config", ["--add"], "key", "b")
          .and.not.calledWith("config", ["--add"], "key", "c");

        expect(values).to.deep.equal(["a", "d"]);

      }));

    });

    describe("add()", function() {

      it("should add the value to the config", sinon.test(function() {

        this.stub(git.config, "set", _.noop);

        git.config.add("key", "value");

        expect(git.config.set).to.have.been.calledWith("key", "value", {add: true});

      }));

    });

    describe("unset()", function() {

      it("should unset the config", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.config.unset("key");

        expect(git.exec).to.have.been.calledWith("config", "--unset-all", [], "key");

      }));

    });

    describe("unsetMatching()", function() {

      it("should unset matching values", sinon.test(function() {

        this.stub(git.config, "get").withArgs("key", sinon.match({all: true})).returns(["a", "b", "c", "d"]);

        this.stub(git, "exec", _.noop);

        var values = git.config.unsetMatching("key", ["b", "c", "q"]);

        expect(git.exec).to.have
          .been.calledWith("config", "--unset", [], "key", "^b$")
          .and.calledWith("config", "--unset", [], "key", "^c$")
          .and.not.calledWith("config", "--unset", [], "key", "^a$")
          .and.not.calledWith("config", "--unset", [], "key", "^d$")
          .and.not.calledWith("config", "--unset", [], "key", "^q$");

        expect(values).to.deep.equal(["b", "c"]);

      }));

    });

    describe("subsections()", function() {

      it("should return a list of config subsections fr the provided section", sinon.test(function() {

        this.stub(git, "config").withArgs("^section\\.", {regex: true}).returns({
          "section.one.foo": ["a", "b"],
          "section.two.foo": ["c"],
          "section.three.foo": ["d"]
        });

        expect(git.config.subsections("section")).to.deep.equal(["one", "two", "three"]);

      }));

    });

    describe("removeSection()", function() {

      it("should remove the section", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.config.removeSection("section");

        expect(git.exec).to.have.been.calledWith("config", "--remove-section", [], "section");

      }));

    });

    describe("renameSection()", function() {

      it("should rename the section", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.config.renameSection("section", "newsection");

        expect(git.exec).to.have.been.calledWith("config", "--rename-section", [], "section", "newsection");

      }));

    });

    describe("sectionExists()", function() {

      it("should return whether the section exists", sinon.test(function() {

        this.stub(git.config, "get").withArgs("^section\\.").returns(["a"]);

        expect(git.config.sectionExists("section")).to.be.true;

      }));

    });

  });

  describe("branch", function() {

    describe("name", function() {

      it("should return the reference's branch name", sinon.test(function() {

        this.stub(git, "exec").withArgs("symbolic-ref", "--quiet", "--short", "ref").returns("branch");

        expect(git.branch.name("ref")).to.equal("branch");

      }));

      it("should return the HEAD's branch name if no reference is provided", sinon.test(function() {

        this.stub(git, "exec").withArgs("symbolic-ref", "--quiet", "--short", "HEAD").returns("branch");

        expect(git.branch.name()).to.equal("branch");

      }));

    });

    describe("exists", function() {

      it("should return whether the branch exists", sinon.test(function() {

        this.stub(git, "execSuccess").withArgs("show-ref", "--verify", "--quiet", "refs/heads/branch").returns(true);

        expect(git.branch.exists("branch")).to.be.true;

      }));

    });

    describe("remove", function() {

      it("should remove the named branch", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.branch.remove("branch");

        expect(git.exec).to.have.been.calledWith("branch", "-D", "branch");

      }));

    });

    describe("create", function() {

      it("should create the branch", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.branch.create("branch", "start");

        expect(git.exec).to.have.been.calledWith("branch", "branch", "start");

      }));

      it("should create the branch starting at HEAD if no starting point provided", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.branch.create("branch");

        expect(git.exec).to.have.been.calledWith("branch", "branch", "HEAD");

      }));

      it("should create and checkout the new branch if the parameter is set", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.branch.create("branch", "start", true);

        expect(git.exec).to.have.been.calledWith("checkout", "-b", "branch", "start");

      }));

    });

    describe("hasUpsteam", function() {

      it("should return whether the branch has an upstream", sinon.test(function() {

        this.stub(git, "execSuccess").withArgs("rev-parse", "--verify", "branch@{u}").returns(true);

        expect(git.branch.hasUpstream("branch")).to.be.true;

      }));

    });

    describe("setUpstream", function() {

      it("should set the upstream", sinon.test(function() {

        this.stub(git, "exec", _.noop);

        git.branch.setUpstream("branch", "upstream");

        expect(git.exec).to.have.been.calledWith("branch", "--set-upstream-to", "upstream", "branch");

      }));

    });

    describe("upstream", function() {

      it("should return the upstream", sinon.test(function() {

        this.stub(git, "exec").withArgs("rev-parse", "--symbolic-full-name", "--abbrev-ref", "branch@{u}").returns("upstream");

        expect(git.branch.upstream("branch")).to.equal("upstream");

      }));

    });

    describe("isRemote", function() {

      it("should return whether the branch is remote", sinon.test(function() {

        this.stub(git, "execSuccess").withArgs("rev-parse", "--verify", "refs/remotes/branch").returns(true);

        expect(git.branch.isRemote("branch")).to.be.true;

      }));

    });

    describe("parsedRemote", function() {

      it("should return the parsed remote branch", sinon.test(function() {

        expect(git.branch.parsedRemote("upstream/branch")).to.deep.equal({remote: "upstream", branch: "branch"});

      }));

    });

    describe("list", function() {

      it("shoud return the list of branches", sinon.test(function() {

        this.stub(git, "exec").withArgs("for-each-ref", "--format=%(refname:short)", "refs/heads/").returns("A\nB\nC");

        expect(git.branch.list()).to.deep.equal(["A", "B", "C"]);

      }));

    });


  });

});
