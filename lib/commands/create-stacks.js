
/**
 *  Creates a cluster.
 *
 *  The create-stacks command builds the foundation for a cluster of instances. The
 *  cluster is to be used as the multiple stacks that go into a product (dev, int,
 *  stg, prod, etc.) Layer67 focuses on the network (layer 6 and 7) aspects of an
 *  application -- both the client and the server.
 *
 *  This create-stacks script will configure various AWS resources to create the
 *  topology of the cluster, and all things networking.
 *
 *  2 VPCs -- One for production, and one not (dev). Note that all customer-facing
 *  stacks are considered production. This includes the staging stack and others.
 *  These VPCs are connected via VpcPeeringConnections.
 *
 *  3 or 4 subnets, one for each AZ in a region.
 *
 *  Several security-groups.
 *
 *  2 DynamoDbs: one to do the bookkeeping on all the infrastructure, and one for
 *  the admin apps.
 *
 *  Routes/RouteTables/NATs/Gateways/etc.
 *
 *  Usage:
 *
 *    The following command will build the full stack described above (to be
 *    called 'toad', with the 2 VPCs at 10.100.0.0/16 and 10.101.0.0/16.)
 *
 *        ra invoke lib/commands/create-stacks.js createStacks --stack=toad --b=100 --bt=101
 *
 *
 *    You can invoke create-stacks to do less work (to make it easier/faster to
 *    debug and develop the buildout scripts, for example.)
 *
 *        ra invoke lib/commands/create-stacks.js createStacks --stack=toad --b=100 --bt=101 --quick --skip-2 --dry-run
 *
 *          --quick           do the minimal amount of work to excercise the whole system.
 *          --skip-2          so not do the 2nd half of the script (peering the VPCs.)
 *          --dry-run         do not call the CloudFormation createStack() API
 *
 *
 *    Often times, you must delete the stacks you just built up:
 *        aws cloudformation delete-stack --stack-name toadPeering   && aws cloudformation delete-stack --stack-name toad --profilePeering sabuildout
 *        aws cloudformation delete-stack --stack-name toad          && aws cloudformation delete-stack --stack-name toad --profile sabuildout
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const AWS                     = require('aws-sdk');
const awsService              = require('../aws-creds').awsService;
const fs                      = sg.extlibs.fsExtra;
const util                    = require('util');
const tempy                   = require('tempy');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const hpNetCidrs              = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];
const accounts                = sg.parseOn2Chars(process.env.JSAWS_AWS_ACCTS, ',', ':')

const ec2                     = new AWS.EC2({region: 'us-east-1'});

var lib = {};

const sete = function(next, last, abort) {

  // Abort with message and give up
  var   abortMsg;
  var   eabort = function(callback) {
    return function(err) {
      const abortMsg_ = abortMsg;
      abortMsg = null;
      if (err) { return abort(err, abortMsg_); }
      return callback.apply(this, arguments);
    };
  };
  eabort.msg = function(msg) {
    abortMsg = msg;
  };

  // Warn with a message, but continue with next()
  var   warnMsg;
  var   ewarn = function(callback) {
    return function(err) {
      if (err) {
        console.error('WARNING:'+warnMsg+'  '+JSON.stringify(err));
        return next();
      }

      return callback.apply(this, arguments);
    };
  };
  ewarn.msg = function(msg) {
    warnMsg = msg;
  };

  // Warn with a message, but call the callback (just a warning)
  var   nagMsg;
  var   enag = function(callback) {
    return function(err) {
      if (err) {
        console.error(nagMsg+'  '+JSON.stringify(err));
      }

      return callback.apply(this, arguments);
    };
  };
  enag.msg = function(msg) {
    nagMsg = msg;
  };

  // Just go on to next() without a warning or anything
  const enext = function(callback) {
    return function(err) {
      if (err) { return next(); }
      return callback.apply(this, arguments);
    };
  };

  return {eabort, enext, enag, ewarn};
};

lib.createStacks = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    const createTempl = ra.wrap(lib.createStackTemplates);

    const stackName   = argvGet(argv, u('stack', '=jelly-doughnuts', 'The name of the project stack.'));
    const classB      = argvGet(argv, u('class-b,b', '=12', 'class-b for cidr of prod vpc'));
    const classBt     = argvGet(argv, u('class-bt,bt,class-b-test', '=11', 'class-b for cidr of dev vpc'));
    const dryRun      = argvGet(argv, u('dry-run', '', 'Do not invoke AWS API'));

    if (!stackName)           { return u.sage('stackName', 'Need a stack name.', callback); }
    if (!classB)              { return u.sage('classB', 'Need class-b for cidr of prod vpc.', callback); }
    if (!classBt)             { return u.sage('classBt', 'Need class-b for cidr of dev vpc.', callback); }

    var devTemplate, prodTemplate;

    var   startingDevVpcs   = {};
    var   startingProdVpcs  = {};
    const StackName         = stackName;
    return sg.__run2({}, callback, [function(result, next, last, abort) {
      const { eabort, enext, enag } = sete(next, last, abort);

      return sg.__runll([function(next) {

        return awsService('EC2', 'dev').describeVpcs({}, function(err, data) {
          startingDevVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        });

      }, function(next) {
        return awsService('EC2', 'dev').describeVpcs({}, enext(function(err, data) {
          startingDevVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        }));

      }, function(next) {
        return awsService('EC2', 'prod').describeVpcs({}, function(err, data) {
          startingProdVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        });

      }, function(next) {

        return createTempl(argv, function(err, result) {
          if (!sg.ok(err, result)) { return abort('createStacks.createTempl'); }

          devTemplate  = result.dev;
          prodTemplate = result.prod;

          return next();
        });
      }], function() {
        return next();
      });

    }, function(result, next, last, abort) {
      const { eabort, enext, enag } = sete(next, last, abort);

      const templates = [{template: devTemplate, acctName: 'dev'}, {template: prodTemplate, acctName: 'prod'}];

      return sg.__eachll(templates, function(item, next) {
        const template    = item.template;
        const acctName    = item.acctName;

        const cf          = awsService('CloudFormation', acctName);
        var   tmpFilename = tempy.file({extension: 'json'});

        console.error('template for '+acctName+' is at: '+tmpFilename, 'creating '+sg.numKeys(template.Resources)+' resources');
        enag.msg('failed to write JSON');
        return fs.writeFile(tmpFilename, JSON.stringify(template, null, 2), enag(function(err) {

          /* otherwise */
          var   params = sg._extend({StackName, DisableRollback: true}, {});

          if (dryRun) {
            inspect('Dry run of createStack:', params);
            return next();
          }

          params.TemplateBody = JSON.stringify(template);

          eabort.msg('aws.createStack');
          return cf.createStack(params, eabort(function(err, data) {

            // ---------- Poll until the stack is up ----------

            var inProgress, created, complete, statuses;
            return sg.until(function(again, last, count, elapsed) {
              if (count > 700) { return last(); }

              return sg.__runll([function(next) {
                const { eabort, enext, enag } = sete(next, last, abort);

                return cf.listStackResources({StackName}, enext(function(err, data) {

                  const resources = _.map(data.StackResourceSummaries, resource => _.pick(resource, 'LogicalResourceId', 'ResourceStatus', 'ResourceStatusReason'));

                  // You can get the result of the _.pluck() to see what is still being built
                  inProgress = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_IN_PROGRESS'), 'LogicalResourceId'));
                  created    = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_COMPLETE'), 'LogicalResourceId'));

                  statuses = _.groupBy(resources, 'ResourceStatus');

                  return next();
                }));

              }, function(next) {
                const { eabort, enext, enag } = sete(next, last, abort);
                return cf.describeStacks({StackName}, enext(function(err, data) {

                  complete = sg.reduce(data.Stacks, true, function(m, stack) {
                    return m && (stack.StackStatus === 'CREATE_COMPLETE')
                  });

                  return next();
                }));

              }], function() {
                //inspect('statuses', statuses);
                console.error(`Complete ${acctName} (${created}/${inProgress+created})? ${complete}`);

                if (complete) { return last(); }

                /* otherwise */
                return again(2500);
              });

            // Completion for the until() that waits for the stack to be created
            }, next);
          }));
        }));

      // Completion for when the __eachll finishes each template
      }, function() {

        if (argv.skip_2) {
          return last(null, result);
        }

        // ---------- Now, peer the VPCs ----------

        var devVpc, prodVpc, newlyCreatedPcx;

        return sg.__run([function(next) {

          eabort.msg('aws.describeVpcs');
          return awsService('EC2', 'dev').describeVpcs({}, eabort(function(devErr, devData) {
            return awsService('EC2', 'prod').describeVpcs({}, eabort(function(prodErr, prodData) {

              if (sg.ok(devErr,  devData))  { devVpc  = _.difference(_.pluck(devData.Vpcs,  'VpcId'), startingDevVpcs)[0]; }
              if (sg.ok(prodErr, prodData)) { prodVpc = _.difference(_.pluck(prodData.Vpcs, 'VpcId'), startingProdVpcs)[0]; }

              inspect('Created Vpcs:', {prod: prodVpc, dev: devVpc});
              return next();
            }));
          }));

        }, function(next) {

          //=======================================================================================
          // The dev stack creates the peering connection
          //=======================================================================================

          const peeringStackName    = `${StackName}Peering`;

          var   args = {
            acct      : 'dev',
            vpc       : devVpc,
            owner2    : accounts.pub,
            vpc2      : prodVpc,
            cidr2     : `10.${classB}.0.0/16`,
            stack     : peeringStackName
          };

          const cf                  = awsService('CloudFormation', args.acct);
          const ec2                 = awsService('EC2', args.acct);

          enag.msg('describeVpcPeeringConnections');
          return ec2.describeVpcPeeringConnections({}, enag(function(err, data) {

            // ---------- Use the SDK to create the peering connection ----------

            startingPcxs = _.pluck((data || {}).VpcPeeringConnections, 'VpcPeeringConnectionId');

            return sg.__run([function(next) {
              const params = {
                PeerOwnerId   : args.owner2,
                PeerRegion    : 'us-east-1',
                PeerVpcId     : args.vpc2,
                VpcId         : args.vpc
              };

              eabort.msg('failed to ec2.createVpcPeeringConnection');
              return ec2.createVpcPeeringConnection(params, eabort(function(err, data) {

                eabort.msg('failed to ec2.describeVpcPeeringConnections');
                return ec2.describeVpcPeeringConnections({}, eabort(function(err, data) {

                  newlyCreatedPcx = _.difference(_.pluck(data.VpcPeeringConnections, 'VpcPeeringConnectionId'), startingPcxs)[0];
                  args.pcx        = newlyCreatedPcx;
                  inspect('Newly found pcx: '+newlyCreatedPcx);

                  eabort.msg('ec2.acceptVpcPeeringConnection');
                  return awsService('EC2', 'prod').acceptVpcPeeringConnection({VpcPeeringConnectionId: newlyCreatedPcx}, eabort(next));
                }));
              }));

            }, function(next) {

              // ---------- use CF to create all the routes ----------
              eabort.msg('createPeeringTemplate');
              return lib.createPeeringTemplate(args, context, eabort(function(err, template) {

                const tmpFilename = tempy.file({extension: 'json'});
                console.error('template for '+args.acct+' is at: '+tmpFilename, 'creating '+sg.numKeys(template.Resources)+' resources');

                enag.msg('Failed writing file: '+tmpFilename);
                return fs.writeFile(tmpFilename, JSON.stringify(template.template, null, 2), enag(function(err) {
                  eabort.msg('createStack');
                  return cf.createStack({StackName: peeringStackName, TemplateBody : JSON.stringify(template.template), DisableRollback: true}, eabort(function(err, data) {
                    eabort.msg('fail creating first vpc peering.');
                    return lib.waitForCf({StackName: peeringStackName, acct: args.acct}, context, eabort(next));
                  }));
                }));
              }));

            }], next);
          }));

        }, function(next) {

          const peeringStackName    = `${StackName}Peering`;

          const args = {
            acct      : 'prod',
            vpc       : prodVpc,
            owner2    : accounts.dev,
            vpc2      : devVpc,
            cidr2     : `10.${classBt}.0.0/16`,
            pcx       : newlyCreatedPcx,
            StackName : peeringStackName
          };

          const cf                  = awsService('CloudFormation', args.acct);

          eabort.msg('createPeeringTemplate');
          return lib.createPeeringTemplate(args, context, eabort(function(err, template) {
            //inspect('----2nd peering: ', template, {depth:null, colors:true});

            const tmpFilename = tempy.file({extension: 'json'});
            console.error('template for '+args.acct+' is at: '+tmpFilename, 'creating '+sg.numKeys(template.Resources)+' resources');

            enag.msg('Failed writing file: '+tmpFilename);
            return fs.writeFile(tmpFilename, JSON.stringify(template.template, null, 2), enag(function(err) {
              eabort.msg('createStack');
              return cf.createStack({StackName: peeringStackName, TemplateBody : JSON.stringify(template.template), DisableRollback: true}, eabort(function(err, data) {
                eabort.msg('fail creating second vpc peering.');
                return lib.waitForCf({StackName: peeringStackName, acct: args.acct}, context, eabort(next));
              }));
            }));
          }));

        }], next);
      });

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};

lib.waitForCf = function(argv, context, callback) {

  const StackName           = argvGet(argv, 'stack-name');
  const cf                  = awsService('CloudFormation', argv.acct);

  var   result = {};

  return sg.__run2({}, callback, [function(result, next, outerLast, abort) {
    const { eabort, enext, enag } = sete(next, outerLast, abort);

    var inProgress, created, complete;
    return sg.until(function(again, last, count, elapsed) {
      if (count > 700) { return last(); }

      // TODO: Make this runll?

      return sg.__run([function(next) {
        const { eabort, enext, enag } = sete(next, outerLast, abort);

        // ---------- Get the list of individual resources ----------
        return cf.listStackResources({StackName}, enext(function(err, data) {

          const resources = _.map(data.StackResourceSummaries, resource => _.pick(resource, 'LogicalResourceId', 'ResourceStatus', 'ResourceStatusReason'));
          const statuses  = _.groupBy(resources, 'ResourceStatus');

          inProgress = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_IN_PROGRESS'), 'LogicalResourceId'));
          created    = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_COMPLETE'), 'LogicalResourceId'));

          return next();
        }));

      }, function(next) {
        const { eabort, enext, enag } = sete(next, outerLast, abort);

        // ---------- Get the stack as a whole ----------
        return cf.describeStacks({StackName}, enext(function(err, data) {

          complete = sg.reduce(data.Stacks, null, function(m, stack) {
            return (stack.StackStatus === 'CREATE_COMPLETE') ? true : (stack.StackStatus === 'CREATE_FAILED') ? false : m;
          });

          return next();
        }));

      }], function() {
        //inspect('statuses', statuses);
        console.error(`Complete ${argv.acct} (${created}/${inProgress+created})? ${complete}`);

        if (sg.isnt(complete)) { return again(2500); }

        /* otherwise */
        result.ok = complete;
        return last();
      });

    // Completion for the until() that waits for the stack to be created
    }, function done() {
      if (result.ok)  { return callback(null, result); }

      return callback(result);
    });

  }], function abort(err, message) {
    if (message) { return sg.die(err, callback, message); }
    return callback(err);
  });
};

lib.createPeeringTemplate = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const acctName              = argvGet(argv, u('acct',             '=83683',          'The account name.'));
    const stackName             = argvGet(argv, u('stack',            '=stackname',      'The stack name.'));
    const vpcId                 = argvGet(argv, u('vpc-id,vpc',       '=[vpc-12345678]', 'The VPC.'));
    const otherOwnerId          = argvGet(argv, u('owner-id2,owner2', '=[2222222]',      'The other account.'));
    const otherVpcId            = argvGet(argv, u('vpc-id2,vpc2',     '=[vpc-87654321]', 'The other VPC.'));
    const otherCidrBlock        = argvGet(argv, u('cidr2',            '=[10.4.0.0/0]',   'The other cidr block.'));
    const pcx                   = argvGet(argv, u('pcx',              '=pcx-4321',       'The peering connection.'));

    var template = {};

    return sg.__run2({template}, callback, [function(result, next, last, abort) {
      const { eabort, enext, enag } = sete(next, last, abort);

      eabort.msg(`createPeeringTemplates.describeRouteTables-${acctName}`);
      return awsService('EC2', acctName).describeRouteTables({}, eabort(function(err, tables) {

        var i = 1;
        _.each(tables.RouteTables, table => {
          if (table.VpcId !== vpcId) { return; }   // Not ours

          setOnn(template, `PeerRoute${i}.Type`, "AWS::EC2::Route");

          setOnn(template, `PeerRoute${i}.Properties.RouteTableId`,           table.RouteTableId);
          setOnn(template, `PeerRoute${i}.Properties.DestinationCidrBlock`,   otherCidrBlock);
          setOnn(template, `PeerRoute${i}.Properties.VpcPeeringConnectionId`, pcx);

          i += 1;
        });

        return next();
      }));

    }, function(result, next, last, abort) {
      const template   = sg.extract(result, 'template');

      result.template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf ${acctName} template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: template,
        Outputs: {}
      };
      return next();

    }], function abort(err, message) {
      if (message) { return sg.die(err, callback, message); }
      return callback(err);
    });
  });
};

lib.createStackTemplates = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const quick       = argvGet(argv, 'quick');
    const stackName   = argvGet(argv, u('stack', '=jelly-doughnuts', 'The name of the project stack.'));
    const region      = argvGet(argv, 'region') || 'us-east-1';
    const classB      = argvGet(argv, 'class-b,b');
    const classBt     = argvGet(argv, 'class-bt,bt,class-b-test');
    var   sshCidrs    = (argvGet(argv, 'ssh-cidrs,ssh') || '').split(',');
    var   numBitss    = argvGet(argv, 'bits'         ) || '22,20,20';
    const az          = letter => `${region}${letter}`;

    if (!stackName)           { return u.sage('stackName', 'Need a stack name.', callback); }

    if (quick) {
      console.error('--quick mode!!!! -- Stacks will not work.');
    }

    var dev           = {}, devOutputs  = {};
    var prod          = {}, prodOutputs = {};
    var routeTables   = [];
    var gateways      = {};
    var debug         = {};

    sshCidrs  = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];

    numBitss = numBitss.split(',');
    const getNumBits = function(type) {
      if (type === 'Public')  { return numBitss[0]; }
      if (type === 'App')     { return numBitss[1] || _.last(numBitss); }
      if (type === 'Lambda')  { return numBitss[2] || _.last(numBitss); }
    };

    const setOnnBoth = function(a, b) {
      setOnn(dev,  a, sg.deepCopy(b));
      setOnn(prod, a, sg.deepCopy(b));
    };

    const itemOnnBoth = function(name, awsType, props) {
      setOnnBoth(`${name}.Type`,        `AWS::EC2::${awsType}`);
      setOnnBoth(`${name}.Properties`,  props);
      return ref(name);
    };

    var   devSubnetIp     = `10.${classBt}.0.0`;
    var   prodSubnetIp    = `10.${classB}.0.0`;

    return sg.__run2({dev, prod, debug}, callback, [function(result, next, last, abort) {

      //================================================================================
      // The VPC and top-level stuff
      //================================================================================

      const vpcRef        = ref("VPC");
      const igwRef        = ref("InternetGateway");
      const vpcGateway    = 'VpcGateway';

      setOnnBoth("VPC.Type", "AWS::EC2::VPC");
      setOnnBoth("VPC.Properties", {EnableDnsSupport: true, EnableDnsHostnames: true});
          setOnn(dev,  `VPC.Properties.CidrBlock`, toCidr(devSubnetIp,  16));
          setOnn(prod, `VPC.Properties.CidrBlock`, toCidr(prodSubnetIp, 16));

      setOnnBoth("InternetGateway.Type", "AWS::EC2::InternetGateway");
      setOnnBoth("InternetGateway.Properties", {});

      const gwRef     = itemOnnBoth(vpcGateway,         "VPCGatewayAttachment", {VpcId: vpcRef, InternetGatewayId: igwRef});
      const prttblRef = itemOnnBoth("PublicRouteTable", "RouteTable",           {VpcId: vpcRef});
      const prtRef    = itemOnnBoth("PublicRoute",      "Route",                {RouteTableId: prttblRef, GatewayId: igwRef});
                         setOnnBoth("PublicRoute.Properties.DestinationCidrBlock",         '0.0.0.0/0');

      devOutputs = {
        VPC: {
          Value: vpcRef,
          Description: "The VPC Id"
        },
        VpcCidrBlock: {
          Value: getAtt(vpcRef, 'CidrBlock'),
          Description: "The VPC CIDR block"
        }
      };

      prodOutputs = {
        VPC: {
          Value: vpcRef,
          Description: "The VPC Id"
        },
        VpcCidrBlock: {
          Value: getAtt(vpcRef, 'CidrBlock'),
          Description: "The VPC CIDR block"
        }
      };


      routeTables.push(prttblRef);

      //================================================================================
      // Subnets
      //================================================================================

      const subnetOnnEach = function(letter, type, options_) {

        const options     = options_ || {};
        const LETTER      = `${letter.toUpperCase()}${letter}`;
        const numBits     = getNumBits(type);
        var   publicIp    = false;
        var   rttblRef;
        var   gatewayRef;

        if (type === 'Public') {
          publicIp  = true;
          rttblRef  = prttblRef;
        }

        // ---------- The Subnet ----------
        const subnetRef   = itemOnnBoth(`Subnet${LETTER}${type}`,  "Subnet",                              {VpcId: vpcRef});
                             setOnnBoth(`Subnet${LETTER}${type}.Properties.MapPublicIpOnLaunch`,          publicIp);
                             setOnnBoth(`Subnet${LETTER}${type}.Properties.AvailabilityZone`,             az(letter));

        if (type === 'Public') {

          // Fix the class-c
          setOnn(dev,  [`Subnet${LETTER}${type}`, 'Properties', 'CidrBlock'],           toCidr(devSubnetIp, numBits));
          setOnn(prod, [`Subnet${LETTER}${type}`, 'Properties', 'CidrBlock'],           toCidr(prodSubnetIp, numBits));

          devSubnetIp  = nextCidrStart(devSubnetIp,  numBits);
          prodSubnetIp = nextCidrStart(prodSubnetIp, numBits);
        }

        if (options.useNat) {
          const natEipRef   = itemOnnBoth(`Subnet${LETTER}PublicNatEip`,              'EIP',        {Domain: 'vpc'});
                               setOnnBoth(`Subnet${LETTER}PublicNatEip.DependsOn`,                  vpcGateway);
          gatewayRef        = itemOnnBoth(`Subnet${LETTER}PublicNatGateway`,          'NatGateway', {SubnetId: subnetRef, AllocationId: getAtt(natEipRef, 'AllocationId')});

          gateways[`Subnet${LETTER}PublicNatGateway`] = gatewayRef;

          setOnn(devOutputs,  `Subnet${LETTER}PublicNatIp.Value`,  natEipRef);
          setOnn(prodOutputs, `Subnet${LETTER}PublicNatIp.Value`,  natEipRef);
        }

        if (type !== 'Public') {
          rttblRef          = itemOnnBoth(`Subnet${LETTER}${type}RouteTable`,               "RouteTable",   {VpcId: vpcRef});
                              itemOnnBoth(`Subnet${LETTER}${type}PublicRoute`,              "Route",        {RouteTableId: rttblRef, DestinationCidrBlock: '0.0.0.0/0'});
                               setOnnBoth(`Subnet${LETTER}${type}PublicRoute.Properties.NatGatewayId`,      gateways[`Subnet${LETTER}PublicNatGateway`]);

                              setOnn(dev ,`Subnet${LETTER}${type}.Properties.CidrBlock`,                    toCidr(devSubnetIp, numBits));
                              setOnn(prod,`Subnet${LETTER}${type}.Properties.CidrBlock`,                    toCidr(prodSubnetIp, numBits));

          devSubnetIp  = nextCidrStart(devSubnetIp,  numBits);
          prodSubnetIp = nextCidrStart(prodSubnetIp, numBits);

          routeTables.push(rttblRef);
        }

        itemOnnBoth(`Subnet${LETTER}${type}RouteTableAssociation`, "SubnetRouteTableAssociation", {SubnetId: subnetRef, RouteTableId: rttblRef});

        return subnetRef;
      };

      _.each('a,b,d,e'.split(','), function(letter) {
        subnetOnnEach(letter, 'Public');
      });

      if (!quick) {
        _.each('a,b,d,e'.split(','), function(letter) {
          subnetOnnEach(letter, 'App', {useNat: true});
        });

        _.each('a,b,d,e'.split(','), function(letter) {
          subnetOnnEach(letter, 'Lambda');
        });
      }

      //================================================================================
      // Security Groups
      //================================================================================

      const addSgRule = function(which_, sgName, rule) {
        _.each(mkArray(which_), which => {
          sg.setOnna(which, `${sgName}.Properties.SecurityGroupIngress`, rule);
        });
      };

      // ---------- admin sg ----------
      itemOnnBoth('sgAdmin', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the admins'});
      addSgRule([dev, prod], 'sgAdmin', sgRule('tcp', 443, 443, '0.0.0.0/0'));

      if (!quick) {

        // ---------- admin sg ----------
        addSgRule([dev, prod], 'sgAdmin', sgRule('tcp', 22,  22,  '0.0.0.0/0'));      // TODO: remove this

        _.each(sshCidrs, cidr => {
          addSgRule([dev, prod], 'sgAdmin', sgRule('tcp', 22, 22, cidr));
        });

        // ---------- util sg ----------
        itemOnnBoth('sgUtil', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the utility servers'});

        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 27017, 27017, '10.0.0.0/8'));
        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 6379,  6379,  '10.0.0.0/8'));
        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 22,    22,    '10.0.0.0/8'));

        // ---------- web sg ----------
        itemOnnBoth('sgWeb', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the webtier'});

        addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 80,  80,  '0.0.0.0/0'));
        addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 443, 443, '0.0.0.0/0'));
        addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 22,  22,  '10.0.0.0/8'));

        // ---------- app sg ----------
        itemOnnBoth('sgApp', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the application and service layer'});

        addSgRule([dev, prod], 'sgApp', sgRule('tcp', 80,  80,  '10.0.0.0/0'));
        addSgRule([dev, prod], 'sgApp', sgRule('tcp', 443, 443, '10.0.0.0/0'));
        addSgRule([dev, prod], 'sgApp', sgRule('tcp', 22,  22,  '10.0.0.0/0'));

        // ---------- wide sg ----------
        itemOnnBoth('sgWide', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For wide use inside vpc'});

        addSgRule([dev, prod], 'sgWide', sgRule('tcp', 22, 22, '10.0.0.0/8'));
        addSgRule([dev, prod], 'sgWide', sgRule(-1,    -1, -1, '10.0.0.0/8'));

      }

      //================================================================================
      // DynamoDB
      //================================================================================

      const addDynamo = function(which, name, read, write, keys) {

        const longKey = `${stackName}${name}`
        var   db      = {
          Type : "AWS::DynamoDB::Table",
          Properties : {
            TableName : `${name}`,
            AttributeDefinitions : [ ],
            KeySchema : [ ],
            ProvisionedThroughput : {
                ReadCapacityUnits   : read,
                WriteCapacityUnits  : write,
            },
            StreamSpecification : {
                StreamViewType  : 'NEW_AND_OLD_IMAGES'
            }
          }
        };

        _.each(keys, (kv, key) => {

          if (key === 'hash') {
            sg.setOnna(db, `Properties.AttributeDefinitions`, {AttributeName: 'id',   AttributeType: kv.id});
            sg.setOnna(db,            'Properties.KeySchema', {AttributeName: 'id',   KeyType: 'HASH'});
          }

          if (key == 'range') {
            sg.setOnna(db, 'Properties.AttributeDefinitions', {AttributeName: 'type', AttributeType: 'S'});
            sg.setOnna(db,            'Properties.KeySchema', {AttributeName: 'type', KeyType: 'RANGE'});
          }

        });

        setOnn(which, longKey, sg.deepCopy(db));
      }

      if (!quick) {
        addDynamo(dev, 'clusterDb', 2, 2, {hash:{id:'S'}, range:{type:'S'}});     // The string used as a label for AWS (ImageId, InstanceId, etc.)
        addDynamo(dev, 'adminsDb',  1, 1, {hash:{id:'S'}});                       // email
      }

      //================================================================================
      // VPC Endpoints
      //================================================================================

      if (!quick) {
        // ---------- VPC endpoint ----------
        return ec2.describeVpcEndpointServices({}, function(err, data) {

          if (sg.ok(err, data)) {
            const serviceDetails = _.indexBy(data.ServiceDetails, 'ServiceName');

            _.each('s3,dynamodb,kinesis-streams,elasticloadbalancing,ec2'.split(','), serviceName_ => {
              const endpoint      = `com.amazonaws.us-east-1.${serviceName_}`;
              const serviceName   = serviceName_.replace(/[^a-z0-9]+/i, '');

              if (serviceDetails[endpoint] && serviceDetails[endpoint].VpcEndpointPolicySupported) {

                itemOnnBoth(`${serviceName}Endpoint`, 'VPCEndpoint', {VpcId: vpcRef, ServiceName: endpoint});
                _.each(routeTables, table => {
                  sg.setOnna(dev,  `${serviceName}Endpoint.Properties.RouteTableIds`, sg.deepCopy(table));
                  sg.setOnna(prod, `${serviceName}Endpoint.Properties.RouteTableIds`, sg.deepCopy(table));
                });
              }
            });
          }
          return next();
        });
      }

      return next();

    }, function(result, next, last, abort) {
      const dev   = sg.extract(result, 'dev');
      const prod  = sg.extract(result, 'prod');

      result.dev = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf dev template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: dev,
        Outputs: devOutputs
      };

      result.prod = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf prod template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: prod,
        Outputs: prodOutputs
      };

      result.devKeys = sg.numKeys(dev);
      result.prodKeys = sg.numKeys(prod);

      result.devlen = JSON.stringify(dev).length;
      result.prodlen = JSON.stringify(prod).length;

      //result.devkeys = _.keys(dev);
      //result.prodkeys = _.keys(prod);

      result.chk = result.devlen - result.prodlen;

      return callback(null, result);

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

function ref(x) {
  return {Ref:x};
}

function getAtt(ref, key) {
  return {'Fn::GetAtt':[ref.Ref, key]};
}

function sgRule(protocol, from, to, cidr) {
  return {IpProtocol: protocol, FromPort: from, ToPort: to, CidrIp: cidr};
}

function mkArray(x) {
  if (_.isArray(x)) { return x; }
  return [x];
}


function nextCidrStart(ip, newNumBits) {
  const cidrBlock = `${ip}/${newNumBits}`;

  var lastForOld  = sg.ipNumber(sg.lastIpInCidrBlock(cidrBlock));
  var lastForNew  = sg.ipNumber(sg.lastIpInCidrBlock(cidrBlock.replace(/\/[0-9]+$/g, '/'+newNumBits)));
  var firstOfNext = Math.max(lastForOld, lastForNew) + 1;

  return sg.dottedIp(firstOfNext);
};

function toCidr(ip, bits) {
  var cidrTry1 = `${ip}/${bits}`;
  return `${sg.firstIpInCidrBlock(cidrTry1)}/${bits}`;
}

function inspect(...argv) {
  _.each(argv, arg => {
    console.error(util.inspect(arg, {depth: null, colors:true}));
  });
}


