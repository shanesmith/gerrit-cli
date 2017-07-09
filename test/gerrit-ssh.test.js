"use strict";

var helpers = require("./helpers");
var sandboxEach = helpers.sandboxEach;

var util = require("util");
var cross_spawn = require("cross-spawn");
var mock_spawn = require("mock-spawn");

var gerrit_ssh = require("../lib/gerrit-ssh");

describe("gerrit_ssh", function() {

  var spawn;

  var config = {
    user: "user",
    host: "host",
    port: "1234",
    project: "project"
  };

  sandboxEach(function(sandbox) {
    spawn = mock_spawn();
    spawn.setDefault(spawn.simple(0, "out\n"));
    sandbox.stub(cross_spawn, "spawn", spawn);
  });

  describe("run()", function() {

    it("should run", sinon.test(function() {

      return gerrit_ssh.run("cmd", config)
        .then(function(stdout) {

          var firstCall = spawn.calls[0];

          expect(firstCall.command).to.equal("ssh");
          expect(firstCall.args).to.deep.equal(["user@host", "-p", "1234", "--", "gerrit cmd"]);
          expect(stdout).to.equal("out");

        });

    }));
    
  });

  describe("scp()", function() {

    it("should scp", sinon.test(function() {

      return gerrit_ssh.scp("source", "destination", config)
        .then(function() {

          var firstCall = spawn.calls[0];

          expect(firstCall.command).to.equal("scp");
          expect(firstCall.args).to.deep.equal(["-p", "-P", "1234", "user@host:'source'", "destination"]);

        });

    }));

  });

  describe("query", function() {

    var queryCommand = function(query) {
      return util.format("query '%s' --format json --patch-sets --files --all-approvals --comments --commit-message --submit-records", query);
    };

    describe("query()", function() {

      var data = [
        {foo: "bar"},
        {tro: "lol"}
      ];

      var dataString = data.map(JSON.stringify).join("\n") + "\n";

      sandboxEach(function(sandbox) {
        sandbox.stub(gerrit_ssh, "run").resolves(dataString);
      });

      it("should run a string query", sinon.test(function() {

        return gerrit_ssh.query("foobar", config)
          .then(function(result) {

            expect(gerrit_ssh.run).to.have.been.calledWith(queryCommand("foobar"));
            expect(result).to.deep.equal(data);

          });

      }));

      it("should run an array query", sinon.test(function() {

        return gerrit_ssh.query(["foo %s", "bar"], config)
          .then(function(result) {

            expect(gerrit_ssh.run).to.have.been.calledWith(queryCommand("foo bar"));
            expect(result).to.deep.equal(data);

          });

      }));

      it("should run an object query", sinon.test(function() {

        var query = {
          one: "two",
          three: ["four", "five"],
          not: {
            six: "seven",
            eight: ["nine", "ten"]
          }
        };

        return gerrit_ssh.query(query, config)
          .then(function(result) {

            expect(gerrit_ssh.run).to.have.been.calledWith(queryCommand("one:two three:four three:five -six:seven -eight:nine -eight:ten"));
            expect(result).to.deep.equal(data);

          });

      }));
      
    });

    describe("number()", function() {

      it("should query for the number", sinon.test(function() {

        this.stub(gerrit_ssh, "query").resolves();

        return gerrit_ssh.query.number(1234, config)
          .then(function() {

            expect(gerrit_ssh.query).to.have.been.calledWith(["change:%s project:%s limit:1", 1234, "project"], config);

          });

      }));
      
    });

    describe("topic()", function() {

      it("should query for the topic", sinon.test(function() {

        this.stub(gerrit_ssh, "query").resolves();

        return gerrit_ssh.query.topic("foobar", config)
          .then(function() {

            expect(gerrit_ssh.query).to.have.been.calledWith(["project:%s topic:%s limit:1", "project", "foobar"], config);

          });

      }));
      
    });
    
  });

});
