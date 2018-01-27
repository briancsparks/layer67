
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const AWS                     = require('aws-sdk');
const awsService              = require('./aws-creds').awsService;
var   MongoClient             = require('mongodb').MongoClient;

var   namespace               = process.env.NAMESPACE   || 'layer67';

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const ec2                     = new AWS.EC2({region: 'us-east-1'});

if (namespace === 'serverassist') {
  namespace = 'layer67';
}

var   ezuse;
var   bootstrap;

var lib = {};


lib.runInstances = function(argv, context, callback) {
  return bootstrap(function(err, db, config_) {
    const configDb = db.db('layer67').collection('config');

    var   u             = sg.prepUsage();

    const webConfig = {
      awsSvc    : 'EC2_runInstances',
      acct      : 'dev',
      zone      : 'us-east-1a',
      tier      : 'web'
    };

    const appConfig = {
      awsSvc    : 'EC2_runInstances',
      acct      : 'dev',
      zone      : 'us-east-1a',
      tier      : 'app'
    };

    config = webConfig;
    if (argv.app) {
      config = appConfig;
    }

    const proj = {projection: sg.reduce(config, {_id:0}, function(m, v, k) {
      return sg.kv(m, k, 0);
    })};

    return configDb.find(config, proj).toArray(function(err, receipt) {

      if (sg.ok(err, receipt)) {
        return ec2.runInstances(receipt[0], function(err, data) {
          console.log(err, data);

          if (sg.ok(err, data)) {
            const launched = db.db('layer67').collection('launched');
            return launched.insert({launchParams: receipt[0], result: data}, function(err, data) {
              db.close();
              return callback();
            });
          }
        });
      }
    });
  });
};


ezuse = function(argv, item, u) {

  var result = {};

  _.each(item, function(value, key) {
    result[key] = argvGet(argv, u(key, `=${key}`, `The ${key}`)) || value;
  });

  return result;
};

bootstrap = function(callback) {
  const dbAddress = process.env.SERVERASSIST_DB_IP;
  var   dbUrl     = 'mongodb://'+dbAddress+':27017/'+namespace;

  var   db, config = {};

  return sg.__run([function(next) {
    if (db) { return next(); }

    return MongoClient.connect(dbUrl, function(err, db_) {
      if (!sg.ok(err, db_)) { return process.exit(2); }

      db = db_;
      return next();
    });

  }], function done() {
    return callback(null, db, config);
  });
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

if (sg.callMain(ARGV, __filename)) {
  main();
}

