"use strict";

var _ = require("lodash");
var util = require("util");

var helpers = {};

helpers.makeError = function(name, constructor) {
  var err = function(msg, code) {
    Error.call(this);
    Error.captureStackTrace(this, err);
    if (constructor) {
      constructor.apply(this, _.toArray(arguments));
    }
    else {
      this.setCode(code);
      this.setMessage(msg);
    }
  };

  // inherits must be before setting prototype propoerties for node < 5
  // https://stackoverflow.com/a/35320874/1333402
  util.inherits(err, Error);

  err.prototype.name = name;

  err.prototype.setCode = function(code) {
    this.code = code;
  };

  err.prototype.setMessage = function(msg) {
    this.message = util.format.apply(null, _.castArray(msg));
  };

  return err;
};

helpers.indent = function(num, string) {
  var spaces = new Array(num + 1).join(" ");
  return spaces + string.replace(/\n/g, "\n" + spaces);
};

module.exports = helpers;
