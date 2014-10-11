
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var emitter = new EventEmitter();

var logger = {};

logger.LEVELS = ['error', 'warn', 'info', 'debug'];

logger.log = function(level, message) {
  var args = Array.prototype.slice.call(arguments);
  message = util.format.apply(null, args.slice(1));
  emitter.emit(level, message);
};

logger.on = emitter.on.bind(emitter);

logger.LEVELS.forEach(function(level) {
  logger[level] = function(message) {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(level);
    logger.log.apply(null, args);
  };
});

module.exports = logger;
