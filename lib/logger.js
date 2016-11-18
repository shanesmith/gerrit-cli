"use strict";

var util = require("util");
var EventEmitter = require("events");

var LEVELS = ["error", "warn", "info", "debug"];

var Logger = function() {
  EventEmitter.call(this);
};
util.inherits(Logger, EventEmitter);

Logger.prototype.LEVELS = LEVELS;

Logger.prototype.log = function(level, message, context) {
  if (util.isArray(message)) {
    message = util.format.apply(null, message);
  }
  this.emit(level, message, context);
};

Logger.prototype.newline = function(count) {
  var newlines = new Array(count || 1).join("\n");
  this.log("info", newlines);
};

LEVELS.forEach(function(level) {

  Logger.prototype[level] = function(message, context) {
    var args = Array.from(arguments);
    args.unshift(level);
    this.log.apply(this, args);
  };

});

module.exports = new Logger();
