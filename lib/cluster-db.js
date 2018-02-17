
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

      return sg.iwrap('createRunConfig', callback, abort, function(eabort) {
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
 *  Updates a run configuration's AMI ID
 *
 *    ra invoke lib/cluster-db.js updateRunConfigAmi --stack=dev  --image-id=ami-0795ff05699c4e957
 *
 *    ra invoke lib/cluster-db.js updateRunConfigAmi --stack=prod --image-id=ami-0795ff05699c4e957
 *
 */
lib.updateRunConfigAmi = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    var   query         = {ImageId:{$exists:true}, SubnetId:{$exists:true}, name:{$not:/prod/}};

    const stack         = argvGet(argv, u('stack',        '=dev',           'The stack to update (dev or prod).'));
    const ImageId       = argvGet(argv, u('image-id,ami', '=ami-12341234',  'The AMI Id.'));

    if (!stack)         { return u.sage('stack', 'Need the run config stack.', callback); }
    if (!ImageId)       { return u.sage('ami',   'Need the AMI.', callback); }

    if (stack === 'prod' || stack == 'pub') {
      query.name = /prod/;
    }

    return bootstrap('updateRunConfigAmi', callback, function(err, db, config, eabort) {
      const configDb = db.db('layer67').collection('config');

      return configDb.update(query, {$set:{ImageId}}, {multi:true}, eabort(function(err, receipt) {
        if (db)   { db.close(); }

        return callback(null, receipt.result);
      }, 'configDb.update'));
    });
  });
};

/**
 *  Finds the current dev AMI, and sets it to be the default for prod.
 *
 */
lib.promoteRunConfigAmi = function() {
  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    const readRunConfig       = ra.wrap(lib.readRunConfig);
    const updateRunConfigAmi  = ra.wrap(lib.updateRunConfigAmi);

    return readRunConfig({query:{name:/dev-web/}}, function(err, devConfig) {
      if (!sg.ok(err, devConfig, devConfig.ImageId))   { return callback(err); }

      const ImageId = devConfig.ImageId;

      return updateRunConfigAmi({stack:'prod', ImageId}, function(err, receipt) {
        return callback(err, receipt);
      });
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
    const query         = argvGet(argv, 'query') || {name};

    if (!name && !query) { return u.sage('name', 'Need the run config name.', callback); }

    return bootstrap(function(err, db, config) {

      return sg.iwrap('readRunConfig', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.find(query, {projection:{_id:0, name:0}}).toArray(eabort(function(err, receipt) {
          if (receipt.length < 1) {
            return abort('ENOCONFIG', 'Did not find "'+query+'" in db.');
          }

          if (db)   { db.close(); }

          return callback(null, receipt[0]);
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

/**
 *  Creates a project
 */
lib.createProject = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const projectId       = argvGet(argv, u('project-id,project',     '=xyz',             'The project id'));
    const domainName      = argvGet(argv, u('domain',                 '=example.com',     'The prod domain name'));
    const testDomainName  = argvGet(argv, u('tdomain,test',           '=exampledev.com',  'The test domain name')) || domainName;

    if (!projectId)       { return u.sage('projectId',    'Need the projectId', callback); }
    if (!domainName)      { return u.sage('Domain Name',  'Need the domain',  callback); }

    return bootstrap('createProject', callback, function(err, db, config, eabort) {
      const configDb = db.db('layer67').collection('config');

      return configDb.insert({projectId, domainName, testDomainName}, eabort(function(err, receipt) {
        if (db)   { db.close(); }

        return callback(null, receipt.result);
      }, 'configDb.insert'));
    });
  });
};

/**
 *  Creates a project
 */
lib.readProject = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const projectId       = argvGet(argv, u('project-id,project',     '=xyz',             'The project id'));

    if (!projectId)       { return u.sage('projectId',    'Need the projectId', callback); }

    return bootstrap('readProject', callback, function(err, db, config, eabort) {
      const configDb = db.db('layer67').collection('config');

      return configDb.find({projectId}, {projection:{_id:0}}).toArray(eabort(function(err, receipt) {
        if (db)   { db.close(); }

        return callback(null, receipt[0]);
      }, 'configDb.find'));
    });
  });
};

/**
 *  Updates project
 */
lib.updateProject = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;
    const readProject         = ra.wrap(lib.readProject);

    const projectId           = argvGet(argv, u('project-id,project',     '=xyz',             'The project id'));
    const version             = argvGet(argv, u('version,v',              '=1',               'The version'))       || 1;

    if (!projectId)           { return u.sage('projectId',    'Need the projectId', callback); }

    var project, receipts = [];
    return bootstrap('updateProject', callback, function(err, db, config, eabort) {
      const configDb = db.db('layer67').collection('config');

      return sg.__run3([function(next, enext, ewarn, enag) {
        return readProject(argv, eabort(function(err, project_) {
          project = project_;
          return next();
        }));

      }, function(next) {

        const domain = argvGet(argv, 'domain');
        if (!domain)  { return next(); }

        return configDb.update({projectId}, {$set:{domainName:domain}}, {upsert:true}, eabort(function(err, receipt) {
          receipts.push(receipt);
          return next();
        }));

      }, function(next) {

        const domain = argvGet(argv, 'tdomain');
        if (!domain)  { return next(); }

        return configDb.update({projectId}, {$set:{testDomainName:domain}}, {upsert:true}, eabort(function(err, receipt) {
          receipts.push(receipt);
          return next();
        }));

      }, function(next) {
        const subDomain = argvGet(argv, 'upstream');
        if (!subDomain)  { return next(); }

        // Like: http://blue-l67.mobilewebassist.net/ntl/api/v1
        const prodFqdn = `http://${subDomain}.${project.domainName}/${project.projectId}/api/v${version}`;
        return configDb.update({projectId}, {$set:{"upstream.prod":prodFqdn}}, {upsert:true}, eabort(function(err, receipt) {
          receipts.push(receipt);

          // Like: http://blue-l67.mobiledevassist.net/ntl/api/v1
          const testFqdn = `http://${subDomain}.${project.testDomainName}/${project.projectId}/api/v${version}`;
          return configDb.update({projectId}, {$set:{"upstream.test":testFqdn}}, {upsert:true}, eabort(function(err, receipt) {
            receipts.push(receipt);
            return next();
          }));
        }));

      }, function(next) {
        const subDomain = argvGet(argv, 'telemetry');
        if (!subDomain)  { return next(); }

        // Like: http://blue-l67.mobilewebassist.net/ntl/api/v1
        const prodFqdn = `http://${subDomain}.${project.domainName}/${project.projectId}/api/v${version}`;
        return configDb.update({projectId}, {$set:{"upstreams.prod.telemetry":prodFqdn}}, {upsert:true}, eabort(function(err, receipt) {
          receipts.push(receipt);

          // Like: http://blue-l67.mobiledevassist.net/ntl/api/v1
          const testFqdn = `http://${subDomain}.${project.testDomainName}/${project.projectId}/api/v${version}`;
          return configDb.update({projectId}, {$set:{"upstreams.test.telemetry":testFqdn}}, {upsert:true}, eabort(function(err, receipt) {
            receipts.push(receipt);
            return next();
          }));
        }));

      }, function(next) {
        const subDomain = argvGet(argv, 'attrstream');
        if (!subDomain)  { return next(); }

        // Like: http://blue-l67.mobilewebassist.net/ntl/api/v1
        const prodFqdn = `http://${subDomain}.${project.domainName}/${project.projectId}/api/v${version}`;
        return configDb.update({projectId}, {$set:{"upstreams.prod.attrstream":prodFqdn}}, {upsert:true}, eabort(function(err, receipt) {
          receipts.push(receipt);

          // Like: http://blue-l67.mobiledevassist.net/ntl/api/v1
          const testFqdn = `http://${subDomain}.${project.testDomainName}/${project.projectId}/api/v${version}`;
          return configDb.update({projectId}, {$set:{"upstreams.test.attrstream":testFqdn}}, {upsert:true}, eabort(function(err, receipt) {
            receipts.push(receipt);
            return next();
          }));
        }));

      }], function() {
        if (db)   { db.close(); }
        return callback(null, receipts);
      });

      return configDb.update({projectId}, {$set:{eip}}, {upsert:true}, eabort(function(err, receipt) {
        if (db)   { db.close(); }

        return callback(null, receipt.result);
      }, 'configDb.update'));
    });
  });
};
/**
 *  Creates an FQDN <-> EIP mapping
 */
lib.createFqdnEipMap = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const fqdn          = argvGet(argv, u('fqdn', '=www.example.com',  'The FQDN'));
    const eip           = argvGet(argv, u('eip',  '=eipalloc-12345',   'The AWS ID for the Elastic IP'));

    if (!fqdn)          { return u.sage('fqdn', 'Need the FQDN', callback); }
    if (!eip)           { return u.sage('eip',  'Need the EIP',  callback); }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err,'bootstrapping-db');
      }

      return sg.iwrap('createFqdnEipMap', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.insert({fqdn, eip}, eabort(function(err, receipt) {
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
 *  Updates an FQDN <-> EIP mapping
 */
lib.updateFqdnEipMap = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const fqdn          = argvGet(argv, u('fqdn', '=www.example.com',  'The FQDN'));
    const eip           = argvGet(argv, u('eip',  '=eipalloc-12345',   'The AWS ID for the Elastic IP'));

    if (!fqdn)          { return u.sage('fqdn', 'Need the FQDN', callback); }
    if (!eip)           { return u.sage('eip',  'Need the EIP',  callback); }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err,'bootstrapping-db');
      }

      return sg.iwrap('updateFqdnEipMap', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.update({fqdn}, {$set:{eip}}, {upsert:true}, eabort(function(err, receipt) {
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
 *  Read an FQDN <-> EIP mapping
 */
lib.readFqdnEipMap = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    delete argv._id;

    const fqdn          = argvGet(argv, u('fqdn', '=www.example.com',  'The FQDN'));
    const eip           = argvGet(argv, u('eip',  '=eipalloc-12345',   'The AWS ID for the Elastic IP'));

    if (!fqdn && !eip)          { return u.sage('fqdn/eip', 'Need either the FQDN or the eip', callback); }

    var query = {};

    if (fqdn)                   { query.fqdn = fqdn; }
    if (eip)                    { query.eip  = eip; }

    return bootstrap(function(err, db, config) {

      if (!sg.ok(err, db, config)) {
        return abort(err,'bootstrapping-db');
      }

      return sg.iwrap('readFqdnEipMap', callback, abort, function(eabort) {
        const configDb = db.db('layer67').collection('config');

        return configDb.find(query, {projection:{_id:0}}).toArray(eabort(function(err, receipt) {
          if (receipt.length < 1) {
            return abort('ENOCONFIG', 'Did not find "'+query+'" in db.');
          }

          if (db)   { db.close(); }

          return callback(null, receipt[0]);
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

bootstrap = function(name, outerCb, callback) {

  if (arguments.length === 1) {
    return bootstrap(null, null, arguments[0]);
  }


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

    if (!name) {
      return callback(null, db, config);
    }

    return sg.iwrap(name, outerCb, abort, function(eabort) {
      return callback(null, db, config, eabort, abort);
    });
  });

  function abort(err, msg) {
    if (db)   { db.close(); }

    if (msg)  { return sg.die(err, outerCb, msg); }
    return outerCb(err);
  }
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
