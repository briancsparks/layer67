
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var lib = {};

const main = function() {

  return sg.__run2({}, callback, [function(result, next, last, abort) {
    return next();

  }, function(result, next, last, abort) {
    return next();

  }], function abort(err, msg) {
    return callback();

  });
};


//...
lib.myFavoriteFunction = function(argv, context, callback) {
  return callback();
};




_.each(lib, (value, key) => {
  exports[key] = value;
});

if (sg.callMain(ARGV, __filename)) {
  main();
}

