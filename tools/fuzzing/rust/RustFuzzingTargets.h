/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Interface definitions for fuzzing rust modules
 */

#ifndef RustFuzzingTargets_h__
#define RustFuzzingTargets_h__

extern "C" {

int fuzz_rkv(const uint8_t* raw_data, size_t size);

}  // extern "C"

#endif  // RustFuzzingTargets_h__
