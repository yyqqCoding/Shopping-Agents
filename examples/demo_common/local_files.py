"""Durable files and the single-writer lease for the local experience."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


class LocalFiles:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._lease = None

    def acquire(self) -> None:
        if self._lease is not None:
            return
        lease = (self.root / "writer.lock").open("a+b")
        try:
            if os.name == "nt":
                import msvcrt

                if lease.seek(0, os.SEEK_END) == 0:
                    lease.write(b"\0")
                    lease.flush()
                lease.seek(0)
                msvcrt.locking(lease.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            lease.close()
            raise RuntimeError("The local data directory already has an API writer") from error
        self._lease = lease
        try:
            schema = self.read_json(self.root / "schema.json")
            if schema is None:
                self.atomic_json(self.root / "schema.json", {"version": 1})
            elif schema != {"version": 1}:
                raise RuntimeError("Unsupported local data schema version")
        except Exception:
            self.release()
            raise

    def release(self) -> None:
        lease = self._lease
        self._lease = None
        if lease is None:
            return
        if os.name == "nt":
            import msvcrt

            lease.seek(0)
            msvcrt.locking(lease.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lease.fileno(), fcntl.LOCK_UN)
        lease.close()

    def path(self, *parts: str) -> Path:
        candidate = self.root.joinpath(*parts).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError("Path leaves the local data directory")
        return candidate

    @staticmethod
    def read_json(path: Path, default: Any = None) -> Any:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def atomic_text(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @classmethod
    def atomic_json(cls, path: Path, value: Any) -> None:
        cls.atomic_text(path, json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")

    @staticmethod
    def append_jsonl(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    @staticmethod
    def read_jsonl(path: Path) -> list[Any]:
        if not path.exists():
            return []
        with path.open(encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    @staticmethod
    def last_jsonl(path: Path) -> Any:
        if not path.exists():
            return None
        with path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            end = handle.tell()
            if end == 0:
                return None
            handle.seek(end - 1)
            if handle.read(1) != b"\n":
                raise ValueError("JSONL has an incomplete trailing record")
            start = max(0, end - 4096)
            while True:
                handle.seek(start)
                lines = handle.read(end - start).splitlines()
                if start == 0 or len(lines) >= 2:
                    return json.loads(lines[-1])
                start = max(0, start - 4096)

    @staticmethod
    def repair_jsonl_tail(path: Path) -> None:
        if not path.exists():
            return
        with path.open("r+b") as handle:
            handle.seek(0, os.SEEK_END)
            end = handle.tell()
            if not end:
                return
            handle.seek(end - 1)
            if handle.read(1) == b"\n":
                return
            position = end
            while position:
                position -= 1
                handle.seek(position)
                if handle.read(1) == b"\n":
                    handle.truncate(position + 1)
                    handle.flush()
                    os.fsync(handle.fileno())
                    return
            handle.truncate(0)
            handle.flush()
            os.fsync(handle.fileno())
