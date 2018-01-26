
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

lib.query_ = function(it) {
  var    result = {};

  result = sg.reduce(it, result, function(m, value, key) {
    if (_.isString(value))  { return sg.kv(m, key, {S:value}); }
    if (_.isNumber(value))  { return sg.kv(m, key, {N:''+value}); }
    if (_.isBoolean(value)) { return sg.kv(m, key, {B:value}); }

    if (_.isArray(value)) {
      // TODO: Introspect to see if its a set?
      return sg.kv(m, key, {L:value});
    }

    if (_.isObject(value))  { return sg.kv(m, key, {M:value}); }

    if (value === null)     { return sg.kv(m, key, {NULL:value}); }

    // TODO: if not one of the above types, make {M:{just:JSON.stringify(value)}}

    return sg.kv(m, key, {s:value});
  });

  return result;
//  return {id:{S:'userId'}, group:{S:'groupId'}};
};

lib.query = function(argv, context, callback) {

  return callback(null, lib.query_(argv));
};


lib['ra-validate'] = function(argv, context, callback) {

  const v = new raLib.Validator(context);

  v.runner([function(next) {
    v.compare(lib.query, {id:'userId', group:'groupId'}, {id:{S:'userId'}, group:{S:'groupId'}}, next);
  }, function(next) {
    v.compare(lib.query, {id:'userId', group:777}, {id:{S:'userId'}, group:{N:777}}, next);
  }], callback);
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

