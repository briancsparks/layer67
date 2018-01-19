
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;


var lib = {};

lib.foo = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, callback) => {
    const baz           = ra.wrap(lib.baz);

    const bar           = argvGet(argv, u('bar',  '=bar', 'The bar.'));

    if (!bar)           { return u.sage('bar', 'Need bar.', callback); }

    return sg.__run2({}, callback, [function(result, next, last, abort) {
      return next();

    }, function(result, next, last, abort) {
      return next();

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};

lib.baz = function(argv, context, callback) {
  return callback();
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

