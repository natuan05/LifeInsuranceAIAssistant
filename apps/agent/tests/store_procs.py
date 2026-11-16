"""Code run in separate processes by test_store.py (multiprocessing spawn). Synthetic data only."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from langgraph.graph import END, START, StateGraph
from typing import TypedDict

from life_agent.store import PgRuntimeStore, StaleWriter


class Counter(TypedDict):
    n: int


def tiny_graph(checkpointer: Any, wait=None):
    """One node graph; `wait` blocks inside the node (writer paused before its checkpoint write)."""
    def work(state: Counter) -> dict:
        if wait is not None:
            wait()
        return {"n": state.get("n", 0) + 1}

    graph = StateGraph(Counter)
    graph.add_node("work", work)
    graph.add_edge(START, "work")
    graph.add_edge("work", END)
    return graph.compile(checkpointer=checkpointer)


def paused_writer(dsn: str, run_id: str, attempt_id: str, thread_id: str, paused, resume, results) -> None:
    """Process A: claim, start a step, pause before the checkpoint write, then try to publish."""
    store = PgRuntimeStore(dsn)
    lease = store.claim_execution(run_id, attempt_id, worker_id="process-a", lease_seconds=60)

    def wait() -> None:
        paused.set()
        resume.wait(30)

    graph = tiny_graph(store.checkpointer(lease), wait)
    try:
        graph.invoke({"n": 0}, {"configurable": {"thread_id": thread_id}}, durability="sync")
        results.put("SAVED")
    except StaleWriter:
        results.put("STALE_WRITER")
    finally:
        store.close()


def crashing_business_reads(dsn: str, run_id: str, attempt_id: str, counter_file: str) -> None:
    """Process that sends Core reads and is killed right after the 4th request, before any later checkpoint."""
    from life_agent.core_client import CoreError
    from life_agent.graph import build_graph
    from life_agent.store import execute_attempt
    from fakes import FakeCore, FakeRetrieval, ManualClock, ScriptedModel, config, reply, tool

    class CountingCore(FakeCore):
        def list_contracts(self, ctx, *, timeout):
            path = Path(counter_file)
            sent = int(path.read_text() or "0") + 1 if path.exists() else 1
            path.write_text(str(sent))
            if sent == 4:
                os._exit(17)  # process dies after the 4th request was sent
            raise CoreError("TIMEOUT")

    model = ScriptedModel([reply(tool("list_contracts")), reply(tool("list_contracts")), reply(tool("list_contracts"))])
    store = PgRuntimeStore(dsn)
    execute_attempt(store, run_id, attempt_id,
                    lambda runtime, saver: build_graph(runtime, CountingCore(), FakeRetrieval(), model, config(),
                                                       clock=ManualClock(), checkpointer=saver),
                    worker_id="process-crash", lease_seconds=60)
