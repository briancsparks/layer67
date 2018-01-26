
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;

const db = require('../../lib/db');

const query = db.query_;

const test                    = require('ava');

// Unconditional:
// t.pass('[message]');
// t.fail('[message]');
//
// Assertions:
// t.truthy(data, '[message]');
// t.falsy(data, '[message]');
// t.true(data, '[message]');
// t.false(data, '[message]');
// t.is(data, expected, '[message]');
// t.not(data, expected, '[message]');
// t.deepEqual(data, expected, '[message]');
// t.notDeepEqual(data, expected, '[message]');
// t.throws(function|promise, [error, '[message]']);
// t.notThrows(function|promise, '[message]');
// t.regex(data, regex, '[message]');
// t.notRegex(data, regex, '[message]');
// t.ifError(error, '[message]');         /* assert that error is falsy */
//
// t.skip.is(foo(), 5);

test('query', t => {
  const q = query({id:'userId', group:'groupId'});

  t.deepEqual(q, {id:{S:'userId'}, group:{S:'groupId'}});
});

test('query2', t => {
  const q = query({id:'admin', type:'LaunchConfig'});

  t.deepEqual(q, {id:{S:'admin'}, type:{S:'LaunchConfig'}});
});

test('query number', t => {
  const q = query({id:'userId', group:777});

  t.deepEqual(q, {id:{S:'userId'}, group:{N:777}});
});

test('query boolean', t => {
  const q = query({id:'userId', group:true});

  t.deepEqual(q, {id:{S:'userId'}, group:{B:true}});
});

test('query null', t => {
  const q = query({id:'userId', group:null});

  t.deepEqual(q, {id:{S:'userId'}, group:{NULL:null}});
});

test('query map', t => {
  const q = query({id:'userId', group:{my:3, their:'house'}});

  t.deepEqual(q, {id:{S:'userId'}, group:{M:{my:3, their:'house'}}});
});

test('query list', t => {
  const q = query({id:'userId', group:[{my:3}, {their:'house'}]});

  t.deepEqual(q, {id:{S:'userId'}, group:{L:[{my:3}, {their:'house'}]}});
});


