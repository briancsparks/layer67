
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const AWS                     = require('aws-sdk');
const awsService              = require('../../lib/aws-creds').awsService;
var   MongoClient             = require('mongodb').MongoClient;
const util                    = require('util');

var   namespace               = process.env.NAMESPACE   || 'layer67';

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const ec2 = new AWS.EC2({region: 'us-east-1'});
const s3 =  new AWS.S3 ({region: 'us-east-1'});

var   bootstrap;

const main = async function() {
  return bootstrap(function(err, db, config) {

    const configDb = db.db('layer67').collection('config');

    var result = {};


    return sg.__runll([function(next) {
      return awsService('EC2', 'prod').describeVpcs({}, function(err, prodVpcs) {
        return chkerr(err, {prodVpcs}, next);
      });

    }, function(next) {
      return awsService('EC2', 'dev').describeVpcs({}, function(err, devVpcs) {
        return chkerr(err, {devVpcs}, next);
      });

    }, function(next) {
      return awsService('EC2', 'dev').describeImages({Owners:['084075158741']}, function(err, devImages) {
        return chkerr(err, {devImages}, next);
      });

    }, function(next) {
      return awsService('EC2', 'dev').describeSecurityGroups({}, function(err, devSecurityGroups) {
        return chkerr(err, {devSecurityGroups}, next);
      });

    }, function(next) {
      return awsService('EC2', 'prod').describeSecurityGroups({}, function(err, prodSecurityGroups) {
        return chkerr(err, {prodSecurityGroups}, next);
      });

    }, function(next) {
      return awsService('EC2', 'dev').describeSubnets({}, function(err, devSubnets) {
        return chkerr(err, {devSubnets}, next);
      });

    }, function(next) {
      return awsService('EC2', 'prod').describeSubnets({}, function(err, prodSubnets) {
        return chkerr(err, {prodSubnets}, next);
      });

    }], function done() {
      result.devImages.Images = _.map(result.devImages.Images, function(image) {
        return sg.reduce(image.Tags, image, function(m, tag) {
          image[tag.Key] = tag.Value;
          return image;
        });
      });

//      console.log(util.inspect(result, {depth:null, colors:true}));
      console.log(result.devSecurityGroups.SecurityGroups[0]);
      console.log(_.keys(result.devSecurityGroups));

      const config = {
        awsSvc    : 'EC2_runInstances',
        isProd    : false,
        zone      : 'us-east-1a',
        tier      : 'web',
        vpc       : 'vpc-fe6b9b87',   // vpc-fbd32082 for sa-pub, vpc-a7cab0c1 for mario-pub
        isCluster : false
      };

      const vpcs = {
        dev   : 'vpc-fe6b9b87',
        prod  : 'vpc-fbd32082'
      };

      const layer67Ami  = _.last(_.sortBy(_.filter(result.devImages.Images, i => /^layer67/.exec(i.Name)), 'Name'));
      const vpcSgs      = _.filter(result.devSecurityGroups.SecurityGroups, sg => sg.VpcId === vpcs.dev);
      var   vpcSubnets  = _.filter(result.devSubnets.Subnets, sn => sn.VpcId === vpcs.dev);

      console.log(util.inspect(_.map(vpcSubnets, subnet => _.pick(subnet, 'CidrBlock', 'SubnetId')), {depth:null, colors:true}));

      vpcSubnets  = _.filter(result.prodSubnets.Subnets, sn => sn.VpcId === vpcs.prod);

      console.log(util.inspect(_.map(vpcSubnets, subnet => _.pick(subnet, 'CidrBlock', 'SubnetId')), {depth:null, colors:true}));




      var i = 0;

      _.each('dev,prod'.split(','), function(acct) {
        _.each('a,b,c,d'.split(','), function(letter) {
          _.each('web,app'.split(','), function(tier) {
            i += 1;
            if (i > 1) { return; }

            const vpc = vpcs[acct];

            const query = {
              awsSvc              : 'EC2_runInstances',
              acct                : acct,
              zone                : `us-east-1${letter}`
            };

//            configDb.update(query, sg._extend({
//              ImageId             : layer67Ami.ImageId,
//              InstanceType        : 'c5.large',
//              KeyName             : 'mario_demo',
//            }, query), {
//              upsert:true
//            }), function(err, result) {
//              console.log(err, result);
//            };
          });
        });
      });

      db.close();
    });
//      ImageId             : null,
//      InstanceType        : 'c5.large',
//      KeyName             : 'mario_demo',
//      SecurityGroupIds    : null,
//      IamInstanceProfile  : null,
//      UserData            : null,
//      PrivateIpAddress    : null,
//      SubnetId            : null,
//      Count               : 1

    function chkerr(err, kv, next) {
      if (err) { console.error(err, name); }
      _.each(kv, (v, k) => {
        result[k] = v;
      });
      return next();
    }
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

  }], function done() {
    return callback(null, db, config);
  });
};
//bootstrap(function() {});

if (sg.callMain(ARGV, __filename)) {
  main();
}


