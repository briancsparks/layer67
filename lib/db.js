
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const difflet                 = require('difflet');

const diff                    = difflet({indent:2});
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;


var lib = {};

lib['ra-validate'] = function(argv, context, callback) {
  var   errors = 0;
  const assert = require('assert');

  const query  = function(argv, shouldBe, callback) {
    return lib.query(argv, context, function(err, data) {
      assert(!err);

      if (err) {
        errors++;
      }

      if (!sg.deepEqual(data, shouldBe)) {
        const d = difflet.compare(shouldBe, data);
        process.stderr.write(d);
        errors++;
      }
      return callback();
    });
  };

  const handler = function(err) {
    assert(!err);
    return next();
  };

  return sg.__runll([function(next) {
    query({id:'userId', group:'groupId'}, {id:{S:'userId'}, group:{S:'groupId'}}, next);
  }, function(next) {
    return next();
  }], function() {
    return callback(''+errors+' Errors.');
  });

};

lib.query = function(argv, context, callback) {

  return callback(null, argv);
};



_.each(lib, (value, key) => {
  exports[key] = value;
});

