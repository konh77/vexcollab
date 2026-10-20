"""POSIX USB transport for the optional V5 hardware smoke test (AGPL-3.0-only)."""
import os
import array
import fcntl
import select
import sys
import termios
import tty

fd = os.open(sys.argv[1], os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
saved = termios.tcgetattr(fd)
try:
    tty.setraw(fd)
    settings = termios.tcgetattr(fd)
    settings[2] |= termios.CLOCAL | termios.CREAD
    settings[4] = settings[5] = termios.B115200
    termios.tcsetattr(fd, termios.TCSANOW, settings)
    fcntl.ioctl(fd, termios.TIOCMBIS, array.array('i', [termios.TIOCM_DTR | termios.TIOCM_RTS]))
    os.set_blocking(fd, True)
    while True:
        ready, _, _ = select.select([fd, sys.stdin.fileno()], [], [])
        if fd in ready:
            data = os.read(fd, 65536)
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if sys.stdin.fileno() in ready:
            data = os.read(sys.stdin.fileno(), 65536)
            if not data:
                break
            while data:
                data = data[os.write(fd, data):]
finally:
    try:
        termios.tcsetattr(fd, termios.TCSANOW, saved)
    finally:
        os.close(fd)
