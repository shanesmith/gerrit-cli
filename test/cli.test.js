"use strict";

var helpers = require("./helpers");

var _ = require("lodash");
var Q = require("bluebird");
var moment = require("moment");
var proxyquire = require("proxyquire");

var git = require("../lib/git");
var gerrit = require("../lib/gerrit");
var prompter = require("../lib/prompter");

var openSpy = sinon.spy();

var cli = proxyquire("../lib/cli", {
  open: openSpy
});

describe("cli", function() {

  var sandbox;

  var logSpy = helpers.setupLogSpy();

  var requirementTestDef = {

    "inRepo": function(fn) {

      it("should throw if not in a git repository", sinon.test(function() {

        git.inRepo.returns(false);

        expect(fn).to.throw(cli.CliError, "This command requires the working directory to be in a repository.");

      }));

    },

    "upstream": function(fn) {

      it("should throw if branch doesn't have an upstream", sinon.test(function() {

        git.branch.hasUpstream.returns(false);

        expect(fn).to.throw(cli.CliError, "Topic branch requires an upstream.");

      }));

    },

    "cleanIndex": function(fn) {

      it("should throw if index is dirty", sinon.test(function() {

        git.isIndexClean.returns(false);

        expect(fn).to.throw(cli.CliError, "There are uncommitted changes.");

      }));

    },

    "squadExists": function(fn) {

      it("should throw if the squad doesn't exist", sinon.test(function() {

        gerrit.squad.exists.returns(false);

        expect(_.partial(fn, "name")).to.throw(cli.CliError, "Squad \"name\" does not exist.");

      }));

    }

  };

  var testRequirements = function(requirements, fn) {
    requirements.forEach(function(req) {
      requirementTestDef[req](fn);
    });
  };


  beforeEach(function() {

    sandbox = sinon.sandbox.create();

    sandbox.stub(git, "inRepo").returns(true);

    sandbox.stub(git.branch, "hasUpstream").returns(true);

    sandbox.stub(git, "isIndexClean").returns(true);

    sandbox.stub(gerrit.squad, "exists").returns(true);

    openSpy.reset();

  });

  afterEach(function() {

    sandbox.restore();

  });

  describe("CliError", function() {

    it("should be an Error", function() {
      expect(cli.CliError).to.inheritsfrom(Error);
    });

    it("should set a message", function() {

      var err = new cli.CliError("foobar");

      expect(err.message).to.equal("foobar");

    });

    it("should format a message-array", function() {

      var err = new cli.CliError(["foo %s", "bar"]);

      expect(err.message).to.equal("foo bar");

    });

  });

  describe("config()", function() {

    it("should display named config", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "config").resolves({
        name: "foo",
        host: "host",
        user: "user",
        port: 1234
      });

      return cli.config("foo", {})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith("foo");

          expect(logSpy.info.output).to.equal([
            "name = foo",
            "host = host",
            "user = user",
            "port = 1234",
            ""
          ].join("\n"));

        });

    }));

    it("should display default config if none named", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "config").resolves({
        name: "foo",
        host: "host",
        user: "user",
        port: 1234
      });

      return cli.config(null, {})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith("default");

        });

    }));

    it("should display all configs", sinon.test(function() {

      this.stub(gerrit, "allConfigs").resolves({
        foo: {
          name: "foo",
          host: "foo_host",
          user: "foo_user",
          port: 1234
        },
        bar: {
          name: "bar",
          host: "bar_host",
          user: "bar_user",
          port: 5678
        }
      });

      return cli.config(null, {all: true})
        .then(function() {

          expect(logSpy.info.output).to.equal([
            "name = foo",
            "host = foo_host",
            "user = foo_user",
            "port = 1234",
            "",
            "name = bar",
            "host = bar_host",
            "user = bar_user",
            "port = 5678",
            ""
          ].join("\n"));

        });

    }));

    it("should prompt if creating a new config", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(false);

      this.stub(prompter, "prompt").resolves({
        host: "host",
        user: "user",
        port: 1234
      });

      this.spy(gerrit, "config");

      return cli.config("newconf", {})
        .then(function() {

          expect(prompter.prompt).to.have.been.calledWithMatch(sinon.match(function(val) {

            if (!_.isUndefined(val[0].default)) {
              return false;
            }

            if (val[1].default !== "29418") {
              return false;
            }

            if (!_.isUndefined(val[2].default)) {
              return false;
            }

            return true;

          }));


          expect(gerrit.config).to.have.been.calledWith("newconf", {
            host: "host",
            user: "user",
            port: 1234
          });

        });

    }));

    it("should prompt to edit an existing config", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "config").resolves({
        name: "foo",
        host: "host",
        user: "user",
        port: 1234
      });

      this.stub(prompter, "prompt").resolves({
        host: "new_host",
        user: "new_user",
        port: 5678
      });

      return cli.config("foo", {edit: true})
        .then(function() {

          expect(prompter.prompt).to.have.been.calledWithMatch(sinon.match(function(val) {

            if (val[0].default !== "host") {
              return false;
            }

            if (val[1].default !== 1234) {
              return false;
            }

            if (val[2].default !== "user") {
              return false;
            }

            return true;

          }));

          expect(gerrit.config).to.have.been.calledWith("foo", {
            host: "new_host",
            user: "new_user",
            port: 5678
          });

        });

    }));

  });

  describe("projects()", function() {

    it("should reject if the config doesn't exist", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(false);

      var promise = cli.projects({});

      return expect(promise).to.be.rejectedWith(cli.CliError);

    }));

    it("should use 'default' as the config name if none specified", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "projects").resolves(["foo"]);

      return cli.projects({})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith("default");

          expect(gerrit.projects).to.have.been.calledWith("default");

        });

    }));

    it("should output a list of projects", sinon.test(function() {

      var configName = "config";

      var projects = ["foo", "bar", "xyzzy"];

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "projects").resolves(projects);

      return cli.projects({config: configName})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith(configName);

          expect(gerrit.projects).to.have.been.calledWith(configName);

          expect(logSpy.info.output).to.equal(projects.join("\n"));

        });

    }));

  });

  describe("clone()", function() {

    it("should use 'default' as the config name if none specified", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "clone").resolves(null);

      return cli.clone("project", "destination", {})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith("default");

          expect(gerrit.clone).to.have.been.calledWith("default", "project", "destination");

        });

    }));

    it("should reject if the config doesn't exist", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(false);

      var promise = cli.clone(null, null, {});

      return expect(promise).to.be.rejectedWith(cli.CliError);

    }));

    it("should clone", sinon.test(function() {

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "clone").resolves(null);

      return cli.clone("project", "destination", {config: "config"})
        .then(function() {

          expect(gerrit.configExists).to.have.been.calledWith("config");

          expect(gerrit.clone).to.have.been.calledWith("config", "project", "destination");

        });

    }));

    it("should prompt for information if none given", sinon.test(function() {

      var fs = require("fs");

      var projects = ["foo", "bar" ,"xyzzy"];

      var projectName = projects[0];

      var destinationName = "destination";

      var configName = "config";

      this.stub(gerrit, "configExists").resolves(true);

      this.stub(gerrit, "projects").resolves(projects);

      this.stub(gerrit, "clone").resolves(null);

      this.stub(fs, "existsSync").returns(false);

      this.stub(prompter, "choose").resolves(projectName);

      this.stub(prompter, "input").resolves(destinationName);

      return cli.clone(null, null, {config: configName})
        .then(function() {

          expect(gerrit.projects).to.have.been.calledWith(configName);

          expect(prompter.choose).to.have.been.calledWith("Clone which project?", projects);

          expect(prompter.input).to.have.been.calledWith("Clone to which folder?", projectName);

          expect(fs.existsSync).to.have.been.calledWith(destinationName);

          expect(gerrit.clone).to.have.been.calledWith(configName, projectName, destinationName);

        });

    }));

  });

  describe("_patches_map", function() {

    var patchList = helpers.fixture.loadJson("patches");
    var patchObj = patchList[0];

    var expectedResult = {
      "c": [
        "1.comments2.reviewer.username (" + cli._dynamicTimeFormat(moment.unix(patchObj.comments[1].timestamp)) + ")\n  1.comments2.msg1\n  1.comments2.msg2",
        "1.comments1.reviewer.username (" + cli._dynamicTimeFormat(moment.unix(patchObj.comments[0].timestamp)) + ")\n  1.comments1.msg"
      ].join("\n\n"),
      "O": "1.owner.name <1.owner.email>",
      "on": "1.owner.name",
      "oe": "1.owner.email",
      "ou": "1.owner.username",
      "dc": cli._dynamicTimeFormat(moment.unix(patchObj.createdOn)),
      "du": cli._dynamicTimeFormat(moment.unix(patchObj.lastUpdated)),
      "s": "1.subject",
      "e": 2,
      "r": [
        " 1.ps1.approvals.name-1  -1  -1 ",
        " 1.ps1.approvals.name0    0   0 ",
        " 1.ps1.approvals.name+1  +1  +1 "
      ].join("\n"),
      "R": "-1 / -1",
      "f": [
        " 1.ps1.files1.type  1.ps1.files1  +123  -456 ",
        " 1.ps1.files2.type  1.ps1.files2  +789    -0 "
      ].join("\n"),
      "m": "1.commitMessage"
    };

    _.forEach(cli._patches_map, function(definition, key) {

      it("should contain valid format map definition for: " + definition[0], function() {

        expect(key).to.have.length.within(1,2);

        expect(definition[0]).to.be.a("string");

        expect(definition[1]).to.be.a("boolean");

        expect(typeof definition[2]).to.be.oneOf(["string", "function"]);

        if (typeof definition[2] === "function") {

          var defFunction = definition[2];

          expect(expectedResult).to.have.property(key);

          expect(defFunction(patchObj, {})).to.be.equal(expectedResult[key]);

          // extra tests
          switch(key) {
            case "c":
              expect(defFunction({comments: ""})).to.be.equal("<none>");
              break;

            case "s":
              var genString = function(len) { return Array(len).fill("Q").join(""); };
              expect(defFunction({subject: genString(90)}, {table: true})).to.be.equal(genString(80) + "...");
              break;

            case "r":
              expect(defFunction({patchSets: [{}]})).to.be.equal("<none>");
              break;

            case "R":
              expect(defFunction({patchSets: [{}]})).to.be.equal("0 / 0");
              break;
          }

        }

      });

    });

  });

  describe("patches()", function() {

    var patchList = helpers.fixture.loadJson("patches");

    var testFormat = "%n foo %t %% %b";

    testRequirements(["inRepo"], cli.patches);

    describe("--oneline", function() {

      it("should display patches in a one-line per patch format", sinon.test(function() {

        this.stub(gerrit, "patches").resolves(patchList);

        return cli.patches({oneline: true, format: testFormat, opts: _.constant({})})
          .then(function() {

            expect(logSpy.info.output).to.equal([
              "1.number foo 1.topic % 1.branch",
              "2.number foo 2.topic % 2.branch"
            ].join("\n"));

          });

      }));

    });

    describe("--table", function() {

      it("should display patches in a table format", sinon.test(function() {

        this.stub(gerrit, "patches").resolves(patchList);

        return cli.patches({table: true, format: testFormat, opts: _.constant({})})
          .then(function() {

            expect(logSpy.info.output).to.equal([
              " Number    Topic    Branch   ",
              " 1.number  1.topic  1.branch ",
              " 2.number  2.topic  2.branch "
            ].join("\n"));

          });

      }));

    });

    describe("--vertical", function() {

      it("should display patches in a vertical table format", sinon.test(function() {

        this.stub(gerrit, "patches").resolves(patchList);

        return cli.patches({vertical: true, format: testFormat, opts: _.constant({})})
          .then(function() {

            expect(logSpy.info.output).to.equal([
              " Number:  1.number ",
              " Topic:   1.topic  ",
              " Branch:  1.branch ",
              "",
              " Number:  2.number ",
              " Topic:   2.topic  ",
              " Branch:  2.branch ",
              ""
            ].join("\n"));

          });

      }));

    });

    var testQueryList = [[
      { author: "author"},
      { owner: "author" }
    ], [
      { assigned: true },
      { reviewer: "self" }
    ], [
      { mine: true },
      { owner: "self" }
    ], [
      { reviewed: true },
      { is: ["reviewed"] }
    ], [
      { watched: true },
      { is: ["watched"] }
    ], [
      { starred: true },
      { is: ["starred"] }
    ], [
      { drafts: true },
      { is: ["drafts"] }
    ], [
      { number: "number" },
      { change: "number" }
    ], [
      { owner: "owner" },
      { owner: "owner" }
    ], [
      { reviewer: "reviewer" },
      { reviewer: "reviewer" }
    ], [
      { branch: "branch" },
      { branch: "branch" }
    ], [
      { topic: "topic" },
      { topic: "topic" }
    ], [
      { message: "message" },
      { message: "message" }
    ], [
      { age: "age" },
      { age: "age" }
    ],

    // not
    [
      { notAuthor: "notAuthor"},
      { not: { owner: "notAuthor" } }
    ], [
      { notAssigned: true },
      { not: { reviewer: "self" } }
    ], [
      { notMine: true },
      { not: { owner: "self" } }
    ], [
      { notReviewed: true },
      { not: { is: ["reviewed"] } }
    ], [
      { notWatched: true },
      { not: { is: ["watched"] } }
    ], [
      { notStarred: true },
      { not: { is: ["starred"] } }
    ], [
      { notDrafts: true },
      { not: { is: ["drafts"] } }
    ], [
      { notNumber: "notNumber" },
      { not: { change: "notNumber" } }
    ], [
      { notOwner: "notOwner" },
      { not: { owner: "notOwner" } }
    ], [
      { notReviewer: "notReviewer" },
      { not: { reviewer: "notReviewer" } }
    ], [
      { notBranch: "notBranch" },
      { not: { branch: "notBranch" } }
    ], [
      { notTopic: "notTopic" },
      { not: { topic: "notTopic" } }
    ], [
      { notMessage: "notMessage" },
      { not: { message: "notMessage" } }
    ], [
      { notAge: "notAge" },
      { not: { age: "notAge" } }
    ],

    // misc
    [
      { reviewed: true, starred: true  },
      { is: ["reviewed", "starred"] }
    ], [
      { owner: "owner", notBranch: "notBranch" },
      { owner: "owner", not: { branch: "notBranch" } }
    ]];

    it("should process query parameters", sinon.test(function() {

      var sinonStub = this.stub;

      return Q.each(testQueryList, function(testQuery) {

        sinonStub(gerrit, "patches").resolves(patchList);

        return cli.patches({opts: _.constant(testQuery[0])})
          .then(function() {

            expect(gerrit.patches).to.have.been.calledWith(testQuery[1]);

          })
          .finally(function() {

            gerrit.patches.restore();

          });

      });

    }));

  });

  describe("status()", function() {

    testRequirements(["inRepo"], cli.status);

    it("should display patch information for provided patch number", sinon.test(function() {

      this.stub(cli, "patches").resolves(null);

      return cli.status("1234", {option: _.noop})
        .then(function() {

          expect(cli.patches).to.have.been.calledWithMatch({number: "1234"});

        });

    }));

    it("should display patch information for provided topic", sinon.test(function() {

      this.stub(cli, "patches").resolves(null);

      return cli.status("abcd", {option: _.noop})
        .then(function() {

          expect(cli.patches).to.have.been.calledWithMatch({topic: "abcd"});

        });

    }));

    it("should default to current branch name if noething provided", sinon.test(function() {

      this.stub(cli, "patches").resolves(null);

      this.stub(git.branch, "name").returns("gitbranch");

      return cli.status(null, {option: _.noop})
        .then(function() {

          expect(cli.patches).to.have.been.calledWithMatch({topic: "gitbranch"});

        });

    }));

  });

  describe("assign()", function() {

    testRequirements(["inRepo"], cli.assign);

    it("should assign reviewers and display results", sinon.test(function() {

      var revList = ["a"];
      var reviewersArray = ["r1", "r2", "r3"];

      this.stub(git, "config").returns([]);

      this.stub(git.config, "add");

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(revList);

      this.stub(git, "describeHash").returns("hash.description");

      this.stub(gerrit, "assign").resolves([
        Q.resolve([
          {success: true,  reviewer: reviewersArray[0]}, 
          {success: false, reviewer: reviewersArray[1]},
          {success: true,  reviewer: reviewersArray[2]}
        ])
      ]);

      return cli.assign(reviewersArray, {remote: "remote"})
        .then(function() {

          expect(gerrit.assign).to.have.been.calledWith(revList, reviewersArray, "remote");

          expect(logSpy.info.output).to.equal("hash.description\nAssigned reviewer r1\nAssigned reviewer r3");

          expect(logSpy.warn.output).to.equal("Could not assign reviewer r2");

        });

    }));

    it("should reject if multiple patches found and intractive is not set", sinon.test(function() {

      var revList = ["a", "b"];
      var reviewersArray = ["r1", "r2", "r3"];

      this.stub(git, "config").returns([]);

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(revList);

      var promise = cli.assign(reviewersArray, {interactive: false});

      return expect(promise).to.be.rejectedWith(cli.CliError);

    }));

    it("should prompt to select patches if multiple found and interactive is set", sinon.test(function() {

      var revList = ["a", "b", "c"];
      var selectedRevList = ["a", "c"];
      var reviewersArray = ["r1"];

      this.stub(git, "config").returns([]);

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(revList);

      this.stub(prompter, "select").resolves(selectedRevList);

      this.stub(git, "describeHash", _.identity);

      this.stub(gerrit, "assign").resolves([
        Q.resolve([
          {success: true, reviewer: reviewersArray[0]}
        ]),
        Q.resolve([
          {success: true, reviewer: reviewersArray[0]}
        ])
      ]);

      return cli.assign(reviewersArray, {interactive: true, remote: "remote"})
        .then(function() {

          expect(gerrit.assign).to.have.been.calledWith(selectedRevList, reviewersArray, "remote");

          expect(logSpy.info.output).to.equal([
            "a",
            "Assigned reviewer r1",
            "",
            "c",
            "Assigned reviewer r1"
          ].join("\n"));

        });

    }));

    it("should save reviewers if assignment successful", sinon.test(function() {

      var revList = ["a"];
      var reviewersArray = ["r1", "r2", "r3"];

      this.stub(git, "config").returns([]);

      this.stub(git.config, "add");

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(revList);

      this.stub(git, "describeHash").returns("hash.description");

      this.stub(gerrit, "assign").resolves([
        Q.resolve([
          {success: true,  reviewer: reviewersArray[0]}, 
          {success: false, reviewer: reviewersArray[1]},
          {success: true,  reviewer: reviewersArray[2]}
        ])
      ]);

      return cli.assign(reviewersArray, {remote: "remote"})
        .then(function() {

          expect(git.config.add).to.have.been
            .calledWith("gerrit.reviewers", "r1")
            .calledWith("gerrit.reviewers", "r3")
            .not.calledWith("gerrit.reviewers", "r2");

        });

    }));
    
  });

  describe("ssh()", function() {

    testRequirements(["inRepo"], cli.ssh);

    it("should run the ssh command and log the output", sinon.test(function() {

      var command = "command";
      var output = "somekind of output";

      this.stub(gerrit, "ssh").resolves(output);

      return cli.ssh(command, {remote: "remote"})
        .then(function() {

          expect(gerrit.ssh).to.have.been.calledWith(command, "remote");

          expect(logSpy.info.output).to.equal(output);

        });

    }));
    
  });

  describe("up()", function() {

    testRequirements(["inRepo", "upstream"], cli.up);

    it("should send up the patch", sinon.test(function() {

      this.stub(gerrit, "up").resolves(null);

      this.stub(git, "revList").returns(["a"]);

      return cli.up({remote: "remote", branch: "branch", draft: false, assign: []})
        .then(function() {

          expect(gerrit.up).to.have.been.calledWith("remote", "branch", false);

        });

    }));

    it("should assign reviewers and post comments", sinon.test(function() {

      this.stub(gerrit, "up").resolves(null);

      this.stub(cli, "comment").resolves(null);

      this.stub(cli, "assign").resolves(null);

      this.stub(git, "revList").returns(["a"]);

      return cli.up({remote: "remote", branch: "branch", draft: false, assign: ["joe", "shmoe"], comment: "comment"})
        .then(function() {

          expect(cli.comment).to.have.been.calledWith("comment", sinon.match({all: true}));

          expect(cli.assign).to.have.been.calledWith(["joe", "shmoe"], sinon.match({all: true}));

        });

    }));

    it("should prompt to assign or comment on all patches if multiple found", sinon.test(function() {

      this.stub(gerrit, "up").resolves(null);

      this.stub(cli, "comment").resolves(null);

      this.stub(cli, "assign").resolves(null);

      this.stub(git, "revList").returns(["a", "b", "c"]);

      this.stub(prompter, "confirm").resolves(true);

      return cli.up({remote: "remote", branch: "branch", draft: false, assign: [], comment: "comment"})
        .then(function() {

          expect(prompter.confirm).to.have.been.called;

          expect(cli.comment).to.have.been.calledWith("comment", sinon.match({all: true}));

        });


    }));

    it("should prompt for interactive patch choice if multiple found and denied assigning or commenting all", sinon.test(function() {

      this.stub(gerrit, "up").resolves(null);

      this.stub(cli, "comment").resolves(null);

      this.stub(cli, "assign").resolves(null);

      this.stub(git, "revList").returns(["a", "b", "c"]);

      this.stub(prompter, "confirm").resolves(false);

      return cli.up({remote: "remote", branch: "branch", draft: false, assign: [], comment: "comment"})
        .then(function() {

          expect(prompter.confirm).to.have.been.called;

          expect(cli.comment).to.have.been.calledWith("comment", sinon.match({interactive: true}));

        });


    }));
    
  });

  describe("checkout", function() {

    testRequirements(["inRepo", "cleanIndex"], cli.checkout);

    it("should checkout the patch", sinon.test(function() {

      this.stub(gerrit, "checkout").resolves(null);

      return cli.checkout("target", "patch_set", {remote: "remote"})
        .then(function() {

          expect(gerrit.checkout).to.have.been.calledWith("target", "patch_set", false, "remote");

        });

    }));
    
  });

  describe("recheckout", function() {

    testRequirements(["inRepo", "cleanIndex"], cli.recheckout);

    it("should re-checkout the patch", sinon.test(function() {

      this.stub(gerrit, "checkout").resolves(null);

      this.stub(git, "hashFor").returns("123abc");

      return cli.recheckout({remote: "remote"})
        .then(function() {

          expect(git.hashFor).to.have.been.calledWith("HEAD");

          expect(gerrit.checkout).to.have.been.calledWith("123abc", null, true, "remote");

        });

    }));
    
  });

  var _review_args = {
    review: {
      cli: ["1", "2", "message"],
      gerrit: ["1", "2", "message", null],
      answer: {
        verified_score: "1",
        code_review_score: "2",
        message: "message"
      }
    },
    submit: {
      cli: ["message"],
      gerrit: ["1", "2", "message", "submit"],
      answer: {
        message: "message"
      }
    },
    abandon: {
      cli: ["message"],
      gerrit: [null, null, "message", "abandon"],
      answer: {
        message: "message"
      }
    },
    comment: {
      cli: ["message"],
      gerrit: [null, null, "message", null],
      answer: {
        message: "message"
      }
    }
  };

  ["review", "submit", "abandon", "comment"].forEach(function(command) {

    var review_args = _review_args[command];

    describe(command + "()", function() {

      testRequirements(["inRepo"], cli[command]);

      describe("single patch", function() {

        it("should " + command + " the patch", sinon.test(function() {

          var revlist = ["A"];

          this.stub(git, "isDetachedHead").returns(false);

          this.stub(git, "revList").returns(revlist);

          this.stub(gerrit, "review").resolves([]);

          this.spy(prompter, "confirm");

          return cli[command].apply(null, review_args.cli.concat({remote: "remote"}))
            .then(function() {

              expect(prompter.confirm).to.not.have.been.called;

              var ee = expect(gerrit.review);
                
              ee.to.have.been.calledWith.apply(ee, ["A"].concat(review_args.gerrit, "remote"));

            });

        }));

        it("should prompt for score and message if none provided");

      });

      describe("multiple patches", function() {

        it("should throw an error if the all or interactive options are not set", sinon.test(function() {

          var revlist = ["A", "B", "C"];

          this.stub(git, "isDetachedHead").returns(false);

          this.stub(git, "revList").returns(revlist);

          var fn = function() {
            cli[command].apply(null, review_args.cli.concat({}));
          };

          return expect(fn).to.throw(cli.CliError);

        }));

        it("should prompt whether to " + command + " if interactive option is set", sinon.test(function() {

          var revlist = ["A", "B", "C"];

          this.stub(git, "isDetachedHead").returns(false);

          this.stub(git, "revList").returns(revlist);

          this.stub(git, "describeHash", _.identity);

          this.stub(prompter, "confirm")
            .onFirstCall().resolves(true)
            .onSecondCall().resolves(false)
            .onThirdCall().resolves(true);

          this.stub(prompter, "prompt", function() {
            return Q.resolve(_.clone(review_args.answer));
          });

          this.stub(gerrit, "review").resolves([]);

          return cli[command].apply(null, review_args.cli.concat({interactive: true, remote: "remote"}))
            .then(function() {

              // reverse order
              var exFirst = expect(gerrit.review.firstCall);
              var exSecond = expect(gerrit.review.secondCall);
              var exNot = expect(gerrit.review);

              exFirst.to.have.been.calledWith.apply(exFirst, ["C"].concat(review_args.gerrit, "remote"));
              exSecond.to.have.been.calledWith.apply(exSecond, ["A"].concat(review_args.gerrit, "remote"));

              exNot.to.not.have.been.calledWith.apply(exNot, ["B"].concat(review_args.gerrit, "remote"));

            });

        }));

        it("should " + command + " if all option is set", sinon.test(function() {

          var revlist = ["A", "B", "C"];

          this.stub(git, "isDetachedHead").returns(false);

          this.stub(git, "revList").returns(revlist);

          this.stub(gerrit, "review").resolves([]);

          return cli[command].apply(null, review_args.cli.concat({all: true, remote: "remote"}))
            .then(function() {

              // reverse order
              var exFirst = expect(gerrit.review.firstCall);
              var exSecond = expect(gerrit.review.secondCall);
              var exThird = expect(gerrit.review.thirdCall);

              exFirst.to.have.been.calledWith.apply(exFirst, ["C"].concat(review_args.gerrit, "remote"));
              exSecond.to.have.been.calledWith.apply(exSecond, ["B"].concat(review_args.gerrit, "remote"));
              exThird.to.have.been.calledWith.apply(exThird, ["A"].concat(review_args.gerrit, "remote"));

            });

        }));

      });

    });

  });

  describe("ninja()", function() {

    testRequirements(["inRepo", "upstream"], cli.ninja);

    it("should push and submit", sinon.test(function() {

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(["A"]);

      this.stub(gerrit, "up").resolves(null);

      this.stub(cli, "submit").resolves(null);

      var options = {remote: "remote", branch: "branch"};

      return cli.ninja(options)
        .then(function() {

          expect(gerrit.up).to.have.been.calledWith("remote", "branch", false);

          expect(cli.submit).to.have.been.calledWith(null, options);

        });

    }));

    it("should confirm with user if multiple patched detected", sinon.test(function() {

      this.stub(git, "isDetachedHead").returns(false);

      this.stub(git, "revList").returns(["A", "B", "C"]);

      this.stub(gerrit, "up").resolves(null);

      this.stub(cli, "submit").resolves(null);

      this.stub(prompter, "confirm").resolves(true);

      var options = {remote: "remote", branch: "branch"};

      return cli.ninja(options)
        .then(function() {

          expect(prompter.confirm).to.have.been.called;

          expect(gerrit.up).to.have.been.calledWith("remote", "branch", false);

          expect(cli.submit).to.have.been.calledWith(null, options);

        });

    }));
    
  });

  describe("web()", function() {

    testRequirements(["inRepo"], cli.web);

    // how to stub out `open`? (proxyquire)
    it("should open the url for the current patch in a browser", sinon.test(function() {

      this.stub(git, "hashFor").returns("hash");

      this.stub(gerrit, "ssh_query").resolves([{url: "url"}]);

      return cli.web({remote: "remote"})
        .then(function() {

          expect(openSpy).to.have.been.calledWith("url");

        });

    }));
    
  });

  describe("topic()", function() {

    testRequirements(["inRepo"], cli.web);

    it("should create a topic branch", sinon.test(function() {

      this.stub(git.branch, "isRemote").returns(true);

      this.stub(gerrit, "topic").returns("result");


      cli.topic("name", "upstream");

      expect(gerrit.topic).to.have.been.calledWith("name", "upstream");

      expect(logSpy.info.output).to.equal("result");

    }));

    it("should use the current branch's upstream if none provided", sinon.test(function() {

      this.stub(git.branch, "upstream").returns("upstream");

      this.stub(git.branch, "isRemote").returns(true);

      this.stub(gerrit, "topic").returns("result");


      cli.topic("name");

      expect(gerrit.topic).to.have.been.calledWith("name", "upstream");

      expect(logSpy.info.output).to.equal("result");

    }));

    it("should throw if an upstream is not provided and the current branch does not have an upstream", sinon.test(function() {

      git.branch.hasUpstream.returns(false);

      expect(_.partial(cli.topic, "name")).to.throw(cli.CliError);

    }));

    it("should throw if the upstream is not a remote branch", sinon.test(function() {

      this.stub(git.branch, "isRemote").returns(false);

      expect(_.partial(cli.topic, "name", "upstream")).to.throw(cli.CliError);

    }));
    
  });

  describe("squad", function() {

    describe("list()", function() {

      testRequirements(["squadExists"], cli.squad.list);

      it("should list the squad members for the squad", sinon.test(function() {

        this.stub(gerrit.squad, "get").returns(["A", "B", "C"]);

        cli.squad.list("name");

        expect(logSpy.info.output).to.equal("A, B, C");

      }));

      it("should list all squads and their memebers if no squad name provdided", sinon.test(function() {

        this.stub(gerrit.squad, "getAll").returns({
          first: ["A", "B"],
          second: ["C", "D"]
        });

        cli.squad.list();

        expect(logSpy.info.output).to.equal("first: A, B\nsecond: C, D");

      }));
      
    });

    describe("set()", function() {

      it("should set the squad to the provided reviewers", sinon.test(function() {

        this.stub(gerrit.squad, "set", _.noop);

        cli.squad.set("name", ["A", "B"]);

        expect(gerrit.squad.set).to.have.been.calledWith("name", ["A", "B"]);

        expect(logSpy.info.output).to.equal("Reviewer(s) \"A, B\" set to squad \"name\".");

      }));
      
    });

    describe("add()", function() {

      it("should add the provided reviewers to the squad", sinon.test(function() {

        this.stub(gerrit.squad, "add", _.noop);

        cli.squad.add("name", ["A", "B"]);

        expect(gerrit.squad.add).to.have.been.calledWith("name", ["A", "B"]);

        expect(logSpy.info.output).to.equal("Reviewer(s) \"A, B\" added to squad \"name\".");

      }));
      
    });

    describe("remove()", function() {

      testRequirements(["squadExists"], cli.squad.remove);

      it("should remove the provided reviewers from the squad", sinon.test(function() {

        this.stub(gerrit.squad, "remove").returns(["A", "B"]);

        cli.squad.remove("name", ["A", "B"]);

        expect(logSpy.info.output).to.equal("Reviewer(s) \"A, B\" removed from squad \"name\".");

      }));

      it("should warn if the prodied reviewer is not part of the squad", sinon.test(function() {

        this.stub(gerrit.squad, "remove").returns(["A", "B"]);

        cli.squad.remove("name", ["A", "B", "C", "D"]);

        expect(logSpy.warn.output).to.equal("Reviewer(s) \"C, D\" do not exist in squad \"name\".");
        expect(logSpy.info.output).to.equal("Reviewer(s) \"A, B\" removed from squad \"name\".");

      }));
      
    });

    describe("delete()", function() {

      testRequirements(["squadExists"], cli.squad.delete);

      it("should delete the named squad", sinon.test(function() {

        this.stub(gerrit.squad, "delete", _.noop);

        cli.squad.delete("name");

        expect(logSpy.info.output).to.equal("Squad \"name\" deleted.");

      }));

    });

    describe("rename()", function() {

      testRequirements(["squadExists"], cli.squad.rename);

      it("should rename the squad", sinon.test(function() {

        this.stub(gerrit.squad, "rename", _.noop);

        cli.squad.rename("name", "newname");

        expect(logSpy.info.output).to.equal("Squad \"name\" renamed to \"newname\".");

      }));
      
    });
    
  });

});
