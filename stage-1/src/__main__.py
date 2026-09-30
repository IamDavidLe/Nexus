"""Allow `python -m src` as well as `python -m src.main`."""

import sys

from .main import main

if __name__ == "__main__":
    sys.exit(main())
