// This file was procedurally generated from the following sources:
// - src/accessor-names/literal-string-char-escape.case
// - src/accessor-names/default/cls-expr-static.template
/*---
description: Computed values as accessor property names (string literal containing a character escape sequence) (Class expression, static method)
esid: sec-runtime-semantics-classdefinitionevaluation
flags: [generated]
info: |
    [...]
    21. For each ClassElement m in order from methods
        a. If IsStatic of m is false, then
           [...]
        b. Else,
           a. Let status be the result of performing PropertyDefinitionEvaluation
              for m with arguments F and false.

    12.2.6.7 Runtime Semantics: Evaluation

    [...]

    ComputedPropertyName : [ AssignmentExpression ]

    1. Let exprValue be the result of evaluating AssignmentExpression.
    2. Let propName be ? GetValue(exprValue).
    3. Return ? ToPropertyKey(propName).
---*/

var stringSet;

var C = class {
  static get 'character\tescape'() { return 'get string'; }
  static set 'character\tescape'(param) { stringSet = param; }
};

assert.sameValue(C['character	escape'], 'get string');

C['character	escape'] = 'set string';
assert.sameValue(stringSet, 'set string');

reportCompare(0, 0);
