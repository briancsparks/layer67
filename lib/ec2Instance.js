
/**
 *
 *
 * ra invoke lib/ec2Instance.js runInstances --name=peach-cluster-app
 * ra invoke lib/ec2Instance.js runInstances --name=peach-cluster-web
 * ra invoke lib/ec2Instance.js runInstances --name=peach-prod-app
 * ra invoke lib/ec2Instance.js runInstances --name=peach-prod-web
 * ra invoke lib/ec2Instance.js runInstances --name=peach-dev-app
 * ra invoke lib/ec2Instance.js runInstances --name=peach-dev-web
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

    const name          = argvGet(argv, u('name', '=ns-stack-tier', 'The name of the config in the db.'));

    if (!name)          { return u.sage('name', 'Need the name of the item in the db', callback); }

    var   acct = argvGet(argv, 'acct');
    if (!acct && name.match(/prod/)) {
      acct = 'prod';
    } else {
      acct = 'dev';
    }

    if (!acct)          { return u.sage('acct', 'Need the account name', callback); }

    var   result = {};
    const projection = {_id:0, name:0};

    return configDb.find({name}, {projection}).toArray(function(err, receipt) {
      if (!sg.ok(err, receipt)) { db.close(); console.error(err); return callback(err); }
      if (receipt.length < 1) {
        db.close();
        return u.sage('query', 'Did not find "'+name+'" in db.', callback);
      }

      var   instanceLaunchParams = receipt[0];

      setOnn(instanceLaunchParams, 'InstanceType', argvGet(argv, 'instance-type'));

      return sg.until(function(again, last, count, elapsed) {
        if (count > 6)  { db.close(); return callback('ETOOMANY'); }

        //console.error('launch: ', instanceLaunchParams);
        return awsService('EC2', acct).runInstances(instanceLaunchParams, function(err, runInstanceResult) {

          if (err) {
            if (err.code === 'InvalidIPAddress.InUse') {
              instanceLaunchParams.PrivateIpAddress = sg.dottedIp(sg.ipNumber(instanceLaunchParams.PrivateIpAddress) +1);
              console.error(err.code, 'trying again with: '+instanceLaunchParams.PrivateIpAddress);
              return again(100);
            }
            console.error(err, runInstanceResult);

            // Fatal error
            if (!sg.ok(err, runInstanceResult))           { db.close(); console.error(err); return callback(err); }
          }

          _.extend(result, runInstanceResult);

          const launched = db.db('layer67').collection('launched');
          return launched.insert({launchParams: instanceLaunchParams, result: runInstanceResult}, function(err, insertedData) {
            return last();
          });
        });

      }, function done() {
        db.close();
        return callback(null, result);
      });
    });
  });
};

lib.eipForFqdn = function(argv, context, callback) {
  return bootstrap(function(err, db, config_) {
    const configDb = db.db('layer67').collection('config');

    const fqdn    = argvGet(argv, 'fqdn');

    return configDb.find({fqdn:fqdn}).toArray(function(err, receipt) {
      if (err) { console.error(err); return callback(err); }

      db.close();
      return callback(null, {eip: (receipt[0] || {}).eip});
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

