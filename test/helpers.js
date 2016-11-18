"use strict";

var Q = require("bluebird");
var fs = require("fs");
var path = require("path");
var chai = require("chai");
var sinon = require("sinon");
var sinonChai = require("sinon-chai");
var chaiAsPromised = require("chai-as-promised");

require("colors/safe").enabled = false; // cli-table dependency
require("chalk").enabled = false;

require("sinon-as-promised")(Q);

chai.use(sinonChai);
chai.use(chaiAsPromised);

global.sinon = sinon;
global.expect = chai.expect;

chai.use(function(_chai, utils) {

  utils.addMethod(_chai.Assertion.prototype, "inheritsfrom", function(construct) {

    var obj = this._obj;

    this.assert(
      obj.prototype instanceof construct,
      "Nope, doesn't inherit.",
      "Yup, does inherit"
    );

  });

});

var origSinonTest = sinon.test;
sinon.test = function(callback) {

  return origSinonTest(function(done) {

    var result = callback.call(this);
      
    if (result && typeof result === "object" && typeof result.then === "function") {
      result.then(function() { done(); }, done);
    }
    else {
      done();
    }

  });

};

var fixtureCache = {};
var fixtureBasePath = "test/fixtures";

global.fixture = {

  load: function(name) {
    var fixturePath = path.join(fixtureBasePath, name);

    if (fixtureCache[fixturePath]) {
      return fixtureCache[fixturePath];
    }

    var contents = fs.readFileSync(fixturePath, {encoding: "utf8"});
    fixtureCache[fixturePath] = contents;
    return contents;
  },

  loadJson: function(name) {
    return JSON.parse(global.fixture.load(name + ".json"));
  }

};
