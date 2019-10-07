# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os
import sys
import tempfile
import subprocess
import glob

from mozboot.base import BaseBootstrapper
from mozboot.linux_common import (
    ClangStaticAnalysisInstall,
    NodeInstall,
    SccacheInstall,
    StyloInstall,
)

# NOTE: This script is intended to be run with a vanilla Python install.  We
# have to rely on the standard library instead of Python 2+3 helpers like
# the six module.
if sys.version_info < (3,):
    input = raw_input  # noqa


class VoidlinuxBootstrapper(NodeInstall, StyloInstall, SccacheInstall,
                            ClangStaticAnalysisInstall, BaseBootstrapper):
    '''Voidlinux experimental bootstrapper.'''

    SYSTEM_PACKAGES = [
        'autoconf213',
        'nodejs',
        'python',
        'python3',
        'unzip',
        'zip',
    ]

    BROWSER_PACKAGES = [
        'alsa-lib',
        'dbus-glib',
        'gtk+',
        'gtk+3',
        'libevent',
        'libvpx',
        'libXt',
        'mime-types',
        'nasm',
        'startup-notification',
        'gst-plugins-base1',
        'libpulseaudio',
        'xorg-server-xvfb',
        'yasm',
        'gst-libav',
        'gst-plugins-good1',
    ]

    def __init__(self, version, dist_id, **kwargs):
        print('Using an experimental bootstrapper for Voidlinux.')
        BaseBootstrapper.__init__(self, **kwargs)

    def install_system_packages(self):
        self.xbps_install(*self.SYSTEM_PACKAGES)

    def install_browser_packages(self):
        self.ensure_browser_packages()

    def install_browser_artifact_mode_packages(self):
        self.ensure_browser_packages(artifact_mode=True)

    def install_mobile_android_packages(self):
        self.ensure_mobile_android_packages()

    def install_mobile_android_artifact_mode_packages(self):
        self.ensure_mobile_android_packages(artifact_mode=True)

    def ensure_browser_packages(self, artifact_mode=False):
        # TODO: Figure out what not to install for artifact mode
        self.xbps_install(*self.BROWSER_PACKAGES)

    def ensure_nasm_packages(self, state_dir, checkout_root):
        # installed via ensure_browser_packages
        pass

    def ensure_mobile_android_packages(self, artifact_mode=False):
        null

    def suggest_mobile_android_mozconfig(self, artifact_mode=False):
        from mozboot import android
        android.suggest_mozconfig('linux', artifact_mode=artifact_mode)

    def suggest_mobile_android_artifact_mode_mozconfig(self):
        self.suggest_mobile_android_mozconfig(artifact_mode=True)

    def _update_package_manager(self):
        self.xbps_update

    def upgrade_mercurial(self, current):
        self.xbps_install('mercurial')

    def upgrade_python(self, current):
        self.xbps_install('python2')

    def xbps_install(self, *packages):
        command = ['xbps-install']

        command.extend(packages)

        self.run_as_root(command)

    def xbps_update(self):
        command = ['xbps-install', '-S']

        self.run_as_root(command)

    def run(self, command, env=None):
        subprocess.check_call(command, stdin=sys.stdin, env=env)

    def download(self, uri):
        command = ['curl', '-L', '-O', uri]
        self.run(command)

    def unpack(self, path, name, ext):
        if ext == 'gz':
            compression = '-z'
        elif ext == 'bz':
            compression == '-j'
        elif exit == 'xz':
            compression == 'x'

        name = os.path.join(path, name) + '.tar.' + ext
        command = ['tar', '-x', compression, '-f', name, '-C', path]
        self.run(command)
