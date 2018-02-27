
/**
 *
 */
const sg                      = require('sgsg');
const _                       = require('lodash');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;


var lib = {};

lib.upsertOne = function(collDb, query, updates_ /*, options, callback*/) {
  var   args      = _.drop(arguments, 2);
  const callback  = _.isFunction(_.last(args)) ? args.pop() : function(){};
  const options_  = args.pop() || {};
  const now       = sg.extract(options_, 'now') || new Date();

  // ---------- The Updates ----------
  var   updates = { $setOnInsert: ids(query) };

  _.merge(updates, {
    $set: {
      mtime       : now
    },
    $setOnInsert: {
      ctime       : now
    }
  });

  _.merge(updates, updates_);

  // ---------- The Options ----------
  var   options = {upsert:true};

  _.merge(options, options_);

  return collDb.findOneAndUpdate(query, updates, options, function(err, receipt) {
    if (err) { console.error(query[sg.firstKey(ids(query))], err, receipt); }
    return callback.apply(this, arguments);
  });
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

/**
 *  Returns an object with all properties that are 'ids' preserved.
 */
function ids(obj) {
  return sg.reduce(obj, {}, function(m, value, key) {
    if (key.match(/id$/i)) {
      return sg.kv(m, key, value);
    }

    return m;
  });
}

