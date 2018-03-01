
/**
 *  Hosts an app,
 *
 *  TODO: This hosting app and the real app that is running are not connected
 *  to each other in any way. This one should restart the other one, or at
 *  the very least, stop sending the beacon if the real app fails.
 *
 *  Adds all the stuff that is needed to run in the Layer67 system, so
 *  that any http server can work.
 *
 *    pm2 start host-app.js --name ${appName} --watch -- --port=3000 --namespace=foo --stack=test --color=lime
 *
 *    pm2 start host-app.js --name host-one --watch -- --port=3000 --namespace=one --stack=test --color=lime
 *
 * -or-
 *
 *    host-app --pm2-name=one --port=3000 --ns=one --stack=test --color=lime
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const redisUtils              = require('../../lib/redis-utils');
const MongoClient             = require('mongodb').MongoClient;
const request                 = sg.extlibs.superagent;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const route                   = argvGet(ARGV, 'route');
const namespace               = argvGet(ARGV, 'namespace,ns');
const port                    = ARGV.port;
const stack                   = ARGV.stack;
const color                   = ARGV.color;
const argvIp                  = ARGV.ip;

var   bootstrap;
const main = function(callback) {

  var db;

  function abort(err, msg) {
    if (db) { db.close(); }

    console.error(msg, err);
    return callback(err);
  }

  var result = {};
  return  bootstrap('hostApp', callback, abort, function(err, db_, config, eabort) {
    db = db_;

    return request.get('http://169.254.169.254/latest/meta-data/local-ipv4').end((err, result) => {
      var   ip  = argvIp;

      if (!ip && sg.ok(err, result, result.text)) {
        ip = result.text;
      }

      ip  = ip || '127.0.0.1';

      if (!port || !ip || !namespace || !stack || !color) {
        console.log('Need --port= and --ip= and --namespace= and --stack= and --color=');
        process.exit(2);
      }

      console.log(`${namespace} Listening on ${ip}:${port}/${route || namespace}`);

      tell();
      function tell() {
        setTimeout(tell, 15 * 1000);
        redisUtils.tellStackService(`/${route || namespace}`, `http://${ip}:${port}`, 30000, stack, function(err) {
        });
      };
    });
  });
};




bootstrap = function(name, outerCb, abort, callback) {

  const dbAddress = process.env.SERVERASSIST_DB_IP                  || '10.12.21.229';
  var   dbUrl     = `mongodb://${dbAddress}:27017/${namespace}`;
  var   db, config = {};

  return sg.__run([function(next) {
    if (db) { return next(); }

    return MongoClient.connect(dbUrl, function(err, db_) {
      if (!sg.ok(err, db_)) { return process.exit(2); }

      db = db_;
      return next();
    });

  }, function(next) {
    config.accts = sg.parseOn2Chars(process.env.JSAWS_AWS_ACCTS || '', ',', ':');
    return next();

  }], function done() {
    return sg.iwrap(name, outerCb, abort, function(eabort) {
      return callback(null, db, config, eabort, abort);
    });

  });
};



ARGV.main = true;
if (sg.callMain(ARGV, __filename)) {
  return main(function(err, result) {
    if (err)      { console.error(err); return process.exit(2); }
    if (result)   { console.log(result); }
  });
}

