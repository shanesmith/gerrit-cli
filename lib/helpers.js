"use strict";

var _ = require("lodash");
var util = require("util");

var helpers = {};

helpers.makeError = function(name, constructor) {
  var err = function(msg, code) {
    Error.call(this);
    Error.captureStackTrace(this, err);
    if (constructor) {
      constructor.apply(this, Array.from(arguments));
    }
    else {
      this.setCode(code);
      this.setMessage(msg);
    }
  };
  err.prototype.name = name;
  err.prototype.setCode = function(code) {
    this.code = code;
  };
  err.prototype.setMessage = function(msg) {
    this.message = util.format.apply(null, _.castArray(msg));
  };
  util.inherits(err, Error);
  return err;
};

module.exports = helpers;
