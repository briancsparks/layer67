
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
var   MongoClient             = require('mongodb').MongoClient;

const namespace               = 'layer67' || process.env.NAMESPACE;

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var   bootstrap, translateRunConfigArgs;

const runConfigNames = {
  MaxCount          : 'max-count',
  MinCount          : 'min-count',
  InstanceType      : 'instance-type',
  ImageId           : 'image-id',
  KeyName           : 'key-name,key',
  SubnetId          : 'subnet-id',
  PrivateIpAddress  : 'ip',
  SecurityGroupIds  : 'security-group-ids'
};

var lib = {};

/**
 *  Creates a run configuration into the DB
 */
lib.createRunConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const name          = argvGet(argv, u('name', '=ns-cluster-web',  'The name of the run config.'));

    if (!name)          { return u.sage('name', 'Need the run config name.', callback); }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err,'bootstrapping-db');
      }

      argv = translateRunConfigArgs(argv);

      return sg.iwrap('insertRunConfig', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.insert(argv, eabort(function(err, receipt) {
          if (db)   { db.close(); }

          return callback(null, receipt.result);
        }, 'configDb.insert'));
      });

			function abort(err, msg) {
        if (db)   { db.close(); }

				if (msg)  { return sg.die(err, callback, msg); }
				return callback(err);
			}

    });
  });
};

/**
 *  Updates a run configuration into the DB
 */
lib.updateRunConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const name          = argvGet(argv, u('name', '=ns-cluster-web',  'The name of the run config.'));

    if (!name)          { return u.sage('name', 'Need the run config name.', callback); }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err,'bootstrapping-db');
      }

      argv = translateRunConfigArgs(argv);

      return sg.iwrap('updateRunConfig', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.update({name}, {$set:argv}, {upsert:true}, eabort(function(err, receipt) {
          if (db)   { db.close(); }

          return callback(null, receipt.result);
        }, 'configDb.update'));
      });

			function abort(err, msg) {
        if (db)   { db.close(); }

				if (msg)  { return sg.die(err, callback, msg); }
				return callback(err);
			}

    });
  });
};

/**
 *  Read a run configuration from the DB
 */
lib.readRunConfig = lib.getRunConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const name          = argvGet(argv, u('name', '=ns-cluster-web',  'The name of the run config.'));

    if (!name)          { return u.sage('name', 'Need the run config name.', callback); }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err, 'bootstrapping-db');
      }

      argv = translateRunConfigArgs(argv);

      return sg.iwrap('readRunConfig', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        const projection = {_id:0, name:0};
        return configDb.find({name}, {projection}).toArray(eabort(function(err, receipt) {
          if (receipt.length < 1) {
            return abort('ENOCONFIG', 'Did not find "'+name+'" in db.');
          }

          if (db)   { db.close(); }

          return callback(null, receipt);
        }, 'configDb.find'));
      });

			function abort(err, msg) {
        if (db)   { db.close(); }

				if (msg)  { return sg.die(err, callback, msg); }
				return callback(err);
			}

    });
  });
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

  }, function(next) {
    config.accts = sg.parseOn2Chars(process.env.JSAWS_AWS_ACCTS || '', ',', ':');

    translateRunConfigArgs = function(argv) {
      var   result            = translateArgs(argv, runConfigNames);

      const [ns, stack, tier] = (result.name || '').split('-');

      if (result.SecurityGroupIds) {
        result.SecurityGroupIds = result.SecurityGroupIds.split(',');
      }

      var Arn   = argvExtract(argv, 'instance-profile,role');

      if (!Arn && ns && stack) {
        const acctName = acctForStack(stack);
        const acctNum  = config.accts[acctName];
        Arn = `arn:aws:iam::${acctNum}:instance-profile/${ns}-${tier}-instance-role`;
      }

      if (Arn) {
        argv.IamInstanceProfile = {Arn};
      }

      return result;
    }

    return next();

  }], function done() {
    return callback(null, db, config);
  });
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

function translateArgs(argv, names) {
  return sg.reduce(names, argv, function(m, v, k) {
    const value = argvExtract(m, v);
    if (value) {
      m[k] = value;
    }
    return m;
  });
}



function acctForStack(stack) {
  if (stack === 'prod' || stack === 'pub') {
    return 'pub';
  }

  return 'dev';
}
