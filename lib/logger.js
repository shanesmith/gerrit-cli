"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");

var emitter = new EventEmitter();

var logger = {};

logger.LEVELS = ["error", "warn", "info", "debug"];

logger.log = function(level, message, context) {
  if (util.isArray(message)) {
    message = util.format.apply(null, message);
  }
  emitter.emit(level, message, context);
};

logger.newline = function(count) {
  var newlines = new Array(count || 1).join("\n");
  logger.log("info", newlines);
};

logger.on = emitter.on.bind(emitter);

logger.LEVELS.forEach(function(level) {
  logger[level] = function(message, context) {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(level);
    logger.log.apply(null, args);
  };
});

module.exports = logger;
