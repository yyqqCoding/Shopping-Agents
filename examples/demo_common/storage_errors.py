"""Storage errors shared by the local experience host and file stores."""


class StorageUnavailable(RuntimeError):
    pass


class StorageConflict(RuntimeError):
    pass


class RecordNotFound(LookupError):
    pass


class QuotaExceeded(RuntimeError):
    pass
