#include <stdbool.h>

/* XSPICE / MIF types — include before sharedspice.h so that the internal
   complex.h (pulled in via devdefs.h → cktdefs.h) defines struct ngcomplex
   first.  Then set ngspice_NGSPICE_H to suppress the duplicate definition
   in sharedspice.h. */
#ifndef XSPICE
#define XSPICE 1
#endif
#include <ngspice/miftypes.h>
#include <ngspice/mifparse.h>
#include <ngspice/mifcmdat.h>
#include <ngspice/mifdefs.h>
#include <ngspice/devdefs.h>
#include <ngspice/mifproto.h>
#include <ngspice/mif.h>

/* add_device is defined in dev.c under #ifdef XSPICE but not declared in
   any public header — provide an extern declaration here. */
extern int add_device(int n, SPICEdev **devs, int flag);

/* complex.h already defined struct ngcomplex; prevent sharedspice.h from
   re-defining it. */
#define ngspice_NGSPICE_H
#include <ngspice/sharedspice.h>
