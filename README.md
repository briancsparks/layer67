# layer67
All the layer-6 and layer-7 stuff you need so you can just write your code for the cloud.

Project Layout
==============

Stuff that is Common to CC and Node Instances
---------------------------------------------

All the stuff in `lib` and `bin` is common.

Stuff that Runs on CC (Admin)
-----------------------------

All the stuff that runs on the command-and-control server (the admin server)
is in the admin dir.

* Creating a stack
 * Creates 2 VPCs and peers them
* Building a base instance (build-instance)
 * A little more gets put onto each instance, but this is what builds the
   snapshot.
* Running an instance (run-xyz-instance)
* Terminating an instance (terminate-instance)


Stuff that Runs on Each Node
----------------------------

* The `agent` gets run on each node.
* the `layer67-plugins` get run on each node.


