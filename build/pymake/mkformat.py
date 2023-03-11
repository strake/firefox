#!/usr/bin/env python

import sys
import pymake.parser

filename = sys.argv[1]
source = None

with open(filename, 'r') as fh:
    source = fh.read()

statements = pymake.parser.parsestring(source, filename)
print statements.to_source()
