/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is:
 * http://dom.spec.whatwg.org/#xmldocument
 * http://www.whatwg.org/specs/web-apps/current-work/#xmldocument
 */

// http://dom.spec.whatwg.org/#xmldocument
[Exposed=Window]
interface XMLDocument : Document {};

// http://www.whatwg.org/specs/web-apps/current-work/#xmldocument
partial interface XMLDocument {
  [Throws, NeedsCallerType, Pref="dom.xmldocument.load.enabled"]
  boolean load(DOMString url);
};

// Gecko extensions?
partial interface XMLDocument {
  [UseCounter, Pref="dom.xmldocument.async.enabled"]
  attribute boolean async;
};
