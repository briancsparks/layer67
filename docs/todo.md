
Cleaning up After Simplifying
=============================

And ejecting dynamoDb!

* All 5 run-instances need to be finally un-dynamoDb-ified.
* ec2Instance.js works great, tho.
* Still have not confimed build-instance still works.

Next Milestone
==============

* Clean up main stack-building changes
* Error handling
* Name the Dbs with the stack name

2

* Spin up new serverassist stack, based on layer67
* Spin down 13 stack

Then
====

* Full error handling in the stack-builder
* Move the sete module to sg
* Break up stack-building so each part can be done alone

2.0
===

* Separate the util subnet / sg
 * One for the DB, one for redis, etc

Maybe
=====

* Add SNS for errors / warnings / operations?
* Host SSH on 443?

Notes / Brainstorming
=====================

* Management of /etc/hosts

